#include <stdint.h>

/* Direct original owned-ball marker/attachment arithmetic. Ownership and
 * contact acquisition are preconditions, not synthesized game logic.
 * Original global identity comparisons become explicit opaque identity words.
 * See PLAYER_BALL_RECOVERY.md for the exact source regions and guard domain.
 */
extern uint32_t fifa98_fixed_multiply(uint32_t, uint32_t);
extern uint32_t fifa98_signed_reciprocal(uint32_t);
extern int32_t fifa98_player_heading_vector(uint32_t, const uint32_t *, uint32_t *);

static int64_t signed_value(uint32_t value) {
    return (int64_t)(value & UINT32_C(0x7fffffff)) -
           (int64_t)(value & UINT32_C(0x80000000));
}
static uint32_t high_half(uint32_t value) {
    uint32_t high = value >> 16;
    return high & UINT32_C(0x8000) ? high | UINT32_C(0xffff0000) : high;
}
static uint32_t clamp(uint32_t value, uint32_t magnitude) {
    int64_t signed_input = signed_value(value);
    if (signed_input < -(int64_t)magnitude) return 0 - magnitude;
    return signed_input > magnitude ? magnitude : value;
}
static uint32_t valid_half(int32_t value) {
    return value >= -32768 && value <= 32767;
}

/* BECODE D3ADC key-fraction use, D3C34 root interpolation/mirroring and D3E78
 * marker calculation, with BA334..380's controlled motion fixed X/Z supplied
 * explicitly. prefixA/B[9] are ORIGINAL decoded signed-halfword key prefixes;
 * fraction is source low16 interpolation fraction. Both prefix vectors use
 * the same key pair. Heading is the angle passed to D38EC, i.e. source chosen
 * facing plus signed action-row heading offset. It is not the key-prefix
 * heading channel. mirror is runtime child flagbit0; original metadata flag
 * conversion is recovered elsewhere. out[3] is the source fixed marker XYZ.
 * No pose-bone approximation or tuned player-relative offset is substituted.
 */
int32_t fifa98_player_ball_marker(const int32_t *prefix_a,
                                 const int32_t *prefix_b, uint32_t fraction,
                                 const uint32_t *position_xz,
                                 uint32_t heading, uint32_t mirror,
                                 const uint32_t *quarter, uint32_t *out) {
    if (!prefix_a || !prefix_b || !position_xz || !quarter || !out ||
        fraction > 65535 || mirror > 1) return 0;
    for (uint32_t index = 0; index < 9; ++index)
        if (!valid_half(prefix_a[index]) || !valid_half(prefix_b[index])) return 0;
    uint32_t root[3], marker[3];
    for (uint32_t axis = 0; axis < 3; ++axis) {
        uint32_t first = (uint32_t)prefix_a[3 + axis] << 12;
        uint32_t difference = ((uint32_t)prefix_b[3 + axis] -
                               (uint32_t)prefix_a[3 + axis]) << 12;
        root[axis] = first + fifa98_fixed_multiply(fraction, difference);
        first = (uint32_t)prefix_a[6 + axis] << 12;
        difference = ((uint32_t)prefix_b[6 + axis] -
                      (uint32_t)prefix_a[6 + axis]) << 12;
        marker[axis] = first + fifa98_fixed_multiply(fraction, difference);
    }
    uint32_t relative_x = marker[0] - root[0];
    if (mirror) relative_x = 0 - relative_x;
    uint32_t relative_z = marker[2] - root[2];
    uint32_t direction[2];
    fifa98_player_heading_vector(0 - heading, quarter, direction);
    uint32_t cosine = direction[1], sine = direction[0];
    uint32_t x = position_xz[0] + fifa98_fixed_multiply(relative_x, cosine) +
        fifa98_fixed_multiply(relative_z, 0 - sine);
    uint32_t z = position_xz[1] + fifa98_fixed_multiply(relative_x, sine) +
        fifa98_fixed_multiply(relative_z, cosine);
    out[0] = x; out[1] = marker[1]; out[2] = z;
    return 1;
}

/* Complete 7514C integer state update, composed with caller8DF54..98's
 * entity flag1000 and fixed-marker high-halfword/Y-8-clamp conversion.
 * ownership[3]=owner,currentUpdateActor,attachmentActor opaque identity tokens;
 * ball[10]=integerXYZ,previousIntegerXYZ,anchorIntegerXYZ,flags.
 * Source requires a nonnull owner equal to both other identities.
 * Return1 applied,0 source guard false,-1 null. No writes on0/-1.
 */
