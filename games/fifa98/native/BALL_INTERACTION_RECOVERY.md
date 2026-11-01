# Grounded target launch recovery

`ball-interaction.c` directly reconstructs the original grounded target-launch
numerics. It does not implement a pass/shoot action, possession, a kick animation
event, player/ball contact detection, or a complete match. It contains no CPU
state, instruction dispatcher, original-memory runtime, or emulator.

The original wrapper launches **from the current ball position**. A browser test
that places a ball at the selected player's position supplies an explicit
inspection input; it does not establish contact or ownership. The original action
caller constructs its target from stored action parameters. Using a live
controller target for inspection does not establish that as the action's input.

The read-only `scripts/ball-interaction-recovery.mjs` report accepts only these
complete original images before extracting tables, disassembly and call edges:

| Image | Size | SHA-256 |
| --- | ---: | --- |
| BECODE.BIN, base8005AE28h | 939136 | `254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0` |
| SLES_009.14, file-address base80011000h | 251904 | `dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644` |

No original lookup table is embedded in C. Preparation extracts the following
fingerprinted data into the local generated report:

| Data | Address | Elements | SHA-256 |
| --- | --- | ---: | --- |
| atan8 | resident80048E30h | 257bytes | `03ab75ced39a3c62580ab3e24c4e54867b63bbdd1135da55cdf6bd678f74f221` |
| atan16 | backend80130F74h | 257u32 | `a3ab1c0b30ea38a25c2d7f7c7b13969a0e3448547b839c92b1ae5789c3942b64` |
| sineQ16 | resident8004904Ch | 257u32 | `c3b03a2581960f9b22f2f29fb52f30bf36eb87c3896c8e4f62c708b3c247f880` |
| exponential factors | backend80125EB8h | 113u32 | `a3a10c51cad4d18da9c84cefffe9fab256083139be227bd76ea6a692be70cf8d` |

## Source call chain and scope

The action branch8006BF10h..8006BFF8h reads signed halfword actor+406 atBF3Ch.
Parameter-1 takes another path. It constructs an integer target with8008AEF0h,
using actor position+152, stored action word+408 and halfword+414. AtBF7Ch,
parameter0 takes the position setter80074704h; only the other branch calls
80075694h atBF8Ch. No named action mapping or default positive parameter is
established here.

Wrapper80075694h..800757E0h:

1. Reads global ball Q16 position8013DF0Ch/10h/14h.
2. Converts target integer X/Z to Q16 with SLL16; supplies targetY0.
3. Calls reset800749A8h at756F8h. Its prefix stores spin0 to global8013C680h
   at749E8h. This is evidence for zero spin after this wrapper's reset.
4. Calls numeric solver8007CC40h at75714h, passing the original integer parameter
   and **25Q16**, loaded by LUI a3,19h at7570Ch. Output is velocity8013C6A4h/8h/Ch.
5. Updates speed, flags, ownership/event state and calls predictor initializer
   80076300h at757B8h. These remaining wrapper operations are not reconstructed.

`fifa98_ball_ground_launch` recovers the solver with the exact25Q16 wrapper
argument and explicit target conversion. The source solver returns a flag and
three velocity words. Native diagnostics expose already-computed speed, length
and heading; native validation adds a separate-1 rejection result.

