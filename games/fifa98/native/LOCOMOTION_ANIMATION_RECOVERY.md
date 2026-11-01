# Original locomotion action selection and phase arithmetic

The new browser-compatible `scripts/locomotion-animation.mjs` reads the original
action database, prepares the source selector tables, and ports the complete
numerical selector at backend `0x800b92bc`. `native/locomotion-animation.c`
provides the corresponding bounded native selector and a separate same-loop
phase arithmetic subset. Neither executes console instructions or introduces
a console runtime. They do not implement the complete animation action graph,
cross-fades, root motion, contacts or an authoritative match scheduler.

The read-only evidence report is:

```sh
node games/fifa98/scripts/locomotion-animation-recovery.mjs
```

`inspectLocomotionAnimation(backendBytes, actionBytes)` verifies both complete
source identities before reporting seventeen source-region hashes, table
layouts and original asset selection. Unknown data returns `unsupported` with
empty regions/tables; it does not expose guessed action symbols.

## Sources and original resource choice

`BECODE.BIN` is 939136 bytes, loaded at `0x8005ae28`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
`ZMODAT.BIG/aiseqs.tbi` is 25108 bytes, SHA-256
`914994f8e4edef1878214d5c4fd967769e0c2946e033251e11b1577fca5fc270`.
The `ZMODAT30.BIG` copy of that action table is byte-identical.

The original loader at `0x8011d514` explicitly loads `zmodat.big`, then selects
`mopsx115.viv` and `aiseqs.tbi`. The following bank loader format string is
`mopsx115.bk%d`. This backend contains no `zmodat30.big` or `mopsx130.viv`
literal. Preparation must prefer the 115 clips and banks; merging 130 resources
over duplicate names changes key counts, phase spacing and calibrated speeds.

For example, original 115 `rlruna2` has ten keys and `rlwlka2` has fifteen,
both with header flags `0x80d5`, giving 1024 phase units per key. Their 130
counterparts have eighteen/twenty-eight keys and 512-unit key spacing. Asset
choice is consequently part of the recovered timing, not a cosmetic duplicate.

## Action database

`parseAnimationActions(bytes)` reads the observed layout without assigning
names to unproved attribute fields:

| File field | Layout |
| --- | --- |
| Header +0/+4 | u32 action count; u32 clip-descriptor offset |
| Actions | Count rows of 20 bytes starting at 8 |
| Action +0/+2/+4 | u16 action ID; next action ID; unavailable-clip fallback ID |
| Action +6/+8/+12 | i16 heading adjustment; u32 flags; u32 descriptor offset |
| Action +16/+18 | u16 initial/transition blend parameters, preserved raw |
| Descriptors | 24-byte rows, followed by one all-zero terminator |
| Descriptor +0/+10 | Null-terminated ASCII name within 10 bytes; u16 source index |
| Descriptor +12/+14/+16/+20 | u16 flags; u16 unknown; u32 pointer; u32 unknown |

The supplied table has 661 action records and 494 named clip descriptors. Many
actions share a clip while retaining different flags, heading adjustments or
transitions. Source `0x800b8fa8` rebases action descriptor pointers;
`0x800b8ff0` resolves names through original case-insensitive motion lookup.
`0x800ba904` returns an action's fallback ID when its clip is unavailable.

The parser checks exact boundaries and EOF, terminator placement, descriptor
alignment/indices, unique safe names and all action references. It supports
nonzero-offset `Uint8Array` views and retains numeric raw values. Tests use
invented records; no commercial database is embedded in source or fixtures.

## Source selector and initialization

`prepareLocomotionTables(backend, actionBytes, decodedClipsByName)` performs the
reviewed initialization against hash-gated source data. The clip argument is a
map from lowercase source name to decoded clip. It returns the parsed database,
252 category bytes, 330 action/reference halfwords, three run variants and the
source evidence report. Missing clips follow the original single-step action
fallback; calibration still requires its resolved original source clip.

