#include <stdint.h>

/* Geometry subset of BECODE.BIN 0x800ea250..0x800ea558 and its quad helper.
 * Original resource allocation, colour tables and primitive packets are not
 * reproduced. C arguments replace original globals and object pointers.
 * The original eight-byte vertex slot stores x/y/z in its first six bytes;
 * this ABI returns those three signed halfwords tightly packed.
 */
#define COLUMNS 12u
#define ROWS 16u
#define VERTICES (COLUMNS * ROWS)
#define QUADS ((COLUMNS - 1u) * (ROWS - 1u))

static int16_t pitch_vertices[VERTICES * 3u];
static uint16_t pitch_quads[QUADS * 4u];
static const uint16_t pitch_uv[8] = { 256, 0, 0, 0, 256, 256, 0, 256 };

int16_t *fifa98_pitch_vertices(void) { return pitch_vertices; }
uint16_t *fifa98_pitch_quads(void) { return pitch_quads; }
const uint16_t *fifa98_pitch_uv(void) { return pitch_uv; }
uint32_t fifa98_pitch_vertex_capacity(void) { return VERTICES; }
uint32_t fifa98_pitch_quad_capacity(void) { return QUADS; }

/* fd38/fd3c are half extents. Mode 5's conditional reuse of previous global
 * state is deliberately excluded from this explicit profile lookup. */
int32_t fifa98_pitch_profile_extent(uint32_t profile, uint32_t axis) {
    static const int32_t extents[5][2] = {
        { 4080, 5664 }, { 3840, 5376 }, { 3648, 5088 },
        { 3600, 4800 }, { 2160, 2784 },
    };
    if (profile >= 5 || axis >= 2) return -1;
    return extents[profile][axis];
}

static int32_t signed_word(uint32_t value) {
    return value < UINT32_C(0x80000000) ? (int32_t)value :
        (int32_t)((int64_t)value - INT64_C(4294967296));
}

static int16_t halfword(uint32_t value) {
    uint32_t low = value & 65535u;
    return (int16_t)(low < 32768u ? (int32_t)low : (int32_t)low - 65536);
}

int32_t fifa98_pitch_generate(int32_t x0, int32_t z0, int32_t x1, int32_t z1) {
    int32_t max_x = x0 > x1 ? x0 : x1;
    int32_t min_x = x0 > x1 ? x1 : x0;
    int32_t max_z = z0 > z1 ? z0 : z1;
    int32_t min_z = z0 > z1 ? z1 : z0;
    /* SUBU and subsequent signed constant division in the original code.
     * Preserve wrap even for spans crossing the signed 32-bit boundary. */
    int32_t step_x = signed_word((uint32_t)max_x - (uint32_t)min_x) / 11;
    int32_t step_z = signed_word((uint32_t)max_z - (uint32_t)min_z) / 15;
    for (uint32_t row = 0; row < ROWS; ++row) {
        uint32_t z = (uint32_t)max_z - row * (uint32_t)step_z;
        for (uint32_t column = 0; column < COLUMNS; ++column) {
            uint32_t vertex = row * COLUMNS + column;
            pitch_vertices[vertex * 3] = halfword((uint32_t)max_x - column * (uint32_t)step_x);
            pitch_vertices[vertex * 3 + 1] = 0;
            pitch_vertices[vertex * 3 + 2] = halfword(z);
        }
    }
    for (uint32_t row = 0; row < ROWS - 1; ++row) {
        for (uint32_t column = 0; column < COLUMNS - 1; ++column) {
            uint32_t quad = row * (COLUMNS - 1) + column;
            uint32_t top = row * COLUMNS + column;
            pitch_quads[quad * 4] = (uint16_t)top;
            pitch_quads[quad * 4 + 1] = (uint16_t)(top + 1);
            pitch_quads[quad * 4 + 2] = (uint16_t)(top + COLUMNS);
            pitch_quads[quad * 4 + 3] = (uint16_t)(top + COLUMNS + 1);
        }
    }
    return VERTICES;
}
