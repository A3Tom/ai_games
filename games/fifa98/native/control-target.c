#include <stdint.h>

/* Original control-target arithmetic recovered as direct native C. Source
 * regions, argument adaptations and supported bounds: CONTROL_TARGET_RECOVERY.md.
 * Original pointer/global fields become explicit native arrays and tables.
 * There is no console memory, CPU state, interpreter or instruction dispatcher.
 */
extern uint32_t fifa98_fixed_multiply(uint32_t left, uint32_t right);
extern uint32_t fifa98_planar_distance(uint32_t dx, uint32_t dz);
extern int32_t fifa98_player_heading_vector(uint32_t angle,
                                           const uint32_t *quarter,
                                           uint32_t *out);

static uint32_t signed_less(uint32_t left, uint32_t right) {
    return (left ^ UINT32_C(0x80000000)) < (right ^ UINT32_C(0x80000000));
}

/* Complete resident 80026FD0h..800270FCh, bounded to defined table lookup
 * inputs. quarter[257] is the original byte table from resident 80048E30h.
 * INT_MIN input magnitudes can escape the source's signed abs/lookup domain;
 * reject them and null tables with INT32_MIN. Ordinary inputs retain all
 * source ratio rounding, quadrants, signed angles and atan(0,0)==128.
 */
int32_t fifa98_control_heading(uint32_t dx, uint32_t dz,
                               const uint8_t *quarter) {
    if (!quarter || dx == UINT32_C(0x80000000) ||
        dz == UINT32_C(0x80000000)) return INT32_MIN;
    uint32_t x = dx, z = dz, subtract = 0;
    int32_t base = 0;
    if (z & UINT32_C(0x80000000)) {
        z = UINT32_C(0) - z; subtract = 1; base = 512;
    }
    if (x & UINT32_C(0x80000000)) {
        x = UINT32_C(0) - x; subtract = 1 - subtract; base = -base;
    }
    if (z < x) {
        uint32_t temporary = x; x = z; z = temporary;
        base += subtract ? -256 : 256;
        subtract = 1 - subtract;
    }
    uint32_t angle;
    if (x == z) {
        angle = 128;
    } else {
        uint32_t index;
        if (x & UINT32_C(0xff800000)) {
            /* The two original helpers form x<<32 and divide by z. Their
             * reviewed non-overflow domain is ordinary unsigned division. */
            uint32_t ratio = (uint32_t)(((uint64_t)x << 32) / z);
            index = (ratio >> 24) + ((ratio & UINT32_C(0x00800000)) != 0);
        } else {
            index = ((x << 8) + (z >> 1)) / z;
        }
        angle = quarter[index];
    }
    return subtract ? base - (int32_t)angle : base + (int32_t)angle;
}

/* Complete BECODE 800A4FF0h..800A5054h scalar input/decay helper.
 * Same-sign nonzero input adds, opposite-sign input replaces, and zero input
 * moves previous toward zero by step. Intermediate ADDU/SUBU wrap is retained.
 */
uint32_t fifa98_control_decay(uint32_t input, uint32_t previous,
                             uint32_t step) {
    if (signed_less(0, previous)) {
        if (signed_less(0, input)) return previous + input;
        if (signed_less(input, 0)) return input;
        uint32_t next = previous - step;
        return signed_less(next, 0) ? 0 : next;
    }
    if (!signed_less(previous, 0)) return input;
    if (signed_less(input, 0)) return previous + input;
    if (signed_less(0, input)) return input;
    uint32_t next = previous + step;
    return signed_less(0, next) ? 0 : next;
}

static uint32_t clamp_word(uint32_t value, uint32_t limit) {
    uint32_t lower = UINT32_C(0) - limit;
    if (signed_less(value, lower)) return lower;
    return signed_less(limit, value) ? limit : value;
}

/* Complete numeric behavior of BECODE 800B679Ch..800B68ACh, with the
 * original global dimensions made explicit. target[3]=integerXYZ;
 * bounds[3]=Xlimit,Zlimit,alternateInnerX. Basic mode clamps X/Z to +/-limits.
 * Alternate mode only clamps if wrapped signed abs(X)>innerX-16; its outer
 * limits are Xlimit-16 and Zlimit-16. It deliberately leaves Z untouched when
 * X is inside the inner strip. Y is always untouched. Nonzero selects alternate.
 * New null guard returns zero without writes; successful calls return one.
 */
