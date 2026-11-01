# Original owned-ball marker and following

`player-ball.c` connects original animation reference channels to original
owned-ball attachment and a bounded no-contact ground-following path. A test
can now carry a ball using its active original motion marker and release from
the current followed position. There is no authored ball-ahead offset, new
dribbling force, proximity pickup, or emulator.

The test must explicitly supply an already-owned state. Genuine acquisition,
possession changes, action/contact dispatch, opposition, laws and a complete
match remain unrecovered. The original ownership functions also update team
and action state and invoke callbacks; identity equality alone must not be
presented as recovering them.

`scripts/player-ball-recovery.mjs` exports
`inspectPlayerBallRecovery(backend,resident)` and
`playerBallNativeExports`. It gates the complete original images by size and
SHA-256 before supplying18 source-region fingerprints,19 call edges, the
existing original sine table, source state contracts and a norm-branch bound:

| Image | Size | SHA-256 |
| --- | ---: | --- |
| BECODE.BIN, base8005AE28h | 939136 | `254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0` |
| SLES_009.14, file-address base80011000h | 251904 | `dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644` |

No original motion or lookup-table bytes are embedded in C or tests. Original
tables and motion prefixes are supplied from locally extracted source assets.

## Motion marker to world position

After the movement update,8008DF44h calls800BA290h to synchronize the animation
runtime with the controlled player's position/heading. It then checks entity
flags+36 bit1000h atDF54h..60h. If set,DF6Ch calls800D4A7Ch on the entity's
animation runtime. The getter ensures the original marker cache is current
through800D3E78h, then copies runtime+84/+88/+92, three fixed world words.

Source800D3ADCh selects the key pair and interpolation fraction:

```
scaled = (signedPhase >> (1 + (clip.flags & 1))) << 8  // word wrap
rawKey = scaled arithmetic>>16
fraction16 = scaled & 65535
A = independently clamped rawKey
B = independently clamped rawKey+1
```

This agrees with existing `selectMotionKeys(clip,phase)`. A/B must be original
decoded clip frames, rather than a mirrored/retained rendered pose. Both the
current root and marker use that same pair/fraction. From each signed-halfword
channel, interpolation is `A<<12 + fixedMultiply(fraction16,(B-A)<<12)`:

| Packet halfwords | Parsed prefix indices | Use |
| --- | --- | --- |
| +8/+10/+12 | 3/4/5 | Current root reference |
| +14/+16/+18 | 6/7/8 | Ball marker reference |

800D3C34h stores interpolated current root X/Z at runtime+120/+128; mirrored
children negate rootX. 800D3E78h subtracts the current root from the marker:
ordinary relativeX=`markerX-rootX`, mirrored relativeX=`rootX-markerX`;
relativeZ=`markerZ-rootZ`. MarkerY is used directly; rootY is not subtracted.

At800BA334h..380h, integer movement position plus fractional words becomes
fixedXYZ, passed to800D3928h. That function explicitly refreshes animation
worldX/Z at+96/+104. Thus the marker's world origin can be the controlled
player's fixedXZ without inventing a translation.

Heading has a specific source contract. 800BA2C8h..318h updates the animation
heading when `(entityFlags & 0x2100)==0x100`, or when its separate force argument
is nonzero. Low8 entity flags equal0 selects motion+132 (the current fixture's
facing); otherwise it selects motion+136. Both add the signed action-row+6
heading adjustment. 800D38ECh stores the new angle and gets sine/cosine of its
**negative**, at runtime+72/+68. Other modes can retain a prior cached heading;
the marker helper's explicit heading is not permission to overwrite that cache
for every source entity mode.

The selector category aliases this same low flags byte:800B92C0h reads category
with LBU object+36, and800B9424h stores the selected category with SB object+36.
Therefore the current composition must use `selectorState[0]===0 ?
player.facing : player.heading`, then add the action heading adjustment. An
initial low-byte-zero fixture does not keep selecting facing after the category
changes.

With cosine c, negative-heading sine s and controlled fixed origin X/Z:

```
worldX = originX + fixedMultiply(relativeX,c) + fixedMultiply(relativeZ,-s)
worldY = interpolatedMarkerY
worldZ = originZ + fixedMultiply(relativeX,s) + fixedMultiply(relativeZ,c)
```

These are source word arithmetic and original +32768 fixed-product rounding.
The marker interpolates independently of the preview's discrete skeletal key;
this does not implement skeletal interpolation, action blends or callbacks.

## Guarded integer attachment

8008DF74h..98h reads the signed high16 of each marker fixed word. It subtracts8
from integerY and clamps negative Y to0 before calling8007514Ch. This8-unit
offset is source code, separate from the player's rendering Y-3 adaptation.

The complete8007514Ch..80075214h routine requires:

- Nonnull owner at8013C60Ch.
- Owner equals the actor currently being updated,8013C634h.
- Owner equals the attachment actor,8013DF30h.

It copies current integer ballXYZ8013DE44h to previous integerXYZ8013DE50h,
writes the supplied coordinates to currentXYZ and anchor8013DF34h, and ORs40h
into shared ball flags8013DF48h. The native composition also includes the
caller entityflag1000h guard and marker-to-integer conversion above.

Three opaque identity tokens replace the original pointer comparisons. They
are identities, not emulated addresses. `[1,1,1]` plus entityflag1000h is an
explicit already-owned test fixture. It does not acquire a nearby free ball.

