#include <stdint.h>

/* Original numeric player-placement subset, without camera subtraction.
 * Snapshot source: BECODE 800D6360h/636Ch/63B4h read the signed high halfwords
 * of fixed XYZ at entity+128/+132/+136. Render source: 800D96DCh..800D978Ch
 * shifts each integer left16, arithmetic-right15, then stores signed SH;
 * Y subtracts3 before those shifts. See PLAYER_PLACEMENT_RECOVERY.md.
 * Display-list sentinel/filtering, camera/view and interpolation are excluded.
 */
int32_t fifa98_player_render_position(const uint32_t *fixed_xyz,
                                      int32_t *out_xyz) {
    if (!fixed_xyz || !out_xyz) return 0;
    int32_t result[3];
    for (uint32_t axis = 0; axis < 3; ++axis) {
        uint32_t integer = fixed_xyz[axis] >> 16;
        if (integer & UINT32_C(0x8000)) integer |= UINT32_C(0xffff0000);
        if (axis == 1) integer -= 3;
        uint32_t shifted = integer << 16;
        uint32_t doubled = (shifted >> 15) |
            (shifted & UINT32_C(0x80000000) ? UINT32_C(0xfffe0000) : 0);
        uint32_t halfword = doubled & UINT32_C(0xffff);
        result[axis] = (int32_t)halfword - (halfword & UINT32_C(0x8000) ? 65536 : 0);
    }
    for (uint32_t axis = 0; axis < 3; ++axis) out_xyz[axis] = result[axis];
    return 1;
}
