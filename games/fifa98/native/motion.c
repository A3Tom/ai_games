/* Original codec-11 delta arithmetic, BECODE.BIN 0x800d5b44..0x800d5bd8.
 * A bounded asset buffer replaces the original packet/cache pointers. No CPU
 * state or console runtime is present. Source evidence: MOTION_RECOVERY.md.
 */
typedef unsigned int u32;
typedef signed int i32;
typedef unsigned char u8;

#define CHANNELS 233u
#define PACKED_BYTES 466u
static i32 previous[CHANNELS], decoded[CHANNELS];
static u32 widths[CHANNELS];
static u8 packed[PACKED_BYTES];

i32 *fifa98_mop_previous(void) { return previous; }
i32 *fifa98_mop_decoded(void) { return decoded; }
u32 *fifa98_mop_widths(void) { return widths; }
u8 *fifa98_mop_packed(void) { return packed; }
u32 fifa98_mop_channel_capacity(void) { return CHANNELS; }
u32 fifa98_mop_packed_capacity(void) { return PACKED_BYTES; }

/* Return the channel count, or -1 without altering output on invalid input.
 * Every packed halfword is loaded little-endian, then consumed MSB first.
 * The original halfword store wraps the sum, including signed overflow.
 */
i32 fifa98_mop_decode_deltas(u32 count, u32 byte_length) {
  if (count > CHANNELS || byte_length > PACKED_BYTES) return -1;
  u32 bits = 0;
  for (u32 index = 0; index < count; index++) {
    if (widths[index] > 16u || previous[index] < -32768 || previous[index] > 32767) return -1;
    bits += widths[index];
  }
  if (((bits + 15u) / 16u) * 2u > byte_length) return -1;
  u32 position = 0;
  for (u32 index = 0; index < count; index++) {
    u32 width = widths[index], value = 0;
    for (u32 bit = 0; bit < width; bit++, position++) {
      u32 offset = (position / 16u) * 2u;
      u32 word = (u32)packed[offset] | ((u32)packed[offset + 1u] << 8u);
      value = (value << 1u) | ((word >> (15u - position % 16u)) & 1u);
    }
    i32 delta = (i32)value;
    if (width && (value & (1u << (width - 1u)))) delta -= (i32)(1u << width);
    u32 sum = ((u32)previous[index] + (u32)delta) & 65535u;
    decoded[index] = sum < 32768u ? (i32)sum : (i32)sum - 65536;
  }
  return (i32)count;
}
