#include <stdint.h>

/* Direct numerical recovery of original loft launch and source table builders.
 * No console execution or guessed launch vectors. See BALL_FLIGHT_RECOVERY.md.
 */
extern uint32_t fifa98_fixed_multiply(uint32_t, uint32_t);
extern uint32_t fifa98_ball_integer_length(uint32_t, uint32_t, const uint8_t *, const uint32_t *);
extern uint32_t fifa98_ball_negative_exponential(uint32_t, const uint32_t *);
extern int32_t fifa98_ball_heading16(uint32_t, uint32_t, const uint32_t *);
extern int32_t fifa98_ball_heading_vector16(uint32_t, const uint32_t *, uint32_t *);
extern uint32_t fifa98_random_next(uint32_t *);

static uint16_t horizontal_factors[320], heading_factors[320];
static uint32_t tables_ready;
uintptr_t fifa98_ball_flight_factors(void) { return (uintptr_t)horizontal_factors; }
uintptr_t fifa98_ball_flight_angles(void) { return (uintptr_t)heading_factors; }

static uint32_t sar(uint32_t word, uint32_t count) {
    return (word >> count) | ((word & UINT32_C(0x80000000)) ? UINT32_MAX << (32 - count) : 0);
}
static uint32_t less_signed(uint32_t left, uint32_t right) {
    return (left ^ UINT32_C(0x80000000)) < (right ^ UINT32_C(0x80000000));
}
static uint32_t divide_word(uint32_t numerator, uint32_t denominator) {
    /* Resident27100 numerical signed fixed divide on nonzero bounded inputs.
     * Retain low32 quotient before applying sign, including source overflow. */
    uint32_t n = numerator & UINT32_C(0x80000000) ? 0u - numerator : numerator;
    uint32_t d = denominator & UINT32_C(0x80000000) ? 0u - denominator : denominator;
    uint32_t result = (uint32_t)(((uint64_t)n << 16) / d);
    return (numerator ^ denominator) & UINT32_C(0x80000000) ? 0u - result : result;
}
static void curve(uint32_t *vx, uint32_t *vz, uint32_t *spin) {
    *vx -= fifa98_fixed_multiply(203, *vx);
    *vz -= fifa98_fixed_multiply(203, *vz);
    if (*spin) {
        *vx += fifa98_fixed_multiply(fifa98_fixed_multiply(*spin, *vz), 10000);
        *vz -= fifa98_fixed_multiply(fifa98_fixed_multiply(*spin, *vx), 10000);
        *spin = fifa98_fixed_multiply(*spin, UINT32_C(0xf9db));
    }
}

/* Source7C2F8 and7C438 with caller7CE1C args203,F9DB,10000.
 * Build original mutable tables by direct source recurrence, not a memory dump.
 * A failed lookup-domain guard preserves previously generated tables. */
int32_t fifa98_ball_flight_tables(const uint8_t *atan8,
                                 const uint32_t *atan16,
                                 const uint32_t *sine) {
    if (!atan8 || !atan16 || !sine) return 0;
    uint16_t factors[320], angles[320];
    factors[0] = 0; angles[0] = 0;
    uint32_t x = 65536, z = 0, vx = 65536, vz = 0, spin = 1000;
    for (uint32_t index = 1; index < 320; index++) {
        z += vz;
        curve(&vx, &vz, &spin);
        uint32_t distance = fifa98_ball_integer_length(sar(x, 16), sar(z, 16), atan8, sine);
        if (!distance || distance > 32767) return 0;
        uint32_t factor = divide_word(65536, distance << 16);
        factors[index] = (uint16_t)(less_signed(65535, factor) ? 65535 : factor);
        x += vx;
    }
    x = 0; z = 0; vx = 0; vz = 4 * 65536; spin = (uint32_t)-1000;
    for (uint32_t index = 1; index < 320; index++) {
        z += vz;
        curve(&vx, &vz, &spin);
        int32_t heading = fifa98_ball_heading16(x, z, atan16);
        if (heading == INT32_MIN) return 0;
        angles[index] = (uint16_t)divide_word((uint32_t)heading, (uint32_t)-1000);
        x += vx;
    }
    for (uint32_t index = 0; index < 320; index++) {
        horizontal_factors[index] = factors[index]; heading_factors[index] = angles[index];
    }
    tables_ready = 1;
    return 1;
}

/* Original7D5AC vertical solution. Constants are immutable source80127080,
 * 7084,7088,70A4,70AC, not caller-selected gravity or invented physics.
 * Launch's subsequent discrete air gravity remains its separate source input. */
