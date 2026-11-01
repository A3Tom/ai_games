#include <stdint.h>

/* Direct native arithmetic/state recovery from the SLES_009.14 backend.
 * Evidence and image/region fingerprints are emitted by match-recovery.mjs.
 * These functions are original simulation support, not a complete match loop.
 * No emulated addresses, CPU register file, instruction dispatch or PS1 runtime
 * are used: original global/struct fields become explicit typed arguments.
 */

static uint32_t signed_less(uint32_t left, uint32_t right) {
    return (left ^ UINT32_C(0x80000000)) < (right ^ UINT32_C(0x80000000));
}

static uint32_t arithmetic_half(uint32_t value) {
    return (value >> 1) | (value & UINT32_C(0x80000000));
}

/* BECODE 0x800618f4..0x8006193c inside the team distance update.
 * Input deltas and output retain original 32-bit bit patterns. In particular,
 * abs(INT_MIN) wraps instead of introducing C signed-overflow undefined behavior.
 * For ordinary coordinates: max(abs(dx),abs(dz)) + ceil(min(abs(dx),abs(dz))/2).
 */
uint32_t fifa98_planar_distance(uint32_t dx, uint32_t dz) {
    uint32_t x = dx & UINT32_C(0x80000000) ? UINT32_C(0) - dx : dx;
    uint32_t z = dz & UINT32_C(0x80000000) ? UINT32_C(0) - dz : dz;
    uint32_t smaller = signed_less(z, x) ? z : x;
    return x + z - arithmetic_half(smaller);
}

/* BECODE 0x80061818..0x800619a0, full rolling symmetric-distance routine.
 * ABI adaptation:
 *   team player pointers and +98h/+A0h coordinates -> xz[count][2];
 *   team+774h -> count; global 80124A14h[team] -> row/return value;
 *   global 8013B448h -> ticks; team+14Ch -> matrix[11][11].
 * Matrix cells not visited by this tick, including diagonals, are untouched.
 * The original central tick derives ticks from a 16-bit accumulator carry.
 * Bounds below reject inputs outside that recovered storage/timing domain
 * before writing anything; they do not substitute approximate game behavior.
 */
uint32_t fifa98_distance_rows(const uint32_t *xz, uint32_t count,
                             uint32_t row, uint32_t ticks, uint32_t *matrix) {
    if (!xz || !matrix || count == 0 || count > 11 || row > count || ticks > 65535)
        return UINT32_MAX;
    uint32_t initial_row = row;
    uint32_t rows = ticks << 1;
    for (uint32_t iteration = 0; iteration < rows; ++iteration) {
        if (row >= count - 1) row = 0;
        uint32_t x = xz[row * 2];
        uint32_t z = xz[row * 2 + 1];
        for (uint32_t other = row + 1; other < count; ++other) {
            uint32_t distance = fifa98_planar_distance(xz[other * 2] - x,
                                                     xz[other * 2 + 1] - z);
            matrix[row * 11 + other] = distance;
            matrix[other * 11 + row] = distance;
        }
        ++row;
        if (row == initial_row) break;
    }
    return row;
}

/* BECODE 0x8006a120..0x8006a164, complete 16.16 accumulator leaf.
 * Original globals 8013B440h and 8013B444h become clock[whole, fraction].
 * The addition wraps before carry extraction, exactly as ADDU on the PS1.
 * The original return register is unused; this native interface is void.
 */
void fifa98_tick_accumulate(uint32_t *clock, uint32_t delta) {
    uint32_t sum = clock[1] + delta;
    uint32_t carry = sum >> 16;
    clock[1] = sum & UINT32_C(0xffff);
    if (carry != 0) clock[0] += carry;
}

static int64_t signed_value(uint32_t value) {
    return (int64_t)(value & UINT32_C(0x7fffffff)) -
           (int64_t)(value & UINT32_C(0x80000000));
}

/* Resident SLES_009.14 0x800271a8..0x800271d0, complete leaf routine.
 * Signed 16.16 multiplication, rounded by adding 0x8000 before extracting
 * product bits 16..47. Ties therefore round toward positive infinity.
 * Explicit floor division avoids implementation-defined negative C shifts.
 */
