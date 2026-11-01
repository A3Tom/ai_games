#include <stdint.h>

/* Source B9EA8/D4684..D4698: action metadata flags become child flags after
 * shifting eight, preserving only the existing child high/linked bits. This
 * formula alone does not initialize linked children or invoke callbacks. */
uint32_t fifa98_action_runtime_flags(uint32_t action_flags, uint32_t retained) {
    return (action_flags >> 8) | (retained & UINT32_C(0x80000020));
}

static int32_t workspace[256];
uintptr_t fifa98_action_workspace(void) { return (uintptr_t)workspace; }
uint32_t fifa98_action_workspace_words(void) { return 256; }

static int32_t halfword(int32_t value) { return value >= -32768 && value <= 32767; }

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
