# Original MOPSX phase and prefix recovery

`scripts/motion-playback.mjs` supplies browser-compatible original key selection
and the verified prefix consumers. It does not introduce a gameplay clock or
guess an FPS. Original decoded keys can drive an inspection scrubber through
the existing pose adapter. These helpers do not select a player's action or
replace the movement controller.

Evidence is gated by the complete `BECODE.BIN` fingerprint:
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`,
939,136 bytes, loaded at `0x8005ae28`. The optional Node CLI prints verified
region hashes and instruction words without executing any original code:

```bash
node games/fifa98/scripts/motion-playback.mjs
```

## Source phase and key selection

The wrapper `0x800d0568–0x800d0644` reads bit zero of clip header flags at
offset 14. It computes the following using signed 32-bit shifts:

```text
shift = 1 + (flags & 1)
scaled = (phase >> shift) << 8       # the left shift wraps to 32 bits
key = scaled >> 16
fraction16 = scaled & 65535
```

It obtains decoded cache keys `key` and `key+1`. The cache independently clamps
each index to `[0,keyCount-1]` at `0x800d575c–0x800d5788`. Packet lookup does the
same clamp at `0x800d04e4–0x800d053c`. Thus ordinary neighbouring keys are
separated by 512 phase units when flag bit zero is clear, or 1024 when set.
`selectMotionKeys(clip,phaseRaw)` preserves all these integer operations.

The endpoint query `0x800d08b8–0x800d08e4` returns
`(keyCount-1)*(512<<(flags&1))`. `motionPhaseForKey(clip,index)` gives that same
spacing for a validated explicit key. It does not infer total loop duration
from the raw header field `timeValueRaw` at offset 4.

The direct prefix getters instead use `phase>>(9+(flags&1))`, followed by the
packet-index clamp. This equals the cached selector in the ordinary clip range,
but can differ after extreme 32-bit left-shift wrap. The API exposes
`directKeyIndex` separately; `motionPrefixAtPhase` follows that direct path.

One packed-state caller at `0x800d543c–0x800d5458` passes
`(signedPackedWord>>20)<<8`. This establishes quantized source phase input;
it does not establish a wall-clock update frequency, browser FPS, automatic
repeat behavior, action transitions or the authoritative match scheduler.
An automatic inspection player must label its chosen stepping rate accordingly.

## Discrete poses and interpolation limits

`sampleMotionPose(clip,phaseRaw,{interpolate:false})` returns the original
decoded frame object, compatible with `recoverPcmdJointParameters`. It does not
modify prefix channels or insert fractional values into signed-halfword data.
`interpolate:true` is explicitly rejected.

### Authentic initialized base pose

The initializer at `0x800d0408–0x800d0474` looks up the source literal `AAAAAA`
at `0x8005c53c`, opens that clip, obtains key zero through `0x800d04e4`, and
applies it with `0x800d0b44`, mirror disabled and heading offset zero. The
aligned call at `0x800b9ac8` supplies the pose address `0x8013a630` after the
surrounding state initialization. This establishes the full original base pose
before later masked writes. Missing sparse channels retain their existing
pose values; they are not initialized to zero by each clip.

The source name lookup `0x800d0354–0x800d03e0` invokes the bounded comparator
`0x800d5a28–0x800d5aa8`, which folds ASCII `A..Z` to lowercase. The source
literal therefore matches the archive entry `aaaaaa`. The recovered full-pose
resource is identified precisely:

| Resource | BIGF member offset | Archive SHA-256 |
| --- | ---: | --- |
| `ZMODAT.BIG/mopsx115.viv/aaaaaa` | 3060 | `e3a54adc4d7585765359919dcd98db95ad099ae8411505d3649d7f38c04eef93` |
| `ZMODAT30.BIG/mopsx130.viv/aaaaaa` | 3044 | `ecd4541f9a7aaa89e025d899a13c2741467450a19d3c2d728037aef399d6dbd3` |

Both members are identical 504-byte resources with SHA-256
`7c3212c782a10791ce3988a1c64a33a78f386fde7345b26bd473214543bb1c3e`.
Their decoded header has six keys, 121 channels, and both translation and
rotation masks `0xffff`. For example, key-zero translation slots 1, 11 and 14
contain `[241,0,0]`, `[461,0,0]` and `[460,0,0]`; dropping them collapses the
limb offsets in sparse clips. This selection is original initialization
evidence, rather than an assumed bind pose derived from the model.

`verifyMotionBaseClip(rawBytes)` gates the exact resource identity before a
caller decodes key zero for `baseFrame`. `inspectMotionPlayback(backend,
{baseClip})` additionally reports whether supplied clip bytes passed that gate.
For an isolated clip inspection, initialize from this base and overlay only
the selected sparse key's channels. Actual clip transitions can retain values
written by the previous pose; resetting every clip to the base is an explicit
inspection policy and does not reproduce the full action state machine.
`sampleMotionPose` returns the sparse original key unchanged, leaving this
base/retained-state handling to its pose consumer.

The initializer, caller, lookup and comparison fingerprints are respectively:

```text
0x800d0408 +112  3df286e227887a2438fbe2c368077735a96bc73e590f45167a86487cc1d5169d
0x800b9a68 +112  0e174d1bc3343c9ca3135028ae0ba74412831730ca8437900ad62553d2618e06
0x800d0354 +144  1c80842e9c35fea1054c790690a69855b4412d2d46c67bb3b0fa986de0b8f5fd
0x800d5a28 +132  e4af250910d4b21c6a94d878ae68fbb9d67d4dfe369bfe9dbf1e51713bbeb1a4
```

The inspected `0x800d1c20` path is not general lerp or quaternion slerp. Its
entry checks `fraction16>>14`: zero invokes the first key's ordinary pose
application, and nonzero enters an arithmetic midpoint path. For ordinary
non-root channels that path stores:

```text
translation = (signedHalfwordA + signedHalfwordB) << 11
quaternion = (signedHalfwordA + signedHalfwordB) << 7
```

The corresponding ordinary application uses shifts 12 and 8. Odd component
sums therefore represent half-channel values in scaled integer pose storage;
rounding them back into synthetic raw halfwords would change the source result.
Root heading adjustment, mirrored paths and the alternate pose consumer are
separate. The runtime API leaves interpolation disabled until its consumer
supports the original scaled fields. It never substitutes a normalized
floating-point blend merely to smooth the preview.

## Nine-prefix channels and movement association

Each decoded packet starts with a two-byte size and nine signed halfwords.
The following consumers are verified:

| Prefix index | Packet byte offset | Consumer | Verified operation |
| ---: | ---: | --- | --- |
| 1 | 4 | `0x800d0738` | Return signed scalar; negate for mirrored selection |
| 3,4,5 | 8,10,12 | `0x800d0790` | Return three words shifted left 12; mirror X only |
| 6,7,8 | 14,16,18 | `0x800d0824` | Return another three words shifted left 12; mirror X only |

`extractMotionPrefix(frame,{mirrorX:false})` exposes these as `headingOffsetRaw`,
`referenceAFixed12` and `referenceBFixed12`, preserving all nine original
channels alongside them. Indices 0 and 2 remain explicitly unresolved.
Negating a signed halfword is a 32-bit operation: mirrored -32768 becomes
+32768 rather than wrapping back into a halfword.

The caller `0x800bacf4–0x800bad40` adds the scalar to a clip-alignment value,
masks to ten bits and normalizes the signed angular range. This supports the
heading-offset interpretation without assigning degrees or a guessed clock.
The caller `0x800ba620–0x800ba738` selects reference vectors at two phases,
subtracts their X/Z words, and passes those deltas to planar measurement and
heading-related helpers. These are concrete movement-association consumers.

This does **not** establish that either vector should be blindly added to a
player's position. Per-joint pelvis translation is separately decoded from the
sparse pose tail and can differ from the prefix. Applying both as entity motion
would risk counting displacement twice. Player speed profiles, action/clip
selection, transitions, contact/event channels, world heading and the motion
controller still need their own source recovery.

## Verification

The evidence report includes seventeen complete or partial source regions with
exact SHA-256 fingerprints. Tests use invented metadata, frames and instruction
words, covering both flag modes, signed clamping, left-shift overflow, direct
versus cached selection, prefix mirroring, malformed input and unknown-image
refusal, plus refusal of substitute base-pose resources. No commercial clip is
required by the automated tests.
