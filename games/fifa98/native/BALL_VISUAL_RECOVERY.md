# Original ball image and sprite construction

`scripts/ball-visual.mjs` decodes the original indexed ball images and ports
their bounded placement, frame selection, billboard and screen correction
arithmetic. The original ball is a textured quad. No authored sphere, guessed
mesh radius, substitute image or emulation runtime is introduced.

The browser adapter deliberately uses the repository's new inspection camera
and native rasterizer. Original camera projection, lighting, shadow drawing,
ordering-table submission remain separate. Original screen
pixel parity is not claimed for that new platform view.

## Source identities and asset

`inspectBallVisual(backend,resident,asset)` verifies all three complete hashes
before returning fifteen source-region fingerprints and the original frame
lookup table. Unknown inputs return `unsupported` with empty evidence/table.

| Original source | Bytes | SHA-256 |
| --- | ---: | --- |
| `BECODE.BIN` | 939136 | `254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0` |
| `SLES_009.14` | 251904 | `dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644` |
| `ZCRAM.BIG/gameball.psh` | 5568 | `1e282d650ef468d92364b2d4fb042c1f5d693f06866212afce603b5f29dfc6c0` |

The backend loads at `0x8005ae28`. The resident payload starts at file offset
2048 and loads at `0x80011800`. All addresses below refer to these verified
images; no original machine code is executed.

The PSH contains twelve 32×24 4bpp images, `b00z` through `b11z`, plus the
16×1 image `b01p`. Every ball frame has zero bitmap centre fields. The loader
at backend `0x800d7ccc` registers the preceding `ZGAMEFNT.PFN` glyphs, then
registers these PSH images sequentially after them. Their independent image
frames do not require decoding the font glyphs into the browser scene.

## Palette and frame are independent source choices

The source image loader `0x8001febc` iterates the PSH index and calls
`0x8001e394`. Registration at resident `0x8001e564..0x8001e590` copies bitmap
width/height and centre fields into its runtime image entry. Descriptor fetch
`0x8001e674..0x8001e6a0` copies them into the sprite descriptor consumed by the
billboard builder. Thus its width32, height24 and horizontal centre0 come from
the original asset and actual loader path.

Backend `0x800d7ec8` looks up `b01z` and obtains its palette coordinates through
resident `0x8001ebe0`; `0x800d7f00..0x800d7f04` stores that pair at `0x80137aa4`.
The nearby `b00z` and `b02z` paths store their palette pairs at `0x80137aa8` and
`0x80137aac`. Palette selector `0x800dd55c` normally chooses the `b01z` pair.
Its numeric mode4 branch chooses `b00z`; another numeric setting4 branch chooses
`b02z`. No friendly names are assigned to those settings here.

The frame's indices and selected palette must therefore be composed separately.
Directly displaying each frame's own palette is wrong for normal-mode frames
0 and2. `decodeBallVisual(psh,{paletteIndex:1})` returns twelve independent RGBA
and STP arrays using the normal source palette. Indices and source frame names
are retained. Palette indices0/2 expose the two other reviewed branches.
For frame7, its embedded palette already equals the normal `b01z` palette,
so ordinary `b07z` RGBA and the composed normal result are identical.

The original frame table is 32 bytes at backend `0x80125e98`, SHA-256
`08c6c774b6a74d787e702a2d4f6d0026379d8d8a2138929851279cdd69bdead8`.
It is extracted into the local report/config, rather than embedded in the
implementation. Selector `0x80076474` computes:

```text
sector = ((heading1024 + (cameraAngle65536 >> 6) + 64) & 1023) >> 7
frame = sourceTable[rollPhase * 8 + sector] & 15
mirror = sector == 1 || sector == 5
```

The caller at `0x800d6030` puts the mirror decision into bit0x80. Drawing at
`0x800dc4c8..0x800dc55c` swaps the projected left/right corner pairs when that
bit is set. The platform adapter implements the equivalent horizontal UV flip
for its camera-aligned quad; this is a platform representation of the source
corner permutation, not a claim that the original mutated UVs.

`selectBallVisualFrame` requires roll phase0..3 and the verified 32-byte table.
Heading uses a period of1024; camera angle uses a period of65536. Zero roll,
heading and camera angle select frame7. The source moving-ball heading comes
from the last consumed trajectory sample's X/Z displacement through resident
`0x80026fd0` at backend `0x80077024` (main path) or `0x80076628` (short path);
the source retains its old heading when both components are zero.
The native `fifa98_control_heading` function supplies that same rounded lookup.
Converting a fractional launch angle by shifting it right six can differ from
that displacement lookup and must not be substituted as exact source heading.
The original accumulator and its two distinct rate paths are now recovered in
`BALL_VISUAL_PHASE_RECOVERY.md`. The isolated trajectory adapter can use that
source phase instead of an independent sprite timer or held phase0.

## Position and original billboard

