#include <stdint.h>

/* Direct native ports of SLES_009.14 BECODE steering 0x8008cd44..0x8008d2d8
 * and the speed-selection prefix 0x8008d2dc..0x8008d560. The ABI replaces
 * source objects with explicit numerical fields, never virtual console memory.
 * Animation requests are refused unless the original BA0C0 guards prove that
 * callback returns zero without calling its animation mutator. See the report.
 */
extern int32_t fifa98_control_heading(uint32_t dx, uint32_t dz,
                                    const uint8_t *atan257);

enum {
    FACING, MOVEMENT_HEADING, DESIRED_FACING, ANGULAR_MAGNITUDE, TURN_CLASS,
    SPEED, MOTION_FLAGS, STATUS_FLAGS, TURN_SIDE, ENTITY_STATE_FLAGS,
    HEADING_DELTA, FACING_SECTOR, COPY_FACING, COPY_MOVEMENT, STATE_WORDS
};

static uint32_t less_signed(uint32_t left, uint32_t right) {
    return (left ^ UINT32_C(0x80000000)) < (right ^ UINT32_C(0x80000000));
}

static uint32_t negative(uint32_t value) { return value >> 31; }

static uint32_t asr(uint32_t value, uint32_t count) {
    uint32_t shifted = value >> count;
    return negative(value) ? shifted | (UINT32_MAX << (32 - count)) : shifted;
}

/* Source folds ten-bit angles to [-511,512], keeping +512 at the tie. */
static uint32_t signed_angle(uint32_t value) {
    value &= 1023;
    return value > 512 ? value - 1024 : value;
}

static uint32_t absolute_angle(uint32_t value) {
    value &= 1023;
    return value > 512 ? 1024 - value : value;
}

static uint32_t classify(uint32_t magnitude, uint32_t prior,
                         const uint32_t *thresholds) {
    if (!less_signed(thresholds[prior * 2], magnitude)) return 0;
    return less_signed(thresholds[prior * 2 + 1], magnitude) ? 2 : 1;
}

static int32_t animation_blocked(uint32_t entity_flags, uint32_t entity_state) {
    return !(entity_flags & 0x200) || entity_state == 1;
}

static int32_t request(uint32_t *detail, uint32_t action, uint32_t heading,
                       uint32_t call_pc) {
    detail[0] = 0;
    detail[1] = action;
    detail[2] = heading;
    detail[3] = call_pc;
    return -2;
}

/* state[14]: facing132, movementHeading136, desiredFacing144,
 * angularMagnitude152, turnClass156, speed160, flags216, status220,
 * side222, entityStateFlags24, headingDelta140, facingSector148,
 * copyFacing16, copyMovement20.
 * input[6]: ticks, distance96, desiredDX100, desiredDZ104,
 * turnCoefficient24, entityFlags36.
 * thresholds[6]: original two-word classification rows for prior classes0..2.
 * detail[4]: original slowdown return, requested action, heading, call PC.
 * Return1 commits success,0 rejects invalid input,-2 reports unsupported
 * animation request. Rejection/request leaves state untouched. All arrays must
 * have the stated size and distinct valid storage. Tick bound is a new guard.
 */
