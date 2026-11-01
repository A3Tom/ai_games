# Original airborne spin and random state

`ball-motion.c` completes the arithmetic of the original ball-air routine
`0x8007a88c..0x8007aa34`, including both nonzero-spin branches. The previous
`match.c` zero-spin API remains compatible. This does not complete the ball
predictor, player contacts or match engine.

All evidence uses BECODE.BIN, 939136 bytes, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`,
load base `0x8005ae28`. Run `scripts/ball-motion-recovery.mjs` to emit exact
region hashes, disassembly and call-site checks. Unknown builds return an empty
unsupported report and never expose guessed recovery exports.

| Original region | Start | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Air drag/spin routine | `0x8007a88c` | 428 | `3dfb1272355092c168d871a8702ba0a26f4acd8d87611b4224b9b253abdfd68b` |
| Random initializer | `0x8008ad3c` | 64 | `35301446027fd87b0123cb98be5563ca801092efab0473d1e3538e7b0954ee15` |
| Random generator | `0x8008ad7c` | 372 | `29b3d1a2d2d6196e8bbab3d9ac4afff0ebac69d78cd0e2d2af929d80998bca42` |
| Predictor air/ground selection | `0x8007b520` | 156 | `7b3bbf8a8fb9e49bd4d632987e266654a68edacf646c8ba89d3c098f3a0448a5` |

## Native arguments and exact order

`fifa98_ball_air_motion(velocity3, spin1, gravity, options, random6)` adapts
original pointer arguments to separate native arrays. Gravity replaces
`0x80125d18`; options replaces resident word`0x80054480`. Successful return is1.
Null velocity/spin or required random storage returns0 before any writes.
Arrays must be valid and distinct; they are typed transfer buffers, not console
memory or instruction state.

1. Subtract rounded Q16 `fixedMultiply(203, component)` from all XYZ components.
2. For nonzero spin, add
   `fixedMultiply(fixedMultiply(spin, draggedZ), factor)` to X.
3. Subtract `fixedMultiply(fixedMultiply(spin, updatedX), factor)` from Z.
   The updated X is essential; these operations are sequential, not a new
   simultaneous rotation or floating-point Magnus calculation.
4. With option bit64 clear, factor is10000 and no random value is consumed.
   With bit64 set, factor is`0x4e200` (320000); call the original random
   generator once and negate spin when its low nibble is zero. The descriptive
   game option remains unresolved and is not labelled as weather or difficulty.
5. Multiply spin by`0xf9db` (63963), preserving signed rounded fixed arithmetic.
6. Add the original gravity expression to Y. Its default `0xfe000000` gives
   −9320 per source step. Spin does not affect Y. The C implementation reuses
   the existing drag/gravity helper before the X/Z curve, which commutes with
   the independent final Y addition and yields identical public scalar outputs.

Zero spin skips all curve, spin decay and random consumption. Every arithmetic
operation preserves 32-bit word wrap and original signed multiplication. All
options bits except64 are ignored by this source routine.

## Source random generator

The full initializer and generator now have explicit six-word state, replacing
the globals at`0x8012769c..0x801276b0`. The initializer reads bytes
`41 72 43 61 44 65` from`0x8005b180` and writes
`(seed << 25) + byte`, with word wrap. It does **not** narrow initial state to
16 bits. `fifa98_random_seed(seed,state6)` returns1, or0 for null storage.

`fifa98_random_next(state6)` reproduces all five sequential masked additions
and carries, increments the sixth word modulo65536, and preserves the original
additional carry cascade on sixth-word wrap. It returns the source low16 result;
that explicit return replaces both the return register and last-result global
`0x8013c66c`. Null storage returns`UINT32_MAX`, outside the successful range.
No host entropy is used. Match seed selection and the shared order of random
consumption by other game systems remain unrecovered.

## Guarded trajectory composition

`fifa98_ball_motion_tick(state9,spin1,gravity,material3,options,random6)` is a
**new composition** of original position advance, isolated floor physics and
air-spin/rolling selection. State is `[positionXYZ,velocityXYZ,previousXYZ]`,
all Q16 word patterns. It returns2 for the floor branch,1 otherwise,0 for
invalid/below-ground input, or−1 for signed position overflow. Guard failures
leave state, spin and random storage unchanged. See `MATCH_RECOVERY.md` for
strict-negative floor guards, bounce thresholds and rolling stops.

Its domain excludes player/wall/post/net contacts, trajectory special states,
the original contact record/event system and callbacks. Spin is unchanged by
the isolated rolling branch, as this composition does not invent another decay.
Default materials, options, random seed and wall-clock cadence must be supplied
as inspection inputs until full match initialization is recovered. This helper
alone is not a player kick, goal detection or complete original trajectory.

## Validation

Native tests check source/WASM hashes and zero imports; all256 seed inputs,
12,010 full-word and carry-boundary random states, a10,000-step sequence,
15,098 signed edge/random air cases, random reversal and nonconsumption,
20,000 spin-free parity cases against the existing surface composition,
bounce-to-rest behaviour and atomic failure. Oracles use independent BigInt
word truncation, multiplication and unrolled original carry expressions.
Commercial assets are not embedded in tests or native source.
