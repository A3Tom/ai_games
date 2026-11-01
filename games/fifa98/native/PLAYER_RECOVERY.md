# Original player control and horizontal motion arithmetic

`player.c` contains five direct native C functions recovered from the supplied
SLES_009.14 images. They cover digital direction mapping, original heading
lookup, source-indexed motion profiles, target-speed selection and the numeric
horizontal integration portion of player movement. They do not form complete
match controls, a complete player tick or an approximate replacement engine.

Original pointer/global fields become typed native arguments. The implementation
contains no console memory map, CPU interpreter, virtual registers, instruction
dispatcher or PS1 runtime. It calls the already recovered rounded fixed multiply
and signed reciprocal from `match.c` / `core.c`.

The read-only evidence command is:

```sh
node games/fifa98/scripts/player-recovery.mjs
```

`inspectPlayerRecovery(backend, boot)` accepts the two original `Uint8Array`
images, checks both complete image hashes, then verifies the reviewed instruction
regions and data tables. Unknown images produce `status: unsupported`, empty
routines/tables/call paths and no guessed symbols. Supported output is marked
`reconstruction-only`. It includes all 257 actual quarter-sine words for the
browser's native heading function, signed digital-direction tables, source
motion tables and a clearly labeled synthetic attribute-index fixture.

## Verified source

The backend is 939136-byte `BECODE.BIN`, loaded at `0x8005ae28`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
The resident is 251904-byte `SLES_009.14`, SHA-256
`dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644`.
Its payload begins at file offset 2048 and loads at `0x80011800`.

| Region | Address | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Complete resident heading lookup | `0x80021550` | 316 | `b16ecd98fb31460184fc1cf0ad5b0e7009339787facf85965f524be7d7ea6b19` |
| Complete digital direction mapper | `0x8009eda0` | 56 | `c4c17b04dfe2672fd1f2a9e14c8e5918aa88d37b1ccebce912d03e22e2f3b4be` |
| Containing horizontal motion routine, partly recovered | `0x8008d2dc` | 1444 | `42e304cfe03236a1dc8ce8f94fe6591279b10cd77a3c1e80f9dbb5345a5e431d` |
| Recovered integration subset | `0x8008d564` | 604 | `5b2342547dbc6ec6e39661bacd1a30166a9d2548274db95aaea86b0ab4e685e2` |
| Profile initializer prefix, data/arithmetic subset | `0x800a5288` | 276 | `5e355f79456a93af90bc589f8f65628e4b87e78919d5e89243fbf6ae8c0ca99f` |
| Base-speed source selector | `0x800b8f74` | 52 | `041310886474923a0fc7b367a0d6ee158c9b507daf5501727cbbd3b89f7dc6c2` |
| Complete target-speed update | `0x800a5628` | 252 | `26e2e6a981188f6bdfd5960a710a9d855f74c567da55c716cb66266c22e10244` |
| Inlined heading ray advance | `0x8008aef0` | 128 | `ba787c45d62d46f8c57c8cff7be32845ea721ad818a75c2be4a6526d5b713a8a` |
| Inlined speed/component storage | `0x8008b050` | 116 | `2635119f44f4f0f182d77243c56ef4d01e0ccfd567cbf92b63753685d192052b` |
| Motion caller, evidence only | `0x8008dc80` | 844 | `bc0a9f554d15c94bd063525d783f13ac69957db03ea2d9d5202da36ffc21149f` |

Fingerprints identify containing bytes, including parts not implemented. A
partial region is not counted as a complete native routine merely because a
new helper exports its numeric subset.

## Verified path and motion structure

The central simulation tick calls controller polling `0x8009f1c0` at
`0x8006a538`. That poller visits eight 472-byte controller slots, invoking
`0x8009edf8`; it calls the digital mapper at `0x8009f0b8`. Controller providers
and analog-device handling include indirect host callbacks, not reconstructed
input devices.

The central tick also calls per-side update `0x80061368`. Its entity loop
dispatches to `0x8008787c` or `0x800a6f60` according to entity field +4. Both
eventually call `0x800a5b18`, which invokes the recovered target-speed routine
at `0x800a5d28` on its selected path, and the motion caller `0x8008dc80` at
`0x800a6060`. That caller reaches `0x8008d2dc` at `0x8008dd0c` on its selected
object-flag path; other paths use animation-derived motion `0x8008d880`.
Static edges prove potential reachability, not complete runtime coverage.

The motion structure begins at **entity +124**, not at the entity's base.
Relevant fields relative to that structure are:

