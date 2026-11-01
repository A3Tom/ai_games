#include <stdint.h>

/* Direct source recovery, not an instruction interpreter. Source addresses,
 * field adaptations and fingerprints are in BALL_MOTION_RECOVERY.md. */
extern uint32_t fifa98_fixed_multiply(uint32_t left, uint32_t right);
extern void fifa98_ball_air_drag(uint32_t *velocity, uint32_t gravity);
extern int32_t fifa98_ball_ground_contact(uint32_t *state, const uint32_t *material);
extern void fifa98_ball_ground_drag(uint32_t *velocity, uint32_t retention);

/* Complete 8008AD3C..8008AD78 initializer. Seed is shifted before adding the
 * six source bytes, retaining word wrap. Do not narrow to16 bits here. */
int32_t fifa98_random_seed(uint32_t seed, uint32_t *state) {
    static const uint8_t initial[6] = {65, 114, 67, 97, 68, 101};
    if (!state) return 0;
    for (uint32_t i = 0; i < 6; ++i) state[i] = (seed << 25) + initial[i];
    return 1;
}

/* Complete 8008AD7C..8008AEEC generator. Original six globals become state[6].
 * Return value also replaces the last-result global8013C66C; no host entropy.
 * UINT32_MAX is a new null-storage guard, outside the successful16-bit result.
 */
uint32_t fifa98_random_next(uint32_t *state) {
    if (!state) return UINT32_MAX;
    uint32_t carry = state[5], result = 0;
    for (uint32_t i = 5; i != 0; --i) {
        uint32_t sum = state[i - 1] + carry;
        result = sum & UINT32_C(0xffff);
        state[i - 1] = result;
        carry = result + (sum >> 16);
    }
    state[5] = (state[5] + 1) & UINT32_C(0xffff);
    if (!state[5]) {
        for (uint32_t i = 5; i != 0; --i) {
            state[i - 1] = (state[i - 1] + 1) & UINT32_C(0xffff);
            if (i == 1) result = state[0];
            if (state[i - 1]) break;
        }
    }
    return result;
}

/* Complete8007A88C..8007AA34 arithmetic including both spin branches.
 * velocity[3] corresponds to a0, spin[1] to a1, options to resident80054480,
 * gravity to80125D18. Bit64 selects the source strong/random-reversal branch;
 * its descriptive game option is unresolved. The source applies drag first,
 * then uses post-drag Z to change X, then UPDATED X to change Z.
 */
int32_t fifa98_ball_air_motion(uint32_t *velocity, uint32_t *spin,
                               uint32_t gravity, uint32_t options,
                               uint32_t *random) {
    if (!velocity || !spin || (*spin && (options & 64) && !random)) return 0;
    /* Reuse the verified zero-spin routine for drag/gravity. Its final Y
     * addition commutes with the X/Z-only curve operations below; there is no
     * callback or externally visible intermediate state in this native ABI. */
    fifa98_ball_air_drag(velocity, gravity);
    if (*spin) {
        uint32_t factor = options & 64 ? UINT32_C(0x4e200) : UINT32_C(10000);
        uint32_t curve = fifa98_fixed_multiply(*spin, velocity[2]);
        velocity[0] += fifa98_fixed_multiply(curve, factor);
        curve = fifa98_fixed_multiply(*spin, velocity[0]);
        velocity[2] -= fifa98_fixed_multiply(curve, factor);
        if ((options & 64) && !(fifa98_random_next(random) & 15))
            *spin = UINT32_C(0) - *spin;
        *spin = fifa98_fixed_multiply(*spin, UINT32_C(0xf9db));
    }
    return 1;
}

static int64_t signed_value(uint32_t value) {
    return (int64_t)(value & UINT32_C(0x7fffffff)) -
           (int64_t)(value & UINT32_C(0x80000000));
}