## Original bounded following

8007BAE0h..8007BB84h selects owned prediction only when shared ballflag40h is
set and blocker8013DEF8h is zero. It calls80076300h with zero velocity and spin,
then8007B790h for the current whole-tick count, and clears40h. The predictor's
initial position at80076324h..3Ch is the existing fixed ballXYZ8013DF0Ch; it
preserves fractional bits and does not replace them by previous integerXYZ.

8007B790h computes each velocity component toward the integer anchor:

```
inverseTicks = originalRoundedReciprocal(ticks <<16)
velocity = fixedMultiply((anchorInteger<<16)-currentFixed,inverseTicks)
velocityX/Z = signed clamp to +/-15Q16
velocityY   = signed clamp to +/-10Q16
```

It adds this same velocity to each trajectory sample without air drag or ground
rolling retention. This is an owned trajectory, not a new free-ball force.
The common consumer800766A4h..80076760h updates current/previous fixed positions,
their signed high16 integer coordinates and actual sample displacement velocity.
The native output follows those consumed fields for the last sample.

The source later computes an approximate norm80124678h and can scale velocities
above30Q16. After component clamps, squared speed is at most550Q16. A proof
against the **actual approximate norm**, rather than mathematical sqrt, is in
the report: highest-set-bit chooses positive source slopes at8013137Ch and
intercepts at80131400h. Evaluating each of26 interval endpoints through550Q16
gives maximum1540977Q16, below30Q16=1966080. Thus this later scaling branch is
unreachable in the bounded component-clamped path. The immutable table hashes
are `857d78e6038ffcd652f971d4c44d22a8693a65def03845dd71fb12db0da66797`
and `4e2fb44872932d7af0b3d42d1090427ea10896ad92c23b7ad90daaa2e5a3fd7d`.
The tables are inspected for proof; they are not embedded or needed at runtime.

The native follow helper accepts1..6 ticks, matching the bounded control
adapter. It requires both current and anchorY0, consistent previous integer
coordinates, signed16 anchors and no signed delta/position overflow. It omits
the source predictor's ring counters, contact/event records and80079C90h
collision call. The caller must exclude other field, post, net and player
contacts and stop before boundaries. A positive anchorY is explicitly rejected;
it must not be flattened to ground to force this subset to run.

Reset spin to0 when starting this owned predictor, matching8007BB48h/7631Ch.
Launching from an owned test should release that fixture and pass the **current
followed fixed ball position** to the recovered launch solver. Resetting it to
the player would introduce a new teleport.

## Native interfaces and verification

- `fifa98_player_ball_marker(prefixA_i32_9,prefixB_i32_9,fraction16,
  playerFixedXZ_u32_2,sourceHeading1024,mirror0or1,sine257,outFixedXYZ3)`:
  returns1 success/0 invalid, leaving output unchanged on rejection.
- `fifa98_player_ball_attach(markerFixedXYZ3,ownershipTokens3,entityFlags,
  ballIntegerState10)`: returns1 applied,0 source guard false,-1 null.
- `fifa98_player_ball_follow(ballIntegerState10,ticks1to6,blockerWord,
  ballFixedState9)`: returns1 applied,0 pendingflag absent/blocker nonzero,-1
  unsupported. Both buffers remain unchanged on rejection. A false guard
  means another source ball branch is needed, not that free physics is complete.

`ballIntegerState10` is `[currentXYZ,previousXYZ,anchorXYZ,sharedFlags]`.
`ballFixedState9` is `[currentFixedXYZ,velocityXYZ,previousFixedXYZ]`, matching
existing match helpers. Valid distinct native buffers are required. The helper
does not allocate or retain native/world state.

Seven native tests verify the built main Wasm/source hashes and absence of
runtime imports,12000 marker cases and12000 follow cases against independent
BigInt products/reciprocals,6000 ownership/Y conversions, supported boundaries
and atomic guards. When local source assets are prepared, tests read the actual
19 control action clips, select real A/B/fractions, and validate their full
marker→attachment→follow chain without embedding original data. Two static
tests ensure unknown source images make no recovery claims. Tests do not invoke
the compiler or linker.

## Remaining action/contact work

The attachment entityflag has a real event producer, now traced but unimplemented.
800D4780h compares phase against signed clipheader+8 shifted8 and signed
`(clipheader+10-2)` shifted8. Its source suppression flags can set runtime8000h
at the start, then clear8000h and set4000h/20000h at the end. The main phase
crossing path800D41A4h performs corresponding callbacks at these boundaries.
The callback800B95E0h sets entityflag1000h from runtime8000h; runtime4000h
samples a final marker, clears1000h and invokes further action processing.

All currently used ordinary control clips inspected here have header+8/+10=-1,
so their motion marker alone does not supply an attachment start/end event.
The already-owned fixture remains explicit. Recover callback registration,
action-specific event windows and their possession guards before describing
automatic dribbling/contact behavior.

Ownership routine80074C64h changes owner/team state, may invoke80087CACh and
calls800A651Ch,8006246Ch,800BCDF8h or800BCC60h. Launch bookkeeping80075580h
also changes team/action pointers and flags. These are not replaced by the
test's identity tokens. The shot/action parameter producer at actor+406/+408/+414
and the complete8006BD4Ch action state dispatcher remain continuation targets.