uint32_t fifa98_fixed_multiply(uint32_t left, uint32_t right) {
    int64_t biased = signed_value(left) * signed_value(right) + INT64_C(32768);
    int64_t shifted = biased >= 0 ? biased / INT64_C(65536) :
        -((-biased + INT64_C(65535)) / INT64_C(65536));
    return (uint32_t)shifted;
}

/* Exact multiply-high/shift expression at BECODE 0x8007a9ec..0x8007aa18.
 * For all signed 32-bit inputs it is truncation toward zero of gravity/3600.
 * Kept as the original constant expression, including its wrapping intermediate.
 */
static uint32_t gravity_component(uint32_t gravity) {
    int64_t product = signed_value(gravity) * -INT64_C(1851608123);
    uint32_t high = (uint32_t)((uint64_t)product >> 32);
    uint32_t sum = high + gravity;
    uint32_t shifted = (sum >> 11) |
        (sum & UINT32_C(0x80000000) ? UINT32_C(0xffe00000) : UINT32_C(0));
    return shifted - (UINT32_C(0) - (gravity >> 31));
}

/* BECODE 0x8007a88c..0x8007aa34, only the exact *spin==0 branch.
 * Three rounded fixed-multiply drag operations followed by gravity on Y.
 * Original global 80125D18h becomes the gravity argument; the verified disc
 * stores FE000000h (-33554432), yielding a velocity increment of -9320.
 * The spin/random branches and external collision processing are not replaced.
 */
void fifa98_ball_air_drag(uint32_t *velocity, uint32_t gravity) {
    for (uint32_t axis = 0; axis < 3; ++axis)
        velocity[axis] -= fifa98_fixed_multiply(UINT32_C(203), velocity[axis]);
    velocity[1] += gravity_component(gravity);
}

/* A new bounded native ABI combines two recovered no-contact blocks:
 *   8007ABE0h..8007AC2Ch: previous XYZ = position XYZ; position XYZ += velocity;
 *   8007A88Ch..8007AA34h: the spin==0 airborne velocity branch above.
 * State = [position XYZ, velocity XYZ, previous XYZ], each a 16.16 word.
 * A successful call follows the original prediction order. This is NOT the
 * complete trajectory predictor: unresolved collision/net/post/ground paths
 * occur between these blocks in the original. Stop before ground contact;
 * no bounce, collision approximation or automatic relaunch is fabricated.
 * Return 1: advanced; 0: ground contact required; -1: invalid/overflow domain.
 * Failure leaves all nine words untouched.
 */
int32_t fifa98_ball_free_tick(uint32_t *state, uint32_t gravity) {
    if (!state) return -1;
    if (signed_value(state[1]) < 0) return 0;
    uint32_t next[3];
    for (uint32_t axis = 0; axis < 3; ++axis) {
        int64_t sum = signed_value(state[axis]) + signed_value(state[axis + 3]);
        if (sum < INT32_MIN || sum > INT32_MAX) return -1;
        next[axis] = (uint32_t)sum;
    }
    if (signed_value(next[1]) <= 0) return 0;
    for (uint32_t axis = 0; axis < 3; ++axis) {
        state[axis + 6] = state[axis];
        state[axis] = next[axis];
    }
    fifa98_ball_air_drag(state + 3, gravity);
    return 1;
}

/* Original tables at BECODE 80125D1Ch, 80125D44h and 80125D6Ch.
 * 80074440h indexes each table as [resident setting 80054448h][80054444h].
 * Their descriptive setting names are unresolved; do not invent surface or
 * weather labels. This extracts only the three table values, not the setting
 * initializer's further calls. out = [vertical, horizontal, rolling retention].
 * Invalid row/column/storage returns zero without writing.
 */
int32_t fifa98_ball_surface_material(uint32_t row, uint32_t column,
                                    uint32_t *out) {
    static const uint32_t tables[3][10] = {
        {0x9eb8,0x9eb8,0x9eb8,0x9eb8,0x9eb8,0x9999,0xa666,0x8000,0x4000,0x8ccc},
        {0xbae1,0xbae1,0xbae1,0xbae1,0xbae1,0xb851,0xb851,0xb333,0xe666,0xc000},
        {0xfd70,0xfd70,0xfd70,0xfd70,0xfd70,0xfae1,0xfd70,0xf5c2,0xf333,0xf851}
    };
    if (!out || row >= 2 || column >= 5) return 0;
    uint32_t index = row * 5 + column;
    for (uint32_t field = 0; field < 3; ++field) out[field] = tables[field][index];
    return 1;
}

