#include <stdint.h>

/* Source B9EA8/D4684..D4698: action metadata flags become child flags after
 * shifting eight, preserving only the existing child high/linked bits. This
 * formula alone does not initialize linked children or invoke callbacks. */
uint32_t fifa98_action_runtime_flags(uint32_t action_flags, uint32_t retained) {
    return (action_flags >> 8) | (retained & UINT32_C(0x80000020));
}

/* Source D4780..D4820, snapshot initialization of the two clip windows.
 * start/end are signed halfwords at clip+8/+10, not key indices. In particular
 * equal start and (end-2) phases set then clear 0x8000 in this single call.
 * Inputs outside the source halfword domain leave flags unchanged. */
uint32_t fifa98_action_window(uint32_t flags, uint32_t phase,
                              int32_t start_half, int32_t end_half) {
    if (start_half < -32768 || start_half > 32767 ||
        end_half < -32768 || end_half > 32767) return flags;
    int32_t start = start_half * 256, end = (end_half - 2) * 256;
    if (start >= 0 && (int32_t)phase >= start && !(flags & 0x28000))
        flags |= 0xa000;
    if (end >= 0 && (int32_t)phase >= end && !(flags & 0x20000))
        flags = (flags & UINT32_C(0xffff7fff)) | 0x24000;
    return flags;
}

/* Bounded callback-NULL/unlinked/non-fading numerical branch of D4044.
 * state4=[flags,phase,timestamp36,rate60]; out6=[flags,phase,timestamp36,
 * advance,windowTransitions,removalRequired]. transitions1/2 report source flag
 * writes, NOT callbacks or ball effects. No game pointers/callbacks are run.
 * Return0 idle,1 progressed,2 source requests current-child removal;
 * -1 invalid input,-2 a linked/loop/fade/already-finished runtime is unsupported.
 * Source removal precedes timestamp update. The endpoint phase remains the
 * advanced phase with flag0x10; no invented clamping/wrapping is performed.
 * Valid storage of six output and four input words is the caller's obligation.
 */
int32_t fifa98_action_nonloop_step(const uint32_t *state, uint32_t clock,
                                  int32_t start_half, int32_t end_half,
                                  int32_t endpoint, uint32_t *out) {
    if (!state || !out || start_half < -32768 || start_half > 32767 ||
        end_half < -32768 || end_half > 32767 || endpoint < 1 ||
        endpoint > 67106816 || state[1] > (uint32_t)endpoint ||
        state[3] > INT32_MAX) return -1;
    uint32_t flags = state[0], phase = state[1], timestamp = state[2];
    if (flags & 0xb4) return -2; /* loop4,finished10,linked20,fade80 */
    uint32_t staged[6] = {flags, phase, timestamp, 0, 0, 0};
    int32_t result = 0;
    if (!(flags & 0x40) && (int32_t)timestamp < (int32_t)clock) {
        int64_t elapsed = (int64_t)(int32_t)clock - (int32_t)timestamp;
        if (elapsed > INT32_MAX) return -1; /* exclude signed-clock wrap */
        if (elapsed > 3072) elapsed = 3072;
        uint32_t advance = (uint32_t)((elapsed * state[3] + 32768) >> 16);
        if (advance) {
            staged[3] = advance;
            if (!(flags & 0x100)) phase += advance;
            staged[1] = phase;
            if ((int32_t)phase >= endpoint) {
                staged[0] = flags | 0x10;
                staged[5] = 1;
                result = 2;
            } else {
                int32_t start = start_half * 256, end = (end_half - 2) * 256;
                if (start >= 0 && (int32_t)phase >= start && !(flags & 0x28000)) {
                    flags |= 0xa000; staged[4] |= 1;
                }
                if (end >= 0 && (int32_t)phase >= end && !(flags & 0x20000)) {
                    flags = (flags & UINT32_C(0xffff7fff)) | 0x24000;
                    staged[4] |= 2;
                }
                staged[0] = flags;
                staged[2] = clock;
                result = 1;
            }
        }
    }
    for (uint32_t index = 0; index < 6; index++) out[index] = staged[index];
    return result;
}

/* The first256 words remain the sparse-pose transfer area. Calibration uses
 * separate trailing storage; neither consumer retains pointers into the other. */
static int32_t workspace[768];
uintptr_t fifa98_action_workspace(void) { return (uintptr_t)workspace; }
uint32_t fifa98_action_workspace_words(void) { return 768; }

static int32_t halfword(int32_t value) { return value >= -32768 && value <= 32767; }

extern uint32_t fifa98_ball_integer_length(uint32_t, uint32_t, const uint8_t *, const uint32_t *);
extern int32_t fifa98_control_heading(uint32_t, uint32_t, const uint8_t *);

static int32_t calibration_phase(const int32_t *header, int32_t selector) {
    if (selector == -100) return header[2] * 256;
    if (selector == -99) return (header[3] - 2) * 256;
    if (selector == -98) return (header[4] < 0 ? header[2] : header[4]) * 256;
    if (selector == -97) return (header[1] - 1) * (512 << (header[0] & 1));
    return (int32_t)((uint32_t)selector << 8);
}

/* BA460 phase selectors followed by the D0790/D0824 discrete key clamp.
 * header5=[clipFlags,keyCount,signedHeader8,signedHeader10,signedHeader12].
 * out5=[startPhase,endPhase,startKey,endKey,(endPhase-startPhase)>>8].
 * Return1 success,0 original invalid phase/order,-1 malformed native input.
 * Original clip lock/unlock and action lookup are caller responsibilities;
 * no animation object, source address or virtual machine is stored here.
 */
