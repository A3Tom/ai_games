#include <stdint.h>

/* Direct original pitch/net predicates. No goals, restarts, possession or
 * substitute collision response is synthesized. See BALL_BOUNDARY_RECOVERY.md.
 */
extern uint32_t fifa98_fixed_multiply(uint32_t, uint32_t);
extern uint32_t fifa98_signed_reciprocal(uint32_t);
extern int32_t fifa98_ball_heading16(uint32_t, uint32_t, const uint32_t *);
extern int32_t fifa98_player_heading_vector(uint32_t, const uint32_t *, uint32_t *);

static int64_t signed_value(uint32_t value) {
    return (int64_t)(value & UINT32_C(0x7fffffff)) -
        (int64_t)(value & UINT32_C(0x80000000));
}
static uint32_t sar(uint32_t value, uint32_t shift) {
    return (value >> shift) | ((value & UINT32_C(0x80000000)) ?
        UINT32_MAX << (32 - shift) : 0);
}
static uint32_t absolute(uint32_t value) {
    return value & UINT32_C(0x80000000) ? 0 - value : value;
}
static uint32_t divide(uint32_t numerator, uint32_t denominator) {
    uint32_t n = absolute(numerator), d = absolute(denominator);
    uint32_t value = (uint32_t)(((uint64_t)n << 16) / d);
    return (numerator ^ denominator) & UINT32_C(0x80000000) ? 0 - value : value;
}

/* Exact endpoint flag block79C90:A5F8..A668. Half extents and radius are
 * original integer simulation units, not doubled render coordinates. Domain
 * guards are new; return-1 rejects, otherwise return source flag10h or zero. */
int32_t fifa98_ball_outside_pitch(const uint32_t *position,
                                 uint32_t half_width, uint32_t half_length,
                                 uint32_t radius) {
    if (!position || !half_width || !half_length || radius > 256 ||
        half_width + radius > 32767 || half_length + radius > 32767 ||
        half_width > 32767 || half_length > 32767 ||
        position[0] == UINT32_C(0x80000000) ||
        position[2] == UINT32_C(0x80000000)) return -1;
    return absolute(position[2]) > ((half_length + radius) << 16) ||
        absolute(position[0]) > ((half_width + radius) << 16) ? 0x10 : 0;
}

static uint32_t valid_geometry(const uint32_t *geometry) {
    if (!geometry || !geometry[0] || !geometry[1] || !geometry[3] ||
        !geometry[4] || geometry[2] > 256 || geometry[5] > 256 ||
        geometry[6] > 256 || geometry[0] > 32767 || geometry[1] > 32767 ||
        geometry[3] > 32767 || geometry[4] > 32767 ||
        geometry[0] + geometry[2] > 32767 ||
        geometry[1] + geometry[2] > 32767 ||
        geometry[3] + geometry[5] / 2 + geometry[2] > 32767 ||
        geometry[4] + geometry[6] / 2 > 32767 ||
        geometry[3] + geometry[5] / 2 <= geometry[2] ||
        geometry[4] + geometry[6] / 2 <= geometry[2] * 2) return 0;
    for (uint32_t i = 7; i < 11; ++i)
        if (signed_value(geometry[i]) <= 0) return 0;
    return 1;
}

/* Original77068..77194 derived net planes. params9 contains integer half
 * pitch width/length, radius, half goal width, goal height, post/bar diameters,
 * lower net depth and upper net depth. out11 preserves first7 then source
 * bounds8013AF64,8013F128,80133320,8013C51C, all Q16. Tables are verified
 * original atan16[257]/quarter-sine[257]. Return1 or0 invalid, transactional.
 */