/* Exact physics-only ground branch from 80079E98h..80079F98h.
 * state uses the nine-word ABI above; material is [vertical, horizontal,
 * rolling retention]. Only signed position.Y < 0 enters this branch; Y == 0
 * is deliberately untouched. Return 1 for contact, 0 otherwise, -1 for null.
 * Original flags, event/counter records and callbacks are NOT implemented by
 * this helper. It is not the complete 80079C90h contact processor.
 */
int32_t fifa98_ball_ground_contact(uint32_t *state, const uint32_t *material) {
    if (!state || !material) return -1;
    if (!signed_less(state[1], 0)) return 0;
    state[1] = 0;
    state[4] = UINT32_C(0) - fifa98_fixed_multiply(state[4], material[0]);
    state[3] = fifa98_fixed_multiply(state[3], material[1]);
    state[5] = fifa98_fixed_multiply(state[5], material[1]);
    if (!signed_less(UINT32_C(0xbfff), state[4])) state[4] = 0;
    return 1;
}

/* Complete original 8007AA38h..8007AB28h ground-drag routine, with explicit
 * velocity and rolling-retention arguments. Y is unchanged. Preserve its
 * signed abs(INT_MIN), wrapped squared sum and two-stage stopping test,
 * including edge cases outside ordinary ball velocities.
 */
void fifa98_ball_ground_drag(uint32_t *velocity, uint32_t retention) {
    uint32_t x = fifa98_fixed_multiply(velocity[0], retention);
    uint32_t z = fifa98_fixed_multiply(velocity[2], retention);
    velocity[0] = x;
    velocity[2] = z;
    uint32_t abs_x = x & UINT32_C(0x80000000) ? UINT32_C(0) - x : x;
    uint32_t abs_z = z & UINT32_C(0x80000000) ? UINT32_C(0) - z : z;
    if (signed_less(abs_x, 6553) && signed_less(abs_z, 6553)) {
        uint32_t square_sum = x * x + z * z;
        if (!signed_less(UINT32_C(0x028f3d70), square_sum)) {
            velocity[0] = 0;
            velocity[2] = 0;
        }
    }
}

/* New bounded composition of original position, isolated-ground and no-spin
 * drag paths, in their observed order. It requires a neutral predictor state,
 * no spin and no intervening contact with players, walls, posts or nets.
 * The nine-word ABI omits the original predictor's event/record machinery.
 * Return 2: ground branch taken; 1: advanced without ground crossing;
 * 0: starts below ground (full contact processing required); -1: null/overflow.
 * Failure leaves state untouched. A zero-height exact landing does not bounce;
 * the original strict-negative contact guard is preserved on the next step.
 */
int32_t fifa98_ball_surface_tick(uint32_t *state, uint32_t gravity,
                                const uint32_t *material) {
    if (!state || !material) return -1;
    if (signed_value(state[1]) < 0) return 0;
    uint32_t next[3];
    for (uint32_t axis = 0; axis < 3; ++axis) {
        int64_t sum = signed_value(state[axis]) + signed_value(state[axis + 3]);
        if (sum < INT32_MIN || sum > INT32_MAX) return -1;
        next[axis] = (uint32_t)sum;
    }
    for (uint32_t axis = 0; axis < 3; ++axis) {
        state[axis + 6] = state[axis];
        state[axis] = next[axis];
    }
    int32_t contact = fifa98_ball_ground_contact(state, material);
    if (state[1] != 0 || state[4] != 0) {
        fifa98_ball_air_drag(state + 3, gravity);
    } else if (state[3] != 0 || state[5] != 0) {
        fifa98_ball_ground_drag(state + 3, material[2]);
    }
    return contact ? 2 : 1;
}

/* Browser/test transfer storage, newly written platform code. The caller owns
 * its layout; it is not a virtual console address space or a fake match state.
 */
static uint32_t workspace[512];
uint32_t *fifa98_match_workspace(void) { return workspace; }
uint32_t fifa98_match_workspace_words(void) { return 512; }
