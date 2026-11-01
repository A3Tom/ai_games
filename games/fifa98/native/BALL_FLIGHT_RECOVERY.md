# Original airborne ball launch numerics

`native/ball-flight.c` ports the numeric launch at`0x8007c590` and its vertical
solution at`0x8007d5ac`. It generates both original mutable lookup tables from
their source initializers. It also recovers the numeric random-spin selection
in wrapper`0x800757e4`. This produces actual source airborne velocities, rather
than a newly chosen vertical impulse.

The module does not implement possession, ball/player contact, named actions,
kick animation events, ownership flags or full trajectory-predictor setup.
Launching a test ball from a chosen player position remains an explicit
inspection placement; the original wrapper operates on the current ball.

The module also recovers duration search`0x8007c71c` and the distinct
speed-selected solver`0x8007c83c`. These are numerical dependencies of general
dispatcher`0x80075924`; they do not replace its football callback, actor
attributes, random adjustments, ownership or world state effects.

## Source-generated duration tables

The initializer at`0x8007ce14` calls`0x8007c2f8` to build320 unsigned halfwords
at`0x8013a110`. Index zero is zero. It starts positionX=65536, positionZ=0,
velocityX=65536, velocityZ=0 and spin1000. At each index1..319 it:

1. Adds the current Z velocity to accumulated Z.
2. Subtracts rounded fixedMultiply(203,component) from X/Z velocity.
3. Applies the original sequential curve: change X from post-drag Z, then
   change Z using the **updated X**; the curve factor is10000.
4. Decays spin with fixedMultiply(spin,`0xf9db`).
5. Obtains original integer planar length from accumulated positions shifted
   right16, computes source fixedDivide(65536,length<<16), and caps at65535.
6. Adds updated X velocity before the next iteration.

This exact ordering includes the delayed X accumulation; moving both position
adds or sampling fractional length changes the source table.

The call at`0x8007ce24` invokes`0x8007c438` with drag203, spin decay`0xf9db`
and curve10000. It builds another320 unsigned halfwords at`0x8013ff90`, again
starting index zero at zero. Initial position is zero, velocityX=0,
velocityZ=262144 and spin=-1000. Its accumulation/drag/curve order is the same.
Each entry is the low16 bits of original fixedDivide(heading16(X,Z),-1000).
These entries compensate the launch heading for the selected spin.

Both source arrays are runtime-generated state. Reading their original
overlay bytes as initialized values would be incorrect. The native code uses
direct numerical recurrences with the existing recovered fixed multiply,
integer length and heading helpers; it runs no original instructions.

## Vertical solution and caps

The vertical solver reads these reviewed backend coefficient words:

| Address | Signed value | Use |
| --- | ---: | --- |
| `0x80127080` |65536| Unit denominator |
| `0x80127084` |-208360| Exponential time coefficient |
| `0x80127088` |-3006669| Velocity addend |
| `0x801270a4` |832149| Height-difference coefficient |
| `0x801270ac` |-2386092| Time numerator coefficient |

For duration zero it returns15Q16. Otherwise it computes:

```text
time = duration << 16
n = ASR12(fixedMultiply(832149,targetY-currentY))
    - ASR8(fixedMultiply(-2386092,time))
e = ASR10(fixedMultiply(-208360,time))
vertical = -3006669 + fixedDivide(n,65536-negativeExponential(e))
```

These are signed word operations with the original multiplication rounding,
shifts and low-word divide result. Native Y bounds keep the accepted source
path within its reviewed arithmetic domain. The negative exponential reuses
the separately recovered113-word source table and reciprocal behavior.

The launch multiplies the generated horizontal factor by the integer planar
target distance. Horizontal speed above35Q16 becomes35Q16; vertical speed
above25Q16 becomes25Q16. Either sets the original return flag1. The caps use
signed comparisons and do not clamp negative vertical speeds to zero.

The exact full-resolution heading is reduced by
`fixedMultiply(spin,headingFactor[duration])`. Original normalization subtracts
65536 only for a value strictly greater than65536, otherwise adds65536 for a
negative value. The recovered corrected sine/cosine helpers produce the X/Z
components. Output Y is the original vertical solution.

The analytical launch coefficients are separate from subsequent discrete air
gravity. The inspected source gravity word at`0x80125d18` is`0xfe000000`;
the recovered air step maps it to the original gravity increment. This does
not establish every active match setting or permit replacing the launch
coefficients with arbitrary physics. The duration index is an original table
index0..319; no seconds-per-index conversion is asserted.