/* NEW guarded composition: same position/floor/air-or-rolling order as the
 * previous surface tick, now supporting original spin and random state. This
 * is not the complete predictor/contact/event routine. It requires no player,
 * net, wall or post contacts and no special trajectory state. All public
 * arrays must be distinct. Invalid/overflow steps write nothing.
 * Return2 floor branch taken,1 advanced,0 below-ground/invalid,-1 overflow.
 */
int32_t fifa98_ball_motion_tick(uint32_t *state, uint32_t *spin,
                                uint32_t gravity, const uint32_t *material,
                                uint32_t options, uint32_t *random) {
    if (!state || !spin || !material ||
        (*spin && (options & 64) && !random)) return 0;
    if (signed_value(state[1]) < 0) return 0;
    uint32_t staged[9];
    for (uint32_t axis = 0; axis < 3; ++axis) {
        int64_t sum = signed_value(state[axis]) + signed_value(state[axis + 3]);
        if (sum < INT32_MIN || sum > INT32_MAX) return -1;
        staged[axis] = (uint32_t)sum;
        staged[axis + 3] = state[axis + 3];
        staged[axis + 6] = state[axis];
    }
    int32_t contact = fifa98_ball_ground_contact(staged, material);
    if (staged[1] != 0 || staged[4] != 0)
        fifa98_ball_air_motion(staged + 3, spin, gravity, options, random);
    else if (staged[3] != 0 || staged[5] != 0)
        fifa98_ball_ground_drag(staged + 3, material[2]);
    for (uint32_t i = 0; i < 9; ++i) state[i] = staged[i];
    return contact ? 2 : 1;
}

/* Complete8008A90C..8008A940 horizontal displacement norm. Abs, addition and
 * subtraction keep source32-bit wrap, including the INT32_MIN corner case.
 * In76650 these inputs are the LAST consumed trajectory position difference,
 * not the predictor's already drag-updated velocity. */
uint32_t fifa98_ball_visual_speed(uint32_t dx, uint32_t dz) {
    if (signed_value(dx) < 0) dx = UINT32_C(0) - dx;
    if (signed_value(dz) < 0) dz = UINT32_C(0) - dz;
    uint32_t smaller = signed_value(dz) < signed_value(dx) ? dz : dx;
    /* Explicit arithmetic shift without relying on signed right-shift rules. */
    uint32_t half = (smaller >> 1) | (smaller & UINT32_C(0x80000000));
    return dx + dz - half;
}

/* Original visual accumulator tails76580..76610 /76F80..7700C. state[2]
 * replaces ball+6228/+6232. short_path selects764D0 (ball+5984 bit0x20000);
 * the normal76650 path has a different high-speed branch. blocked replaces
 * ball+6240, flags replaces global8013DF48. Source gates preserve BOTH words.
 * New bounded ABI: ticks0..6, valid accumulated phase, mode0/1; invalid calls
 * write nothing. Return1 advanced,2 source-held,0 invalid. No seconds or
 * arbitrary sprite frequency is introduced; see BALL_VISUAL_PHASE_RECOVERY.md.
 */
int32_t fifa98_ball_visual_phase(uint32_t *state, uint32_t speed,
                                uint32_t ticks, uint32_t short_path,
                                uint32_t blocked, uint32_t flags) {
    if (!state || state[0] > UINT32_C(0x3ffff) || state[1] > 3 ||
        ticks > 6 || short_path > 1) return 0;
    if (blocked || (flags & UINT32_C(0x20))) return 2;
    uint32_t threshold = short_path ? UINT32_C(131071) : UINT32_C(32767);
    uint32_t rate;
    if (signed_value(speed) <= signed_value(threshold)) {
        rate = fifa98_fixed_multiply(UINT32_C(25032), speed);
    } else if (short_path) {
        rate = fifa98_fixed_multiply(UINT32_C(3755), speed) + UINT32_C(50065);
    } else {
        rate = fifa98_fixed_multiply(UINT32_C(1134), speed) + UINT32_C(12516);
    }
    uint32_t accumulator = (state[0] + rate * ticks) & UINT32_C(0x3ffff);
    state[0] = accumulator;
    state[1] = accumulator >> 16;
    return 1;
}