int32_t fifa98_player_steer(uint32_t *state, const uint32_t *input,
                          const uint8_t *atan257, const uint32_t *thresholds,
                          uint32_t *detail) {
    if (!state || !input || !atan257 || !thresholds || !detail ||
        state[TURN_CLASS] > 2 || input[0] > 65535) return 0;
    uint32_t facing = state[FACING], moving = state[MOVEMENT_HEADING];
    uint32_t flags = state[MOTION_FLAGS], prior_class = state[TURN_CLASS];
    uint32_t turn_delta = 0, slowdown = 0, offset;
    uint32_t near_target = less_signed(input[1], 9);
    uint32_t desired = facing;
    if (!near_target) {
        int32_t heading = fifa98_control_heading(input[2], input[3], atan257);
        if (heading == INT32_MIN) return 0;
        desired = (uint32_t)heading;
    }
    uint32_t output_flags = state[STATUS_FLAGS] & 65535;
    if (less_signed(state[SPEED], 19660)) moving = desired;
    if (moving != desired) {
        turn_delta = signed_angle(desired - moving);
        uint32_t magnitude = absolute_angle(desired - moving);
        if (magnitude >= 456) {
            uint32_t preference = signed_angle(state[DESIRED_FACING] - moving);
            if (!negative(preference) && preference != 0 && negative(turn_delta))
                turn_delta += 1024;
            else if (negative(preference) && !negative(turn_delta) && turn_delta != 0)
                turn_delta -= 1024;
        }
        if (magnitude >= 200 && !(flags & 9) &&
            (((flags & 2) && less_signed(state[ANGULAR_MAGNITUDE], 28)) ||
             less_signed(state[SPEED], 19660))) {
            uint32_t action = magnitude < 342 ? (negative(turn_delta) ? 1 : 2) :
                                               (negative(turn_delta) ? 3 : 4);
            if (!animation_blocked(input[5], state[ENTITY_STATE_FLAGS]))
                return request(detail, action, moving, UINT32_C(0x8008ceec));
        }
        uint32_t coefficient = input[4] - (asr(state[SPEED], 16) - 14);
        uint32_t limit = coefficient * input[0];
        if (flags & 32) {
            limit = asr(limit, 1);
            if (less_signed(limit, 2)) limit = 2;
            if (less_signed(turn_delta, 0u - limit)) turn_delta = 0u - limit;
            else if (less_signed(limit, turn_delta)) turn_delta = limit;
        } else if (less_signed(limit, turn_delta)) {
            if (less_signed(coefficient << 2, turn_delta - limit)) slowdown = 1;
            turn_delta = limit;
        } else if (less_signed(turn_delta, 0u - limit)) {
            if (less_signed(turn_delta + limit, (0u - coefficient) << 2)) slowdown = 1;
            turn_delta = 0u - limit;
        }
        moving = signed_angle(moving + turn_delta);
    }
    if ((flags & 16) && !near_target) {
        offset = signed_angle(moving - facing);
        if (flags & 2) output_flags |= 8;
        output_flags |= 64;
    } else if ((flags & 2) && !less_signed(state[SPEED], 19661)) {
        offset = signed_angle(state[DESIRED_FACING] - moving);
        if (less_signed(offset, (uint32_t)-114)) offset = (uint32_t)-114;
        else if (less_signed(114, offset)) offset = 114;
        offset = signed_angle(offset + moving - facing);
        output_flags |= 8;
    } else {
        offset = signed_angle(state[DESIRED_FACING] - facing);
    }
    if ((prior_class == 0 || prior_class == 2) && !(flags & 9) &&
        absolute_angle(offset) >= 428 &&
        !animation_blocked(input[5], state[ENTITY_STATE_FLAGS]))
        return request(detail, 5, state[MOVEMENT_HEADING], UINT32_C(0x8008d11c));
    uint32_t limit = (input[4] + 14) * input[0];
    if (flags & 32) limit = asr(limit, 1);
    if (less_signed(offset, 0u - limit)) offset = 0u - limit;
    else if (less_signed(limit, offset)) offset = limit;
    if (near_target) turn_delta = offset;
    facing = signed_angle(facing + offset);
    uint32_t signed_separation = signed_angle(moving - facing);
    uint32_t magnitude = absolute_angle(moving - facing);
    uint32_t next_class = classify(magnitude, prior_class, thresholds);
    uint32_t side = next_class == 1 && negative(signed_separation) ? 1 : 0;
    uint32_t prior_side = state[TURN_SIDE] & 65535;
    if (prior_class != next_class || prior_side != side) state[ENTITY_STATE_FLAGS] |= 256;
    state[FACING] = facing;
    state[MOVEMENT_HEADING] = moving;
    state[ANGULAR_MAGNITUDE] = magnitude;
    state[TURN_CLASS] = next_class;
    state[STATUS_FLAGS] = output_flags;
    state[TURN_SIDE] = side;
    state[HEADING_DELTA] = turn_delta;
    state[FACING_SECTOR] = ((facing + 64) & 1023) >> 7;
    state[COPY_FACING] = facing;
    state[COPY_MOVEMENT] = moving;
    detail[0] = slowdown; detail[1] = 0; detail[2] = 0; detail[3] = 0;
    return 1;
}

/* control[6]: desiredSpeed176, rangeFlags92, distance96, speedPenalty188,
 * steeringSlowdown, ticks. profile[8] is motion_profile's original output.
 * caps[3] is the original class-dependent speed ceiling table.
 * output[7] matches fifa98_player_motion_integrate's params. Status220 is the
 * only state field updated here. No invented acceleration or turn rate exists.
 */
int32_t fifa98_player_speed_clamp(uint32_t *state, const uint32_t *control,
                                const uint32_t *profile,
                                const uint32_t *thresholds,
                                const uint32_t *caps, uint32_t *output) {
    if (!state || !control || !profile || !thresholds || !caps || !output ||
        state[TURN_CLASS] > 2 || control[5] > 65535) return 0;
    uint32_t target = control[0], flags = state[MOTION_FLAGS];
    uint32_t status = state[STATUS_FLAGS] & 65535;
    if (flags & 0x1c0) {
        uint32_t limit = flags & 0x40 ? 0x18000 : flags & 0x80 ? 0x40000 : 0x68000;
        if (less_signed(limit, target)) target = limit;
    }
    if (!(control[1] & 0x10000) && less_signed(control[2], 160)) {
        if (less_signed(control[2], 8)) target = 0;
        else {
            uint32_t limit = asr(control[2] << 16, 5) + 65536;
            if (less_signed(limit, target)) target = limit;
        }
    }
    uint32_t alternate = !!(flags & 0x100000);
    uint32_t maximum = profile[alternate ? 1 : 0];
    if (flags & 0x6000000) maximum -= control[3];
    if (less_signed(maximum, target)) target = maximum;
    if (alternate) status |= 4;
    uint32_t class_cap = caps[state[TURN_CLASS]];
    if (flags & 2) {
        uint32_t magnitude = absolute_angle(state[DESIRED_FACING] - state[MOVEMENT_HEADING]);
        uint32_t selected = classify(magnitude, state[TURN_CLASS], thresholds);
        if (!less_signed(target, asr(caps[selected], 1))) status |= 1;
    }
    if (less_signed(class_cap, target)) {
        /* D530 is the delay slot of D52C: the target cap applies on both
         * branches. Current speed gates only the following status-bit store. */
        target = class_cap;
        if (!less_signed(state[SPEED], class_cap)) status |= 1;
    }
    if (control[4] && !(flags & 4)) target = 0;
    output[0] = target;
    output[1] = profile[alternate ? 3 : 2];
    output[2] = profile[4];
    output[3] = profile[alternate ? 6 : 5];
    output[4] = profile[7];
    output[5] = control[5];
    output[6] = state[MOVEMENT_HEADING];
    state[STATUS_FLAGS] = status;
    return 1;
}
