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

/* Source7C71C duration selection. distanceQ16 is integer_length<<16 in its
 * caller7C83C: require that exact positive integer domain here. With this
 * denominator, resident27100's fractional divide is the signed Q16 quotient.
 * factors has320 source u16 entries, usually fifa98_ball_flight_factors().
 * Return original index1..319, or new-1 for an invalid bounded argument.
 * Source C810 tests the PREVIOUS range before C814 updates hi-lo. Retaining
 * this extra terminal pass is observable for nearest-error ties; a conventional
 * binary search with a newly tested range gives a different source result. */
int32_t fifa98_ball_flight_duration(uint32_t distance, uint32_t requested,
                                   const uint16_t *factors) {
    if (!factors || !distance || (distance & 65535) ||
        distance > 32767u * 65536 || requested > 50u * 65536) return -1;
    int32_t ratio = (int32_t)divide_word(requested, distance);
    if ((int32_t)factors[1] < ratio) return 1;
    if (ratio < (int32_t)factors[319]) return 319;
    int32_t low = 1, high = 319, range = high - low;
    int32_t best_error = 0x0fffffff, best_index = 319;
    for (;;) {
        int32_t middle = low + (int32_t)sar((uint32_t)range, 1);
        if (middle < 0 || middle > 319) return -1;
        int32_t error = (int32_t)factors[middle] - ratio;
        if (error > 0) low = middle + 1;
        else if (error < 0) high = middle - 1;
        else range = 0;
        int32_t magnitude = error < 0 ? -error : error;
        int32_t best_magnitude = best_error < 0 ? -best_error : best_error;
        if (magnitude < best_magnitude) {
            best_error = error; best_index = middle;
        }
        uint32_t repeat = range > 0;
        range = high - low;
        if (!repeat) return best_index;
    }
}

/* Original7C83C: select duration for an explicit requested horizontal speed,
 * then compute the corresponding actual speed, vertical solution and curve
 * correction. This is a numerical branch of75924, not that world dispatcher.
 * No horizontal clamp is performed after duration selection. Return original
 * bits1=vertical cap applied,2=absolute speed error STRICTLY exceeds32768;
 * new-1 refuses outside the bounded domain atomically.
 * position/target[3] fixedQ16 XYZ, Y0..1024Q16, integer planar distance1..32767,
 * spin+/-8000, requested/cap0..50Q16. Full75924 handles distance<16 separately;
 * callers wanting that behavior must keep its dispatcher guard themselves.
 * out8=[vx,vy,vz,actualHorizontalSpeed,integerDistance,heading16,spin,duration].
 * Buffers must have their stated sizes and distinct valid storage. */
