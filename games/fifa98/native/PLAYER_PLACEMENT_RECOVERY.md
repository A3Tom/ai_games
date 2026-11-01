# Original player simulation-to-render coordinate conversion

`player-placement.c` recovers the numeric conversion from a player's fixed-point
simulation position to packed render coordinates, before camera-origin
subtraction. X/Z are **twice the signed integer simulation position**. Y first
subtracts three simulation units, then doubles. Fractional fixed-point bits are
discarded and final signed-halfword wrapping is preserved.

The source chain proves that factor independently of camera behavior. It does
not establish the complete original external view transform or the coordinate
conventions of the independently written inspection camera.

## Source chain

The backend is the supplied `BECODE.BIN`, 939136 bytes, load address
`0x8005ae28`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
Optional resident evidence uses `SLES_009.14`, 251904 bytes, SHA-256
`dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644`.

1. Snapshot writer `0x800d6358` obtains player pointers from the original side
   entity list. It reads signed halfwords at entity +130/+134/+138 at
   `0x800d6360`, `0x800d63b4`, `0x800d636c`. These are the high halves of
   fixed XYZ words +128/+132/+136 in the motion subobject at entity +124.
   It stores unchanged coordinate halfwords at snapshot +368/+370/+372 at
   `0x800d63b0`, `0x800d63bc`, `0x800d63c8`.
2. `0x800d9304` passes world-position array `0x801371e8` and the second-side
   array +132 to reader `0x800d5f64`, called at `0x800d9360`. At
   `0x800d607c`–`0x800d609c` the reader sign-extends the snapshot XYZ
   halfwords to three integer words without scaling.
3. Render-position producer `0x800d96b4` loads these integer array values.
   It applies `SLL16` then `SRA15` to X at `0x800d96e4` / `0x800d9740`,
   to Y at `0x800d9714` / `0x800d975c`, and to Z at `0x800d9744` /
   `0x800d9774`. Y subtracts three first at `0x800d9710`. After camera
   subtraction, signed-halfword stores write render-instance +12/+14/+16 at
   `0x800d9750`, `0x800d9764`, `0x800d978c`. The second-side loop repeats
   the same conversion at `0x800d97ec`–`0x800d98f4`.

Within the controlled source bounds, the conversion before camera subtraction
is therefore:

```text
integerXYZ = signedFixedXYZ >> 16
packedRenderX = signed16(2 * integerX)
packedRenderY = signed16(2 * (integerY - 3))
packedRenderZ = signed16(2 * integerZ)
```

The source expresses doubling through left/right shifts. The native function
retains those word/shift/halfword operations explicitly; the independent
BigInt oracle verifies the equivalent formula across the entire halfword range.

## Native and JavaScript interfaces

```c
int32_t fifa98_player_render_position(const uint32_t *fixedXYZ3,
                                     int32_t *outXYZ3);
```

Inputs are original 32-bit Q16.16 word patterns. Outputs are signed int32
expansions of the original packed signed halfwords. Success returns one; null
storage returns zero without writing. Temporary results make in-place use
safe. It uses ordinary typed native arithmetic, without console addresses,
machine state or an interpreter.

`recoverPlayerRenderPosition(fixedXYZ)` in `scripts/player-placement.mjs`
performs the same conversion as a pure JavaScript helper and returns a frozen
three-element signed array. Invalid word/count inputs reject explicitly.

`inspectPlayerPlacement(backend, bootOptional)` verifies full source-image
hashes before publishing seven backend regions, five call edges and the source
conversion fields. Supplying the resident also verifies its packed-position
consumer as an eighth region. Unknown images produce empty evidence with
`status: unsupported`. Supported output is `reconstruction-only`, with
`conversion.horizontalMultiplier=2`, `packedVerticalOffset=-6`, native exports
and explicit platform boundaries. The CLI defaults to both extracted images:

```sh
node games/fifa98/scripts/player-placement.mjs
```

## Platform boundary and excluded source behavior

The original producer also subtracts packed camera-origin halfwords at
`0x80137830`, `0x80137832`, `0x80137834`. Later `0x800d9ed0` calls resident
`0x80011a48` to transform packed render-instance +12 into +20 through the
active camera. The body draw path calls resident `0x80011910` at
`0x800dcd48`; that consumer loads signed packed coordinates without X/Z
rescaling and **negates packed Y** into matrix translation before external
matrix composition and drawing.

Those camera-origin, active-camera and external-body transforms are outside
the helper. Adding returned X/Z or returned Y directly to recovered model-space
vertices is a separate platform translation. In particular, returned Y=-6 at
simulation Y=0 is the original packed-position value, not proof of every later
model-space Y sign convention. The report does not claim external transform
or camera parity.

The containing snapshot writer replaces X/Z outside [-32000,32000] with a
32016 off-field sentinel and later display-list code culls those records. That
filtering is not implemented by this coordinate arithmetic subset. Controlled
player bounds (for example ±1824/±2544 in source profile 2) lie far inside it.
The helper's defined arithmetic for other bit patterns must not be represented
as a complete display-list eligibility decision.

The source snapshot discards the low 16 fractional bits. Rendering the full
fixed-point fraction, interpolation or smoothing would be additional platform
behavior. Snapshot serialization, replay selection, animation, contacts and
match timing also remain outside this recovery.

## Region fingerprints

| Region / image | Address | Bytes | SHA-256 |
| --- | --- | --- | --- |
| Snapshot player-position writer / backend | `0x800d6358` | 128 | `27fb2b2ca009d1216dbf1fcdb02e47a1b29e27e778a42b3ffe4b8052572c1d64` |
| Snapshot position reader / backend | `0x800d6074` | 44 | `62dd9de830305579c18988ae5b34452b9c1a9a11cbfa715120e9aff9207e176f` |
| Position array reader caller / backend | `0x800d9304` | 116 | `a027b1bf4a5e026206a3a89de8b6dbf6f69ce2c14a86ceba6e90c08a9fae335a` |
| First-side render writes / backend | `0x800d96b4` | 272 | `94f8b511d00f533ba601f11bcc1a2a6985a56c1502c7cf9a477fdd8a9524045a` |
| Second-side render writes / backend | `0x800d97ec` | 268 | `4846d0ba372f2877877502134d5bbfafda1510c231be9e76c0eb0bdb1a9b0115` |
| Packed-position camera caller / backend | `0x800d9e6c` | 108 | `b5c907c29b1443942b1cad952371dce1c7c0092d36289fb9853d8879724b339b` |
| Body external-transform caller / backend | `0x800dcd40` | 80 | `326ff9da596b3e35d5b263cdff982912181aa69d1eddb96c1a5bfed3c33da892` |
| Packed-position matrix consumer / resident | `0x80011910` | 56 | `32477087e7cd8dd6bf619828019ecf012770370f29bf38fb6c7a89672c00ca60` |

Five native tests verify the built source/module hashes and no runtime imports,
all 65536 signed high-halfword patterns, 20000 random fractional coordinate
triples against an independent BigInt oracle, null/no-write behavior, in-place
conversion and actual source regions/calls. Two script tests verify source
quantization/wrapping and reject malformed inputs/unknown images. Reference
binaries are not embedded; no compiler runs during tests.
