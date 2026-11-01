# Original PCMD data conversion

The resident `SLES_009.14` executable contains the original PCMD reader at
`0x800178fc`. The executable SHA-256 is
`dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644`.
These findings come from static instruction inspection. No console code was run.

`models.mjs` preserves the raw model data. `recoverDirectGeometry`,
`recoverPlayerGeometry` and `native/model.c` separately reproduce the reviewed
loader and fixed-point skinning arithmetic. Player geometry uses supplied
original, unmirrored animation keys. External view transforms, lighting and the
match engine remain separate. No console graphics runtime is introduced.

## Reviewed instruction ranges

Addresses are virtual resident addresses. Each checksum covers the complete
contiguous byte range beginning at the listed address, for the listed length.

| Address | Bytes | SHA-256 | Recovered behavior |
| --- | ---: | --- | --- |
| `0x80018788` | 76 | `f4f63f283a949eaaf640395956d914a4ce8d77a978933495382eb6011c772ae2` | Direct XYZ: arithmetic shift by 15, negate X, store signed halfwords. |
| `0x800188ac` | 140 | `2dac1d3c84405f428d386c035ea3ba869038729e5278cee6655131818072ed4d` | Clamp signed U/V to 0..65536, shift by 8, replace V with 256 minus V. |
| `0x80018964` | 72 | `328372bbbca58d75115e97f829a30bfe295e6b7b7df5a6f0785851a2727a91ef` | Swap the third and fourth corners of a source quad before packet construction. |
| `0x80017ee8` | 100 | `a37ef521906e5cec2d880d51a8632109c60180132f51dd4155e12f6c0450d59f` | Recognize weight 100×65536; convert other weights through signed multiply-high and shifts. |
| `0x80019080` | 428 | `766f3d471a289ece292ed9ba165f1a006ec0fe2202b16590c403e6f417f9b0b7` | Construct runtime joints and copy weighted row XYZ using shift 15 and halfword stores. |
| `0x80012ad0` | 260 | `1808a8930618911ab2a0705b0c370960e0cd5ed6c9815575b5ceb5617c860121` | Convert four runtime quaternion components into nine local matrix coefficients. |
| `0x800179fc` | 72 | `8f895c623277f44171134e0215b7ec896472193592e36dea2d3f63d3286c3c96` | Initialize halfword lookup entries, including the root-parent guard, to -1. |
| `0x800190bc` | 52 | `b93f1e4846236981acc262c18233157b40b4e385b89b45bb3da0993c271cd052` | Resolve a runtime parent and redirect parent-zero children to pelvis joint1, except joint1 itself. |
| `0x80012a3c` | 136 | `54652925b8adae6d85437609d436ac71935fee4c7a116ca33592cac49b579e01` | Construct model-scale and root matrices, both with negated Y diagonals. |
| `0x80012bd4` | 528 | `8ae40d2efd53ffe64aa9861460a15fd2d45e5e8e0ae96ee445229894e2edac2f` | Compose local joint translations and matrices with their parent, including temporary second-row negation. |
| `0x80012de4` | 480 | `b33afe27f831b56aebfa41d9e1364292c1689100258f3df431eb710d44294467` | Apply model scale to the completed hierarchy, with halfword translation inputs and saturated matrix outputs. |
| `0x800134a8` | 240 | `88f764e076cd0aa70713c147c5224fd4594aae3f506c85aa3cf31262dc9575fa` | Transform partial-weight points, negate Y, multiply by stored blend factors, shift by eight and write/add signed halfwords. |
| `0x8001803c` | 68 | `4f0e5cfb604f992d4d10c3ba48e8986783604ba1eaeab2c0d584b80944e867ed` | Clear the runtime joint count for a non-animated loader call. |
| `0x800181d4` | 16 | `ed04f81adf51a1501749f158e12808a120fc2dd01350b37eabc0e96861cf0253` | Store the resulting runtime joint count at object offset36. |
| `0x800136e4` | 48 | `94e14e71e64972e5f59a981ad7ef5590e5a93fe7a37f9c0a76dd5f9eb87fe712` | For zero-joint geometry, use the supplied matrix directly rather than constructing another hierarchy. |

The native source spells out signed shifting and halfword wrapping without
relying on implementation-defined C conversions. Native tests compare boundary
values and 10,000 samples to an independent integer oracle and the browser
adapter. Build metadata binds the tested module to `model.c`.

## Direct meshes and UVs

The resident reader does not apply the source node's transform values to direct
XYZ in the reviewed conversion path. Output coordinates are loader-space
integers, not world-space positions or a recovered camera convention. The X
negation happens after the arithmetic shift; negative values and halfword
overflow therefore require the exact operation order.

Normalized UVs in the browser helper are the loader's 0..256 intermediate values
divided by 256. Texture dimensions, texture-page packing, edge treatment,
palette state and blending are later operations and are not established by this
conversion alone.

