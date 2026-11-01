# Native code recovery

`core.c` contains two recovered original leaf routines and new browser texture
conversion code. `match.c` adds original simulation support, `model.c` adds
recovered loader arithmetic, and `renderer.c` implements new platform drawing.
The combined module is not yet a recovered match engine.

## Integer display helper

| Evidence | Value |
| --- | --- |
| Image | `BECODE.BIN` from SLES_009.14 |
| Image SHA-256 | `254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0` |
| Address | `0x80102044` |
| File offset | `0x000a721c` |
| Length | 56 bytes |
| Routine SHA-256 | `6635357b180c0a42de00c400580d4886311f296ab7dae18e86bdd61ae693961e` |
| Direct caller | `0x80105f20`, JAL word `0x0c040811` |

The routine shifts its argument left six bits, adds seven, multiplies the
unsigned 32-bit result by `0x88888889`, takes the upper product word shifted
right three, adds 35, and caps values of 100 or more at 99. The C version keeps
the original wrapping behavior for every possible 32-bit input. For inputs
0 through 15 the result runs from 35 to 99. A caller formats the result with
`%d`; assigning this to a particular player-statistic field remains unverified.

The source has no virtual register file, instruction interpreter, translated
instruction dispatcher or PS1 hardware runtime. WebAssembly runs the compiled
C function directly. Tests use an independent integer-division oracle rather
than executing the console machine code. That proves the recovered arithmetic,
not broader gameplay equivalence.

## Signed rounded reciprocal

The second routine is at `0x80124640`, backend file offset `0x000c9818`,
56 bytes, SHA-256
`ed3fa46a1a62d42eec3d1dfbe6bf62c91b6b1e46e2778c8ed0b85db1f5a6bb41`.
It divides `0xffffffff` by the unsigned magnitude of its argument, increments
the quotient if the remainder exceeds the arithmetic-shifted half-magnitude,
and reapplies the argument's sign. Both the magnitude and the result wrap as
32-bit values. Direct callers include `0x800770d8` and `0x800c875c` in the
backend context; its higher-level role is still unknown.

The `INT_MIN` input retains the original arithmetic shift of `0x80000000`,
rather than substituting ordinary positive-integer rounding. Zero returns zero
after the original quotient increment wraps. The latter follows the documented
[DIVU overflow results](https://psx-spx.consoledev.net/cpuspecifications/#multiplydivide):
dividing `0xffffffff` by zero yields quotient and remainder `0xffffffff`.
The native function spells out these cases without invoking undefined C
division or signed-overflow behavior.

## Browser texture conversion

The indexed-colour decoder is new platform code based on the documented
[EA PSH format](https://psx-spx.consoledev.net/cdromfileformats/#electronic-arts-psh-shpp).
The JavaScript parser supplies decompressed pixel indices and 16-bit palettes;
the native module converts these to RGBA. Zero is transparent. Nonzero bit-15
colours remain opaque in previews because actual semi-transparency also depends
on the original draw command. This stage does not reproduce polygon blending,
texture-page layout or the original match drawing pipeline. The new triangle
renderer now displays original stadium geometry with a separate inspection
camera; it does not reproduce PS1 graphics hardware.

The module is freestanding C11 and uses a bounded set of static buffers. Build
with Clang targeting `wasm32` and LLVM's `wasm-ld`; Emscripten, a system libc and
console emulation are unnecessary for these functions. The larger port may need
additional native platform libraries later.
