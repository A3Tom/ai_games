#include <stdint.h>

/* Original SLES_009.14 PCMD loader arithmetic recovered by static inspection.
 * 0x80018788..0x800187d0: arithmetic shift 15, negate X, store halfword.
 * 0x800188ac..0x80018934: clamp signed UV to [0,65536], shift 8, flip V.
 * These functions convert data; they do not execute console instructions or
 * reproduce console hardware. The skinning functions below port only this
 * model's fixed-point matrix and weighted-point arithmetic, with bounded data.
 */

static int32_t arithmetic_shift_15(int32_t value) {
    uint32_t shifted = (uint32_t)value >> 15;
    if (value < 0) return (int32_t)shifted - 131072;
    return (int32_t)shifted;
}

int32_t fifa98_pcmd_position_component(int32_t raw, int32_t axis) {
    if (axis < 0 || axis > 2) return 0;
    int32_t value = arithmetic_shift_15(raw);
    if (axis == 0) value = -value;
    uint32_t halfword = (uint32_t)value & 0xffffu;
    return halfword >= 32768u ? (int32_t)halfword - 65536 : (int32_t)halfword;
}

int32_t fifa98_pcmd_uv_component(int32_t raw, int32_t vertical) {
    uint32_t clamped = raw < 0 ? 0u : raw > 65536 ? 65536u : (uint32_t)raw;
    int32_t coordinate = (int32_t)(clamped >> 8);
    return vertical ? 256 - coordinate : coordinate;
}

static int32_t quaternion_input[4];
static int32_t matrix_output[9];

uintptr_t fifa98_pcmd_quaternion(void) { return (uintptr_t)quaternion_input; }
uintptr_t fifa98_pcmd_matrix(void) { return (uintptr_t)matrix_output; }

static int32_t signed_halfword(int32_t value) {
    uint32_t bits = (uint32_t)value & 0xffffu;
    return bits >= 32768u ? (int32_t)bits - 65536 : (int32_t)bits;
}

static int32_t twice_product_shift12(int32_t left, int32_t right) {
    /* MULT followed by MFLO and SRA12: keep the low product word first. */
    uint32_t low = (uint32_t)left * ((uint32_t)right * 2u);
    uint32_t shifted = low >> 12;
    return low & 0x80000000u ? (int32_t)shifted - 1048576 : (int32_t)shifted;
}

/* Resident 0x80012ad0..0x80012bd0. The original diagonal constant is 4095.
 * This is the local coefficient calculation only; hierarchy, pose sampling,
 * matrix composition and weighted vertex accumulation remain separate steps.
 */
static int32_t quaternion_coefficients(const int32_t *input, int32_t *output) {
    for (int32_t index = 0; index < 4; index++) {
        if (input[index] < -524288 || input[index] > 524272) return 0;
    }
    int32_t x = input[0], y = input[1];
    int32_t z = input[2], w = input[3];
    int32_t xx = twice_product_shift12(x, x), wx = twice_product_shift12(w, x);
    int32_t xy = twice_product_shift12(x, y), yy = twice_product_shift12(y, y);
    int32_t wy = twice_product_shift12(w, y), xz = twice_product_shift12(x, z);
    int32_t yz = twice_product_shift12(y, z), zz = twice_product_shift12(z, z);
    int32_t wz = twice_product_shift12(w, z);
    output[0] = signed_halfword(4095 - yy - zz);
    output[1] = signed_halfword(xy + wz);
    output[2] = signed_halfword(xz - wy);
    output[3] = signed_halfword(xy - wz);
    output[4] = signed_halfword(4095 - xx - zz);
    output[5] = signed_halfword(wx + yz);
    output[6] = signed_halfword(xz + wy);
    output[7] = signed_halfword(yz - wx);
    output[8] = signed_halfword(4095 - xx - yy);
    return 1;
}

int32_t fifa98_pcmd_quaternion_matrix(void) {
    return quaternion_coefficients(quaternion_input, matrix_output);
}

#define SKIN_JOINTS 32
#define SKIN_ROWS 2048
#define SKIN_VERTICES 512

/* Joint row: parent,qx,qy,qz,qw,tx,ty,tz.
 * Vertex row: joint,globalVertexId,rawX,rawY,rawZ,rawWeight.
 * Matrix row: nine signed 12-fraction rotation coefficients, three translations.
 */
