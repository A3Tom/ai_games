#include <stdint.h>

/* Direct numeric recovery, not a match/action/contact implementation.
 * Original pointers/globals become bounded native arrays; see
 * BALL_INTERACTION_RECOVERY.md for the exact source paths and domains.
 */
extern uint32_t fifa98_fixed_multiply(uint32_t, uint32_t);
extern uint32_t fifa98_signed_reciprocal(uint32_t);
extern int32_t fifa98_control_heading(uint32_t, uint32_t, const uint8_t *);
extern int32_t fifa98_player_heading_vector(uint32_t, const uint32_t *, uint32_t *);

static uint32_t sar(uint32_t value, uint32_t shift) {
    return (value >> shift) | ((value & UINT32_C(0x80000000)) ?
        (UINT32_MAX << (32 - shift)) : 0);
}
static uint32_t absolute(uint32_t value) {
    return value & UINT32_C(0x80000000) ? 0 - value : value;
}
static int64_t signed_value(uint32_t value) {
    return (int64_t)(value & UINT32_C(0x7fffffff)) -
           (int64_t)(value & UINT32_C(0x80000000));
}

/* BECODE8008AEF0h..8008AF6Ch with the distance mask applied by its action
 * caller8006BF64h. Position and output use integer XYZ. Heading is the signed
 * halfword from actor+414. Only X/Z are written by the original routine: the
 * caller's existing output Y is preserved. This does not select an action,
 * establish ball contact, or turn controller input into a kick.
 */
int32_t fifa98_ball_action_target(const uint32_t *position,
                                 uint32_t stored_distance, uint32_t heading,
                                 const uint32_t *quarter, uint32_t *out) {
    if (!position || !quarter || !out || signed_value(heading) < -32768 ||
        signed_value(heading) > 32767) return 0;
    uint32_t vector[2];
    fifa98_player_heading_vector(heading, quarter, vector);
    uint32_t distance = stored_distance & UINT32_C(0x7ffff);
    uint32_t x = position[0] + fifa98_fixed_multiply(distance, vector[0]);
    uint32_t z = position[2] + fifa98_fixed_multiply(distance, vector[1]);
    out[0] = x; out[2] = z;
    return 1;
}

/* Complete BECODE80124500h..8012463Ch, restricted to magnitudes<=INT_MAX.
 * atan[257] contains original Q16-turn lookup values at80130F74h.
 * Angle period65536, X=sin,Z=cos; equal zero inputs retain original8192.
 * INT32_MIN is the new invalid-input sentinel, outside the valid angle range.
 */
int32_t fifa98_ball_heading16(uint32_t dx, uint32_t dz,
                             const uint32_t *atan) {
    if (!atan || dx == UINT32_C(0x80000000) ||
        dz == UINT32_C(0x80000000)) return INT32_MIN;
    uint32_t x = absolute(dx), z = absolute(dz);
    uint32_t flags = (dz >> 31) * 2 + (dx >> 31) * 4;
    uint32_t angle;
    if (x == z) angle = 8192;
    else {
        if (z < x) {
            uint32_t temporary = x; x = z; z = temporary; flags |= 1;
        }
        uint32_t ratio = (uint32_t)(((uint64_t)x << 32) / z);
        uint32_t index = ratio >> 24;
        uint32_t fraction = (ratio >> 8) & UINT32_C(0xffff);
        uint32_t product = (atan[index + 1] - atan[index]) * fraction;
        angle = atan[index] + (product >> 16);
    }
    switch (flags) {
    case 0: return (int32_t)angle;
    case 1: return (int32_t)(16384 - angle);
    case 2: return (int32_t)(32768 - angle);
    case 3: return (int32_t)(angle + 16384);
    case 4: return -(int32_t)angle;
    case 5: return (int32_t)angle - 16384;
    case 6: return (int32_t)angle - 32768;
    default: return -(int32_t)angle - 16384;
    }
}

/* Resident800271D4h/80027258h. These are the original small-angle corrected
 * sine/cosine lookups, not host trigonometry or a new interpolation formula.
 * Keep low-word multiplication and signed shifts, including negative angles.
 */
int32_t fifa98_ball_heading_vector16(uint32_t angle, const uint32_t *quarter,
                                    uint32_t *out) {
    if (!quarter || !out) return 0;
    uint32_t coarse[2];
    fifa98_player_heading_vector(sar(angle, 6), quarter, coarse);
    uint32_t correction = ((angle & 63) * UINT32_C(411774)) >> 9;
    uint32_t sin_product = sar(coarse[1], 2) * correction;
    uint32_t cos_product = sar(0 - coarse[0], 2) * correction;
    uint32_t sine = coarse[0] + sar(sin_product, 21);
    uint32_t cosine = coarse[1] + sar(cos_product, 21);
    out[0] = sine; out[1] = cosine;
    return 1;
}

/* Original exponential8007CFC0h negative-input branch. Caller supplies exactly
 * the113 original words80125EB8h..80126078h: digits1..31 in rows0..2,1..20
 * in row3. Source row base stride31 words means its unused row-zero cells are
 * the preceding row's last value. Inputs below-681391 return zero before reads.
 * Only the nonpositive branch needed by accepted positive launch parameters
 * is recovered; unrelated positive exponential/logarithm paths are excluded.
 */