The source quad order becomes packet order `[0,1,3,2]`. The PS1 GPU uses packet
triangles `[0,1,2]` and `[1,2,3]`, making the corresponding source triangles
`[0,1,3]` and `[1,3,2]`. A source triangle fan chooses another diagonal and can
change interpolated colours and UVs. The GPU's split is documented in
[PSX-SPX polygon notes](https://psx-spx.consoledev.net/graphicsprocessingunitgpu/#notes).

## Weighted player models

The reader consumes node fields after the three links as groups of three, four
and three integers. The last three begin at node offsets 64, 68 and 72. These
groups are retained as raw values; assigning an Euler or quaternion convention
without the runtime pose code would be premature.

Player nodes 0..14 contain weighted rows targeting the final mesh node 15.
The first link identifies the source parent used while constructing runtime
joints. The reviewed path initializes runtime joint state separately rather
than turning the source transform words into a demonstrated bind pose.

All supplied player models' groups of rows sharing a target/global vertex ID
sum to 100×65536. The reader treats a single 100×65536 weight as a rigid case.
Partial weights are reduced to an integer blend factor through multiplication
by `0x51eb851f`, signed high-word extraction, shift 13 and sign correction.
Weighted XYZ is shifted by 15 and stored as signed halfwords without the direct
mesh X negation. For the supported nonnegative source weights, the original
multiply-high expression equals `floor(rawWeight / 25600)`. Thus 30% and 70%
become factors 76 and 179, which sum to 255. The conversion does not renormalize
those factors.

The animation packet format and pose-to-player-joint table are now recovered
separately; see [motion recovery](./MOTION_RECOVERY.md). The sparse motion pose is
mapped by `recoverPcmdJointParameters` using the original fifteen-entry table.
It yields the exact quaternion and translation integers written into runtime
joints, together with the recovered runtime parent indices. The model helper
then composes the hierarchy and recovers weighted geometry with the arithmetic
below, rather than inventing a bind pose.

The source parent-zero link is redirected to pelvis joint1 except for joint1,
which remains attached to dummy root0. A source parent of -1 stays -1: the
initialization loop's final halfword fills the guard immediately before the
node lookup table with -1. This makes root0 a root rather than creating a cycle.
For the supplied high-detail model the recovered parent array is
`[-1,0,1,2,3,2,5,2,7,1,9,10,1,12,13]`.

## Local quaternion coefficients

`recoverPcmdQuaternionMatrix` and `fifa98_pcmd_quaternion_matrix` reproduce the
straight-line local rotation calculation at `0x80012ad0`. Inputs are the four
runtime quaternion integers, normally twelve fractional bits. Each doubled
product keeps the original multiplication's low 32-bit word and then shifts
arithmetically by twelve; output coefficients wrap through signed halfwords.

The original diagonal base is **4095**, rather than 4096. Consequently, an
identity quaternion produces diagonal 4095, and the exact X half-turn produces
4095, -4097, -4097. Replacing this with a textbook floating-point formula loses
the recovered quantization. Tests use an independent BigInt arithmetic oracle
across 10,000 mapped input samples, including multiplication overflow.

## Hierarchy and weighted geometry

`recoverPcmdSkin(joints, rows, vertexCount, modelScale)` is the bounded numerical
kernel; `recoverPlayerGeometry(model, frame, nativeCore?, {baseFrame})` maps an
original key and returns indexed meshes with converted UVs and original material references.
The latter uses model scale **512**, written by the original high-detail body
setup at backend `0x8010b31c..0x8010b32c`. It retains the mapped parameters and
completed matrices for inspection. Native and JS paths return the same shape.
The geometry adapter supports the original high/medium scale-512 draw path,
including its raw clip translations, with absent sparse channels retained from
original `AAAAAA` key zero; see [motion recovery](./MOTION_RECOVERY.md). Low/slow
draw sets the scale field to zero and follows another external-matrix path;
that geometry is rejected here until separately ported. The parameter helper
still exposes its reviewed divided-by-eight translations. PCMD raw transform
words are preserved, not substituted as assumed missing animation channels.

The hierarchy begins with root matrix `diag(4096,-4096,4096)` and zero
translation. Each joint's local translation is stored through signed halfwords
before a parent-matrix dot product. Translation results use an arithmetic shift
by twelve and signed 44-bit accumulator wrapping. For rotation composition the
source temporarily negates the parent's second row, transforms each local
matrix column, clamps results to signed halfwords, and negates the resulting
second row. The parent is restored before the next joint. Negations also use
signed halfword storage; moving the sign outside rounding changes results.

After composing the full hierarchy, a separate
`diag(modelScale,-modelScale,modelScale)` stage transforms its translations and
matrix columns. Translation inputs again truncate through signed halfwords;
matrix outputs saturate to signed halfwords. The implementation ports these
specific numerical formulas rather than providing virtual registers or a
general instruction or graphics processor. The original fixed-point matrix
operation and saturation are described in the
[GTE MVMVA documentation](https://psx-spx.consoledev.net/geometrytransformationenginegte/#gte-command-12h-8-mvmva-sf-mx-v-cv-lm).

A rigid row with weight 100×65536 transforms its signed-halfword XYZ directly.
Partial rows transform the point, negate transformed Y, multiply each component
by its truncated 0..256 blend factor, retain the product's low 32-bit word and
shift arithmetically by eight. The first contribution stores signed halfwords;
subsequent contributions add to those signed halfwords and store through
halfwords again. Exported model-space geometry converts the final partial Y
back to ordinary model-space Y. It does not mix that source projection
convention into the platform camera.

The original routine applies an external object/view matrix after model scale
and before weighted accumulation. This helper deliberately stops its matrix
composition before that external transform and applies the recovered weight
formula in model space. The browser supplies its own inspection camera. Because
fixed-point rounding depends on operation order, this is not a claim of original
camera-space or screen-pixel parity. Source lighting, turning/mirroring,
interpolation and match animation selection remain separate recovery work.

The C kernel accepts at most 32 joints, 2,048 weighted rows and 512 output
vertices. It validates acyclic parent order, signed component bounds, ascending
joint row order and the observed exact source weight totals. A rigid vertex
must have exactly one contribution. It rejects layouts outside these bounds.
Its exported buffers contain joint rows
`[parent,qx,qy,qz,qw,tx,ty,tz]`, vertex rows
`[joint,globalId,rawX,rawY,rawZ,rawWeight]`, three-component output points and
twelve-component matrices `[nine rotation coefficients,tx,ty,tz]`.

Synthetic tests pin original 4095-diagonal shrinkage, parent translation
rounding, partial blend-factor loss, Y rounding and signed-halfword input
conversion. A further 1,200 randomized cases compare native and JS hierarchy,
matrix saturation and weighted output over signed arithmetic boundaries.
The existing 10,000-sample BigInt oracle checks local quaternion products.

## Original separate head

The high body source excludes its separate head. The backend loads
`nhead1.pc`, `nhead2.pc` and `nhead3.pc` with loader argument `a1=0`; body models
use `a1=1`. The non-animated head loader clears its runtime joint count and
flattens the source's rigid weighted rows. Their XYZ conversion is the weighted
`SRA15` and signed-halfword storage, without direct-mesh X negation. All three
source heads have 26 rows, each 100% attached to source joint4.

At backend `0x800dce50..0x800dce84`, the head draw receives the body matrix at
the original external matrix base plus 256 bytes. The setup at
`0x800d8c48..0x800d8ce4` establishes external base `0x1f800060` and resident
scratch base `0x1f800080`. The body hierarchy starts at scratch base plus96,
or external base plus128, with 32-byte matrix rows. Thus external base plus256
is body joint4, `Head_1`. This identifies the attachment from source memory
layout rather than an estimated position.

The head object has zero runtime joints, so draw entry `0x80012a00` immediately
branches to `0x800136e4`, using its incoming body joint4 matrix directly. It
bypasses another hierarchy and model-scale stage, even though its scale field
is set to512. Adding another512 factor or constructing a zero-quaternion head
skeleton would therefore introduce a source-inconsistent transform.

`recoverPlayerHeadGeometry(headModel, bodyGeometry, nativeCore?)` applies the
body geometry's completed matrix4 to these flattened head rows, retaining head
materials and source faces. Native `fifa98_pcmd_attachment(rowCount,vertexCount)`
uses existing matrix slot0, rigid row buffers and output points. It accepts one
rigid row per global ID, at most512 rows, and rejects missing/duplicate IDs or
non-rigid weights. Synthetic tests preserve absence of extra scaling; 3,000
signed-boundary points are checked against an independent BigInt matrix oracle.

The following backend ranges belong to `BECODE.BIN`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`:

| Address | Bytes | SHA-256 | Evidence |
| --- | ---: | --- | --- |
| `0x800d8c48` | 160 | `7bf5f55230db57be7b2035cadd7be517f69fd3a6bcab961668ba5cb467621b85` | Establish original external and resident scratch matrix bases. |
| `0x800dce50` | 56 | `61d6859d2cb1fa148410a514036e2b2d11de62c149a0eefe74fca8a48c1953ce` | Pass body matrix4 to the separate head draw, with no authored attachment offset. |
| `0x8010ba3c` | 20 | `faebc85953845feea7ad06796ba93cf772c46496f30b86303a2540741175f9d8` | Select the high body instance table and assign detail state4. |

## Continuation addresses

- `0x80012fc4..0x80013198`: external scene/view matrix stage, currently separate
  from exported model-space geometry.
- `0x80013608..0x8001364c`: rigid point projection path. A browser renderer must
  supply a native platform projection, rather than introducing a console
  instruction interpreter or graphics runtime.
