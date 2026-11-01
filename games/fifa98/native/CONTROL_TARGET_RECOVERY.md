# Original controller targets, heading and boundary arithmetic

`control-target.c` directly recovers the original integer heading, scalar input
decay, controller-directed target construction, target-bound helpers and target
delta stores. Original fields become typed native arrays; original lookup data
is supplied separately from fingerprinted resident bytes. There is no console
memory, CPU register state, instruction interpreter or translated dispatcher.

These helpers provide original numeric input paths. They do not initialize a
match, select a controlled squad member, implement action/AI behavior or replace
the original steering, animation, contact and scheduler machinery.

Read-only evidence is available through:

```sh
node games/fifa98/scripts/control-target-recovery.mjs
```

`inspectControlTargetRecovery(backend, boot)` requires the original two byte
images. It checks their complete hashes before decoding reviewed regions,
tables, calls and dimension constants. Unsupported images yield empty evidence
and `status: unsupported`; supported output is `reconstruction-only`. The
report includes `nativeExports`, `tables.quarterAtan.values` (257 bytes),
`tables.quarterSine.values` (257 Q16 words), `boundsProfiles`, ABI descriptions
and explicit limits. Neither lookup table is embedded in C source.

## Verified source regions

Backend `BECODE.BIN`: 939136 bytes, loaded at `0x8005ae28`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
Resident `SLES_009.14`: 251904 bytes, SHA-256
`dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644`.
Resident file offset equals address minus `0x80011000`, accounting for its
2048-byte PS-X EXE header and `0x80011800` payload load address.

| Region | Address | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Resident heading | `0x80026fd0` | 304 | `26550e479e15aa55b56c8618fb87ce9b1ec4c52a2ce6c800cf41e34b46ea6dc7` |
| Resident wide-numerator helper | `0x800211b8` | 88 | `ae6b0afb579a2e31a7b994baa8cf32a8d2fe41ae3dabb231051c10bc9c779989` |
| Resident wide-divide helper | `0x80021248` | 64 | `1d61b42252bde2ba721d92d602fb94e5dd0344b9b9f9f2053cbab05574af76e2` |
| Controller target constructor | `0x800a598c` | 396 | `78c4e0cd0b3c95f8f3faa97dbe6a04b057dac1b9f38e53d80992a71aee4870d6` |
| Scalar input/neutral decay | `0x800a4ff0` | 104 | `d3358a760436c1e2f1cdb02a7585b2adf4c33b028681ff267e5ddc3b33a601cb` |
| Basic target bounds | `0x800b679c` | 104 | `1d20a4b9bd127a2b9435437231f59509fdf049b362d45ecd90b0b6aea60f76ce` |
| Alternate target bounds | `0x800b6804` | 172 | `738924198107cad169db63fbf1339d042412fbfbcb2433e082e86f591bcce0ec` |
| Stored target/delta update | `0x8008e040` | 156 | `b299b8533126d12b017a1c993d95f1f7ff49b9a2062ecd2c734ce73ded17667d` |
| Controller dimension conversion, partial initializer | `0x800b5be0` | 284 | `d408a89a8872c3b1f5af00fa6db64edb0e9c33f51acdfce8a356f8395b0b75f2` |
| Profile dimension selector, partial initializer | `0x800b595c` | 644 | `2a0faa7de533b3e5fef844498c164a0d411ccb8f6aaae0cf5178262d2be173d1` |
| State-700 caller, static evidence | `0x80070768` | 344 | `821fdede0f7753d2e7b35cc66757edd56ba7fb42bfcff74eaf8ceca153819e43` |

The report additionally fingerprints the already recovered sine lookup, fixed
multiply and planar metric. They remain dependencies rather than newly counted
recoveries. The two wide helpers are replaced by native integer shift/division
only in the heading caller's reviewed argument domain; their other call modes
are not claimed as complete native ports.

## Heading