static int32_t skin_joints[SKIN_JOINTS][8];
static int32_t skin_rows[SKIN_ROWS][6];
static int32_t skin_vertices[SKIN_VERTICES][3];
static int32_t skin_matrices[SKIN_JOINTS][12];
static int32_t hierarchy[SKIN_JOINTS][12];
static int64_t weight_totals[SKIN_VERTICES];
static uint16_t row_totals[SKIN_VERTICES];
static uint8_t rigid_vertices[SKIN_VERTICES];
static uint8_t initialized_vertices[SKIN_VERTICES];

uintptr_t fifa98_pcmd_skin_joints(void) { return (uintptr_t)skin_joints; }
uintptr_t fifa98_pcmd_skin_rows(void) { return (uintptr_t)skin_rows; }
uintptr_t fifa98_pcmd_skin_vertices(void) { return (uintptr_t)skin_vertices; }
uintptr_t fifa98_pcmd_skin_matrices(void) { return (uintptr_t)skin_matrices; }

static int32_t signed_word(uint32_t bits) {
    return bits & 0x80000000u ? (int32_t)(bits & 0x7fffffffu) - 2147483647 - 1 : (int32_t)bits;
}

static int32_t mac_shift12(int64_t sum) {
    /* Only the numerical fixed-point dot product is retained. No virtual
     * registers, instructions, timing, flags, projection or hardware state.
     * A signed44 accumulator shifted12 produces a signed32 result.
     */
    uint64_t bits = (uint64_t)sum & ((UINT64_C(1) << 44) - 1);
    int64_t value = bits & (UINT64_C(1) << 43) ? (int64_t)bits - (INT64_C(1) << 44) : (int64_t)bits;
    return value < 0 ? (int32_t)(-((-value + 4095) / 4096)) : (int32_t)(value / 4096);
}

static int32_t saturate_halfword(int32_t value) {
    return value < -32768 ? -32768 : value > 32767 ? 32767 : value;
}

static void transform_point(const int32_t *matrix, const int32_t *point, int32_t *output) {
    for (int32_t row = 0; row < 3; row++) {
        int64_t sum = (int64_t)matrix[9 + row] * 4096;
        for (int32_t column = 0; column < 3; column++) sum += (int64_t)matrix[row * 3 + column] * signed_halfword(point[column]);
        output[row] = mac_shift12(sum);
    }
}

static void compose_rotation(const int32_t *parent, const int32_t *local, int32_t *output, int32_t flip_middle_row) {
    for (int32_t row = 0; row < 3; row++) for (int32_t column = 0; column < 3; column++) {
        int64_t sum = 0;
        for (int32_t component = 0; component < 3; component++) {
            int32_t coefficient = parent[row * 3 + component];
            if (flip_middle_row && row == 1) coefficient = signed_halfword(-coefficient);
            sum += (int64_t)coefficient * local[component * 3 + column];
        }
        int32_t value = saturate_halfword(mac_shift12(sum));
        output[row * 3 + column] = flip_middle_row && row == 1 ? signed_halfword(-value) : value;
    }
}

static int32_t weighted_component(int32_t point, int32_t weight) {
    uint32_t product = (uint32_t)point * (uint32_t)weight;
    uint32_t shifted = product >> 8;
    return product & 0x80000000u ? (int32_t)shifted - 16777216 : (int32_t)shifted;
}

/* Original, unmirrored key-pose geometry before external object/view transforms.
 * Parent composition: 0x80012bd4..0x80012de0.
 * Model scale stage: 0x80012de4..0x80012fc0.
 * Partial contribution stores: 0x800134a8..0x80013598.
 * Returns vertex_count, or -1 for unsupported/corrupt bounded input.
 */
