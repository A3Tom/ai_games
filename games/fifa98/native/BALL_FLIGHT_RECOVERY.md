# Original lofted ball launch

`native/ball-flight.c` ports the numeric launch at`0x8007c590` and its vertical
solution at`0x8007d5ac`. It generates both original mutable lookup tables from
their source initializers. It also recovers the numeric random-spin selection
in wrapper`0x800757e4`. This produces actual source airborne velocities, rather
than a newly chosen vertical impulse.

The module does not implement possession, ball/player contact, named actions,
kick animation events, ownership flags or full trajectory-predictor setup.
Launching a test ball from a chosen player position remains an explicit
inspection placement; the original wrapper operates on the current ball.

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

## Evidence and verification

`inspectBallFlightRecovery(backend,boot)` verifies complete source hashes
before reporting six source regions, their static disassembly, original spin
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

Five WASM tests bind the source/module hashes, independently reproduce every
generated table cell using BigInt arithmetic, compare5000 bounded loft cases,
verify selector RNG consumption and failure atomicity, and confirm an actual
source-table duration60 launch rises and travels forward. Two report tests
cover unknown/truncated/mutated images and original source constants. The
synthetic tests embed no commercial clip or original executable bytes.