```c
int32_t fifa98_control_heading(uint32_t dx, uint32_t dz,
                              const uint8_t *quarterAtan257);
```

The original period is 1024: X corresponds to sine, Z to cosine. Cardinal
results include `(0,+1)->0`, `(+1,0)->256`, `(0,-1)->512`, `(-1,0)->-256`.
Signed quadrants and the original equal-magnitude result are preserved,
including the unusual `(0,0)->128` result. Steering calls heading only when
target distance is at least nine, so preserving this zero-vector result does
not invent a neutral-input heading policy.

After sign/quadrant folding the source has `0<=smaller<=larger<=INT_MAX`:

- Equal values give quarter angle 128 directly.
- If smaller <`0x800000`, lookup index is
  `floor((smaller*256 + floor(larger/2))/larger)`.
- Otherwise the two source helpers form `smaller<<32`, divide by larger,
  then round that quotient to an eight-bit fraction using bit 23. Native C
  expresses this as direct unsigned 64-bit arithmetic, without simulating the
  helper's instruction sequence.

The result indexes the original byte table at resident `0x80048e30`, file
offset 228912, length 257, SHA-256
`03ab75ced39a3c62580ab3e24c4e54867b63bbdd1135da55cdf6bd678f74f221`.
Native does not use host floating-point arctangent or generate a new table.

A null table or either input word `0x80000000` returns `INT32_MIN` before
table access. Those magnitudes retain a negative wrapped absolute value in
the source and can escape its reviewed lookup domain; the native guard does
not substitute an approximate angle. All other 32-bit signed input pairs
follow the complete reviewed routine's numeric behavior.

## Input decay and original target construction

`fifa98_control_decay(input, previous, step)` is the complete scalar helper.
Same-sign nonzero input adds to previous, opposite-sign input replaces it,
and zero input moves previous toward zero by step. Wrapped unsigned
addition/subtraction occurs before signed stop comparisons, preserving the
source's edge cases as well as ordinary neutral decay.

```c
int32_t fifa98_control_target(uint32_t *offsets2,
                             const uint32_t *control7,
                             const uint32_t *integerPositionXYZ,
                             const uint32_t *bounds3,
                             const uint32_t *quarterSine257,
                             uint32_t *targetXYZ);
```

The explicit fields are:

```text
offsets2: previous X offset; previous Z offset
control7: analog mode; magnitude; angle16; digital X; digital Z; ticks; alternate bounds
bounds3: X limit; Z limit; alternate inner X
```

Offsets correspond to original entity +52/+60. Controller fields are analog
mode +52, magnitude +44, signed angle halfword +48 and digital X/Z +20/+24.
Integer position corresponds to motion-subobject +28/+32/+36, where that
subobject starts at entity +124. Ticks originate at global `0x8013b448`.

Analog mode **exactly one** uses the signed angle halfword and original Q16
sine/cosine lookup, with each component rounded by
`fixed_multiply(192, unitComponent)`. Zero analog magnitude clears both offsets
immediately. Other mode values use digital signs: negative/positive components
become -192/+192. A diagonal retains both literal component offsets; no new
diagonal normalization is introduced. If both digital components are zero,
each prior offset decays toward zero by `32*ticks`. Releasing a 192 offset
therefore takes six single-tick calls to reach zero.

The target adds those offsets to integer X/Z, sets Y to zero, then calls the
original selected bound helper. Boundary clamping changes the target, not the
stored directional offsets. The source's boundary-mode global `0x8013fe2c`
becomes `control7[6]`. The supplied sine table is exactly the original resident
table at `0x8004904c`, verified separately in this report and
`PLAYER_RECOVERY.md`.

The source callers require valid entity/controller pointers. Native requires
valid distinct arrays and rejects null storage or ticks outside 0–65535 with
return zero before changing either output. Success returns one. There is no
invented device-polling callback or keyboard mapping inside this helper.

