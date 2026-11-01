# Original player steering and speed selection

`native/steering.c` ports the numerical behavior at backend
`0x8008cd44–0x8008d2d8` and the speed-selection prefix
`0x8008d2dc–0x8008d560`. It composes with the separately recovered target
construction, heading lookup and horizontal integrator. Original code is read
as static evidence; this module contains direct C data transformations.

This is a bounded locomotion reconstruction. It does not implement the complete
player action dispatcher, animation turn requests, animated height, collisions
or match setup. It must not be presented as complete FIFA98 controls.

## Native interface

All array entries are original 32-bit word patterns. Signed comparisons,
low-word multiplication, shifts and angle wrapping retain source behavior.
The native API adds null checks, tick bounds and transactional refusal.
Arrays require the declared sizes and separate valid storage.

`fifa98_player_steer(state,input,atan257,thresholds6,detail)` uses:

| Array | Entries in order |
| --- | --- |
| `state[14]` | facing132, movementHeading136, desiredFacing144, angularMagnitude152, turnClass156, speed160, flags216, status220, side222, ownerStateFlags24, headingDelta140, facingSector148, copyFacing16, copyMovement20 |
| `input[6]` | ticks, distance96, desiredDX100, desiredDZ104, turnCoefficient24, ownerFlags36 |
| `detail[4]` | original slowdown return, requested animation action, requested heading, source call address |

Field suffixes are byte offsets in the original motion object. `owner+24` and
`owner+36` refer to its linked runtime/animation owner at motion+0. The motion
constructor receives outer player+84 as this owner and outer player+124 as
the motion storage. These owner offsets must not be confused with fields at
the same offsets in the outer player or attribute record.

The routine returns `1` on success, `0` for invalid input, and `-2` when an
animation operation is required outside the recovered subset. It commits
state only on success. Unsupported requests write their action, heading and
source call address to `detail`; they leave all fourteen state words intact.
`atan257` is the source byte table used by `fifa98_control_heading`.

`fifa98_player_speed_clamp(state,control,profile,thresholds6,caps3,output)`
uses `control[6] = desiredSpeed176, rangeFlags92, distance96, speedPenalty188,
steeringSlowdown, ticks`. `profile[8]` is the existing original
`fifa98_player_motion_profile` output. `output[7]` matches
`fifa98_player_motion_integrate` parameters exactly. Its only state mutation
is status220. Return `1` means success; `0` means invalid input with no writes.

Both functions accept ticks `0..65535` and turn classes `0..2`. The lookup
tables supplied by the gated evidence report are:

```text
thresholds6 = [228,469,171,455,114,398]
caps3      = [786432,327680,327680]
```

Each threshold pair belongs to the prior turn class. A separation at or below
the first threshold selects class0; at or below the second selects class1;
otherwise class2. This retains hysteresis rather than replacing it with fixed
global turn thresholds.

## Steering arithmetic and animation boundaries

Angles have a 1024-unit period. Signed folding keeps the range `[-511,512]`,
including positive512 at the half-turn tie. When distance96 is below9, the
travel-heading target is the current facing. Otherwise it comes from the
original integer heading lookup of desiredDX/desiredDZ. Speed below19660
snaps travel heading to that target before rate-limited turning.

Travel turn rate is the low32 product:

```text
(turnCoefficient24 - arithmetic(speed160 >> 16) + 14) * ticks
```

Facing turn rate is `(turnCoefficient24 + 14) * ticks`. Flag32 halves both
rates with an arithmetic shift; only the travel limit has a minimum of2 in
that branch. Without flag32, sufficiently sharp travel turns produce the
original slowdown return. The opposite-direction preference, flag16
face-movement path, flag2 limited-facing path, status bits, signed turn side,
coarse facing sector and owner dirty flag follow the reviewed source.

The original requests actions1..4 at `0x8008ceec` and action5 at
`0x8008d11c`, through `0x800ba0c0`. That helper returns zero without side
effects if ownerFlags36 lacks bit`0x200`, or ownerStateFlags24 equals1.
The native subset recognizes precisely those guards. Otherwise it stops at
the request, even if an unported animation-table entry might also make the
original helper return zero. It never invents a success/failure return or
silently drops a requested animation mutation.

## Speed selection

Flag limits are ordered: flag`0x40` caps desired speed at98304, else flag`0x80`
at262144, else flag`0x100` at425984. All source comparisons are signed.
Unless rangeFlags92 has bit`0x10000`, distance below8 forces zero, distance
8..159 caps at`65536 + distance*2048`, and distance160 or greater adds no
distance limit.