int32_t fifa98_ball_boundary_geometry(const uint32_t *params,
                                     const uint32_t *atan16,
                                     const uint32_t *quarter, uint32_t *out) {
    if (!params || !atan16 || !quarter || !out || params[7] > 32767 ||
        params[8] > 32767 || params[1] > 32767 ||
        params[1] + params[7] > 32767 ||
        params[1] + params[8] > 32767) return 0;
    uint32_t staged[11];
    for (uint32_t i = 0; i < 7; ++i) staged[i] = params[i];
    for (uint32_t i = 7; i < 11; ++i) staged[i] = 1;
    if (!valid_geometry(staged)) return 0;
    uint32_t along, across;
    if (params[7] == params[8]) {
        along = across = params[2] << 16;
    } else {
        int32_t heading = fifa98_ball_heading16(params[4] + params[6] / 2,
                                               params[7] - params[8], atan16);
        if (heading == INT32_MIN) return 0;
        /*770AC..B4 divides signed angle by2 toward zero. Resident272E0
         * joint trig differs from27258: subtract shifted positive sin-product.
         * Preserve that rounding instead of reusing separate sine/cosine. */
        uint32_t angle = sar((uint32_t)heading + ((uint32_t)heading >> 31), 1);
        uint32_t coarse[2];
        fifa98_player_heading_vector(sar(angle, 6), quarter, coarse);
        uint32_t correction = ((angle & 63) * UINT32_C(411774)) >> 9;
        uint32_t sine = coarse[0] + sar(sar(coarse[1], 2) * correction, 21);
        uint32_t cosine = coarse[1] - sar(sar(coarse[0], 2) * correction, 21);
        if (!cosine || (cosine & UINT32_C(0x80000000))) return 0;
        uint32_t tangent = divide(sine, cosine);
        if (!tangent) return 0;
        along = fifa98_fixed_multiply(params[2] << 16,
                                      fifa98_signed_reciprocal(tangent));
        across = fifa98_fixed_multiply(params[2] << 16, tangent);
    }
    uint32_t lower = (params[1] + params[7]) << 16;
    uint32_t upper = (params[1] + params[8]) << 16;
    staged[7] = lower - along; staged[8] = upper - across;
    staged[9] = upper + across; staged[10] = lower + across;
    if (!valid_geometry(staged)) return 0;
    for (uint32_t i = 0; i < 11; ++i) out[i] = staged[i];
    return 1;
}

/* Complete contact/constrained branches of77C64,77EB4,78258,7843C. kind0
 * inner side,1 inner roof,2 outer roof,3 outer side. Source77198 computes
 * plane crossing fraction, then original strict predicates preserve earliest
 * tie order. out4=[fraction,x,y,z] is a new diagnostic representation of the
 * original caller's fraction/rounded point. Return1 hit,0 none,-1 invalid;
 * nonhits/rejections write nothing. No net collision response is supplied. */
int32_t fifa98_ball_goal_plane(uint32_t kind, const uint32_t *from,
                               const uint32_t *to, const uint32_t *geometry,
                               uint32_t earliest, uint32_t *out) {
    if (kind > 3 || !from || !to || !out || !valid_geometry(geometry) ||
        !earliest || earliest > 65537) return -1;
    uint32_t side = kind == 0 || kind == 3, outer = kind >= 2;
    uint32_t axis = side ? 0 : 1;
    uint32_t plane = side ? geometry[3] + geometry[5] / 2 :
                            geometry[4] + geometry[6] / 2;
    if (side) plane = outer ? plane + geometry[2] : plane - geometry[2];
    else if (!outer) plane -= geometry[2] * 2;
    plane <<= 16;
    if (side && signed_value(to[0]) <= 0) plane = 0 - plane;
    uint32_t delta = to[axis] - from[axis];
    if (!delta) return 0;
    uint32_t fraction = divide(plane - from[axis], delta);
    if (signed_value(fraction) < 0 || fraction >= earliest) return 0;
    uint32_t point[3];
    for (uint32_t i = 0; i < 3; ++i)
        point[i] = from[i] + fifa98_fixed_multiply(fraction, to[i] - from[i]);
    uint32_t abs_z = absolute(point[2]);
    if (signed_value(abs_z) <= signed_value(geometry[1] << 16)) return 0;
    if (!side) {
        uint32_t width = geometry[3] + geometry[5] / 2;
        width = outer ? width + geometry[2] : width - geometry[2];
        if (signed_value(absolute(point[0])) >= signed_value(width << 16)) return 0;
        uint32_t limit = outer ? geometry[9] : geometry[8];
        if (signed_value(abs_z) >= signed_value(limit)) return 0;
    } else {
        uint32_t ratio = divide(point[1], (geometry[4] + geometry[6] / 2) << 16);
        /* Inner-side ratio denominator subtracts2*radius, matching77D8C. */
        if (!outer) ratio = divide(point[1],
            (geometry[4] + geometry[6] / 2 - geometry[2] * 2) << 16);
        uint32_t lower = outer ? geometry[10] : geometry[7];
        uint32_t upper = outer ? geometry[9] : geometry[8];
        uint32_t interpolated = 0;
        if (signed_value(ratio) > 65536) interpolated = lower - upper;
        else if (signed_value(ratio) >= 0)
            interpolated = fifa98_fixed_multiply(ratio, lower) -
                           fifa98_fixed_multiply(ratio, upper);
        uint32_t limit = lower - interpolated + (outer ? UINT32_C(0x80000) : 0);
        if (signed_value(abs_z) >= signed_value(limit)) return 0;
    }
    out[0] = fraction;
    for (uint32_t i = 0; i < 3; ++i) out[1 + i] = point[i];
    return 1;
}