int32_t fifa98_control_pitch_bound(uint32_t *target, const uint32_t *bounds,
                                   uint32_t alternate) {
    if (!target || !bounds) return 0;
    uint32_t x_limit = bounds[0], z_limit = bounds[1];
    if (alternate) {
        uint32_t x = target[0];
        uint32_t absolute_x = x & UINT32_C(0x80000000) ? UINT32_C(0) - x : x;
        if (!signed_less(bounds[2] - 16, absolute_x)) return 1;
        x_limit -= 16; z_limit -= 16;
    }
    target[0] = clamp_word(target[0], x_limit);
    target[2] = clamp_word(target[2], z_limit);
    return 1;
}

/* Complete BECODE 800A598Ch..800A5B14h target construction, with source
 * controller/entity fields supplied explicitly:
 * offsets[2] = prior entity+52/+60, updated in place;
 * control[7] = analogMode,magnitude,angle16,digitalX,digitalZ,ticks,alternate;
 * position[3] = integerXYZ; bounds[3] as above; quarter[257]=original Q16 sine;
 * target[3] = resulting integerXYZ, Y forced zero then original bounds applied.
 * Original callers require a valid controller/entity; null storage or a tick
 * count outside0..65535 returns zero before writes. Other values retain their
 * source word behavior. Arrays must be valid distinct native storage.
 */
int32_t fifa98_control_target(uint32_t *offsets, const uint32_t *control,
                             const uint32_t *position, const uint32_t *bounds,
                             const uint32_t *quarter, uint32_t *target) {
    if (!offsets || !control || !position || !bounds || !quarter || !target ||
        control[5] > 65535) return 0;
    uint32_t x = offsets[0], z = offsets[1];
    if (control[0] == 1) {
        if (control[1] == 0) {
            x = 0; z = 0;
        } else {
            uint32_t direction[2];
            uint32_t angle = control[2] & UINT32_C(0xffff);
            if (angle & UINT32_C(0x8000)) angle |= UINT32_C(0xffff0000);
            fifa98_player_heading_vector(angle, quarter, direction);
            x = fifa98_fixed_multiply(192, direction[0]);
            z = fifa98_fixed_multiply(192, direction[1]);
        }
    } else if (control[3] || control[4]) {
        x = control[3] == 0 ? 0 : signed_less(control[3], 0) ?
            UINT32_C(0) - 192 : 192;
        z = control[4] == 0 ? 0 : signed_less(control[4], 0) ?
            UINT32_C(0) - 192 : 192;
    } else {
        uint32_t step = control[5] << 5;
        z = fifa98_control_decay(0, z, step);
        x = fifa98_control_decay(0, x, step);
    }
    uint32_t result[3] = {position[0] + x, 0, position[2] + z};
    fifa98_control_pitch_bound(result, bounds, control[6]);
    offsets[0] = x; offsets[1] = z;
    target[0] = result[0]; target[1] = result[1]; target[2] = result[2];
    return 1;
}

/* Complete BECODE 8008E040h..8008E0D8h target-store/delta arithmetic.
 * position[3], target[3], state[7]=storedTargetXYZ,distance,deltaX,deltaZ,flags.
 * The original self-pointer field becomes the explicit stored target fields;
 * original flags bit10000h is cleared. Return is adapted to1 success/0 null;
 * the original distance return remains available in state[3].
 */
int32_t fifa98_control_target_delta(const uint32_t *position,
                                   const uint32_t *target, uint32_t *state) {
    if (!position || !target || !state) return 0;
    uint32_t dx = target[0] - position[0], dz = target[2] - position[2];
    uint32_t distance = fifa98_planar_distance(dx, dz);
    state[0] = target[0]; state[1] = 0; state[2] = target[2];
    state[3] = distance; state[4] = dx; state[5] = dz;
    state[6] &= ~UINT32_C(0x10000);
    return 1;
}

/* New bounded native transfer storage, not a console address space. */
static uint32_t workspace[2048];
uint32_t *fifa98_control_workspace(void) { return workspace; }
uint32_t fifa98_control_workspace_words(void) { return 2048; }
