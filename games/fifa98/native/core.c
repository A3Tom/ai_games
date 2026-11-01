#include <stdint.h>

/* BECODE.BIN 0x80102044, European SLES_009.14.
 * A direct reconstruction of the 14-instruction leaf routine, including
 * 32-bit wrapping arithmetic. See native/RECOVERY.md for evidence and limits.
 * Its callers display the result as an integer; a specific player statistic
 * has not yet been established.
 */
uint32_t fifa98_attribute_display(uint32_t value) {
    uint32_t scaled = (value << 6) + UINT32_C(7);
    uint32_t high = (uint32_t)(((uint64_t)scaled * UINT32_C(0x88888889)) >> 32);
    uint32_t result = (high >> 3) + UINT32_C(35);
    return result < UINT32_C(100) ? result : UINT32_C(99);
}

/* BECODE.BIN 0x80124640. Rounded reciprocal with the original sign, wrap,
 * arithmetic-shift and DIVU-by-zero results, expressed as native arithmetic.
 */
uint32_t fifa98_signed_reciprocal(uint32_t value) {
    uint32_t sign = UINT32_C(0) - (value >> 31);
    uint32_t magnitude = (value ^ sign) - sign;
    uint32_t quotient = magnitude ? UINT32_MAX / magnitude : UINT32_MAX;
    uint32_t remainder = magnitude ? UINT32_MAX % magnitude : UINT32_MAX;
    uint32_t half = (magnitude >> 1) | (magnitude & UINT32_C(0x80000000));
    quotient += half < remainder;
    return (quotient ^ sign) - sign;
}

/* Browser platform code, independently written from the texture format.
 * No instruction dispatch, virtual CPU, console RAM or hardware registers.
 * Colour word zero is transparent; bit 15 is retained by the JS asset loader.
 * Semi-transparent draw commands require a later renderer blend stage.
 */
#define PIXEL_CAPACITY (1024u * 1024u)
static uint8_t pixels[PIXEL_CAPACITY];
static uint8_t palette[512];
static uint8_t rgba[PIXEL_CAPACITY * 4];

uint8_t *fifa98_pixels(void) { return pixels; }
uint8_t *fifa98_palette(void) { return palette; }
uint8_t *fifa98_rgba(void) { return rgba; }
uint32_t fifa98_capacity(void) { return PIXEL_CAPACITY; }

static uint8_t expand5(uint32_t colour) {
    return (uint8_t)((colour << 3) | (colour >> 2));
}

int32_t fifa98_decode_indexed(uint32_t width, uint32_t height,
                            uint32_t bits_per_pixel, uint32_t palette_count) {
    if (width == 0 || height == 0 || width > 1024 || height > 1024 ||
        width > PIXEL_CAPACITY / height) return -1;
    if (bits_per_pixel != 4 && bits_per_pixel != 8) return -2;
    if (palette_count == 0 || palette_count > (1u << bits_per_pixel)) return -3;
    uint32_t count = width * height;
    /* Preflight all indices: on failure the previous frame remains intact. */
    for (uint32_t i = 0; i < count; ++i) {
        uint32_t index = bits_per_pixel == 8 ? pixels[i] :
            ((pixels[i >> 1] >> ((i & 1u) * 4)) & 15u);
        if (index >= palette_count) return -4;
    }
    for (uint32_t i = 0; i < count; ++i) {
        uint32_t index = bits_per_pixel == 8 ? pixels[i] :
            ((pixels[i >> 1] >> ((i & 1u) * 4)) & 15u);
        uint32_t colour = (uint32_t)palette[index * 2] |
                          ((uint32_t)palette[index * 2 + 1] << 8);
        rgba[i * 4] = expand5(colour & 31u);
        rgba[i * 4 + 1] = expand5((colour >> 5) & 31u);
        rgba[i * 4 + 2] = expand5((colour >> 10) & 31u);
        rgba[i * 4 + 3] = colour == 0 ? 0 : 255;
    }
    return (int32_t)count;
}
