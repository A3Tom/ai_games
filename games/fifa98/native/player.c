#include <stdint.h>

/* Original player/controller arithmetic, recovered as direct native C.
 * See PLAYER_RECOVERY.md and scripts/player-recovery.mjs for reviewed bytes.
 * This is not a complete player tick: original speed/steering selection,
 * animated height and contacts remain caller responsibilities.
 */
extern uint32_t fifa98_fixed_multiply(uint32_t left, uint32_t right);
extern uint32_t fifa98_signed_reciprocal(uint32_t value);

static uint32_t signed_less(uint32_t left, uint32_t right) {
    return (left ^ UINT32_C(0x80000000)) < (right ^ UINT32_C(0x80000000));
}

static uint32_t arithmetic_half(uint32_t value) {
    return (value >> 1) | (value & UINT32_C(0x80000000));
}

/* Resident 80021550h..80021688h. The 257-entry original Q16 quarter-sine
 * table is supplied as native data, extracted from SLES_009.14 by the report.
 * Outputs X=sin(angle), Z=cos(angle); original angle period is 1024.
 * New null-storage guard returns zero without writing; success returns one.
 */
int32_t fifa98_player_heading_vector(uint32_t angle, const uint32_t *quarter,
                                    uint32_t *out) {
    if (!quarter || !out) return 0;
    uint32_t offset = angle & 255;
    uint32_t low = quarter[offset], high = quarter[256 - offset];
    switch ((angle >> 8) & 3) {
        case 0: out[0] = low; out[1] = high; break;
        case 1: out[0] = high; out[1] = UINT32_C(0) - low; break;
        case 2: out[0] = UINT32_C(0) - low; out[1] = UINT32_C(0) - high; break;
        default: out[0] = UINT32_C(0) - high; out[1] = low; break;
    }
    return 1;
}

/* Complete BECODE 8009EDA0h..8009EDD4h digital direction mapper.
 * Original tables 80127FB8h/7FC8h/7FD4h map the low button nibble to an
 * index0..8 and signed X/Z components. Opposing/invalid combinations retain
 * the actual neutral mappings; the function invents no diagonal normalization.
 * Return is original direction index, or UINT32_MAX for new null-output guard.
 */
uint32_t fifa98_player_digital_direction(uint32_t buttons, uint32_t *out) {
    static const uint8_t indices[16] = {0,1,5,0,3,2,4,0,7,8,6,0,0,0,0,0};
    static const int8_t x[9] = {0,1,1,0,-1,-1,-1,0,1};
    static const int8_t z[9] = {0,0,-1,-1,-1,0,1,1,1};
    if (!out) return UINT32_MAX;
    uint32_t index = indices[buttons & 15];
    out[0] = (uint32_t)(int32_t)x[index];
    out[1] = (uint32_t)(int32_t)z[index];
    return index;
}

/* Data-selection/arithmetic subset of 800A5288h..800A5398h and 800B8F74h.
 * Parameters are explicit original attribute byte48/byte58 indices, attribute
 * flags word64, and the already-resolved 800A86BCh branch result.
 * out[8] = normal maximum; alternate maximum; normal acceleration;
 *          alternate acceleration; deceleration; reciprocal normal accel;
 *          reciprocal alternate accel; reciprocal deceleration.
 * New bounds restrict the source's twenty reviewed table entries, with no
 * invented named-player/rating mapping or guessed active settings.
 */
int32_t fifa98_player_motion_profile(uint32_t index48, uint32_t index58,
                                    uint32_t attribute_flags,
                                    uint32_t alternate_base, uint32_t *out) {
    static const uint32_t acceleration[20] = {
        11468,11468,11468,11468,11468,11468,11468,13107,13107,14745,
        16384,18022,19660,21299,22937,24576,26214,27852,29491,31129
    };
    static const uint32_t addend[20] = {
        98304,104857,111411,111411,117964,117964,124518,124518,131072,131072,
        137625,137625,144179,150732,157286,163840,170393,176947,183500,196608
    };
    static const uint32_t normal_base[20] = {
        281804,288358,294912,301465,308019,314572,321126,321126,327680,327680,
        334233,334233,347340,353894,360448,373555,380108,386662,393216,393216
    };
    static const uint32_t alternate[20] = {
        314572,314572,314572,321126,321126,327680,327680,334233,334233,340787,
        340787,347340,347340,347340,347340,347340,353894,353894,360448,360448
    };
    if (!out || index48 >= 20 || index58 >= 20 || alternate_base > 1) return 0;
    uint32_t base = alternate_base ? alternate[index58] :
        (attribute_flags & 1 ? UINT32_C(0x30000) : normal_base[index58]);
    uint32_t rate = acceleration[index48], alternate_rate = addend[index48] >> 1;
    uint32_t inverse = fifa98_signed_reciprocal(rate);
    out[0] = base; out[1] = base + addend[index48];
    out[2] = rate; out[3] = alternate_rate; out[4] = rate;
    out[5] = inverse; out[6] = fifa98_signed_reciprocal(alternate_rate);
    out[7] = inverse;
    return 1;
}

