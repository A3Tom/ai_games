# Original pitch and goal-net predicates

`ball-boundary.c` supplies the original radius-adjusted pitch-outside flag,
the original derived net bounds, and four complete constrained net-plane
predicates. These are compiled arithmetic functions. No original instructions
execute, and no scoring decision, goalmouth event, restart, possession rule or
replacement collision response is introduced.

## Sources and dimensions

`scripts/ball-boundary-recovery.mjs` exports
`inspectBallBoundaryRecovery(backend,resident)`. It requires the full identities
below before returning ten region hashes, original lookup-table dependencies,
the three native exports and an explicit profile2 geometry fixture. An unknown
image returns `unsupported` without regions or tables.

| Image | Bytes | SHA-256 |
| --- | ---: | --- |
| `BECODE.BIN` | 939136 | `254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0` |
| `SLES_009.14` | 251904 | `dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644` |

Backend addresses use load base `0x8005ae28`. The resident payload starts at
file offset2048 and load base `0x80011800`. Region fingerprints in the report
cover initializer `0x800b595c` through the derived dimension writes, radius
initializer `0x80074540`, complete net-bound builder `0x80077068`, fraction
helper `0x80077198`, the four complete containing plane routines below, the
pitch-outside block and resident joint sine/cosine `0x800272e0`.

| Source global | Use | Explicit normal profile2 value |
| --- | --- | ---: |
| `0x8013fd7c` | Simulation pitch half-width | 1824 |
| `0x8013fd80` | Simulation pitch half-length | 2544 |
| `0x8013ded0` | Ball radius | 5 |
| `0x8013fd90` | Half goal width | 228 |
| `0x8013fd54` | Goal height | 152 |
| `0x8013fd64` | Post diameter | 6 |
| `0x8013fd68` | Bar diameter | 6 |
| `0x8013fd60` | Lower net depth | 152 |
| `0x8013fd5c` | Upper net depth | 76 |

The dimension initializer writes post/bar diameter6 and goal height152 at
`0x800b5b50..0x800b5b78`. It writes lower depth152 and upper depth76 at
`0x800b5b80` / `0x800b5b4c`. Goal width456 is halved at `0x800b5ce4`, and
the full profile2 pitch dimensions3648/5088 are halved into simulation bounds
at `0x800b5c40` / `0x800b5ca0`. The ball clear routine stores radius5 at
`0x80074564`. These dimensions are simulation units. The separate source
placement path doubles simulation coordinates for rendering.

These explicit values describe the reviewed profile, not a complete match
initializer. Other pitch profiles/settings remain caller choices. The report
exposes them both as `normalProfile2` named fields and `fixture.params` in
native ABI order.

## Original outside flag

Contact processor `0x80079c90`, block `0x8007a5f8..0x8007a668`, compares the
absolute fixed-point ball X/Z endpoint to the radius-adjusted half-extents:

```text
if abs(z) > ((halfLength + radius) << 16)
   or abs(x) > ((halfWidth + radius) << 16):
    trajectoryRecord.flags |= 0x10
```

Equality does not set the flag; one fixed-point unit beyond the threshold
does. The containing source also records the first corresponding trajectory
index. Native `fifa98_ball_outside_pitch(positionXYZ3,halfWidth,halfLength,radius)`
returns the numerical flag16 or zero, with a new `-1` invalid-domain result.
It does not change the position or produce an original swept-event time.

The bounded API requires positive half-extents, radius0..256 and adjusted
half-extents no greater than32767. It rejects null storage and INT32_MIN X/Z.
The returned endpoint flag can support an inspection stop after consuming that
sample. Stopping the isolated test is a new adapter policy, not an original
touchline restart, wall bounce or complete laws implementation.

## Original net-bound builder

`fifa98_ball_boundary_geometry(params9,atan16,quarterSine,out11)` reconstructs
the complete numeric builder `0x80077068..0x80077194`. The first nine inputs
are the dimension values in the table above. Output preserves the first seven
parameters and appends four source Q16 bounds in this order:

| Output index | Source global | Meaning in predicates |
| ---: | --- | --- |
| 7 | `0x8013af64` | Inner net depth at its lower end |
| 8 | `0x8013f128` | Inner net depth at its upper end |
| 9 | `0x80133320` | Outer net depth at its upper end |
| 10 | `0x8013c51c` | Outer net depth at its lower end |