| Reviewed region | Size | SHA-256 |
| --- | ---: | --- |
| 8007CC40h ground solver | 248 | `b84f61a9550a29bf566b37e555037f288ebf93ff83f486d7550c0ad63777b0a9` |
| 8007D40Ch speed formula | 124 | `a232f56bcd6d5168c8367490c485dd4e09889272c7014ca9ddb753b9a0c791ee` |
| 8007CFC0h exponential | 216 | `b20d949f71ec3995c93aa2e76e73c470992b8e1152cbbb7e424bd4b91518eee7` |
| 80124500h heading16 | 320 | `b5f3110311b93fe59e8e0d7c5410c5dbd2c1c9ea81bedad96a5cdd00e3e2761d` |
| resident8002146Ch integer length | 228 | `4fd5ba8b8dcdbe2910c368dbb761a0c60c177e7c5ccbc65c8c535121f7c1f83e` |
| resident80027100h fixed divide | 168 | `222c6061d3c5233b248d226bc0b557409ac6911d6aee7bb023783f1fa4cc2204` |
| resident800271D4h corrected sine | 132 | `dfba29db09dec9404ed46d463e400d8a2ec38efbe8f07dc4cc1b46a0cdf44e5c` |
| resident80027258h corrected cosine | 136 | `c6b22244091b1bc6b03c7c1a9ab1997e940a238036cb60985d6068613e72816c` |
| 80075694h containing wrapper | 336 | `03ee394f3d8d1790eed6ad2def7acf4e53a5d4b14310fe2d2f56215297dae64b` |
| 8006BF10h action branch | 236 | `77598e0b6c533f173d022f0cacba53dccc96fdbb4d6af730395b68331a974fa7` |
| 800749A8h reset prefix | 68 | `665b057183d82227c55c8b768b8e5e09b88cdee3e877c01dd2ca64ea1d53df38` |

## Exact numeric behavior

Solver8007CC40h subtracts fixed target/current X/Z, takes the signed high16 of
each delta, and calls the original integer length8002146Ch. That length uses
quantized1024-angle heading80026FD0h with swapped X/Z, selects the original sine
or cosine denominator, and performs integer division. It differs from steering's
max-plus-half-min approximation. Quantization can select angle128 for unequal
axes; the source then selects X even when Z is slightly larger.

Speed8007D40Ch uses fixedMultiply with the source +32768 product bias:

```
parameter == 0: speed = 15Q16
otherwise:
  numerator = fixedMultiply(distanceQ16, 5242)
  exponent = fixedMultiply(-677890, parameterQ16) arithmetic>>9
  denominator = 65536 - originalNegativeExp(exponent)
  speed = originalFixedDivide(numerator, denominator) arithmetic>>2
```

Constants65536, -677890 and5242 are read and verified at80127080h,801270C4h
and801270CCh. The accepted parameter range0..3167 is a numerical bound:
3167=floor(INT_MAX/677890), preventing rate-product signed overflow. It is not a
recovered action limit. Parameter0 preserves the solver's fallback branch even
though the traced action caller bypasses launch for0.

Only the nonpositive exponential path is needed. Zero returns65536. Inputs
strictly below-681391 return0 before reading any table. Other negatives are
negated, split into radix32 digits, and their original table factors combined
with rounded fixed products; the original rounded reciprocal80124640h is then
applied. Source row bases stride31 words; extracted index `row*31+digit-1` skips
the first unused cell. The top digit is at most20 in the accepted cutoff domain.
No positive exponential or logarithm path is claimed.

Within this speed domain, the numerator is nonnegative and the denominator is
1..65536. The resident fixed divide's16 binary fraction steps have remainders
below131072, so its overflow-handling branches are unreachable. Direct
`floor((uint64(numerator)<<16)/denominator)` modulo32bits reproduces the source
positive quotient. Its subsequent signed shift is preserved, including wrapped
negative quotient bit patterns.

At8007CCB8h the solver compares computed speed against the supplied cap with
signed SLT. If speed is greater than25Q16, CCBCh branches past neither the flag
nor the fallback: CCC4h sets return flag1 and CCC8h loads **35Q16**. This is the
source behavior, not a clamp to25. Other speeds retain their word pattern.

Heading80124500h returns period65536 signed angles, X=sin/Z=cos. It divides
minor<<32 by major, interpolates atan16 from the top8 ratio bits and the next16
fraction bits, then applies the source's8 quadrant cases. Equal magnitudes,
including zero/zero, return base8192. INT_MIN magnitudes are excluded before
lookup because source wrapped abs escapes the reviewed domain.

Corrected sine/cosine800271D4h/80027258h use the coarse1024-angle original sine
table at signed angle>>6. If f=angle&63, source shift/add sequence gives
`correction=floor(411774*f/512)`. Sine adds the signed low-word product of
`coarseCos>>2` and correction, shifted by21; cosine uses `(-coarseSin)>>2`.
These original corrections, fixed-product rounding and source quadrant wrapping
are preserved. No host floating-point sin/atan/hypot is used in runtime code.

