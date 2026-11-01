# Original high-detail head attachment

This note records read-only source inspection of the supplied SLES_009.14
images. It introduces no renderer code and makes no claim of a complete player
or texture pipeline. Image SHA-256 values are recorded in `PLAYER_RECOVERY.md`.

The original separate head uses the **completed body joint-4 matrix directly**.
Its source weighted rows flatten to rigid points at load time. They must not
be run through a second head skeleton, X-flipped, or scaled by another 512.

## Exact load and draw path

The backend loads `nhead1.pc` with resident `0x800178fc` at `0x8010b08c`:
`a1=0`, selected mesh name `head1`, `a3=1`. The corresponding high-body load
uses `a1=1`. The loader saves that `a1` at stack offset 176.

For `a1=0`, resident `0x8001803c`–`0x8001807c` clears the runtime joint count
at stack offset 232 and folds weighted-point storage into flat point storage.
`0x800181d4`–`0x800181e0` writes that zero joint count to model object +36;
the following branch clears its runtime joint pointer +40.

The head file structurally contains 15 type-2 nodes and a selected type-1 mesh.
All 26 observed head rows belong to node 4 with weight `6553600` (100%). This
does not imply the loaded renderer object retains a 15-joint head skeleton:
the original selected-mesh load explicitly flattens it.

Resident `0x800191d4`–`0x80019218` writes flat weighted-row XYZ by arithmetic
right shift 15 followed by signed-halfword storage, retaining original global
vertex IDs through its remapping table. This branch does **not** negate X.
The direct, unweighted-PCMD loader's X-negation path at `0x80018798`–`0x800187a4`
is a different path and must not be applied to these head rows.

The backend `0x800dccb8` draw loop handles render-instance detail values outside
1/2, draws the body model at instance +8, then selects the head model at +0.
At `0x800dce50`–`0x800dce60` it obtains the matrix pointer from global
`0x801397bc`, adds 256 and stores it at instance +252. The head draw call at
`0x800dce80` passes that pointer to resident `0x80012a00`.

The matrix association follows exact scratch allocation, not a guessed stride:

```text
Backend initialization 0x800d8c48..0x800d8ce4:
  global 0x801397bc = 0x1f800060  (external/view matrix)
  global 0x80050e6c = 0x1f800080  (resident work base)

Resident 0x80012a00:
  node0 matrix = work base +96 = 0x1f8000e0
  node stride =32 bytes
  node4 matrix = 0x1f800160 = external matrix +256
```

The head call writes object +68 to 512 at `0x800dce74`, but that value is not
used by the flat-object branch. At resident `0x80012a2c` / `0x80012a34`, zero
object +36 jumps directly to `0x800136e4`, before all object-scale setup and
joint quaternion/hierarchy operations. The flat branch sets its point matrix
`a2` directly from the supplied input matrix `a1` and joins the rigid-point
renderer. Consequently the model-space counterpart is the already completed
body matrix 4, including its original scale/quantization, applied to the
flattened signed-halfword head points using the same recovered point-transform
arithmetic. No extra head hierarchy, bind offset or second model scale belongs
between those inputs.

The separate draw path for detail values 1/2 at `0x800dceb0` omits the separate
head draw. This note therefore does not prescribe high-head attachment to all
lower-detail player models.

`0x800ddb50`, called after pose adaptation, is unrelated to this attachment
matrix: it copies body runtime quaternion/translation fields to the separate
shadow object at instance +4, with translation division by eight for selected
detail values. It does not build a 64-byte head-matrix palette.

## Original head selection and texture continuation

Templates load at backend `0x8010b050`, `0x8010b0fc`, `0x8010b1a8`:
`nhead1.pc`, `nhead2.pc`, `nhead3.pc`, each initially assigned object scale 512.
Their template globals are `0x8013f3d0`, `0x8013ab30`, `0x8013a078`.
`0x8010bed0` maps render-instance field +164 values 1/3/2 to those templates
respectively, then calls `0x8010d074` with instance fields +160/+168.
Those numeric selectors have not been assigned invented player/hair names.

All three parsed head materials have texture tag `hhge`. Backend
`0x8010d074` modifies the original textured triangle/quad draw commands:

- Negative face selector `a2`, and selector value 40, are changed to zero.
- Each U keeps its low five bits and adds `(a2 % 4) * 32`.
- Texture-page low five bits become `16 + floor(a2 / 4)`.
- CLUT comes from the halfword table at global `0x801397d0`, indexed by `2*a1`.

This is evidence of original 32-pixel horizontal face cells plus selected
texture page and CLUT. It is not evidence to stretch an entire `hhead.psh`
atlas over every face, assign friendly selector meanings, or assume all VRAM
page/palette reconstruction is complete.

## Region fingerprints

| Image / region address | Bytes | SHA-256 |
| --- | --- | --- |
| Backend head load `0x8010b050` | 92 | `c140c00e2a9517d950694ac9f0a0cab701b24f4f179ff483d4a71dad1fe26ed4` |
| Backend scratch setup `0x800d8c48` | 160 | `7bf5f55230db57be7b2035cadd7be517f69fd3a6bcab961668ba5cb467621b85` |
| Backend high-detail draw `0x800dccb8` | 504 | `e7ba12eb62cf0b7ec7af8d5d14d78b9f9ef0f8d5c2ad25633d67a4c8c71c1c24` |
| Backend head texture setup `0x8010d074` | 368 | `76c030a703e58b770a7e35a189c584e3865104be25041f66e104274ee4bdb57c` |
| Resident flat-load flag `0x8001803c` | 68 | `4f0e5cfb604f992d4d10c3ba48e8986783604ba1eaeab2c0d584b80944e867ed` |
| Resident object joint count `0x800181d4` | 68 | `e0846068dd6883113f415fdf85a2283d5216ad0c8c95c41fcc67304699dcc43f` |
| Resident flat point stores `0x800191d4` | 72 | `c6856943359089d7424070069bbad8c264038e1e0331707b881fdc8ca85cd62e` |
| Resident zero-joint dispatch `0x80012a00` | 60 | `e512f61ea511a804dddb27c88196f3d9ec5a84f6cdc2991b98fb33e624280c49` |
| Resident rigid path `0x800136e4` | 48 | `94e14e71e64972e5f59a981ad7ef5590e5a93fe7a37f9c0a76dd5f9eb87fe712` |