int32_t fifa98_ball_speed_launch(const uint32_t *position,
                                const uint32_t *target, uint32_t spin,
                                uint32_t requested, uint32_t vertical_cap,
                                const uint8_t *atan8, const uint32_t *atan16,
                                const uint32_t *sine,
                                const uint32_t *exponential, uint32_t *out) {
    if (!tables_ready || !position || !target || !atan8 || !atan16 || !sine ||
        !exponential || !out || requested > 50u * 65536 ||
        vertical_cap > 50u * 65536 ||
        less_signed(spin, (uint32_t)-8000) || less_signed(8000, spin) ||
        position[1] > 1024 * 65536 || target[1] > 1024 * 65536) return -1;
    uint32_t dx = target[0] - position[0], dz = target[2] - position[2];
    if (dx == UINT32_C(0x80000000) || dz == UINT32_C(0x80000000)) return -1;
    uint32_t distance = fifa98_ball_integer_length(sar(dx, 16), sar(dz, 16), atan8, sine);
    if (!distance || distance > 32767) return -1;
    int32_t duration = fifa98_ball_flight_duration(distance << 16, requested, horizontal_factors);
    if (duration < 0) return -1;
    uint32_t horizontal = fifa98_fixed_multiply(horizontal_factors[duration], distance << 16);
    uint32_t difference = requested - horizontal;
    if (difference & UINT32_C(0x80000000)) difference = 0u - difference;
    uint32_t flags = less_signed(32768, difference) ? 2 : 0;
    uint32_t vertical;
    if (!vertical_speed(position[1], target[1], (uint32_t)duration, exponential, &vertical)) return -1;
    if (less_signed(vertical_cap, vertical)) { vertical = vertical_cap; flags |= 1; }
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
    out[6] = spin; out[7] = (uint32_t)duration;
    return (int32_t)flags;
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

/* Separate staging from control/player/action buffers. Callers may store the
 * two512-word original inverse tables in words0..1023; no helper mutates them. */
static uint32_t flight_workspace[2048];
uintptr_t fifa98_ball_flight_workspace(void) { return (uintptr_t)flight_workspace; }
uint32_t fifa98_ball_flight_workspace_words(void) { return 2048; }

/* Source7CFC0's positive branch uses the same base32 product as the existing
 * negative exponential, with no final reciprocal. Bound positive arguments
 * so all reads stay within the reviewed113 words. This does not change the
 * legacy negative-input helper or guess a host exp() approximation. */
static int32_t bounded_exponential(uint32_t input, const uint32_t *table,
                                   uint32_t *out) {
    if (!input) { *out = 65536; return 1; }
    if (input & UINT32_C(0x80000000)) {
        *out = fifa98_ball_negative_exponential(input, table); return 1;
    }
    if (input > 681391) return 0;
    uint32_t result = 0, row = 0;
    while (input) {
        uint32_t digit = input & 31;
        input >>= 5;
        if (digit) {
            uint32_t index = row * 31 + digit - 1;
            if (index >= 113) return 0;
            uint32_t factor = table[index];
            result = result ? fifa98_fixed_multiply(result, factor) : factor;
        }
        row++;
    }
    *out = result; return 1;
}

/* Source7D194/7D238 common index/weight arithmetic. Both neighboring entries
 * must exist in a512-word original table. Source out-of-domain returns zero;
 * the native caller reports failure before using uninitialized root outputs. */
static int32_t inverse_coordinates(uint32_t input, uint32_t *low,
                                    uint32_t *high, uint32_t *weight) {
    if (less_signed(0, input)) return 0;
    uint32_t scaled = fifa98_fixed_multiply(182420805, 0u - input);
    int32_t upper = (int32_t)sar(scaled, 16) - 512;
    int32_t lower = upper - 1;
    if (upper >= 512 || lower < 0) return 0;
    *low = (uint32_t)lower; *high = (uint32_t)upper;
    *weight = scaled & 65535;
    return 1;
}
static uint32_t inverse_interpolate(const uint32_t *table, uint32_t low,
                                     uint32_t high, uint32_t weight) {
    return fifa98_fixed_multiply(table[low], 65536 - weight) +
           fifa98_fixed_multiply(table[high], weight);
}

/* Source7D780 followed by7D4EC. The requested source parameter is an absolute
 * fixed Y reference, not duration or the queue54 clip-calibration word. This
 * bounded branch admits only its nonnegative intermediate-time result. */
static int32_t height_vertical(uint32_t current_y, uint32_t height,
                               const uint32_t *exponential,
                               const uint32_t *inverse_b, uint32_t *out) {
    uint32_t delta = height - current_y, exponent, value;
    exponent = sar(fifa98_fixed_multiply((uint32_t)-145331, delta), 15);
    if (!bounded_exponential(exponent, exponential, &value)) return 0;
    uint32_t input = sar(fifa98_fixed_multiply((uint32_t)-395007066, value), 14);
    uint32_t low, high, weight;
    if (!inverse_coordinates(input, &low, &high, &weight)) return 0;
    uint32_t inverse = inverse_interpolate(inverse_b, low, high, weight);
    if (!inverse) return 0;
    uint32_t time = fifa98_fixed_multiply((uint32_t)-21107860, inverse) +
                    fifa98_fixed_multiply(delta, (uint32_t)-1428) - 21140645;
    if (time & UINT32_C(0x80000000)) return 0;
    exponent = sar(fifa98_fixed_multiply(208360, time), 10);
    if (!bounded_exponential(exponent, exponential, &value)) return 0;
    *out = fifa98_fixed_multiply((uint32_t)-3006669, 65536 - value);
    return 1;
}

/* Source7D658 chooses two source roots through7D238, then7CA14 option0 chooses
 * its first root. Preserve the source negative-first/positive-second fallback.
 * All operations retain original low-word wrap, multiply bias and ASR order. */
static int32_t height_duration(uint32_t current_y, uint32_t target_y,
                               uint32_t vertical, const uint32_t *exponential,
                               const uint32_t *inverse_a,
                               const uint32_t *inverse_b, uint32_t *out) {
    uint32_t first = fifa98_fixed_multiply((uint32_t)-91422, target_y - current_y);
    uint32_t second = fifa98_fixed_multiply((uint32_t)-29415702, vertical);
    uint32_t anchor = sar(first - second, 6);
    uint32_t scale = (uint32_t)-395007066 +
                     fifa98_fixed_multiply((uint32_t)-8609919, vertical);
    uint32_t exponent = sar(fifa98_fixed_multiply(anchor, (uint32_t)-208360), 10);
    uint32_t value;
    if (!bounded_exponential(exponent, exponential, &value)) return 0;
    uint32_t input = sar(fifa98_fixed_multiply(scale, value), 14);
    uint32_t low, high, weight;
    if (!inverse_coordinates(input, &low, &high, &weight)) return 0;
    uint32_t a = inverse_interpolate(inverse_a, low, high, weight);
    uint32_t b = inverse_interpolate(inverse_b, low, high, weight);
    uint32_t base = 21140645 + anchor;
    uint32_t selected = base - fifa98_fixed_multiply(a, (uint32_t)-21107860);
    uint32_t other = base - fifa98_fixed_multiply(b, (uint32_t)-21107860);
    if ((selected & UINT32_C(0x80000000)) && less_signed(0, other)) selected = other;
    uint32_t duration = sar(selected + 32768, 16);
    if (duration > 319) return 0;
    *out = duration; return 1;
}

/* Original7CA14, bounded to option0 as passed by75924. Source coefficients and
 * inverse tables replace host analytic functions; this is not a named action
 * binding, world launch dispatcher, possession change or callback execution.
 * absolute_height is positive integer Q16<=1024 and greater than current Y;
 * target/currentY0..1024Q16, spin+/-8000, caps0..50Q16, distance1..32767.
 * Inverse failure, negative intermediate time or a rounded duration outside
 * 0..319 is refused atomically instead of reading the source's uninitialized
 * temporary/table path. Roots below target height are accepted only if all
 * original numerical index tests succeed; no substitute solution is invented.
 * out8 same as other flight exports. Return original cap flag0/1, or new-1.
 */
int32_t fifa98_ball_height_launch(const uint32_t *position,
                                 const uint32_t *target, uint32_t spin,
                                 uint32_t absolute_height,
                                 uint32_t horizontal_cap, uint32_t vertical_cap,
                                 const uint8_t *atan8, const uint32_t *atan16,
                                 const uint32_t *sine,
                                 const uint32_t *exponential,
                                 const uint32_t *inverse_a,
                                 const uint32_t *inverse_b, uint32_t *out) {
    if (!tables_ready || !position || !target || !atan8 || !atan16 || !sine ||
        !exponential || !inverse_a || !inverse_b || !out ||
        !absolute_height || (absolute_height & 65535) ||
        absolute_height > 1024u * 65536 || absolute_height <= position[1] ||
        horizontal_cap > 50u * 65536 || vertical_cap > 50u * 65536 ||
        less_signed(spin, (uint32_t)-8000) || less_signed(8000, spin) ||
        position[1] > 1024 * 65536 || target[1] > 1024 * 65536) return -1;
    uint32_t dx = target[0] - position[0], dz = target[2] - position[2];
    if (dx == UINT32_C(0x80000000) || dz == UINT32_C(0x80000000)) return -1;
    uint32_t distance = fifa98_ball_integer_length(sar(dx, 16), sar(dz, 16), atan8, sine);
    if (!distance || distance > 32767) return -1;
    uint32_t vertical, duration;
    if (!height_vertical(position[1], absolute_height, exponential, inverse_b, &vertical) ||
        !height_duration(position[1], target[1], vertical, exponential,
                         inverse_a, inverse_b, &duration)) return -1;
    uint32_t horizontal = fifa98_fixed_multiply(horizontal_factors[duration], distance << 16);
    uint32_t flags = 0;
    if (less_signed(horizontal_cap, horizontal)) { horizontal = horizontal_cap; flags = 1; }
    if (less_signed(vertical_cap, vertical)) { vertical = vertical_cap; flags = 1; }
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
    return (int32_t)flags;
}