Final velocity is `[fixedMultiply(speed,sine), 0, fixedMultiply(speed,cosine)]`.

## Native ABI and tests

The five exports are listed by `ballInteractionNativeExports`:

- `fifa98_ball_heading16(dx,dz,atan16_u32_257)` returns the signed angle, or
  INT32_MIN for null/unsupported magnitude.
- `fifa98_ball_heading_vector16(angle,sine_u32_257,outXZ2)` returns1 on success,
  0 for null pointers, without output writes on failure.
- `fifa98_ball_ground_launch_speed(distanceInteger,parameter,exp_u32_113,out1)`
  returns1/0; bounds are distance0..32767 and parameter0..3167.
- `fifa98_ball_ground_launch(positionQ16_XYZ3,targetInteger_XYZ3,parameter,
  atan8_u8_257,atan16_u32_257,sine_u32_257,exp_u32_113,out6)` returns original
  fallback flag0/1, or-1 on invalid input before output writes. Output is
  `[velocityX,0,velocityZ,selectedSpeedQ16,integerLength,signedHeading16]`.
- `fifa98_ball_action_target(integerPositionXYZ3,storedDistanceWord408,
  signedHeadingHalfword414,sine_u32_257,outXYZ3)` returns1/0 and writes only
  output X/Z. It preserves output Y, as the original routine does.

The action target constructor8008AEF0h..8008AF6Ch (128bytes,
SHA-256 `ba787c45d62d46f8c57c8cff7be32845ea721ad818a75c2be4a6526d5b713a8a`)
adds rounded fixed products of distance and1024-angle sine/cosine to integer
actor X/Z. Its caller masks actor word408 with`0x7ffff` and reads heading as
signed halfword414. The native helper includes that caller mask and restricts
heading to the signed-halfword domain. Original resident80021550h..80021688h
(316bytes, SHA-256 `b16ecd98fb31460184fc1cf0ad5b0e7009339787facf85965f524be7d7ea6b19`)
is the two-output quarter-table lookup; it has the same values as the already
recovered source lookup pair. Integer additions retain32-bit wrapping. The
parameter producers and action event remain separate recovery work. In
particular, this target is not a live controller target or a proven pass/shoot
button mapping. Tests cover every signed-halfword heading with randomized
distance flags and integer positions, preserved output Y and atomic rejection.

XZ integer target inputs are bounded-32768..32767; targetY is ignored exactly as
in the wrapper. Delta word80000000h and integer lengths above32767 are rejected.
All table/state pointers must be valid native storage. The buffers occupy692
words when atan8 storage is rounded up to65 words; the existing2048-word control
workspace is sufficient without retaining any source address at runtime.

Native tests read the already built main Wasm and verify its hash, this C
source's build hash and absence of imports. They cover all65536 angle low16
values, signed angle wrapping,6000 heading fixtures,5000 launch compositions,
all3168 accepted speed parameters, atomic rejection and independent BigInt
quotient/product oracles. With locally extracted reference images, they also
validate all tables and real launch cases without embedding original bytes.
There are7 native and2 source-gating tests. No test invokes a compiler or linker.

For explicit inspection parameter10 and target192 units along+X from zero,
original output is `[1375534,0,0]`, speed1375534Q16 (approximately20.989), length192,
angle16384, fallback0. Target500 units produces the original35Q16 fallback.
**Parameter10 is an inspection fixture, not an established original default,
player attribute, passing power or named action.**

## Continuation targets

Recover the stored action parameter producer for actor+406/+408/+414 and the
animation callback that reaches8006BF10h before claiming a usable pass/shoot
action. Recover ownership/event helper80075580h and predictor initializer
80076300h before claiming the complete launch wrapper.

The loft/spin solver8007C590h, called from800757E4h, additionally uses duration
tables8013A110h/8013FF90h, vertical solver8007D5ACh and random spin selection
from80125E58h. These are separate unimplemented dependencies. Direct velocity
setter80075EC4h is not evidence for a newly invented kick vector. Attachment
candidate8007514Ch also needs original ownership/actor guards established before
it can support dribbling or player/ball contact.