static int32_t vertical_speed(uint32_t current_y, uint32_t target_y,
                               uint32_t duration, const uint32_t *exponential,
                               uint32_t *output) {
    if (!duration) { *output = 15 * 65536; return 1; }
    uint32_t time = duration << 16;
    uint32_t first = sar(fifa98_fixed_multiply(832149, target_y - current_y), 12);
    uint32_t second = sar(fifa98_fixed_multiply((uint32_t)-2386092, time), 8);
    uint32_t numerator = first - second;
    uint32_t exponent = sar(fifa98_fixed_multiply((uint32_t)-208360, time), 10);
    uint32_t denominator = 65536 - fifa98_ball_negative_exponential(exponent, exponential);
    if (!denominator || denominator > 65536) return 0;
    *output = (uint32_t)-3006669 + divide_word(numerator, denominator);
    return 1;
}

/* Numeric7C590. position/target[3] are fixedQ16 XYZ; duration0..319 is the
 * actual integer source table index. spin is limited to source wrapper range
 * +/-8000, Y inputs0..1024Q16, and integer planar distance0..32767.
 * out8=[vx,vy,vz,horizontalSpeed,integerDistance,heading16,spin,duration].
 * Return original cap flag0/1, or new-1 domain rejection with no output writes.
 * Arrays must have the stated lengths and distinct valid storage. */
int32_t fifa98_ball_loft_launch(const uint32_t *position,
                               const uint32_t *target, uint32_t duration,
                               uint32_t spin, const uint8_t *atan8,
                               const uint32_t *atan16, const uint32_t *sine,
                               const uint32_t *exponential, uint32_t *out) {
    if (!tables_ready || !position || !target || !atan8 || !atan16 || !sine ||
        !exponential || !out || duration > 319 ||
        less_signed(spin, (uint32_t)-8000) || less_signed(8000, spin) ||
        position[1] > 1024 * 65536 || target[1] > 1024 * 65536) return -1;
    uint32_t dx = target[0] - position[0], dz = target[2] - position[2];
    if (dx == UINT32_C(0x80000000) || dz == UINT32_C(0x80000000)) return -1;
    uint32_t distance = fifa98_ball_integer_length(sar(dx, 16), sar(dz, 16), atan8, sine);
    if (distance > 32767) return -1;
    uint32_t horizontal = fifa98_fixed_multiply(horizontal_factors[duration], distance << 16);
    uint32_t vertical;
    if (!vertical_speed(position[1], target[1], duration, exponential, &vertical)) return -1;
    uint32_t capped = 0;
    if (less_signed(35 * 65536, horizontal)) { horizontal = 35 * 65536; capped = 1; }
    if (less_signed(25 * 65536, vertical)) { vertical = 25 * 65536; capped = 1; }
    int32_t heading = fifa98_ball_heading16(dx, dz, atan16);
    if (heading == INT32_MIN) return -1;
    uint32_t angle = (uint32_t)heading - fifa98_fixed_multiply(spin, heading_factors[duration]);
    if (less_signed(65536, angle)) angle -= 65536;
    else if (angle & UINT32_C(0x80000000)) angle += 65536;
    uint32_t direction[2];
    fifa98_ball_heading_vector16(angle, sine, direction);
    out[0] = fifa98_fixed_multiply(horizontal, direction[0]);
    out[1] = vertical;
    out[2] = fifa98_fixed_multiply(horizontal, direction[1]);
    out[3] = horizontal; out[4] = distance; out[5] = angle;
    out[6] = spin; out[7] = duration;
    return (int32_t)capped;
}

/* Wrapper757E4 spin selection after its source reset clears spin. Mode2
 * retains zero without a random call; mode1 negates the sampled source value;
 * mode0 (and other original values) keeps positive. This bounded native ABI
 * admits0..2 only, and stages RNG so rejected launches consume no public draw. */
int32_t fifa98_ball_loft_random_launch(const uint32_t *position,
                                      const uint32_t *target, uint32_t duration,
                                      uint32_t mode, uint32_t *random,
                                      const uint8_t *atan8,
                                      const uint32_t *atan16,
                                      const uint32_t *sine,
                                      const uint32_t *exponential,
                                      uint32_t *out) {
    static const uint32_t spin_table[16] = {2000,3000,3000,4000,4000,4000,5000,5000,5000,6000,6000,6000,7000,7000,8000,8000};
    if (mode > 2 || (mode != 2 && !random)) return -1;
    uint32_t staged[6], spin = 0;
    if (mode != 2) {
        for (uint32_t index = 0; index < 6; index++) staged[index] = random[index];
        spin = spin_table[fifa98_random_next(staged) & 15];
        if (mode == 1) spin = 0u - spin;
    }
    int32_t result = fifa98_ball_loft_launch(position, target, duration, spin, atan8, atan16, sine, exponential, out);
    if (result >= 0 && mode != 2) for (uint32_t index = 0; index < 6; index++) random[index] = staged[index];
    return result;
}
