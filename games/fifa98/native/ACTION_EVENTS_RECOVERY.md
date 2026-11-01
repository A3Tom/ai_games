# Original animation windows, phase advancement and action calibration

The native functions recover window flags, bounded phase advancement and
original action prefix/phase calibration. They show the source attachment
window and derive action distance, heading and queue geometry. They do not execute a football callback or
launch a ball. This distinction matters: the end callback reaches a separate
general launch dispatcher, not the existing ground-launch preview wrapper.

## Source identity and evidence

`scripts/action-events-recovery.mjs` exports
`inspectActionEventsRecovery(backend)` and `inspectActionEventClip(bytes)`.
The code report requires the exact939136-byte `BECODE.BIN` SHA256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
Unknown or truncated images receive `unsupported`, without recovered addresses.
Twenty individually hashed regions cover the numerical helpers, callbacks,
queue producer, calibration and next launch dependencies. Instruction words
are read as evidence and are never interpreted or executed.

| Source region | Recovered use |
| --- | --- |
| `0x800d4780..0x800d4820` | Window snapshot initializer;164 bytes, SHA256 `0d34dac1b28d4a23e4e38ebc54880826094ad6433a42b3bc1a507b23420d1052` |
| `0x800d4044..0x800d4588` | Phase advance/window/endpoint control flow;1352 bytes, SHA256 `f034f79a5e39e15b346e62957acad501fd6d13f8c75e9bdd27549f6257d15367` |
| `0x800b95e0..0x800b97ac` | Owner attachment window and end handoff |
| `0x800b97b0..0x800b98f8` | Other action callback, including successor scheduling |
| `0x800a83d4..0x800a84c4` | Pending action queue dispatch |
| `0x80071cec..0x8007209c` | Marker/proximity checks, spin selection and general launch call |
| `0x800720f8..0x80072a78` | Source queue/action parameter production |
| `0x800ba460..0x800ba76c` | Complete prefix/phase calibration;784 bytes, SHA256 `dc3c5ec8e259cf7100dd2c7661df0684d13b8c70fae5f1f0b99c7f72f31efd5f` |

## Snapshot ABI

```c
uint32_t fifa98_action_window(uint32_t flags, uint32_t phase,
                              int32_t startHalf, int32_t endHalf);
```

`startHalf` and `endHalf` are signed halfwords from MOPSX clip offsets8 and10.
They are neither key indices nor a browser frame rate:

```text
startPhase = startHalf * 256
endPhase = (endHalf - 2) * 256
if startPhase >= 0 && signed(phase) >= startPhase && !(flags & 0x28000):
    flags |= 0xa000
if endPhase >= 0 && signed(phase) >= endPhase && !(flags & 0x20000):
    flags = (flags & 0xffff7fff) | 0x24000
```

Both tests run in source order. Bit8000 is the active attachment window;
bit20000 marks the already-ended window. The transient start/end bits are
2000/4000. Source callbacks separately clear transient bits16000. Calling the
initializer is not a reverse-seek operation: the done bit suppresses later
tests. For independent scrub snapshots, start each call from the action's
fresh runtime flags, converted by `fifa98_action_runtime_flags`.

If the two phases are equal, this initializer sets then clears8000 within one
call. The callback-bearing updater can invoke **two callbacks at the same
phase**, start followed by end. A snapshot alone cannot represent those two
world mutations. Inputs outside signed-halfword header bounds leave flags
unchanged; this is an adapter guard, not an original source branch.

## Callback-null nonloop ABI

```c
int32_t fifa98_action_nonloop_step(const uint32_t state4[4], uint32_t clock,
    int32_t startHalf, int32_t endHalf, int32_t endpoint, uint32_t out6[6]);
```

| Array | Words |
| --- | --- |
| `state4` | flags20, phase24, timestamp36, rate60 |
| `out6` | flags20, phase24, timestamp36, advance, windowFlagWrites, removalRequired |

This is the branch with callback pointer144 **NULL**, no linked old child,
no loop and no fade. `windowFlagWrites` bits1/2 report start/end flag writes;
they do not report dispatched callbacks. Input state remains unchanged. The
caller must supply valid storage; null, invalid and unsupported input leaves
the output unchanged.

Return0 means idle,1 progressed,2 the original source requests removal of the
current child. Return-1 refuses invalid input, and-2 refuses runtime flags4
(loop),10 (already finished),20 (linked child) or80 (fade). Paused40 is idle.
Externally-advanced100 keeps the supplied phase while the elapsed-time and
window tests still run.

The timestamp comparison is signed. When timestamp<clock, elapsed is capped at
3072 and rounded fixedMultiply(elapsed,rate) supplies the advance. Zero advance
retains the old timestamp. Valid input is bounded to nonnegative rate<=INT_MAX,
phase0..endpoint, endpoint1..67106816 and a signed clock difference that does
not overflow. The endpoint limit is the maximum original16-bit clip key count
with the recovered1024-unit key spacing. Clock-wrap behavior and negative rates
are explicitly outside this adapter's domain.