## Original spin selection

Wrapper`0x800757e4` calls the source ball reset, whose store at`0x800749e8`
clears the spin word. Selector2 then skips RNG and retains spin zero.
Other selectors consume one source RNG result and index the table at
`0x80125e58` with its low nibble:

```text
[2000,3000,3000,4000,4000,4000,5000,5000,
 5000,6000,6000,6000,7000,7000,8000,8000]
```

Selector1 negates the sampled value. The new bounded wrapper admits selectors
0,1,2, and stages RNG before launch so rejected native calls consume no public
draw. This transactional guard is a native API adaptation, not a source action
side effect. No friendly action names are inferred from the numeric selectors.

## Native API and inspection inputs

`fifa98_ball_flight_tables(atan8,atan16,sine)` generates both tables in separate
native storage and returns1 on success or0 on invalid input. Getters
`fifa98_ball_flight_factors()` and `fifa98_ball_flight_angles()` expose the320
u16 entries. An invalid generation attempt preserves previously built tables.
The caller supplies the fingerprinted original lookup tables.

```text
fifa98_ball_loft_launch(position,target,duration,spin,
                       atan8,atan16,sine,exponential113,output8)
fifa98_ball_loft_random_launch(position,target,duration,spinMode,random6,
                              atan8,atan16,sine,exponential113,output8)
```

Both position and target are **fixedQ16 XYZ**. This differs from the grounded
wrapper's integer target ABI. Output is:

```text
[velocityX,velocityY,velocityZ,horizontalSpeed,
 integerPlanarDistance,heading16,spin,durationIndex]
```

Return0/1 is the original cap flag; new-1 means unsupported input and leaves
output/RNG untouched. Arrays require their declared lengths and distinct
valid storage. Tables must have been built first. Explicit native bounds are
duration0..319, spin-8000..8000, current/target Y0..1024Q16, and integer planar
distance0..32767. These guards do not introduce substitute velocities.

Duration60 and selectors2/0/1 provide explicit loft/positive-curve/negative-curve
inspection fixtures. The names describe the new inspection choices. They are
not evidence of a named original pass/chip/shoot action or default duration.
The source numeric launch can feed the recovered air/ground stepping while
still stopping before unrecovered player, boundary, post or net contacts.

## Speed-selected duration and airborne solver

`0x8007c71c` receives positive integer planar distanceQ16 and requested horizontal
speedQ16. It forms signed fixedDivide(requested,distance) and searches the
generated unsigned-halfword horizontal factors:

1. If factor1 is strictly smaller than the ratio, return1. If the ratio is
   strictly smaller than factor319, return319. Equality enters the search.
2. Start low1, high319, range318, best signed error`0x0fffffff` and index319.
   Midpoint is low+arithmetic(range>>1).
3. Error is factor[mid]-ratio. Positive raises low=mid+1; negative lowers
   high=mid-1; zero sets the currently tested range to0.
4. Replace the best index only for **strictly** smaller absolute error. Equal
   errors preserve the earlier candidate.
5. BGTZ at`0x8007c810` tests the **previous** range. Only its delay slot atC814
   updates high-low. Preserve the extra terminal iteration; a conventional
   fresh-range binary search can choose a different duration on ties.

`fifa98_ball_flight_duration(distanceQ16,requestedQ16,factors320)` returns
index1..319 or new-1 invalid. Distance must be an integer multiple65536 from
1..32767 units, exactly as7C83C passes integer_length<<16. Requested speed is
0..50Q16. This domain also proves original fixed-divider denominator-halving
steps retain exact bits; fractional/zero distance is explicitly refused.

`0x8007c83c` selects that duration and calculates actual horizontal speed as
fixedMultiply(factor[duration],integerDistance<<16). It does **not** replace it
with the request or apply a subsequent horizontal cap. Return bit2 is set iff
signed absolute(requested-actual) is strictly greater than32768; equality leaves
the bit clear. It calls7D5AC for vertical speed at the selected duration. If
signed verticalCap is strictly below that speed, it replaces it and sets bit1.
Spin compensation, single-turn normalization and corrected sine/cosine retain
the existing original arithmetic.

```
fifa98_ball_speed_launch(positionFixedXYZ,targetFixedXYZ,spin,
                         requestedHorizontalQ16,verticalCapQ16,
                         atan8,atan16,sine,exponential113,out8)
```