int32_t fifa98_action_calibration_keys(const int32_t *header,
                                      int32_t start_selector,
                                      int32_t end_selector, uint32_t *out) {
    if (!header || !out || header[0] < 0 || header[0] > 65535 ||
        header[1] < 1 || header[1] > 65535 || !halfword(header[2]) ||
        !halfword(header[3]) || !halfword(header[4])) return -1;
    int32_t start = calibration_phase(header, start_selector);
    int32_t end = calibration_phase(header, end_selector);
    if (start < 0 || end < start) return 0;
    uint32_t start_key = (uint32_t)start >> (9 + (header[0] & 1));
    uint32_t end_key = (uint32_t)end >> (9 + (header[0] & 1));
    uint32_t last = (uint32_t)header[1] - 1;
    out[0] = (uint32_t)start; out[1] = (uint32_t)end;
    out[2] = start_key > last ? last : start_key;
    out[3] = end_key > last ? last : end_key;
    out[4] = (uint32_t)(end - start) >> 8;
    return 1;
}

/* BA460 displacement/heading after its two discrete prefix reads. Prefixes
 * contain9 signed raw halfwords; reference0 selects3..5, reference1 selects6..8.
 * mirror is the action row's raw100h bit, normalized to0/1. Only X is mirrored.
 * out4=[integerLength,signedHeading1024,deltaFixedX,deltaFixedZ]. Return1 or
 * -1 malformed input. No interpolation, floating-point norm or power curve.
 * Heading is zero when quantized source length is zero, even for subunit
 * nonzero displacement. All failures preserve output.
 */
int32_t fifa98_action_calibration_vectors(const int32_t *start,
                                         const int32_t *end,
                                         uint32_t start_reference,
                                         uint32_t end_reference,
                                         uint32_t mirror,
                                         int32_t heading_offset,
                                         const uint8_t *atan8,
                                         const uint32_t *sine,
                                         uint32_t *out) {
    if (!start || !end || !atan8 || !sine || !out || start_reference > 1 ||
        end_reference > 1 || mirror > 1 || !halfword(heading_offset)) return -1;
    for (uint32_t index = 0; index < 9; index++)
        if (!halfword(start[index]) || !halfword(end[index])) return -1;
    uint32_t first = 3 + start_reference * 3, last = 3 + end_reference * 3;
    int32_t dx = (end[last] - start[first]) * 4096;
    int32_t dz = (end[last + 2] - start[first + 2]) * 4096;
    if (mirror) dx = -dx;
    uint32_t x = (uint32_t)(dx < 0 ? -dx : dx) >> 16;
    uint32_t z = (uint32_t)(dz < 0 ? -dz : dz) >> 16;
    uint32_t distance = fifa98_ball_integer_length(x, z, atan8, sine);
    int32_t heading = 0;
    if (distance) {
        int32_t direction = fifa98_control_heading((uint32_t)dx, (uint32_t)dz, atan8);
        if (direction == INT32_MIN) return -1;
        heading = (int32_t)(((uint32_t)direction + (uint32_t)heading_offset) & 1023);
        if (heading > 512) heading -= 1024;
    }
    out[0] = distance; out[1] = (uint32_t)heading;
    out[2] = (uint32_t)dx; out[3] = (uint32_t)dz;
    return 1;
}

/* Callback-free, zero-heading sparse key application from D0B44/D0DF0.
 * pose/key each16 rows [tx,ty,tz,qx,qy,qz,qw], raw signed16 components.
 * pose is initialized/retained original state; absent key mask fields remain.
 * map16 is the reviewed source mirror permutation. The original scaled-word
 * pose can represent +32768; this raw-halfword adapter refuses that edge before
 * writes instead of wrapping it or passing malformed data to model consumers.
 * Return1 success,0 invalid/unsupported domain. Buffers must be distinct valid
 * storage. Flags0x160 require a separate phase/linked runtime and are refused.
 */
int32_t fifa98_action_pose(int32_t *pose, const int32_t *key,
                           uint32_t translation_mask, uint32_t rotation_mask,
                           uint32_t runtime_flags, const uint32_t *map) {
    if (!pose || !key || !map || (translation_mask | rotation_mask) > 65535 ||
        (runtime_flags & 0x160)) return 0;
    uint32_t seen = 0;
    for (uint32_t index = 0; index < 16; index++) {
        if (map[index] >= 16 || (seen & (1u << map[index]))) return 0;
        seen |= 1u << map[index];
    }
    if (map[0] != 0) return 0;
    for (uint32_t index = 0; index < 16; index++) if (map[map[index]] != index) return 0;
    for (uint32_t index = 0; index < 112; index++) if (!halfword(pose[index]) || !halfword(key[index])) return 0;
    int32_t staged[112];
    for (uint32_t index = 0; index < 112; index++) staged[index] = pose[index];
    uint32_t mirror = runtime_flags & 1;
    for (uint32_t source = 0; source < 16; source++) {
        uint32_t destination = mirror ? map[source] : source;
        int32_t *out = staged + destination * 7;
        const int32_t *input = key + source * 7;
        if (translation_mask & (1u << source)) {
            out[0] = mirror && source == 0 ? -input[0] : input[0];
            out[1] = input[1];
            out[2] = mirror && source != 0 ? -input[2] : input[2];
        }
        if (rotation_mask & (1u << source)) {
            if (!mirror) for (uint32_t component = 3; component < 7; component++) out[component] = input[component];
            else if (source == 0) {
                out[3] = -input[5]; out[4] = input[6];
                out[5] = -input[3]; out[6] = input[4];
            } else {
                out[3] = -input[3]; out[4] = -input[4];
                out[5] = input[5]; out[6] = input[6];
            }
        }
    }
    for (uint32_t index = 0; index < 112; index++) if (!halfword(staged[index])) return 0;
    for (uint32_t index = 0; index < 112; index++) pose[index] = staged[index];
    return 1;
}
