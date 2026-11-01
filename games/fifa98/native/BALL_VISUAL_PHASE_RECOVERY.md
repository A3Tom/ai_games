# Original ball sprite phase scheduling

The original four-state ball image phase is driven by horizontal trajectory
displacement and whole simulation ticks. It does not require a guessed frame
rate, mesh rotation or an independent browser sprite timer. The two verified
numeric paths are implemented in `ball-motion.c` and the browser-compatible
`scripts/ball-visual-phase.mjs`. The native implementation is ordinary compiled
C; no original executable instructions run.

## Source and state

The backend is `BECODE.BIN`, 939136 bytes, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`,
loaded at `0x8005ae28`. The resident is `SLES_009.14`, 251904 bytes,
SHA-256 `dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644`;
its executable payload starts at file offset2048 and runtime `0x80011800`.
`inspectBallVisualPhase(backend,resident)` checks both complete identities
before publishing ten source-region fingerprints. Unknown images produce an
unsupported report with no regions.

The source ball structure starts at `0x8013c680`:

| Field offset | Verified use |
| ---: | --- |
| 36,40,44 | Last consumed trajectory sample's fixed-point XYZ displacement |
| 48 | Approximate horizontal displacement norm |
| 5984 bit0x20000 | Selects the short update path |
| 6228 | Q16 image-phase accumulator, masked to0x3ffff |
| 6232 | Four-state phase, accumulator arithmetic-shifted right16 |
| 6236 | Direction heading from the original horizontal direction lookup |
| 6240 | Nonzero prevents phase and heading update |

The shared word `0x8013df48` bit0x20 independently prevents phase and heading
updates. Its setter is the complete function at `0x80074c3c..0x80074c60`.
No friendly game-state meaning is assigned to those numeric gates.

The source reset path beginning `0x80074590` explicitly stores zero to
`0x8013ded4` (ball+6228) at `0x800746d8`. Phase+6232 is derived on the next
unblocked scheduler invocation. The new adapter's `[0,0]` state is this zero
accumulator with its derived phase. A new inspection launch resets its test
trajectory; this is not evidence that every original kick reset the phase.
The source clear path at `0x80074540..0x8007457c` also clears ball+6240.

## Displacement and exact source order

Main update `0x80076650` consumes a ring of already predicted trajectory
samples. In each iteration `0x800766a4..0x80076760` first copies the preceding
position to ball+6296/+6300/+6304, loads the current sample into
ball+6284/+6288/+6292, and subtracts those positions into ball+36/+40/+44.
It calls `0x8008a90c` with the X and Z differences and stores the result at+48.

That complete leaf helper uses signed comparisons, arithmetic shifts and
wrapping32-bit operations:

```text
x = absWrapped32(dx)
z = absWrapped32(dz)
speed = wrapped32(x + z - (signedMin(x,z) >> 1))
```

This is `max(absX,absZ)+ceil(min(absX,absZ)/2)` for ordinary nonnegative
magnitudes, not Euclidean length. The signed INT32_MIN corner preserves the
original wrapped negation and comparison, rather than claiming an impossible
positive signed absolute value.

The image-phase/heading tail runs once after the entire group of `s5` samples.
It reads the **last** sample's displacement/speed and multiplies the resulting
phase rate by the **total** consumed tick count. Updating once for each sample
can produce a different result when drag or curve changes displacement. In
the isolated native motion adapter, use post-step X/Z position minus pre-step
X/Z position; the predictor's next-step velocity has already undergone drag
and may differ. The original consumer also handles contacts and events between
sample consumption and its tail; those paths are outside this numeric subset.

Main caller `0x8007bbc0..0x8007bc08` selects `0x800764d0` only when ball+5984
bit0x20000 is set, and otherwise calls `0x80076650`. Both receive the same
whole-tick count from `0x8013b448`. This research does not establish seconds
per simulation tick; the report deliberately returns `tickSeconds:null`.

## Two distinct rates

Both tails first preserve their accumulator, phase and heading under either
source gate. Otherwise the main simulated path `0x80076f80..0x80077034` uses:

```text
if signed(speed) <= 32767:
    rate = fixedMultiply(25032, speed)
else:
    rate = wrapped32(fixedMultiply(1134, speed) + 12516)
accumulator = wrapped32(accumulator + low32(rate * ticks)) & 0x3ffff
phase = accumulator >> 16
```

The short path `0x80076580..0x80076634` uses the same low-speed multiplier,
but threshold131071 and high-speed expression
`fixedMultiply(3755,speed)+50065`. Substituting that short-path rate into the
main simulated path causes the wrong image progression.

Resident `0x800271a8..0x800271d0` supplies rounded signed Q16 multiplication:
the low32 result of `(signed(left)*signed(right)+32768)>>16`. The native
implementation reuses that already recovered function. Intermediate additions,
multiplication and final masking retain source32-bit wrap, including negative
numeric inputs.

Both tails retain heading when the last sample's X and Z displacement are
zero. Otherwise they call resident `0x80026fd0`. The main tail sign-extends the
result's low halfword; the short tail masks it to1023. The existing native
`fifa98_control_heading` supplies the same source lookup; a consumer that only
needs sprite sectors may mask to1023 because the frame selector does so.
Heading is updated once per consumed group, along with phase. Launch-angle
right-shifting and next-step velocity are not exact substitutes.

Snapshot writer `0x800d62a8..0x800d62cc` stores phase+6232 at offset558 and
heading+6236 at560. The reader and frame selector described in
`BALL_VISUAL_RECOVERY.md` consume those same fields.

## Bounded API and integration

`fifa98_ball_visual_speed(dx,dz)` returns the original wrapped norm for two
word inputs. `recoverBallVisualSpeed(dx,dz)` is its nonmutating JS counterpart.

`fifa98_ball_visual_phase(state,speed,ticks,shortPath,blocked,flags)` writes
two words `[accumulator,phase]`. Its new API accepts ticks0..6, shortPath0/1,
accumulator0..262143 and phase0..3. It returns1 after updating,2 when either
source gate holds the state, and0 for invalid storage/domain inputs with no
writes. The complete source routine has a larger surrounding state machine;
this bounded ABI does not simulate it.

`advanceBallVisualPhase(state,speed,ticks,{shortPath,blocked,globalFlags})`
returns a fresh frozen `{status,state}` with status `advanced` or `held`, and
rejects invalid API inputs. It does not mutate its inputs. Native and JS
implementations intentionally leave heading lookup with the existing source
heading helper so the phase ABI requires no duplicated lookup-table storage.

An adapter should stage all steps, last displacement, heading and phase before
committing public state. If its boundary guard stops a group early, using the
actual accepted tick count is an explicit property of that inspection adapter,
not a recovered original contact or touchline rule. The source hold words
remain explicit inputs; a callback-free isolated trajectory uses zero for each.

## Validation and remaining event work

Six JS tests compare the norm against BigInt arithmetic, compare both rate
branches/thresholds/rounding/wraps against an independent BigInt oracle, check
source gates and grouping, reject invalid domains, and verify optional exact
local source identities. Four native tests verify the built module/source
hashes, norm and both phase paths against the independently tested JS recovery,
and atomic invalid-input behavior. No commercial bytes are fixtures.

The main sample consumer calls player/contact notification helpers before its
phase tail: `0x80076774/0x8007678c` call `0x80087a5c`, trajectory flags are
loaded at `0x800767a4`, and `0x80076e60` calls `0x800c6998` after updating
consumer state. The original attachment/action-marker path is separate work;
these call sites alone do not establish kick timing, possession or collision
semantics. This recovery introduces no synthetic contact event.