Output8 has the existing loft fields, including **actual** speed and selected
duration. Return0..3 contains original flag bits; new-1 rejects atomically.
Native bounds are integer distance1..32767, spin-8000..8000, current/targetY
0..1024Q16 and requested/cap0..50Q16. This numeric helper consumes no RNG.

General75924 separately handles distance<16, other type/parameter branches,
actor/match adjustments, statistics, ownership/events and predictor setup. A
speed/cap/spin fixture remains a numeric inspection, distinct from both the
25-capped ground fixture and explicit-duration loft fixture.

Queued-action calibration is described in`ACTION_EVENTS_RECOVERY.md`. BA460
derives queue+54 from clip phases and distance/heading from discrete original
prefixes. Queue+54 feeds the separate BF8C→75694 ground path. General
71CEC→75924 instead reads queue+20, which comes from720F8's original a3 input.
Calibration does not establish that solver parameter or dispatch a timed shot.

## Positive absolute-height option0

`fifa98_ball_height_launch` recovers the option0 branch of7CA14 used by the
general caller:75DD0h supplies option0, and75DC8h converts the separate positive
queue+20 integer to fixedQ16. It does not use queue+54's calibrated clip duration.

Two512-element signed original tables provide the inverse branches. They are
extracted by the hash-gated report and supplied as native arguments; they are
not embedded in C. JSON descriptors use`element:'i32'`; transfer values as
`value>>>0` into native word storage. The new2048-word flight workspace can
hold both tables independently of action/control buffers.

| Data | Address | SHA-256 |
| --- | --- | --- |
| inverseA,512 i32 |8012607Ch| `56ff2048e8fd1e9b22939f5f719a6f6b2ab4f64ac4b7cce62786bb0e5c33e5f7` |
| inverseB,512 i32 |8012687Ch| `7a007413897031c46805389ace6d0f65f528a8e64951ba51c098f7803325c1dd` |
| height coefficients,18 i32 |8012707Ch..70C0h| `74e42771e88f054889b49693edcced39c4a6874e1d5aa684c922be9fc456c362` |

For inverse input x<=0, source7D194h/7D238h forms
`scaled=fixedMultiply(182420805,-x)`. Its signed integer part must be513..1023;
the neighboring table indices are integer-513 and integer-512. The low16
fraction supplies two **separately rounded** products, with65536-fraction and
fraction, added with word wrap. D194 reads only inverseB; D238 writes both
branches. These are original table results, not a host analytic approximation.

Using M for original rounded fixedMultiply and E for original exponential:

```
deltaHeight = absoluteHeight-currentY
inverseInput = ASR14(M(-395007066,E(ASR15(M(-145331,deltaHeight)))))
firstTime = M(-21107860,inverseB(inverseInput))
            + M(deltaHeight,-1428) - 21140645
vertical = M(-3006669,65536-E(ASR10(M(208360,firstTime))))
```

The last E call is the **positive** exponential branch of7CFC0h, unlike the
previous negative-only launch dependencies. It combines the original radix32
factors with fixedMultiply and no reciprocal. Positive arguments are bounded
to681391 so all reads stay in the reviewed113-word table. Negative arguments
retain their original reciprocal/cutoff behavior.

7D658h determines the two target-height crossing times:

```
anchor = ASR6(M(-91422,targetY-currentY)-M(-29415702,vertical))
scale = -395007066 + M(-8609919,vertical)
q = ASR14(M(scale,E(ASR10(M(anchor,-208360)))))
selected = 21140645 + anchor - M(inverseA(q),-21107860)
other    = 21140645 + anchor - M(inverseB(q),-21107860)
if selected<0 and other>0: selected=other
durationIndex = ASR16(selected+32768)
```

This is option0's first-root selection, including its negative-first and
positive-alternate fallback. A native guard rejects rounded duration outside
0..319 before reading the mutable flight tables. Source horizontal and vertical
caps each apply on strict signed cap<value; either sets original flag1.
Spin compensation and corrected directional products remain unchanged.

```
fifa98_ball_height_launch(positionFixedXYZ,targetFixedXYZ,spin,
                          absoluteHeightQ16,horizontalCapQ16,verticalCapQ16,
                          atan8,atan16,sine,exponential113,
                          inverseA512,inverseB512,out8)
```

Output8 and return0/1 match the duration-selected loft representation; new-1
rejects atomically. Accepted absolute height is an integer1..1024Q16, strictly
above currentY. Current/targetY are0..1024Q16, spin is-8000..8000, caps0..50Q16,
and integer planar distance1..32767. Height need not exceed targetY: original
inverse/index tests decide support, rather than a new peak-height guess.

