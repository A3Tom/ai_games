# Original simulation support and ball-motion recovery

`match.c` recovers original arithmetic and state-update paths as native C. It
does not contain a complete match engine. Original globals and structure fields
become explicit typed arguments; there is no virtual console memory, instruction
interpreter, register file, generated instruction dispatcher or PS1 runtime.

The static evidence tool is:

```sh
node games/fifa98/scripts/match-recovery.mjs
```

It reads the extracted originals and prints hashes, disassembly, call evidence
and ABI mappings to stdout. It executes no original machine code. Unknown image
hashes produce an unsupported result instead of guessed symbols.

## Verified images and regions

The backend is `BECODE.BIN`, 939136 bytes, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`,
mapped by the bootstrap to `0x8005ae28`. The resident executable is
`SLES_009.14`, 251904 bytes, SHA-256
`dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644`.
Its payload begins at file offset 2048 and loads at `0x80011800`.

| Recovery | Image address | File offset | Bytes | Region SHA-256 |
| --- | --- | --- | --- | --- |
| Fractional tick accumulator, complete leaf | `0x8006a120` | 62200 | 72 | `d1cdedaec158e495bd13326710f8e7714b19377db9bf98bb14419d5da48d3a63` |
| Rolling per-side distance update, complete routine | `0x80061818` | 27120 | 396 | `e8fde2fc05adb052801dd3a1429b7b92bf022a0e242e3cfafeebae671ff14e91` |
| Distance arithmetic block inside that routine | `0x800618f4` | 27340 | 76 | `6b760a5fc78b1f622cd50c8e1b7383f05f7484a51c4affc615b45e05229f5662` |
| Rounded fixed multiply, complete resident leaf | `0x800271a8` | 90536 | 44 | `ad65ab41fa9e936405c7aea1053066ce2e290f8f9d683dcf7c17349ac299c680` |
| Ball position advance block | `0x8007abe0` | 130488 | 80 | `0287d3087f629f0cbc7238433b0b02f3f745a97fd4fb3210da23f1091006958b` |
| Ball drag routine containing the recovered no-spin branch | `0x8007a88c` | 129636 | 428 | `3dfb1272355092c168d871a8702ba0a26f4acd8d87611b4224b9b253abdfd68b` |
| Full predictor, evidence only | `0x8007ab2c` | 130308 | 3172 | `81c4517f27c170df131551f18ca11a7f039eb46951d1cde667461bb7d7bbcf7e` |
| Ground branch containing recovered physics subset | `0x80079e98` | 127088 | 260 | `3b866606571b7ea87a78d70b6a2f69ad6103a1c2e7e5b705196f54b5cba69bbe` |
| Complete ground rolling-drag routine | `0x8007aa38` | 130064 | 244 | `6163d2ecfd97df4baecd7de50121554be8d3d61c1892f8d9748cea93b90c093b` |
| Material initializer containing recovered table selection | `0x80074440` | 103960 | 256 | `0232bb400ee181c9c31b7f4a9ee9354a020da3df5c17e161fa540ed454819d6a` |

The ball drag routine is **partly** recovered: only the branch where its spin
word is zero is implemented. Its 428-byte fingerprint identifies the containing
routine; it does not claim all branches have native implementations.
That statement describes the existing `match.c` API. The follow-up
`ball-motion.c` now implements the complete air-drag/spin arithmetic and its
source random generator through a separate typed ABI; see
[BALL_MOTION_RECOVERY.md](BALL_MOTION_RECOVERY.md). Contact processing and the
full predictor remain incomplete.
The ground-branch fingerprint likewise covers event bookkeeping and a callback
that the native physics helper does not implement. Its bounce arithmetic alone
occupies `0x80079f44`–`0x80079f98` (88 bytes, SHA-256
`4bbe0a54d6b7d33115ef0ac90e70055f6783d8a03eb7c2352c26cb175ee4952e`).

## Call path into the original simulation

The backend outer loop calls `0x800de4f4` at `0x800de29c`. That inner loop calls
`0x8006a168` directly at `0x800de518`, and through `0x800deab4` at
`0x800de680` / `0x800deae0`. `0x8006a168` reaches the scheduler
`0x8006b3bc` at `0x8006a3a0`; the scheduler calls the central tick
`0x8006a3c4` at `0x8006b4a8` or `0x8006b4c8`.

The central tick calls the recovered accumulator at `0x8006a3d8` and the distance
routine at `0x8006a560` / `0x8006a568`, with side arguments zero and one. It also
calls the ball update `0x8007baa8` at `0x8006a548`. That update reaches the
prediction generator `0x8007ab2c`, which calls the airborne drag routine at
`0x8007b544` when its Y position or vertical velocity is nonzero. Static calls
prove potential reachability, not runtime frequency or complete coverage.
The predictor calls the contact processor `0x80079c90` at `0x8007ac7c`,
after position advance and before drag. Ground drag is selected at
`0x8007b5ac` when Y position and vertical velocity are both zero and at least
one horizontal velocity is nonzero. These guards differ from the contact
processor's strict-negative Y guard.

## Native ABIs and exact behavior

`fifa98_tick_accumulate(clock, delta)` maps original words `0x8013b440` and
`0x8013b444` to `clock[0]` (whole) and `clock[1]` (fraction). The fractional
addition wraps to 32 bits **before** extracting its upper 16 bits as carry.
Whole-counter addition also wraps. The original return register is unused.

`fifa98_planar_distance(dx, dz)` is the arithmetic block's metric:

```text
max(abs(dx), abs(dz)) + ceil(min(abs(dx), abs(dz)) / 2)
```

The implementation preserves wrapping subtraction, `abs(INT_MIN)`, signed
comparisons and arithmetic-shift behavior. For example, `(3,4)` gives six,
because this original metric is an approximation rather than Euclidean length.

`fifa98_distance_rows(xz, count, row, ticks, matrix)` preserves the rolling
update schedule, including symmetric writes and untouched diagonal/unvisited
cells. The original side structure has stride 1968, entity pointers at offset
196, count at 1908, coordinates at entity offsets 152 and 160, and the distance
matrix at side offset 332 with a 44-byte row stride. Its rolling indices start
at `0x80124a14`; ticks come from `0x8013b448` (a 16-bit carry).

The native ABI uses two coordinate words per entity and an 11-column matrix.
It rejects count outside 1–11, row outside 0–count, or ticks outside 0–65535
before writing. It returns the next rolling row, or `UINT32_MAX` for invalid
inputs. The two input/output arrays must be valid, distinct native storage.
Higher-level roster-to-entity assignments are still unresolved.

`fifa98_fixed_multiply(a,b)` multiplies signed 32-bit inputs, adds `0x8000` to
the 64-bit product, and returns product bits 16–47. Half-way values round toward
positive infinity, including negative products. Native C uses explicit floor
division and unsigned conversions to avoid undefined overflow or implementation
dependent signed shifts.

`fifa98_ball_air_drag(velocity, gravity)` implements the original zero-spin
branch: each of the three velocity words subtracts
`fixed_multiply(203, velocity)`, then Y adds the original gravity expression.
The backend word at `0x80125d18` (file offset 831216) is `0xfe000000`, or
`-33554432`. The routine's signed multiply-high/shift expression equals
truncation toward zero of that constant divided by 3600, giving `-9320`.
The argument exposes that actual original value; it is not an invented tuning
coefficient. No browser wall-clock frequency is inferred from this divisor.

`fifa98_ball_free_tick(state, gravity)` is a **new guarded composition** of the
original position-advance block and zero-spin air branch. Its nine words are:

```text
position X,Y,Z; velocity X,Y,Z; previous position X,Y,Z
```

All are Q16.16 bit patterns. The function copies current position to previous,
adds velocity to position, then applies the recovered air branch. It returns
one on success, zero when ground contact is required, or minus one for a null
pointer/signed-position overflow. Failure leaves all nine words unchanged.
It stops **before** a next position reaches or crosses ground Y=0. It does not
invent a bounce, resolve collisions, or restart a launch.

This composition is valid only for a spin-free segment without any intervening
collision. The original performs additional contact processing between these
blocks. Staying above ground alone does not prove absence of posts, nets,
players or other boundaries; callers must keep previews within a known free
region and label launches as reconstruction tests, not recovered kick behavior.

## Recovered isolated-ground physics

`fifa98_ball_ground_contact(state, material)` recovers only the floor guard,
clamp and bounce arithmetic from the containing contact processor. It uses the
same nine-word state ABI, and a separate three-word material array:

```text
vertical restitution; horizontal retention on bounce; rolling retention
```

The original condition is **signed Y < 0**, not Y <= 0. At nonnegative Y the
helper returns zero and changes nothing. At negative Y it sets Y to zero,
replaces vertical velocity with `-fixed_multiply(vy, verticalRestitution)`,
multiplies X/Z velocity by horizontal retention, and zeros the resulting
vertical velocity when it is signed <= `0xbfff`. It returns one for that
contact, or minus one for null storage. X/Z position and previous XYZ are
untouched. All arithmetic keeps original wrapping and rounding, including
unusual signed boundary inputs.

This is **not** the complete ground branch. The containing original branch
sets trajectory-record flag `0x40`, tracks up to twelve contact indices at
state offset `0x172a`, increments the contact count at `0x170c`, records the
first-contact index at `0x16fc`, and conditionally calls `0x8008a944` with
original structure fields. Those records/callbacks are omitted by this
physics-only ABI, as are the rest of `0x80079c90`'s net, post, wall and other
contacts. Callers must not treat its return value as an original gameplay
event or use it to infer scoring/law behavior.

`fifa98_ball_ground_drag(velocity, retention)` implements the complete
`0x8007aa38` routine using the already recovered fixed multiply. It changes
only X/Z velocity, multiplying each by rolling retention. The stopping test
has two stages: each wrapped signed absolute component must be <6553, and
their wrapped sum of squared components must be signed <=`0x028f3d70`.
Only then are both horizontal components zeroed. This retains the original
small-speed circular test and the original integer-boundary behavior; it is
not replaced by a floating-point length or a new stopping threshold.

`fifa98_ball_surface_material(row, column, out)` copies three actual original
coefficients. The initializer `0x80074440` computes table index
`word[0x80054448] * 5 + word[0x80054444]`, and copies these values to original
structure offsets `0x1868`, `0x186c` and `0x1870`. The native API bounds row
to 0–1 and column to 0–4, returns one on success or zero without writes for
invalid bounds/null output. These bounds cover the stored 40-byte tables;
the original selection code itself does not contain those validation checks.
Friendly setting names and the full initializer's side effects remain
unresolved. The API therefore exposes numeric indices, with no invented
weather/surface labels or assumed active in-match setting.

| Original table | Address / file offset | SHA-256 |
| --- | --- | --- |
| Vertical restitution, 2x5 words | `0x80125d1c` / 831220 | `0204d40448f012c580a4093fa8ecf62793df6afd83b5457eef3994c32f57a847` |
| Horizontal retention, 2x5 words | `0x80125d44` / 831260 | `d70b279087d4952bbc19954d38efc57ecc2ee73e3a0bea0e4dbe2a033046ca64` |
| Rolling retention, 2x5 words | `0x80125d6c` / 831300 | `240478452ba2bd144fbfd93bfa26420bdc6f64d22b61b5b148ab01cb5835624c` |

Row zero contains `[0x9eb8, 0xbae1, 0xfd70]` for every column. The static
report verifies all thirty words against the source bytes and emits the
complete table values, dimensions and hashes. These are source coefficients,
not new physics tuning values.

`fifa98_ball_surface_tick(state, gravity, material)` is a **new guarded
composition**, not a newly recovered complete original routine. It advances
position and previous position, applies the isolated-floor physics above,
then follows the observed original selection: airborne drag when Y or vy is
nonzero, otherwise rolling drag when X/Z velocity is nonzero. A strict Y=0
landing therefore keeps downward velocity for that step; the next negative-Y
step enters the actual bounce branch. It returns two when the floor branch
was taken, one otherwise, zero when starting below ground, and minus one for
null storage/signed-position overflow. Failure leaves all nine state words
untouched. State/material arrays must be distinct valid native storage.

Its valid reconstruction domain requires zero spin, no special predictor-state
overrides and no intervening contacts other than the isolated floor. It
excludes original contact event records/callbacks, player contacts, goal/net/
post/wall behavior and special predictor states. It can continue an explicitly
labeled test launch through original bounce and rolling arithmetic until
rest; that does not establish an original kick, a complete trajectory
predictor or a playable football match. `fifa98_ball_free_tick` retains its
earlier stop-before-ground ABI for callers wanting only the airborne subset.

## Position scale and remaining ball paths

The ball reset routine `0x800749a8` explicitly arithmetic-shifts input XYZ right
16 at `0x800749c8`, `0x800749d4` and `0x800749e0` before writing integer XYZ at
`0x8013de44/48/4c`. It preserves the original words at
`0x8013df0c/10/14`. The prediction consumer also reads signed high halfwords
from its fixed-point positions at `0x800766f8`–`0x8007670c`. This establishes
the Q16.16-to-integer world scale; it does not by itself establish every mesh
instance's axis transform or browser camera convention.

The original prediction generator maintains a 360-entry, 16-byte record ring.
State at offsets `0x16bc/0x16c0/0x16c4` is velocity, positions are at
`0x16c8/0x16cc/0x16d0`, and previous positions at
`0x16d4/0x16d8/0x16dc`. The following are concrete continuation targets:

- `0x80079c90`: complete contact processing called just after position advance;
  only its isolated-floor physics subset is now ported. Continue with its
  record/callback bookkeeping and remaining contact branches.
- `0x8007a88c`: full air drag/spin and original random state are now recovered
  separately in `ball-motion.c`; see `BALL_MOTION_RECOVERY.md`.
- `0x80074440`: only original material-table selection is adapted; calls to
  `0x8007d348` and setting-index semantics remain unresolved. Source flight
  table builders called by `0x8007ce00` are now reconstructed in `ball-flight.c`.
- `0x80077eb4`, `0x80077c64`, `0x80078258`, `0x8007843c`, `0x800779a8`:
  original predictor contact helpers; their complete semantics remain unresolved.
- `0x80076650`: consumes prediction records and routes gameplay events/callbacks.
- `0x80076300`: initializes prediction state and calls the generator; a complete
  native launch API needs this behavior plus caller/state recovery.

`player-ball.c` reconstructs the animation marker, owned attachment and a
grounded no-contact subset of `0x8007b790`, with original reciprocal and velocity
clamps. It supplies source ownership/action preconditions explicitly in the
browser test; it does not establish loose-ball acquisition. Grounded and lofted
launch numerics are in `ball-interaction.c` and `ball-flight.c`. Original sprite
phase/heading now consume final sample displacement, with its source grouped
tick arithmetic. These additions leave full contact dispatch and match rules
unfinished; see `PLAYER_BALL_RECOVERY.md` and `BALL_VISUAL_PHASE_RECOVERY.md`.

## Validation

Static tests use invented instruction bytes and reject wrong fingerprints,
unaligned ranges and unknown images. Native tests read the built main Wasm
module, verify its `match.c` source hash and module hash, and require no runtime
imports. Independent integer/BigInt oracles cover signed boundaries, wrapping,
rounding, partial matrix writes, carry handling, bounded air trajectories,
strict-negative floor contact, the vertical bounce cutoff, circular rolling
stops, and an isolated-ground trajectory through bounce/rolling to rest.
They validate recovered support arithmetic and ABI adaptations; they do not
establish equivalence of a complete FIFA match.