The state-700 callback `0x80070768` calls target construction at `0x800707c0`,
passes the result to `0x8008e040` at `0x800707cc`, and marks actor flag
`0x100000`. This establishes one real source path. It does not assert that
every gameplay action uses the same target builder or resolve state-700
transitions, player selection or animation/action semantics.

## Target bounds and dimension conversion

```c
int32_t fifa98_control_pitch_bound(uint32_t *targetXYZ,
                                  const uint32_t *bounds3,
                                  uint32_t alternate);
```

Basic mode clamps signed X/Z to ±the respective limits. Alternate mode first
tests **wrapped signed abs(X) > innerX-16**. Only when that strict condition
holds does it clamp X/Z to ±(limit-16). When X lies inside that strip, the
helper deliberately leaves Z untouched. Y is always untouched. No inferred
goal, wall or out-of-play law is added to this observed numeric behavior.
Null storage returns zero without writes; success returns one.

Controller bounds differ from the source dimensions also used by the grass
preview. Source global `0x8013fd38` is divided by two before writing controller
X limit `0x8013fd7c`; `0x8013fd3c` is divided by two before writing Z limit
`0x8013fd80`. Inner X at `0x8013fd90` is half a separate source dimension.
The exact resulting supported selections are:

| Source profile | Controller X limit | Controller Z limit | Alternate inner X | Selected bound path |
| --- | --- | --- | --- | --- |
| 0 | 2040 | 2832 | 228 | Basic |
| 1 | 1920 | 2688 | 228 | Basic |
| 2 | 1824 | 2544 | 228 | Basic |
| 3 | 1800 | 2400 | 228 | Basic |
| 4 | 1080 | 1392 | 152 | Alternate |

For example, source profile 2 dimensions 3648/5088 produce controller limits
1824/2544; passing 3648/5088 directly would double the original movement
target bounds. Profile 5 can retain prior initialized state and is deliberately
excluded from the stateless report rather than guessed.

## Stored target and deltas

```c
int32_t fifa98_control_target_delta(const uint32_t *integerPositionXYZ,
                                   const uint32_t *targetXYZ,
                                   uint32_t *state7);
```

```text
state7: stored target X,Y,Z; distance; delta X; delta Z; motion flags
```

This retains all numeric stores of `0x8008e040`: target Y becomes zero, motion
flag `0x10000` is cleared, X/Z deltas subtract current integer coordinates with
word wrapping, and distance uses the original approximate planar metric.
The original own-target pointer field becomes explicit native target storage.
Return is adapted to one on success, zero for null storage; the original
distance return remains in `state7[3]`. Inputs/output must be valid distinct
storage. Y displacement is not used in the planar metric.

`fifa98_control_workspace()` and `fifa98_control_workspace_words()` expose
2048 words of new bounded transfer storage. It is separate from renderer,
skinning, texture and motion-decode buffers and does not represent console RAM.
The caller assigns offsets and supplies atan as bytes, sine as 32-bit words.

## Validation and composition limits

Two static tests reject missing/unknown source images and verify the export
descriptor. Ten native tests read the already built main Wasm and verify its
module hash, `control-target.c` source hash and absence of runtime imports.
Independent BigInt/integer oracles cover 45000 heading pairs across synthetic
and actual tables, 20000 decay cases, 10000 bound cases, 12000 target builders,
12000 delta stores, all 1024 actual-sine analog headings, signed boundaries,
strict alternate-strip comparisons and nonmutating ABI failures. The actual
reference test verifies all report fingerprints and five converted bound
selections; it skips only when local extracted references are absent. Tests
embed no reference binaries and run no compiler.

Original steering, speed clamping and movement integration have separate
recovery interfaces. A controlled composition must preserve their original
field meanings and order, respect animation-callback guards, use the converted
source bounds and stop on unresolved branches. Combining numeric helpers does
not establish a complete original match loop, an original wall-clock rate or
playable football rules.