Below endpoint, source start and end tests apply and timestamp becomes clock.
At or beyond endpoint, the source skips both window tests and sets finished10.
It retains the advanced phase, without clamping it to endpoint. With no
callback to replace the child, `D44B4` requests removal and returns before the
timestamp store at `D4548`; output therefore retains the previous timestamp.
The native helper reports that removal request and does not allocate/free an
animation object. Repeatedly stepping the finished output is refused.

## Verified real115 clip examples

The action associations use original `aiseqs.tbi` SHA256
`914994f8e4edef1878214d5c4fd967769e0c2946e033251e11b1577fca5fc270`.
Clips below are from `ZMODAT.BIG/mopsx115.viv.members/`; names are literal
asset identifiers. Their names do not establish friendly pass/shot semantics.

| Clip | Action IDs | Header8/10 | Start/end phase | Endpoint |
| --- | --- | --- | --- | --- |
| `ckspfa2` |384,385 |4/6 |1024/1024 |8192 |
| `pkssfa4` |412,413 |8/10 |2048/2048 |6144 |
| `ckskaa4` |380,381,419,420 |8/10 |2048/2048 |10240 |
| `ckspca2` |428,430 |8/10 |2048/2048 |8192 |
| `pkrpfa2` |410,411 |4/6 |1024/1024 |10240 |

`ckspfa2` is824 bytes, SHA256
`68933e957c4997f203ccaac0ea4136d0afa1cfafa62c18377be0530f0bf44e17`.
Its9 keys have flags211 and1024-unit spacing. Actions384/385 carry raw flags
24/280 and heading offsets-113/+114. Their callback is `B97B0`, whose source
also handles successor actions; it is not the ordinary locomotion `B95E0`
callback. Recorded fingerprints for all five clips are in the report and
tests verify them against actual original115 assets when present.

## End-event handoff and the remaining launch dependency

`B95E0` saves the incoming runtime flags, clears transient16000, then handles
old4000 before old8000. For end4000, if owner+36 has1000, it samples marker
`D4A7C`, takes signed high halfwords, changes Y to max(0,Y-8), and calls7514C.
It clears owner1000, then calls `A83D4`. The alternative8000 branch sets
owner1000. `B97B0` shares this handoff but has further action scheduling.

`A83D4` reads current actor at8013c634. Pending actor+408 bit200000 is required.
For queue type byte59<15 it calls `71CEC(actor+352)`; other types clear pending
state via71CA8. `71CEC` performs original ball/marker proximity and owner/world
checks, selects random spin if needed, reads signed **queue+20** at71F90h or
71FB4h, and calls **75924**. This is the real
end-event launch path. It is distinct from the direct BF8C→75694 ground branch.

Actor+352 is the action queue. Its fields52/54/56/59/60/62 correspond to action
ID, signed parameter, packed distance/flags, launch type, initial heading and
computed heading. The producer720F8 invokes
`BA460(action,0,-100,0,1,...)`: sentinel-100 means clip header8 phase, first
reference is prefixA, second is prefixB. BA460 samples the source discrete keys,
returns phase difference>>8, and writes original integer distance and heading
plus the action heading offset. The queue parameter is therefore grounded in
actual animation calibration rather than an arbitrary power/duration guess.

These two parameter fields must stay distinct. Queue+54 is actor+406 and feeds
BF3Ch/BF8Ch→75694h, the separate direct ground path. General71CECh→75924h
instead reads queue+20. Its producer is720F8h's **original a3 argument**, saved
at7213Ch to104(sp), loaded as LHU104(sp) at72A08h, and stored at queue+20 by
SH72A2Ch. No default or source meaning for that producer input is established
by BA460. A clip's calibrated duration4 does not justify solver parameter4 for
7CA14, or establish a timed general shot callback.

## Exact discrete action calibration

BA460 resolves an action throughBA904, which chooses row+4's fallback action ID
if its clip descriptor is absent. Source clip lock/unlockD0A74/D0AC0 remains a
caller/resource responsibility; the new numeric helper receives a resolved clip.
Its inline phase resolverBA4D4h..BA604h uses:

| Selector | Resolved phase |
| --- | --- |
| -100 | signed clipheader+8 shifted8 |
| -99 | (signed clipheader+10 minus2) shifted8 |
| -98 | signed clipheader+12 shifted8; if negative, use header+8 shifted8 |
| -97 | (keyCount-1)*(512<<(clip.flags&1)), fromD08B8 |
| Other | selector shifted8 with original32-bit word behavior |

Negative resolved start/end or negative signed end-start causes source return-1
after unlock. Zero difference is valid. Starta3 and stack16 endreference must be
0 or1: other source values skip a getter and can leave stack data undefined.