int32_t fifa98_player_ball_attach(const uint32_t *marker,
                                 const uint32_t *ownership,
                                 uint32_t entity_flags, uint32_t *ball) {
    if (!marker || !ownership || !ball) return -1;
    if (!(entity_flags & UINT32_C(0x1000)) || ownership[0] == 0 ||
        ownership[0] != ownership[1] || ownership[0] != ownership[2]) return 0;
    uint32_t x = high_half(marker[0]), z = high_half(marker[2]);
    uint32_t y = high_half(marker[1]) - 8;
    if (signed_value(y) < 0) y = 0;
    uint32_t previous[3] = {ball[0], ball[1], ball[2]};
    ball[0] = x; ball[1] = y; ball[2] = z;
    ball[3] = previous[0]; ball[4] = previous[1]; ball[5] = previous[2];
    ball[6] = x; ball[7] = y; ball[8] = z;
    ball[9] |= UINT32_C(0x40);
    return 1;
}

/* Bounded no-contact owned-ball predictor path7BAE0..BB84 ->7B790 and the
 * trajectory-position consumer766A4..76760. The original current fixed ball
 * position initializes prediction (76324..3C); it is not quantized/replaced by
 * previous integerXYZ. Over ticks1..6, calculate rounded-reciprocal velocity
 * toward the anchor, clamp each component to source +/-15XZ,+/-10Y, then add
 * that same velocity for each sample. The source approximate-norm tables bound
 * its result to1540977Q16<30Q16 after these clamps (squared input<=550Q16);
 * the report proves this bound for every highest-bit lookup interval.
 *
 * This supported branch requires ground Y0 at both start/anchor, a clear source
 * blocker, pending flag40 and consistent previous integer coordinates. Full
 * field/player/post/net contacts remain caller-excluded; there is no wall or
 * possession acquisition rule here. Caller must stop before those contacts.
 * state[9]=fixedXYZ,velocityXYZ,previousFixedXYZ, matching match.c. On success
 * ball current/previous integers reflect the consumed last sample, flag40 is
 * cleared. Source zero-spin predictor initialization is a caller obligation.
 * Return1 applied,0 source flag/blocker guard false,-1 unsupported/null/ticks;
 * all rejection results leave both buffers unchanged.
 */
int32_t fifa98_player_ball_follow(uint32_t *ball, uint32_t ticks,
                                 uint32_t blocker, uint32_t *state) {
    if (!ball || !state || ticks == 0 || ticks > 6) return -1;
    if (!(ball[9] & UINT32_C(0x40)) || blocker != 0) return 0;
    if (state[1] != 0 || ball[7] != 0) return -1;
    for (uint32_t axis = 0; axis < 3; ++axis) {
        if (signed_value(ball[6 + axis]) < -32768 ||
            signed_value(ball[6 + axis]) > 32767 ||
            ball[3 + axis] != high_half(state[axis])) return -1;
    }
    uint32_t reciprocal = fifa98_signed_reciprocal(ticks << 16);
    uint32_t position[3] = {state[0], state[1], state[2]};
    uint32_t velocity[3], previous[3] = {0, 0, 0};
    for (uint32_t axis = 0; axis < 3; ++axis) {
        int64_t difference = signed_value(ball[6 + axis] << 16) -
                             signed_value(position[axis]);
        if (difference < INT32_MIN || difference > INT32_MAX) return -1;
        velocity[axis] = clamp(fifa98_fixed_multiply((uint32_t)difference,
                                                    reciprocal),
            axis == 1 ? UINT32_C(0x000a0000) : UINT32_C(0x000f0000));
    }
    for (uint32_t sample = 0; sample < ticks; ++sample) {
        for (uint32_t axis = 0; axis < 3; ++axis) {
            previous[axis] = position[axis];
            int64_t next = signed_value(position[axis]) + signed_value(velocity[axis]);
            if (next < INT32_MIN || next > INT32_MAX) return -1;
            position[axis] = (uint32_t)next;
        }
    }
    for (uint32_t axis = 0; axis < 3; ++axis) {
        state[axis] = position[axis]; state[3 + axis] = velocity[axis];
        state[6 + axis] = previous[axis];
        ball[axis] = high_half(position[axis]);
        ball[3 + axis] = high_half(previous[axis]);
    }
    ball[9] &= ~UINT32_C(0x40);
    return 1;
}