For unequal lower/upper depths, the builder obtains original heading16 from
`(goalHeight+halfBar, lowerDepth-upperDepth)`, halves that signed angle toward
zero, and computes joint sine/cosine through resident `0x800272e0`. The joint
cosine subtracts an arithmetic-shifted positive sine product; reusing separate
cosine `0x80027258` would round differently. The original rounded reciprocal,
fixed divide and fixed multiply produce `along` and `across` radius offsets.

With `lower=(halfLength+lowerDepth)<<16` and
`upper=(halfLength+upperDepth)<<16`, the outputs are:

```text
innerLower = lower - along
innerUpper = upper - across
outerUpper = upper + across
outerLower = lower + across
```

The last use of `across` is preserved exactly. For equal depths, both offsets
are simply `radius<<16`; no trigonometric lookup is performed. Validation
requires positive usable goal bounds and limits the integer geometry to the
source signed-halfword range. Invalid calls leave output unchanged. Original
tables are explicit inputs, identity-checked by the preparation report.

## Four constrained plane helpers

`fifa98_ball_goal_plane(kind,fromXYZ3,toXYZ3,geometry11,earliest,out4)` ports
the complete contact branches selected by original `a3=1`. The original
probe-only `a3=0` paths return earlier without all bounds tests; that separate
operation is deliberately excluded from this ABI.

| Kind | Complete containing source | Plane coordinate |
| ---: | --- | --- |
| 0 | `0x80077c64..0x80077eb0` | X at signed halfGoalWidth+halfPost−radius |
| 1 | `0x80077eb4..0x800780ac` | Y at goalHeight+halfBar−2radius |
| 2 | `0x80078258..0x80078438` | Y at goalHeight+halfBar |
| 3 | `0x8007843c..0x8007867c` | X at signed halfGoalWidth+halfPost+radius |

For side planes, source chooses the sign from the destination X: positive
when X>0, negative otherwise. Fraction helper `0x80077198` rejects zero axis
delta, then computes original signed Q16 division of plane distance by delta.
The plane predicates require nonnegative fraction **strictly less** than the
supplied earliest value. Source orchestration starts at65537, admitting an
exact endpoint fraction65536. Equal candidate times preserve earlier order.

All predicates require interpolated absolute Z strictly beyond the pitch
half-length. Roof predicates additionally require absolute X strictly inside
their corresponding inner/outer side plane and Z strictly before their upper
net-depth limit. Side predicates compute a bounded vertical ratio and use the
original separately rounded products to interpolate lower/upper depth limits.
The outer side adds the source8Q16 allowance. No symmetric simplification or
floating-point line intersection replaces these operations.

Output is `[fractionQ16,pointXQ16,pointYQ16,pointZQ16]`. The point is the
new packed representation of the original caller's separately rounded
interpolation. Success returns1; no hit returns0; invalid input returns−1.
Nonhits/rejections preserve output. The new API accepts kinds0..3 and earliest
1..65537. It exposes only predicates, so its caller can report a source net
candidate or stop before a response that is not recovered yet.

## Integration boundaries and remaining contact work

These four helpers describe goal net surfaces. They are not player proximity
tests. The other inspected helpers `0x800779a8`, `0x80077724` and
`0x80077880` cover a back-net surface and circular post/bar intersections;
their solver paths are not part of this batch. Complete candidate ordering,
numeric response dispatcher `0x80079000`, trajectory-record flags and
score/restart callbacks also remain separate.

The pitch-outside block can replace an earlier inspection stop at the bare
half-extent with the actual original radius-adjusted endpoint condition.
It does not justify allowing the isolated flight helper to pass through a net,
post, player or other unrecovered contact. No original goalmouth-plane event
was established here, so the module does not invent one or label a net contact
as a scored goal.

The contact processor's indirect callback at `0x8007a69c` is reached after its
outside flag. Its pointer `0x80125d94` is zero in the original overlay image
and set through `0x80074434`; the actual callback and match rules require their
own source investigation. No direct ownership-acquisition call was found in
the goal-plane helpers.

## Validation

Six native tests verify source/module build hashes; strict signed pitch-edge
thresholds including one Q16 unit beyond equality; mirrored net sides, roof
seams and earliest ties; 18000 bounded segment fixtures against an independent
BigInt formulation; equal-depth initialization and atomic invalid calls; and
the actual profile2 derived bounds using the exact source tables. The last
test specifically retains the joint cosine's distinct rounding. Reference
images are read only for optional hash-gated local validation and are never
embedded in fixtures or modified.