Flag`0x100000` selects the alternate maximum, acceleration and reciprocal
acceleration and sets status bit4. Flags`0x06000000` subtract speedPenalty188
from the chosen maximum before its comparison. The current turn-class ceiling
always caps a larger desired target. The assignment at`0x8008d530` is the
branch delay slot and applies for either current-speed outcome. Current speed
at or above that ceiling additionally sets status bit1; lower current speed
skips only that status store.
Flag2 derives the additional original status decision from desired-facing
separation. Finally, a nonzero steering slowdown forces target zero unless
motion flag4 is set. The selected values feed the existing horizontal
integrator without introducing new rates.

## Source initialization and a limited inspection recipe

The actual turn coefficient is recovered from attribute byte43 at
`0x800a539c–0x800a53b8` and an identical block at`0x800a5568`:
`min(attributeByte43 >> 2,12)`, stored at outer player148 = motion24.
A synthetic raw attribute fixture of40 therefore selects coefficient10 from
the source formula. Its interpretation as a named roster statistic is not
established.

The constructor at`0x8008dbac` clears228 motion bytes. Per-update action code
at`0x800878c4` clears motionFlags216 again, then computes flags from active
state. Flag16 is set in conditional control/action paths at`0x800a5d6c`
and`0x800a5fac`, among other source sites. It is a verified face-movement
choice, not a universal locomotion default. Each original flag write also
updates ownerStateFlags24 to the arithmetic upper half of motionFlags216.

At`0x800a6020–0x800a6054`, desiredFacing144 is the original heading to a
selected reference, or currentFacing132 when both reference deltas are zero.
The reference is action-dependent and may differ from the movement target.
For an isolated numerical control test, explicitly choosing a reference equal
to current position selects that verified zero-delta branch. It prevents a
stale inspection heading from pulling the facing back while stopping.

The report exposes this explicit inspection configuration:

- Synthetic attribute byte43=40, yielding coefficient10 by the original formula.
- MotionFlags216=16, selected as a fixed inspection source branch.
- OwnerFlags36=`0x900`, selecting the original horizontal and steering caller
  branches while leaving animation-availability bit`0x200` clear.
- OwnerStateFlags24 reset to0 per update from the chosen flag16 upper half.
- DesiredFacing144 copied from currentFacing132 through the zero-reference branch.
- Target construction → target delta → target speed → status220 clear →
  steering → speed selection → horizontal integration.

The complete caller at`0x8008dc80` actually clears status220, tests owner
bit`0x800` to choose the horizontal path, and tests owner bit`0x100` before
steering. It passes steering's original slowdown return directly into the
speed/integration routine. The configuration above uses those recovered
branches but does not assert that this combination is an initialized live
match player. Browser stepping remains an explicit inspection cadence until
its original time producer and scheduling are recovered.

## Evidence and verification

`inspectSteeringRecovery(BECODE)` requires the exact939,136-byte image SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
Unknown or changed images return unsupported with no inferred addresses.
The report includes eleven region fingerprints, full static disassembly,
eight verified call sites and both original tables. Principal regions:

| Source region | Bytes | SHA-256 |
| --- | ---: | --- |
| `0x8008cd44` steering | 1432 | `9e992e624d65068e8cf95ad8a6ed3a0c0bcabd8ccb4ee9116aa068bd44a682ce` |
| `0x8008d2dc` speed prefix | 648 | `c9286f4f5f2bc1535c57043659864b3df4680f2202c895a590d6104aa7872c7d` |
| `0x800ba0c0` animation guard | 172 | `8957639d57443e4f80fa6db244fb671b106ca12daf167cd1357c836de72e71e4` |
| `0x8008dc80` caller | 844 | `bc0a9f554d15c94bd063525d783f13ac69957db03ea2d9d5202da36ffc21149f` |

Native WASM tests use synthetic inputs and independent BigInt word arithmetic
for24,000 steering/clamp cases. Dedicated fixtures cover stationary snaps,
half-turn preferences, every unsupported animation action, proven no-op
guards, range endpoints, flag priority, class caps and failure atomicity.
Optional local-source checks validate all regions and tables. No commercial
bytes are required by the synthetic tests or embedded as game code.

```bash
node games/fifa98/scripts/steering-recovery.mjs
node games/fifa98/scripts/steering-recovery.test.mjs
node games/fifa98/native/steering.test.mjs
```