uint32_t fifa98_ball_negative_exponential(uint32_t input, const uint32_t *table) {
    if (input == 0) return UINT32_C(65536);
    if (signed_value(input) < -INT64_C(681391)) return 0;
    uint32_t digits = 0 - input, result = 0, row = 0;
    while (digits != 0) {
        uint32_t digit = digits & 31;
        digits >>= 5;
        if (digit != 0) {
            uint32_t factor = table[row * 31 + digit - 1];
            result = result == 0 ? factor : fifa98_fixed_multiply(result, factor);
        }
        ++row;
    }
    return fifa98_signed_reciprocal(result);
}

/* Complete8007D40Ch..8007D484h on an explicit non-overflow input domain:
 * distance0..32767 integer units; parameter0..3167, the largest positive
 * integer for which -677890*parameter remains signed32. parameter0 retains
 * the source15Q16 fallback, although the traced action caller bypasses launch
 * for parameter0. The fixed divide's denominator is1..65536 here, so its
 * complete positive branch is exactly floor((numerator<<16)/denominator).
 */
int32_t fifa98_ball_ground_launch_speed(uint32_t distance, uint32_t parameter,
                                       const uint32_t *exponential,
                                       uint32_t *out) {
    if (!exponential || !out || distance > 32767 || parameter > 3167) return 0;
    uint32_t speed;
    if (parameter == 0) speed = UINT32_C(0x000f0000);
    else {
        uint32_t numerator = fifa98_fixed_multiply(distance << 16, 5242);
        uint32_t exponent = sar(fifa98_fixed_multiply(UINT32_C(0xfff5a7fe),
                                                     parameter << 16), 9);
        uint32_t denominator = UINT32_C(65536) - fifa98_ball_negative_exponential(exponent, exponential);
        if (denominator == 0 || denominator > 65536) return 0;
        uint32_t quotient = (uint32_t)(((uint64_t)numerator << 16) / denominator);
        speed = sar(quotient, 2);
    }
    out[0] = speed;
    return 1;
}

/* Resident8002146Ch..8002154Ch original integer planar length, including its
 * heading quantization and integer division. Different from approximate
 * max+half-min helper used by steering. INT_MIN inputs are not admitted.
 */
uint32_t fifa98_ball_integer_length(uint32_t dx, uint32_t dz,
                                   const uint8_t *atan, const uint32_t *quarter) {
    int32_t heading = fifa98_control_heading(dz, dx, atan);
    uint32_t angle = heading < 0 ? (uint32_t)-heading : (uint32_t)heading;
    if (angle > 256) angle = 512 - angle;
    uint32_t vector[2];
    fifa98_player_heading_vector(angle, quarter, vector);
    uint32_t axis = angle <= 128 ? absolute(dx) : absolute(dz);
    uint32_t denominator = sar(angle <= 128 ? vector[1] : vector[0], 1);
    return denominator == 0 ? UINT32_MAX : (axis << 15) / denominator;
}

/* Numeric target-launch8007CC40h..8007CD34h, specialized to the exact
 * max-speed25Q16 argument from wrapper80075694h. The source deliberately
 * changes speeds above25 to35, rather than clamping them to25.
 *
 * position[3] is original Q16 XYZ; target[3] is wrapper integer XYZ (its Y
 * argument is deliberately ignored/set0). Output[6]=velocityXYZ, selected
 * speedQ16, integer length, signed angle16. Last3 are diagnostic ABI additions.
 * Return original fallback flag0/1; new -1 rejects before writes. No ownership,
 * action timing, contact, spin reset, flags, or predictor state is synthesized.
 */
int32_t fifa98_ball_ground_launch(const uint32_t *position,
                                 const uint32_t *target, uint32_t parameter,
                                 const uint8_t *atan8, const uint32_t *atan16,
                                 const uint32_t *quarter,
                                 const uint32_t *exponential, uint32_t *out) {
    if (!position || !target || !atan8 || !atan16 || !quarter ||
        !exponential || !out || parameter > 3167) return -1;
    if (signed_value(target[0]) < -32768 || signed_value(target[0]) > 32767 ||
        signed_value(target[2]) < -32768 || signed_value(target[2]) > 32767) return -1;
    uint32_t dx = (target[0] << 16) - position[0];
    uint32_t dz = (target[2] << 16) - position[2];
    if (dx == UINT32_C(0x80000000) || dz == UINT32_C(0x80000000)) return -1;
    uint32_t length = fifa98_ball_integer_length(sar(dx, 16), sar(dz, 16), atan8, quarter);
    uint32_t speed;
    if (!fifa98_ball_ground_launch_speed(length, parameter, exponential, &speed)) return -1;
    int32_t flag = signed_value(speed) > INT64_C(0x00190000);
    if (flag) speed = UINT32_C(0x00230000);
    int32_t heading = fifa98_ball_heading16(dx, dz, atan16);
    uint32_t vector[2];
    fifa98_ball_heading_vector16((uint32_t)heading, quarter, vector);
    uint32_t vx = fifa98_fixed_multiply(speed, vector[0]);
    uint32_t vz = fifa98_fixed_multiply(speed, vector[1]);
    out[0] = vx; out[1] = 0; out[2] = vz;
    out[3] = speed; out[4] = length; out[5] = (uint32_t)heading;
    return flag;
}