The selector's category tables begin at `0x801293ac`: eleven rows of eighteen
speed bins, plus three eighteen-byte turn-category rows. The five movement
styles are selected by numeric flag priority `4`, `1`, `2`, `8`, then none;
their gameplay meanings are not invented here. The central5×11 action table
starts at `0x801294bc`, with a u16 action ID and u16 calibrated reference per
entry. Four additional5×11 u16 tables select signed turning variants.

For ordinary style zero, central action-table columns begin:

| Source category | Action | Original clip |
| ---: | ---: | --- |
|0|554|`fstnda1`|
|1|659|`rlwlka2`|
|2|327|`nljoga2`|
|3|499|`rlruna2`, subject to the source run-variant selection |
|4|553|`rlsprb3`|

The names and visible source motion support stand/walk/jog/run/sprint
descriptions, but the complete player action-state machine is still separate.
The selector uses its actual category/speed hysteresis table, not newly chosen
friendly speed thresholds. It rounds speed with wrapped `(speed+32768)>>16`,
and promotes a zero bin to one at signed speed19661. Inputs outside the reviewed
0..17 speed bins or0..11 current categories are rejected before native writes.

The current-category constructor `0x800b9c78` starts action554 and writes
category byte36 to zero. Action start at `0x800b9e8c` stores
`low16(wholeClock+30)` in retention-deadline halfword28; halfword30 separately
receives `low16(wholeClock+10)`. These are source whole-tick deadlines, not
milliseconds. The selector compares the halfword deadline against the full
unsigned clock, preserving the source behavior across its narrow storage.

`0x800b9058` calibrates references using original prefix-vector-A displacement
from phase zero to the last-key endpoint. The original measurement truncates
absolute fixed12 X/Z differences to integers before its integer hypot, then
divides by endpoint phase divided by256 using the original positive fixed
division at resident `0x80027100`, and shifts the result right five. Every
supplied central-table clip is axis-aligned after that integer truncation, so
the supported calibration reduces exactly to its nonzero absolute component.
The implementation rejects non-axis calibration instead of substituting a
floating-point hypot. Original 115 walk reference is 5449; run reference 14051.

The selector's normal centered rate expression is
`65536 + (clamp(speed - (reference<<5), -0x13330, 0x13330)>>2)`.
Large/moderate turn branches can write companion rate word20 to zero; special
forced-turn flags64/128 preserve its old value. The original updater applies a
nonzero companion rate to the child animation only when retaining the same
action. Zero therefore means leave the child rate unchanged, not freeze it.
The original new-child initializer at `0x800d4664` starts that child at65536.

Run action499 uses a source-selected record from `[499,500,501]`, corresponding
to `rlruna2`, `mljoga2`, `gljoga1`. Initializer `0x800a53f8` chooses
`clamp((attributeByte61-attributeHalfword24)>>2,0,2)`. `selectRunVariantIndex`
and its native counterpart preserve that numeric rule without inventing
attribute labels. Source turn coefficient is independently initialized at
`0x800a539c` as `min(attributeByte43>>2,12)`.

## Native selector ABI

`fifa98_locomotion_select(state3,motion9,categoryBytes252,actionHalfwords330)`
returns an action ID, or `UINT32_MAX` without writing state on unsupported input.
The arrays contain explicit fields rather than original machine addresses:

```text
state3: current category; companion playback-rate word20; deadline halfword28
motion9: speed; turn category; signed turn value; facing; movement heading;
         animation motion flags24; whole clock; run variant action/reference
```

Getters `fifa98_locomotion_state`, `motion`, `categories`, `actions` and
`phase_state` expose separate bounded native buffers. The complete source
selector preserves flag precedence, category reset/hysteresis, signed turn
thresholds -26/-9/10/27, heading wrap, replacement run references and its special
554→8 /499→453 branches. This does not dispatch the selected action or recover
that action's callbacks merely by returning its ID.

## Simulation phase, without an invented wall clock