Snapshot writer `0x800d6264..0x800d62a4` obtains integer ball XYZ from
`0x8013de44/48/4c` and stores them at snapshot offsets552/554/556. Reader
`0x800d5f98..0x800d5fb8` sign-extends these unchanged. Producer
`0x800da694/0x800da69c/0x800da6a4` doubles them before halfword storage and
camera-origin subtraction. Unlike the player, the ball has no Y-minus-three
offset. The existing ball-position initializer proves that integer ball XYZ
is the arithmetic high half of its Q16 fixed position.

`recoverBallRenderPosition(fixedXYZ)` reproduces the high-half/doubling/halfword
conversion before the camera-origin subtraction. It does not smooth fractional
simulation positions or claim complete original visibility/culling behavior.

The source zoom word is initialized to5440 at `0x800d76d0`. Setter
`0x800dd884..0x800dd8d0` clamps it to1000..6800. After transforming the doubled
ball point through the active camera, `0x800da6bc` reads signed-halfword view Z.
The scale expression retains the source signed multiply-high arithmetic:

```text
product = low32(viewDepth * zoom)
q = (signedHigh32(product * 0x60606061) >> 11) - (product >> 31)
scaleQ16 = 49152 + 8 * clamp(q, 0, 8191)
```

The magic expression is signed division by5440 in the reviewed domain. At
default zoom5440 it reduces to the depth when the product does not wrap. The
helper preserves the actual expression, its depth clamp and its `0xc000` base
rather than selecting a visual size by eye.

Resident `0x800166d4` constructs the unflipped sprite with shift2. It computes
its horizontal extent from `width-(centreX-1)` and its top from `height+1`.
For this asset those are33 and25; both pass through the original rounded fixed
multiply and a left shift by two. Fractional camera sine/cosine at
`0x800271d4` / `0x80027258` preserve the source quarter-table lookup and low
six-bit angular interpolation. The right endpoint moves along that camera
heading in X/Z. The left endpoint remains at the ball origin; the billboard's
bottom remains at originY. Signed-halfword stores and wrapping are preserved.

`recoverBallBillboard` returns source-order points left/top, right/top,
right/bottom, left/bottom. These are intermediate source billboard corners,
not the final screen rectangle or a physical ball mesh diameter.

## Original screen correction and platform adapter

After projecting those four points, `0x800da76c` requires every signed-halfword
depth to be positive. Let `width = projectedCorner2.x-projectedCorner3.x`.
`0x800da7cc..0x800da82c` uses arithmetic integer shifts:

```text
margin = width >> 3
left = corner3.x - margin
right = corner3.x + margin
topDelta = margin + (width >> 4)
topLeftY = corner3.y - topDelta
topRightY = corner2.y - topDelta
```

The bottom Y coordinates remain unchanged; all writes pass through signed
halfwords. This deliberate screen correction is why substituting the initial
billboard dimensions, or choosing a sphere radius from the image size, would
produce the wrong visible size. `recoverBallScreenQuad` ports the correction
and source depth bucket `sum(depths)>>4` without reproducing GTE projection.
The source UV endpoints are image pixels0..31 and0..23; the adapter retains
those endpoints as normalized coordinates. Source packet order corresponds to
triangles `[0,1,3]` and `[1,3,2]`.

`createBallVisualBatch(scene,fixedXYZ,options)` returns one projected batch
compatible with `projectScene` and the native rasterizer. Options include the
inspection camera, verified quarter-sine data and orientation table, zoom,
roll phase and source heading/camera-angle inputs. Its `textureIndex` identifies
the composed frame from `decodeBallVisual`; the default texture tag is
`__ball`. Behind-camera corners produce an empty batch.

The adapter normalizes the original positions into the scene's loader frame,
uses the new inspection projection, explicitly truncates its projected points
and depths to packed integer inputs, then applies the source correction.
Perspective-correct UVs and depth-buffering belong to the new renderer. The
original affine GPU texture sampling, per-corner lighting, palette/STP blend
settings, shadow and ordering-table behavior are not asserted to match.
Supplying camera angle0 with the current yaw0 inspection camera keeps the
source horizontal billboard orientation aligned; a different inspection yaw
needs its corresponding explicitly chosen camera-angle input.

## Validation and independent review

Eight tests use synthetic PSH data and integer fixtures to check palette
composition, frame/angle domains, halfword position conversion, signed
multiply-high depth scale, original33/25 endpoint rounding, screen correction,
positive-depth refusal and projected native-rasterizer batches. Optional local
reference tests verify complete source/asset identities and frame7 palette
equivalence. No original image bytes are embedded in tests.

The loader-centre chain, palette-coordinate mapping, frame selector, scale,
billboard endpoints, screen correction and ball snapshot placement were also
reviewed independently against the original bytes. No new native build is
required: the new module supplies decoded assets and bounded drawing formulas
to the existing native renderer and native ball-motion helpers.
