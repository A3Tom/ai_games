#include <stdint.h>

/* Complete numerical selector BECODE 800B92BCh..800B95DCh. Original pointer
 * fields become explicit bounded arrays and source-initialized tables.
 * No machine-code execution, virtual registers or console runtime is present.
 */
static uint32_t selector_state[3], selector_motion[9], phase_state[3];
static uint8_t category_table[252];
static uint16_t action_table[330];
uintptr_t fifa98_locomotion_state(void) { return (uintptr_t)selector_state; }
uintptr_t fifa98_locomotion_motion(void) { return (uintptr_t)selector_motion; }
uintptr_t fifa98_locomotion_categories(void) { return (uintptr_t)category_table; }
uintptr_t fifa98_locomotion_actions(void) { return (uintptr_t)action_table; }
uintptr_t fifa98_locomotion_phase_state(void) { return (uintptr_t)phase_state; }

int32_t fifa98_locomotion_run_variant(uint32_t byte61, uint32_t halfword24) {
    if (byte61 > 255 || halfword24 > 65535) return -1;
    int32_t delta = (int32_t)byte61 - (int32_t)halfword24;
    if (delta < 4) return 0;
    return delta < 8 ? 1 : 2;
}

static int32_t signed_word(uint32_t value) {
    return value & UINT32_C(0x80000000) ? (int32_t)(value & UINT32_C(0x7fffffff)) - INT32_MAX - 1 : (int32_t)value;
}
static int32_t asr(uint32_t value, uint32_t shift) {
    uint32_t high = value >> shift;
    return value & UINT32_C(0x80000000) ? (int32_t)high - (int32_t)(UINT32_C(1) << (32 - shift)) : (int32_t)high;
}

/* state3: category, companion rate word20, deadline halfword28.
 * motion9: speed, turn category, turn value, facing, movement heading,
 *          motion flags24, whole clock, run variant action/reference.
 * Return action ID; UINT32_MAX rejects input before state writes.
 */
uint32_t fifa98_locomotion_select(uint32_t *state, const uint32_t *motion,
                                 const uint8_t *categories, const uint16_t *actions) {
    if (!state || !motion || !categories || !actions || state[0] > 11 || state[2] > 65535 ||
        motion[1] > 2 || motion[7] > 660 || motion[8] > 65535) return UINT32_MAX;
    int32_t speed = asr(motion[0] + 32768, 16);
    if (speed == 0 && signed_word(motion[0]) >= 19661) speed = 1;
    if (speed < 0 || speed > 17) return UINT32_MAX;
    for (uint32_t index = 0; index < 252; index++) if (categories[index] > 10) return UINT32_MAX;
    for (uint32_t index = 0; index < 330; index++) if (!(index < 110 && index % 2) && actions[index] > 660) return UINT32_MAX;
    uint32_t current = state[0] == 11 ? 0 : state[0], flags = motion[5];
    uint32_t style = flags & 4 ? 2 : flags & 1 ? 3 : flags & 2 ? 4 : flags & 8 ? 1 : 0;
    uint32_t next;
    if (motion[1] == 0) next = categories[current * 18 + (uint32_t)speed];
    else if (motion[1] == 2) next = categories[198 + (uint32_t)speed];
    else next = categories[(((motion[3] - motion[4]) & 1023) > 512 ? 216 : 234) + (uint32_t)speed];
    if (next == current && state[2] < motion[6] && motion[1] == 0) next = categories[(uint32_t)speed];
    uint32_t offset = style * 11 + next;
    uint32_t action, reference = 0, adjust_rate = 0, rate = state[1];
    if (flags & 64) action = actions[110 + offset];
    else if (flags & 128) action = actions[165 + offset];
    else {
        int32_t turn = signed_word(motion[2]);
        if (turn < -26) action = actions[110 + offset];
        else if (turn < -9) action = actions[220 + offset];
        else if (turn >= 27) action = actions[165 + offset];
        else if (turn >= 10) action = actions[275 + offset];
        else { action = actions[offset * 2]; reference = actions[offset * 2 + 1]; adjust_rate = 1; }
        if ((flags & 512) && action == 554) { rate = 65536; action = 8; }
        else if ((flags & 32) && action == 499) { rate = 65536; action = 453; }
        else {
            if (action == 499) { action = motion[7]; reference = motion[8]; }
            if (adjust_rate) {
                int32_t delta = signed_word(motion[0] - (reference << 5));
                if (delta < -0x13330) delta = -0x13330;
                if (delta > 0x13330) delta = 0x13330;
                rate = 65536 + (uint32_t)asr((uint32_t)delta, 2);
            } else rate = 0;
        }
    }
    state[0] = next; state[1] = rate;
    return action;
}

/* Isolated same-loop phase arithmetic; excludes event/action callbacks,
 * cross-fades, root motion and wall-clock scheduling. Source B9C58/D4044.
 * state3 = animation clock phase, clip timestamp, clip phase.
 */
int32_t fifa98_locomotion_phase(uint32_t *state, uint32_t delta_q16,
                               uint32_t rate_q16, uint32_t endpoint) {
    if (!state || delta_q16 > 6 * 65536 || rate_q16 > 2 * 65536 || !endpoint ||
        endpoint > 4193280 || state[2] >= endpoint) return 0;
    uint32_t clock = state[0] + (delta_q16 >> 8);
    if (signed_word(state[1]) >= signed_word(clock)) { state[0] = clock; return 1; }
    int32_t elapsed = signed_word(clock - state[1]);
    if (elapsed > 3072) elapsed = 3072;
    /* Matching the reviewed ordered-clock branch implies positive elapsed. */
    if (elapsed < 0) return 0;
    uint32_t advance = (uint32_t)(((uint64_t)(uint32_t)elapsed * rate_q16 + 32768) >> 16);
    state[0] = clock;
    if (advance) { state[1] = clock; state[2] = (uint32_t)(((uint64_t)state[2] + advance) % endpoint); }
    return 1;
}