The source can leave time temporaries unwritten on a7D658 failure and then
read them in7CA14. The bounded native implementation explicitly refuses inverse
failures, negative firstTime and invalid duration indices. It never invents a
time or reads stale/uninitialized data. Other source option values, broader
exponential domains and full75924 world effects remain excluded.

Absolute height16Q16 with horizontal/vertical caps35Q16/25Q16 is the explicit
inspection fixture. The tested height4Q16 case selects source duration4 and
vertical30968, but that numerical coincidence does not bind it to a clip.
Neither value is a recovered queue+20 default or a named kick calibration.

## Evidence and verification

`inspectBallFlightRecovery(backend,boot)` verifies complete source hashes
before reporting fifteen source regions, their static disassembly, original spin
and coefficient words, reused lookup tables and generated-table semantics.
Unknown/mutated images return unsupported with no guessed launch profile.

| Source region | Bytes | SHA-256 |
| --- | ---: | --- |
| `0x800757e4` wrapper |320| `5ae48e8d7b0969022fd6739af91f7b2c0b0115db5df64bf0f5bbb9b6aecd3265` |
| `0x8007c590` launch |396| `1807de7121d18fc0f03f66d6c15b1c61f91411647ba6b0db9f9675d051b85c3c` |
| `0x8007d5ac` vertical |172| `c9d379b415899d04ed1ebc4a8f9a0db6a2c9ddb7d0e2442deb5da9ccc8f3ad02` |
| `0x8007c2f8` horizontal table |320| `7d9a057af9eb05d68ac1c3b3b581e3e508f50d81ad124361171ebb97e3c47cd9` |
| `0x8007c438` heading table |344| `189675be57ec93fd990569b9bb4f375c672103b1d7433489224ec3cdbcc13f82` |
| `0x8007ce00` table-call arguments |44| `58cd74ac85c9f1cbe09a3a3ebcd234f3ae9660369aa57986b8ed5022d2ecc689` |
| `0x8007c71c` duration search |288| `61fb32b948355f099f942b456831f3e1495692f6a6d34ee5716840468670d2a9` |
| `0x8007c83c` speed-selected solver |472| `c0c5481bb1a49109d57b3707c9b13eab042ba1858a9d9f4ca9071369151c810c` |
| `0x80075924` dispatcher context |1440| `7150adb8cdd2e2fe76e9b0252eec56c7aab537a2bbf9e7b4dcff2593df8298e9` |
| `0x8007ca14` absolute-height option0 |556| `99464043bb84eb6fe38143df622ec01b72be57e5a7e6de1ff44f4552328ac345` |
| `0x8007d780` height reference/time |152| `14f3c062f7ef68cf47e09c99ab2d34bb82f1e380b4c65cf0da5a4272d3e08e8d` |
| `0x8007d4ec` time/vertical velocity |76| `5146f523383c892c8dc248fc6543ce06409f8305001576f761c49455b9cd0a13` |
| `0x8007d658` crossing times |296| `d06d5262197046449c396764391c463ee75d40c0fba4d5a26b0d818436581476` |
| `0x8007d194` inverseB interpolation |164| `92e7e91c1bcc0994d00a065ba491aaf54f85833cc391156443ef29122fd3ef7c` |
| `0x8007d238` paired inverse interpolation |272| `eef665b2dbac0a913f06419d3ebf65a85d4aac3ff05fb76a120ecad1d89409cd` |

WASM tests bind the source/module hashes, independently reproduce every
generated table cell using BigInt arithmetic, compare5000 bounded loft cases,
verify selector RNG consumption and failure atomicity, and confirm an actual
source-table duration60 launch rises and travels forward. Two report tests
cover unknown/truncated/mutated images and original source constants. The
synthetic tests embed no commercial clip or original executable bytes.
New search/speed tests cover the previous-range terminal pass, strict error
ties and thresholds, independent BigInt search/velocity oracles, absence of a
horizontal post-clamp, source-generated tables and atomic guards. Independent
raw-source review confirmed the new search and solver ordering.
The completed native flight suite has14 tests, including7000 height cases
against independent BigInt source formulas, actual inverse tables, root failure,
duration rounding, cap equality and atomic guards. Two report tests verify
all15 regions, both512-word tables, coefficient words and unknown-image refusal.