/* Complete control arithmetic from 800A5628h..800A5720h, after adapting
 * the entity/controller pointer fields to explicit native words.
 * state[2] = targetSpeed, entityFlags; control[5] = controllerPresent,
 * analogMode, magnitude, normalMaximum, actionState.
 * Return zero for null/no controller (no writes), one otherwise. The analog
 * path consumes/clears entity flag100000h, exactly as the original.
 */
int32_t fifa98_player_target_speed(uint32_t *state, const uint32_t *control) {
    if (!state || !control || !control[0]) return 0;
    if (control[1] && (state[1] & UINT32_C(0x100000))) {
        state[1] &= ~UINT32_C(0x100000);
        uint32_t magnitude = control[2], target;
        if (magnitude == 0) target = 0;
        else if (signed_less(magnitude, 26214)) target = UINT32_C(0x19999);
        else if (signed_less(UINT32_C(0xa665), magnitude))
            target = fifa98_fixed_multiply(magnitude, control[3]);
        else target = UINT32_C(0x48000);
        if (control[4] == 8 && !signed_less(UINT32_C(0x6bfff), target))
            target = UINT32_C(0x6c000);
        state[0] = target;
    } else {
        state[0] = control[3];
    }
    return 1;
}

static void advance(uint32_t *position, uint32_t distance,
                    const uint32_t *heading) {
    position[0] += fifa98_fixed_multiply(distance, heading[0]);
    position[1] += fifa98_fixed_multiply(distance, heading[1]);
}

/* Physics subset 8008D564h..8008D7BCh of original 8008D2DCh motion routine.
 * ABI adaptation, all values original 32-bit bit patterns:
 * state[6] = fixed X,Z; speed; velocity X,Z; heading.
 * params[7] = post-clamp target speed; acceleration; deceleration;
 *             reciprocal acceleration; reciprocal deceleration; ticks; heading.
 * Original unit-vector calls use the verified resident quarter table above.
 * The caller must supply speed/profile after original flags/range clamps and
 * steering decisions. This does not substitute an invented control policy.
 * Animated Y, model callbacks, contacts and remaining caller side effects
 * are excluded. Return one on success, zero for null/invalid tick domain;
 * failure leaves state untouched. Arrays must be valid, distinct storage.
 */
int32_t fifa98_player_motion_integrate(uint32_t *state, const uint32_t *params,
                                      const uint32_t *quarter) {
    if (!state || !params || !quarter || params[5] > 65535) return 0;
    uint32_t target = params[0], current = state[2], time = params[5] << 16;
    uint32_t heading[2];
    fifa98_player_heading_vector(params[6], quarter, heading);
    uint32_t position[2] = {state[0], state[1]};
    const uint32_t stop_threshold = 19660;
    if (current == target) {
        if (!signed_less(target, stop_threshold)) {
            /* The original SLL1/SRA1 preserves a signed 31-bit value. */
            uint32_t speed31 = arithmetic_half(target << 1);
            advance(position, fifa98_fixed_multiply(speed31, time), heading);
        }
    } else {
        uint32_t slowing = signed_less(target, current);
        uint32_t difference = slowing ? current - target : target - current;
        uint32_t duration = fifa98_fixed_multiply(difference,
                                                params[slowing ? 4 : 3]);
        if (!signed_less(duration, time)) {
            uint32_t change = fifa98_fixed_multiply(params[slowing ? 2 : 1], time);
            target = slowing ? current - change : current + change;
            if (!signed_less(current, stop_threshold) ||
                !signed_less(target, stop_threshold)) {
                uint32_t mean = arithmetic_half(current + target);
                advance(position, fifa98_fixed_multiply(mean, time), heading);
            }
        } else {
            if (!signed_less(current, stop_threshold) ||
                !signed_less(target, stop_threshold)) {
                uint32_t mean = arithmetic_half(current + target);
                advance(position, fifa98_fixed_multiply(mean, duration), heading);
            }
            time -= duration;
            if (!signed_less(target, stop_threshold)) {
                uint32_t speed31 = arithmetic_half(target << 1);
                advance(position, fifa98_fixed_multiply(speed31, time), heading);
            }
        }
    }
    state[0] = position[0]; state[1] = position[1];
    /* 8008B050h writes scalar speed, rounded components and heading. */
    state[2] = target;
    state[3] = fifa98_fixed_multiply(target, heading[0]);
    state[4] = fifa98_fixed_multiply(target, heading[1]);
    state[5] = params[6];
    return 1;
}
