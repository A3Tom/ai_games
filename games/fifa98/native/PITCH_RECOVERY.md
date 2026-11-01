# Original grass-grid recovery

`pitch.c` reconstructs the geometry arithmetic and topology inside the original
grass constructor. It supplies a grass surface for the inspection renderer. It
does not initialize a match, choose gameplay rules or recreate the original GPU.

The source is `BECODE.BIN`, 939,136 bytes, loaded at `0x8005ae28`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
`scripts/pitch-recovery.mjs` requires this complete fingerprint, then verifies
the following regions and their static disassembly. No instructions execute.

| Evidence region | Address | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Grass constructor | `0x800ea250` | 780 | `2e7bf78871a97a30100e14b80128aa4699e5ac321b2e47020cdf2b974da98efc` |
| Quad helper | `0x800ea55c` | 200 | `33d191414ba162893d9e2d6f88663c098042de41db50e5a36e0077c75ffad08d` |
| Partial size initializer | `0x800b595c` | 612 | `e2e8651444fba18fa73c31c882538816ee2c94d69d179a114ebcb097dbc0b5c9` |
| Caller bounds | `0x800e9be4` | 108 | `3f8c910897d43e2ae0543735f0a56e86e5c3d9ccfef84ae2b21ffa65e761f7a6` |

## Geometry and native ABI

The constructor sorts signed X/Z bounds so each first coordinate is the larger.
It subtracts the minima with 32-bit wrap and computes signed steps truncated
toward zero: span-X / 11 and span-Z / 15. Its outer loop visits 16 Z rows and
its inner loop visits 12 X columns, subtracting those steps from the maxima.
Each vertex writes signed halfwords `{x,0,z}`. The original object reserves an
eight-byte vertex slot; the remaining halfword is not written by this loop.
Native `fifa98_pitch_vertices()` exposes only the logical XYZ, tightly packed
as 192 × three `int16_t` values. Padding is not treated as recovered state.

`fifa98_pitch_generate(x0,z0,x1,z1)` generates all vertices and returns 192.
The C implementation preserves sorting, wrapped spans, truncating division and
halfword stores even for extreme 32-bit arguments. The browser adapter confines
preview coordinates to the ordinary signed-halfword domain.

`fifa98_pitch_quads()` exposes 165 × four `uint16_t` indices. For row `r` and
column `c`, the descriptor is `[12r+c,12r+c+1,12r+c+12,12r+c+13]`: top-left,
top-right, bottom-left, bottom-right in the original descending-coordinate
traversal. A platform renderer splits this strip as corners `(0,1,2)` and
`(1,2,3)`. This helper has no PCMD-loader corner permutation.

The helper's UV halfwords are `(256,0),(0,0),(256,256),(0,256)`, stored at
primitive offsets 8/10, 16/18, 24/26 and 32/34. These are engine intermediate
UVs. The helper also packs a texture handle into offsets 12/13 and receives
RGB bytes separately. They must not be confused with final GPU byte-UV packet
fields. `fifa98_pitch_uv()` exposes the eight original UV halfwords; the new
inspection renderer divides them by 256 for normalized texture sampling.

## Explicit profile and margin

`fifa98_pitch_profile_extent(profile,axis)` returns the original positive
half-extent (axis 0 = X, axis 1 = Z), or -1 for an unsupported argument:

| Profile | Half-X | Half-Z |
| ---: | ---: | ---: |
| 0 | 4080 | 5664 |
| 1 | 3840 | 5376 |
| 2 | 3648 | 5088 |
| 3 | 3600 | 4800 |
| 4 | 2160 | 2784 |

These values are writes to original globals `0x8013fd38` and `0x8013fd3c`.
They are not a recovered complete initializer. Original mode 5 can retain
previous state; the stateless API deliberately exposes only profiles 0–4.
The caller ordinarily extends both signed bounds by 192, with special flag
paths that omit that extension. Preview profile 2 with explicit margin 192
therefore requests bounds ±3840 and ±5280. Its steps are 698 and 704; integer
truncation leaves the last X coordinate at -3838, rather than forcing -3840.
`scripts/pitch.mjs` provides a browser-compatible C-buffer adapter and an
independent JavaScript reference, returning vertices, quads, UVs, profile and
margin. The preview does not infer match globals or silently select a mode.

## Original texture and remaining work

`ZGAOTHER.BIG/grass.psh`, SHA-256
`0e3632097af20795365dc223854443676ddfaea212b963ae4a566aa30fff1cf9`, contains
eight 64 × 64, 4-bit indexed textures: `weto`, `damo`, `hoto`, `dryo`, `dryi`,
`dami`, `hoti` and `weti`. The inspection preview can explicitly choose `dryo`
and white modulation. This does not establish the original weather selection
or alternating RGB table, which depends on other caller/global state.

This subset supplies no painted field markings, nets, goal frames, collision
bounds, match selection, player or ball placement, physics or rules. Existing
stadium meshes and the new camera/rasterizer remain separate. Tests compare
native geometry to independent integer arithmetic and logical topology without
executing the original machine code or depending on commercial test fixtures.