| Motion offset | Meaning established by reviewed arithmetic |
| --- | --- |
| +4 / +12 | Fixed X/Z words |
| +28 / +32 / +36 | Integer XYZ words |
| +40 / +44 / +48 | Fractional XYZ words |
| +96 / +100 / +104 | Approximate target distance / target delta X/Z |
| +132 / +136 / +144 | Facing / movement / desired heading inputs and outputs |
| +156 | Turning category |
| +160 / +164 / +168 / +172 | Scalar speed / velocity X/Z / heading |
| +176 | Desired speed before clamps |
| +180 / +184 | Alternate / normal maximum speed |
| +188 | Maximum-speed reduction word |
| +192 | Deceleration |
| +196 / +200 | Normal / alternate acceleration |
| +204 / +208 / +212 | Reciprocal normal acceleration / alternate acceleration / deceleration |
| +216 / +220 | Motion flags / accumulated result flags |

The motion caller loads ticks from `0x8013b448` at `0x800a605c`. This is the
central simulation carry established in `MATCH_RECOVERY.md`. The motion routine
shifts that integer left 16 at `0x8008d338`. No browser wall-clock frequency
is invented from this conversion.

## Native interfaces

`fifa98_player_digital_direction(buttons, outXZ)` preserves the entire mapper.
It masks the low nibble, uses the original 16-entry direction-index table,
and writes signed X/Z unit components. Return is original direction index
0–8; a new null-output guard returns `UINT32_MAX`. Opposing combinations keep
the original neutral mappings. Diagonals remain `(±1,±1)`; the helper does
not invent normalized diagonal motion or assign keyboard labels.

`fifa98_player_heading_vector(angle, quarterSine257, outXZ)` implements the
complete resident lookup. Its original period is 1024 and its output words
are Q16 X=`sin(angle)`, Z=`cos(angle)`, assembled from the supplied verified
quarter table and the original quadrant sign/reflection rules. The table is
1028 bytes at resident address `0x8004904c`, file offset 229452, SHA-256
`c3b03a2581960f9b22f2f29fb52f30bf36eb87c3896c8e4f62c708b3c247f880`.
Using source values retains the original lookup rounding rather than host
floating-point trigonometry. The helper returns one on success, zero for null
storage without writes.

`fifa98_player_motion_profile(index48, index58, attributeFlags,
alternateBaseBranch, out8)` adapts only the reviewed data-selection/arithmetic
portion of the initializer. Indices are original attribute bytes +48 and +58,
not newly assigned roster-statistic names. The branch argument supplies the
already determined result of original `0x800a86bc`; that position/side/field
predicate remains outside this helper.

It returns:

```text
normal maximum; alternate maximum;
normal acceleration; alternate acceleration; deceleration;
reciprocal normal acceleration; reciprocal alternate acceleration;
reciprocal deceleration
```

The normal base comes from the source table indexed by byte +58, unless
attribute flags word +64 bit 0 selects `0x30000`. A true alternate-base branch
instead selects its separate source table. Alternate maximum adds the source
addend indexed by byte +48. Normal acceleration and deceleration both use the
source acceleration table; alternate acceleration is the addend shifted right
one. Reciprocals use the original recovered `0x80124640` function, not division
with a new rounding convention.

The exact entity stores are important: +320 is normal acceleration; +316 is
deceleration; +324 is alternate acceleration. Relative to the motion subobject
those become +196, +192 and +200 respectively. The first two share a source
coefficient; the latter is half the speed addend. Motion flag `0x100000`
selects the alternate maximum/acceleration path in the containing routine.

| Source table, twenty reviewed words | Address | SHA-256 |
| --- | --- | --- |
| Acceleration | `0x80128f44` | `888f97f629ce3a63dc1fef985fd271dbef3a472aa28af17e771a943451dc3966` |
| Speed addend | `0x80129084` | `01978b2f7520510f95d3a634af1b93f06e83489a71a6c37406e20a617284750b` |
| Normal base speed | `0x80129034` | `1720e5f1aef6621ac20ba38d7ed4fcc16d5e417fa7f2d0206a59c0c5b3f4e379` |
| Alternate base speed | `0x80129354` | `18e4efbe208dd02c805a9eb8b6566de917063b6294945cefc6dff29414f5c4af` |

New validation accepts indices 0–19 and branch values 0/1, returning zero
without writes outside those bounds or for null output. It covers the reviewed
table entries; it does not assert that every original source caller enforces
those bounds or identify the values of any named player's live attribute bytes.
Success returns one. An index-10 fixture uses original normal maximum 334233,
alternate maximum 471858, normal acceleration/deceleration 16384, alternate
acceleration 68812, normal/deceleration reciprocals 262144 and alternate
reciprocal 62416. Its indices are invented test inputs, not a named-player claim.