The central simulation tick calls `0x800b9c58` at `0x8006a4b8`, passing its Q16
simulation delta. The wrapper shifts that value right eight; `0x800d0054` adds
the result to the animation clock. Hence one integer simulation tick contributes
256 phase units. The same simulation carry drives movement, but this relation
alone establishes no seconds-per-tick frequency.

Updater `0x800d4044` requires the animation timestamp to be signed earlier than
the clock, caps elapsed phase at3072, multiplies it by the child Q16 playback
rate with the original rounded fixed multiply, and adds it to the clip phase.
It updates the clip timestamp to the current clock after consuming a nonzero
advance. A zero rounded advance retains the timestamp so elapsed time can
accumulate. Source loop flag4 wraps phase by repeatedly subtracting the endpoint;
the supported positive domain is equivalent to modulo. The endpoint query is
`(keyCount-1)*(512<<(clipHeaderFlags&1))`.

`advanceLocomotionPhase` and native `fifa98_locomotion_phase` port this
**same-loop numerical subset**, using state `[clockPhase,clipTimestamp,phase]`
and explicit Q16 delta, Q16 rate and endpoint. They accept delta0..6 integer
ticks, rate0..2, and endpoint1..4193280, bounded by the parsed clip domain.
The source rate convention above still applies: callers must not pass zero as
the effective rate merely because the selector companion word is zero.

Callers must establish action/runtime loop bit4 and absence of runtime flags
`0x160`: pause0x40, linked/crossfade0x20 and externally advanced phase0x100.
These are the constructed child's flags: the original constructor shifts raw
action-record flags right8 before merging retained child bits. In particular,
raw action bit0x100 becomes runtime mirror1, not runtime external-phase0x100.
See `ACTION_TRANSITION_RECOVERY.md` for the corrected flag mapping and the
new callback-free mirrored/retained key-pose helper.
These are **constructed runtime flags, not MOP clip-header flags**. All nineteen
reviewed style-zero control action records, including their mirrored turning
and sideways variants, satisfy the plain-loop phase guard after this correct
conversion. Event/loop callbacks and linked blending remain separate even when
that guard passes. The separate [action key-pose helper](./ACTION_TRANSITION_RECOVERY.md)
now recovers sparse retention and mirrored key application at zero heading;
the phase API itself still performs only its numerical same-loop update.

Resetting phase when changing action remains an explicit inspection policy;
the original cross-action alignment search is not recovered. The unlinked,
discrete key-pose branch can initialize AAAAAA once and retain already applied
output across keys/actions. It transforms only each new raw key's channels,
avoiding a second mirror of retained state. This does not reproduce linked
cross-fades, nonzero action-relative heading, callback mutation or the complete
transition dispatcher. Original outer-loop code supplies fixed and variable
simulation deltas through the scheduler; the exact authoritative wall-clock
conversion remains unresolved. The report therefore deliberately returns
`wallClockSecondsPerTick:null`.

## Render world scale

The complete position chain is now established. Snapshot writer
`0x800d6358..0x800d63d4` reads signed halfwords at actor offsets 130/134/138,
the high halves of its Q16 fixed XYZ words. It preserves these integer words
in the snapshot, apart from its out-of-range/sentinel guard. Reader
`0x800d607c..0x800d609c` transfers those snapshot coordinates unchanged to the
table beginning at `0x801371e8`.

Render producer `0x800d96dc..0x800d978c` loads those integers, shifts left 16,
then arithmetically right 15 before storing packed instance coordinates. Y
first subtracts three at `0x800d9710`. The producer subtracts the camera's packed
render coordinates; camera simulation XYZ is independently doubled at
`0x800d8d1c..0x800d8d38`. Thus within supported pitch bounds the camera-independent
model-space placement is `[2*simX,2*(simY-3),2*simZ]`. This explains the observed
factor two between pitch/control integer extents from the actual player path,
not only from matching dimensions.

`0x800d9ed0` transforms the camera-relative packed instance coordinates through
the active view matrix. Resident `0x80011910` later reads instance halfwords at
offsets 20/22/24 and writes matrix translation `[X,-Y,Z]` without another scale.
The report exposes the recovered scale and Y offset with source-region hashes.
The dedicated [player placement recovery](./PLAYER_PLACEMENT_RECOVERY.md)
describes the bounded native placement helper; these animation APIs do not
introduce an additional placement transform or camera.