D0790(reference0) and D0824(reference1) choose a **discrete** clamped key by
signed phase>>(9+(clip.flags&1)). Their clampD04E4 restricts0..keyCount-1.
Reference0 reads raw prefix3/4/5 (packet halfwords8/10/12); reference1 reads
prefix6/7/8 (halfwords14/16/18). Each signed component shifts12. Raw action-row
flags100h mirrors X only. This differs from interpolated attachment markers.

The source subtracts end-start X/Z, takes wrapped signed absolute values then
arithmetic>>16, and calls original integer length2146C. Y is unused. If integer
length is zero, heading is zero even for nonzero subunit displacement. Otherwise
26FD0 uses the **signed fixed deltas**, adds signed action-row+6, masks1023 and
subtracts1024 only when greater than512. It writes distance/heading and returns
phaseDifference>>8.

```
fifa98_action_calibration_keys(header5,startSelector,endSelector,out5)
header5 = [clipFlags,keyCount,signedHeader8,signedHeader10,signedHeader12]
out5    = [startPhase,endPhase,startKey,endKey,phaseDifference>>8]

fifa98_action_calibration_vectors(prefixStart9,prefixEnd9,startRef,endRef,
                                  mirror,headingOffsetSigned16,
                                  atan8,sine257,out4)
out4    = [integerLength,signedHeading1024,deltaFixedX,deltaFixedZ]
```

The key helper returns1 success,0 source invalid phase/order,-1 malformed native
input. Vector calibration returns1/-1. Both preserve output on rejection and
use existing verified source lookup tables. Native key count accepts source
u16 range1..65535; the existing parsed-clip adapter retains4096. Headers,
prefixes and heading offsets use signed-halfword bounds. The action workspace
has768 words: the first256 remain pose storage; the tail512 stages calibration.

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| D0790 root getter |148| `b4e7086db0841f549703ad0b8e6c7ecb1c7422590fe472a9d484c8fd1093c323` |
| D0824 marker getter |148| `bb503cc0462e79f9b5e15607e3dd7b139350c3b650020ec711b8c2f8bce07ce2` |
| D08B8 last-key phase |48| `84c17778b8f9a8cc64f5cd3ed07a68230b5bc8c48fb0ebb82fbdb345ff8955f5` |
| D04E4 discrete key clamp |92| `001f8ac32edc048cacd314e64ef3295ada4886dc8782a78148dabacf96d55dbd` |
| BA904 clip fallback |100| `e7ce73a940d0eb8647d9d0f92216de829e9e6e38eb44e9ed22314440bbba597d` |
| 728E8 calibration/store |404| `418dca44bd2c686b40f4397428b4cf38631b6db5aab67a4085a1f0fbc7a12428` |
| BA9D4 end-window query |112| `ca7648bce59358d6b003bf0f420ccc87cf964b966fa1657a07a53872cfc93071` |

At72918h the queue producer requests start0/end-100, reference0→1. SH72A28h
stores its returned duration at+54 unchanged. BA9D4 independently returns
signed(header10-2), or-1 if missing/negative; comparing calibrationDuration
against it controls **packed bit19**, rather than replacing/clamping duration.
72934h adds initial heading s4 to calibration heading, applies signed1024 wrap,
and stores+62; s4 is stored separately at+60. Negative calibration return zeroes
distance and final heading. Queue+56 replaces low19 with calibrated integer
distance, replacesbit19 with that comparison and ORsbit22. Typebyte+59 shares
the upper byte of this packed word.

Calibration therefore recovers queue geometry, not original world/action
selection, source queue20 inputs, callback side effects or general75924.

The next bounded numerical milestone is75924's launch selection:

- Type2, distance16..480, uses7D3A4(distanceQ16,9Q16), then7CC40 with cap50Q16.
  Existing ground preview uses a different25 cap and cannot substitute.
- Type2 distance>480 selects mutable tables80125d98.. initialized by7CE00.
- Other positive queue+20 parameters use7CA14; its option0 numeric branch and
 7D780/7D4EC/7D658 inverse-table dependencies are now recovered inball-flight.c.
 This does not derive queue+20 from calibration+54 or implement75924's context.
- Nonpositive parameters use7C83C and7C71C. Those numeric routines are now
  recovered in `ball-flight.c` with source duration selection and result flags;
  they remain separate from the world-dependent75924 dispatcher.
- Actor attributes, source match mode, type3 random changes, possession,
  statistics and predictor initialization are additional dispatcher effects.

No recovered numerical window function substitutes for these callbacks.
The player viewer can display source attachment window timing now; a complete
timed football action remains a separate reconstruction milestone.

## Validation

Native tests exercise actual WebAssembly exports with an independent BigInt
oracle over15000 window cases and15000 bounded phase states. Regression cases
cover equal start/end, signed phase/header tests, capped elapsed time, zero
advance, externally advanced phase, endpoint skip/removal timestamp, and atomic
domain refusal. Code-report tests verify profile rejection, all region hashes,
and actual115 candidate assets/action associations when available. Independent
raw-source review found no mismatch in the bounded callback-null branch.