`fifa98_player_target_speed(state2, control5)` implements the complete original
target-speed routine with explicit fields:

```text
state: target speed; entity flags
control: controller present; analog mode; magnitude; normal maximum; action state
```

With no controller it returns zero and writes nothing. Otherwise it returns
one. When analog mode and entity flag `0x100000` are both set, it consumes that
flag and follows the exact original thresholds: zero magnitude gives zero;
signed magnitude <26214 gives `0x19999`; magnitude >`0xa665` uses the rounded
fixed product with normal maximum; intermediate values give `0x48000`.
Action-state value 8 then raises results <=`0x6bfff` to `0x6c000`, including
a zero result. Other paths copy normal maximum. This preserves the source's
observed branch behavior without inventing friendly action labels. Digital
neutral-stop behavior is not supplied by this target-speed routine alone.

`fifa98_player_motion_integrate(state6, params7, quarterSine257)` adapts the
numeric horizontal portion after original speed clamps and steering decisions:

```text
state: fixed X,Z; current speed; velocity X,Z; heading
params: post-clamp target speed; selected acceleration; deceleration;
        reciprocal selected acceleration; reciprocal deceleration; ticks; heading
```

It implements the original piecewise integration: either remain at target
speed, accelerate/decelerate through the whole interval, or reach target speed
partway and split the interval. Each varying-speed segment uses the wrapped
arithmetic half-sum of initial/final speed, then original rounded fixed
multiplication. Each traveled segment independently rounds its X/Z products.
When both segment endpoint speeds are signed <19660, position stays fixed;
the speed/component outputs still update. Constant-speed segments retain the
original `SLL1/SRA1` signed-31-bit behavior. Final speed and rounded X/Z
components follow the inlined `0x8008b050` stores. All 32-bit wrap and signed
comparisons are retained; no acceleration curve or stopping rule is tuned.

The new ABI returns one on success, zero for null storage or ticks outside
0–65535, with no writes on failure. State, parameter and table arrays must be
valid distinct native storage. It omits original desired-speed clamping,
special flags, result flags, turning/category/animation decisions, animated Y,
contacts and other model callbacks. Supplying a direction directly as heading
would skip original steering and therefore must not be described as faithful
complete controls.

## Concrete remaining control path

The source of the missing links has been located, without substituting new
control rules:

- `0x800a598c` constructs controller-directed targets. State-700 callback
  `0x80070768` calls it at `0x800707c0`, passes its result to `0x8008e040`,
  and marks entity flag `0x100000`. Digital X/Z at controller offsets +20/+24
  become offsets ±192 stored at entity +52/+60. Neutral digital input decays
  those previous offsets toward zero by `32*ticks` through `0x800a4ff0`.
  Analog-mode value 1 instead uses controller angle halfword +48 and original
  trig/fixed multiply with 192; zero magnitude clears both offsets.
- That routine adds offsets to integer motion positions, sets target Y=0,
  then calls `0x800b679c` or `0x800b6804` for the selected original pitch
  boundary behavior. `0x8008e040` computes the target deltas and approximate
  distance from the current position.
- Steering `0x8008cd44`, called by `0x8008dc80` at `0x8008dcfc`, chooses
  movement/facing headings with original turn-rate/category rules, thresholds
  and large-turn animation callbacks (`0x800ba0c0`). It uses resident
  `0x80026fd0` to derive heading from target deltas. That resident function
  uses a quarter-angle lookup at `0x80048e30`, including fixed-ratio rounding,
  rather than a floating-point arctangent. These paths are not yet native.
- The beginning of `0x8008d2dc` applies speed limits based on target distance,
  motion flags, normal/alternate maximum, turning category and helper output.
  A complete controlled slice needs these selections together with steering
  and the appropriate original animation/contact constraints.

The other central-tick helper `0x800a10c8` adjusts shared target/cursor fields
and bounds them to pitch dimensions. It has not been relabeled as player
locomotion merely because it responds to controller input.

## Validation

Three static tests cover signed/unsigned source-table reads, subarray offsets,
hash gates, bad ranges/alignment, truncation and unknown images. Nine native
tests read the built main Wasm, verify its hash and `player.c` source hash,
and require no runtime imports. They cover all digital combinations, heading
quadrants/wrap, analog thresholds/flags, source-index profiles, hand-computed
split-step fixtures and 20000 independent BigInt integration cases. With the
local extracted references available, they also compare all 1024 original
heading outputs and all 400 bounded profile index pairs across both base
branches and flag variants to the actual
fingerprinted source tables. No copyrighted reference files are embedded in
tests and no compiler runs during testing.