int32_t fifa98_pcmd_skin(int32_t joint_count, int32_t row_count, int32_t vertex_count, int32_t model_scale) {
    if (joint_count < 1 || joint_count > SKIN_JOINTS || row_count < 1 || row_count > SKIN_ROWS ||
        vertex_count < 1 || vertex_count > SKIN_VERTICES || model_scale < 1 || model_scale > 4096) return -1;
    for (int32_t vertex = 0; vertex < vertex_count; vertex++) {
        weight_totals[vertex] = 0; row_totals[vertex] = 0; rigid_vertices[vertex] = 0; initialized_vertices[vertex] = 0;
    }
    for (int32_t joint = 0; joint < joint_count; joint++) {
        const int32_t *input = skin_joints[joint];
        if (input[0] < -1 || input[0] >= joint) return -1;
        for (int32_t component = 1; component < 5; component++) if (input[component] < -524288 || input[component] > 524272) return -1;
        for (int32_t component = 5; component < 8; component++) if (input[component] < -32768 || input[component] > 32767) return -1;
    }
    for (int32_t row = 0; row < row_count; row++) {
        const int32_t *input = skin_rows[row];
        int32_t vertex = input[1];
        if (input[0] < 0 || input[0] >= joint_count || vertex < 0 || vertex >= vertex_count || input[5] < 0 || input[5] > 6553600) return -1;
        if (row && input[0] < skin_rows[row - 1][0]) return -1;
        weight_totals[vertex] += input[5]; row_totals[vertex]++;
        if (input[5] == 6553600) rigid_vertices[vertex] = 1;
    }
    for (int32_t vertex = 0; vertex < vertex_count; vertex++) {
        if (weight_totals[vertex] != 6553600 || (rigid_vertices[vertex] && row_totals[vertex] != 1)) return -1;
    }
    const int32_t root[12] = {4096,0,0,0,-4096,0,0,0,4096,0,0,0};
    const int32_t scale[12] = {model_scale,0,0,0,-model_scale,0,0,0,model_scale,0,0,0};
    for (int32_t joint = 0; joint < joint_count; joint++) {
        const int32_t *input = skin_joints[joint];
        const int32_t *parent = input[0] < 0 ? root : hierarchy[input[0]];
        int32_t local[9];
        quaternion_coefficients(input + 1, local);
        compose_rotation(parent, local, hierarchy[joint], 1);
        transform_point(parent, input + 5, hierarchy[joint] + 9);
        compose_rotation(scale, hierarchy[joint], skin_matrices[joint], 0);
        transform_point(scale, hierarchy[joint] + 9, skin_matrices[joint] + 9);
    }
    for (int32_t row = 0; row < row_count; row++) {
        const int32_t *input = skin_rows[row];
        int32_t vertex = input[1];
        int32_t local[3], point[3];
        for (int32_t component = 0; component < 3; component++) local[component] = signed_halfword(arithmetic_shift_15(input[2 + component]));
        transform_point(skin_matrices[input[0]], local, point);
        if (input[5] == 6553600) {
            for (int32_t component = 0; component < 3; component++) skin_vertices[vertex][component] = point[component];
        } else {
            /* The reviewed positive-weight range makes the original signed
             * multiply-high constant equal floor(raw_weight / 25600).
             * Do not normalize the resulting sum of 0..256 factors.
             */
            int32_t weight = input[5] / 25600;
            for (int32_t component = 0; component < 3; component++) {
                int32_t value = component == 1 ? signed_word(0u - (uint32_t)point[component]) : point[component];
                int32_t contribution = weighted_component(value, weight);
                if (initialized_vertices[vertex]) contribution += skin_vertices[vertex][component];
                skin_vertices[vertex][component] = signed_halfword(contribution);
            }
        }
        initialized_vertices[vertex] = 1;
    }
    for (int32_t vertex = 0; vertex < vertex_count; vertex++) {
        if (!rigid_vertices[vertex]) skin_vertices[vertex][1] = -skin_vertices[vertex][1];
    }
    return vertex_count;
}

/* Non-animated head loader sets object+36 to zero (0x800181d4..0x800181e0).
 * Draw 0x800136e4 therefore uses its incoming body Head_1 matrix directly.
 * BECODE 0x800dce50..0x800dce84 supplies that body joint4 matrix. The original
 * head scale field is bypassed; adding another scale or skeleton is incorrect.
 * Input uses matrix slot0 and the same rigid vertex rows/output buffers.
 */
int32_t fifa98_pcmd_attachment(int32_t row_count, int32_t vertex_count) {
    if (row_count < 1 || row_count > SKIN_VERTICES || row_count != vertex_count) return -1;
    for (int32_t component = 0; component < 9; component++) {
        if (skin_matrices[0][component] < -32768 || skin_matrices[0][component] > 32767) return -1;
    }
    for (int32_t vertex = 0; vertex < vertex_count; vertex++) initialized_vertices[vertex] = 0;
    for (int32_t row = 0; row < row_count; row++) {
        const int32_t *input = skin_rows[row];
        int32_t vertex = input[1];
        if (input[0] != 0 || vertex < 0 || vertex >= vertex_count || initialized_vertices[vertex] || input[5] != 6553600) return -1;
        initialized_vertices[vertex] = 1;
    }
    for (int32_t row = 0; row < row_count; row++) {
        const int32_t *input = skin_rows[row];
        int32_t point[3];
        for (int32_t component = 0; component < 3; component++) point[component] = signed_halfword(arithmetic_shift_15(input[2 + component]));
        transform_point(skin_matrices[0], point, skin_vertices[input[1]]);
    }
    return vertex_count;
}