## Reviewed backend fingerprints

All byte ranges below are contiguous. Full-image verification precedes region
reporting. Resident calibration arithmetic uses the resident fingerprint in
[model recovery](./MODEL_RECOVERY.md).

| Address | Bytes | SHA-256 | Evidence |
| --- | ---: | --- | --- |
| `0x800b8fa8` |72| `55479761198d5151c3dcb52420147f29d6560f8221b5e4c0534f32f0c4b5c7bf` | Descriptor-pointer relocation |
| `0x800b8ff0` |104| `f63fcf4e829acc5cc59854f433028b1b52ca4445ae9d90267d97ae70c161daf9` | Clip-name lookup |
| `0x800b9058` |612| `7d88645b1d4300cead6d51bb69e54e487638b0767f60251dd6a2402906072be0` | Table calibration/initialization |
| `0x800b92bc` |804| `e1b0003f0f647a81e4a2386dca20a5b8daecfe5fa8ca57a3df6cbf63c0f796c6` | Complete selector |
| `0x800ba904` |100| `e7ce73a940d0eb8647d9d0f92216de829e9e6e38eb44e9ed22314440bbba597d` | Missing-clip fallback |
| `0x800b9c58` |32| `f5d8ba4f4790361bc7a27573eee43b1259037dc462a20eae30d72e63b6772072` | Q16 delta→phase units |
| `0x800d0054` |32| `751ba04f654cad2099b904e35f4732ba6570218b3bbfa54cd329fcb8fee8ac57` | Add phase-clock delta |
| `0x800d4044` |244| `72a920a5bf23fc51bccf8e2526febef3d8c1536f64e16ebeaa41042b4d1e675e` | Elapsed cap/rate multiplication |
| `0x800d42b0` |72| `8f76392e78fab8246ed7a1d2db258953b1b6e9c7d88e6813c29f2874a4b8cae5` | Loop wrap |
| `0x800d08b8` |48| `84c17778b8f9a8cc64f5cd3ed07a68230b5bc8c48fb0ebb82fbdb345ff8955f5` | Endpoint query |
| `0x8011d514` |204| `476e88c107b5eda7fa863b396fcc50d210792497d6082c315c0ebbe311f2b031` | Original115 resources |
| `0x8006a4b0` |24| `6ea6b3a7d221c75df45adeb02c3480d063da477a62380c224ee7760930279676` | Central phase-clock caller |
| `0x800b9c78` |96| `dbcd2bb35923587972fcca03be8152cdf99eae2048d2ea0ae7c211b1f436ea49` | Initial action/category |
| `0x800a53f0` |76| `4c810ebd26a5dd59cb1527d3a0ffc0a6528e0e2056a49128f036b1177ce5a640` | Attribute-indexed run variant |
| `0x800d6358` |128| `27fb2b2ca009d1216dbf1fcdb02e47a1b29e27e778a42b3ffe4b8052572c1d64` | Actor fixed high-half snapshot writer |
| `0x800d607c` |36| `0cc638224031b7d2158ebfdf898bb453929726c85f0b7049dc086f5a3e1259e1` | Unchanged snapshot position reader |
| `0x800d96dc` |180| `1b2c4b9462897e825077d0288cbb96bac91753facb777889e821cc5c63f19b3b` | Original doubled render coordinates and Y offset |

## Validation

Six browser-module tests cover synthetic database layouts/corruption, source
fingerprint rejection, selector branch boundaries, hysteresis, initialization,
phase wrapping and optional actual115 calibration. Three native tests bind the
built WASM hash and C source hash, require no runtime imports, compare5000
selector fixtures and5000 independent BigInt phase fixtures, and check numeric
run-variant boundaries. Tests execute the new C/JS arithmetic only. Source
references are read as data, with no original binaries executed.
