# Original MOPSX animation recovery

`scripts/animation.mjs` decodes the original version-1, codec-11 clips supplied
with this disc. This is data-format and arithmetic recovery through static
inspection, without running console code or substituting authored animation.

The reviewed image is SLES_009.14's `BECODE.BIN`, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
The backend loads at `0x8005ae28`. Source offsets can be calculated by subtracting
that base from the addresses below.

| Address | Bytes | SHA-256 | Evidence |
| --- | ---: | --- | --- |
| `0x800d04e4` | 92 | `001f8ac32edc048cacd314e64ef3295ada4886dc8782a78148dabacf96d55dbd` | Read data start and key count, clamp the requested key, follow packet sizes. |
| `0x800d572c` | 764 | `2ba07b8e8ce4924eb3949a5537f3939d86adfd8da0530cb8e3c7991acc00054b` | Cache/decode consecutive keys; select absolute packets with flag `0x8000`. |
| `0x800d5b44` | 148 | `0cb009a150bb15269f1a9627dd7ba0a650ba71659165358eb851334c78358ba4` | Unpack signed deltas from most-significant bits of little-endian halfwords and add with halfword wrapping. |
| `0x800d0b44` | 1344 | `4b5973cbcae9b214fce4367c5a5548679632642e8814e8c932a4bd9144443173` | Apply sparse translation and quaternion masks to pose slots. |
| `0x8005c76c` | 60 | `fc495b4e89e8ddd6c308c99585b2e2cf17955b47fd24fb1490f7b312c11e91a7` | Fifteen-entry mapping from PCMD player joints to motion pose slots. |
| `0x800dd96c` | 484 | `eec3ee170d64b648f0ea3fa30ec8bb305edb31306153994ec64888cad7052643` | Transfer mapped pose rotation and translation values to 44-byte runtime joint records. |
| `0x800d0408` | 112 | `3df286e227887a2438fbe2c368077735a96bc73e590f45167a86487cc1d5169d` | Initialize a pose from original `AAAAAA` key zero, without mirroring or heading rotation. |
| `0x800db3a4` | 40 | `87b83386e517f0edbf014b45c4cefd9dc5c6b61a01a5f3c4713e7099e8e50e8e` | Select the adapter's translation scale from the original body detail state. |

## Packet layout

All integers below are little-endian. The first two bytes identify version 1
and codec 11. Key lookup and timing use these observed fields:

| Offset | Type | Meaning established by the reader |
| --- | --- | --- |
| 2 | u16 | Start of key packets. |
| 4 | u16 | Retained time/count value; not labelled as a frame rate. |
| 6 | u16 | Number of key packets. |
| 14 | u16 | Flags; `0x8000` selects all-absolute keys. Timing uses shift `1 + (flags & 1)`. |
| 16 | u16 | Number of signed-halfword channels. |
| 28 | u32 | Mask of pose slots containing XYZ translations. |
| 32 | u32 | Mask of pose slots containing four quaternion components. |
| 36 | u8 array | One packed bit width per channel. |

The channel count equals nine prefix channels plus three values per set
translation bit and four per set rotation bit. Header length is aligned to
four bytes. The supplied collection contains 501 clips with 80 channels and
116-byte headers, and two with 121 channels and 160-byte headers.

Each key begins with its u16 byte length. The first key stores every channel as
an absolute signed halfword. Later keys store their first nine channels as
absolute halfwords, followed by signed deltas for the remaining channels.
The first nine width entries are always 16. The remaining widths are 0..16;
zero leaves the previous channel unchanged. Bits run from the most significant
bit of each little-endian 16-bit word, crossing word boundaries continuously.
Decoded deltas add to the previous key's channels and wrap through signed
16-bit storage. Packet lengths are rounded to four bytes.

Validation of the supplied eight bank archives and nested `mopsx115.viv` and
`mopsx130.viv` consumed **503 clips and 12,192 keys**. Sixteen original VIV
members omit two unused alignment bytes at the end of the last absolute key.
The parser permits only absent final alignment, while requiring every payload
word and every preceding packet. It does not require unused padding to be zero.

`native/motion.c` ports the delta unpacker's numerical bit extraction and signed
halfword addition into bounded WASM buffers. Its getters expose previous and
decoded signed-i32 channel arrays, a u32 width array and packed bytes. Capacity
is 233 channels and 466 packed bytes. `fifa98_mop_decode_deltas(count, byteLength)`
validates all channel widths, previous values and packed-word boundaries before
writing output; it returns the count or -1 without changing output on failure.
`parseMopClip(bytes, {decodeDeltas})` can use this native callback while retaining
the same structural checks and default JS implementation. Native tests compare
1,500 independently packed fixtures with mixed widths, and preparation compares
the supplied clip collection through both decoders.

## Pose parameters and player mapping

Following the nine preserved prefix values, translations appear in ascending
mask-bit order, then quaternions in ascending mask-bit order. The original pose
application shifts translation components left twelve bits and quaternion
components left eight bits. Turning, mirroring and interpolation are additional
paths; the parser exposes keys without inventing those operations.

The original player adapter uses the following table. Each mapped entry has
flags `0x300`, enabling rotation and translation transfer. Joint zero has no
assignment.

| PCMD joint | Source name family | Motion pose slot |
| ---: | --- | ---: |
| 0 | TorsoChn | None |
| 1 | LowerTorso | 0 |
| 2 | UpperTorso | 1 |
| 3 | Neck | 2 |
| 4 | Head | 3 |
| 5 | LUpperArm | 4 |
| 6 | LLowArm | 5 |
| 7 | RUpperArm | 7 |
| 8 | RLowArm | 8 |
| 9 | RThigh | 13 |
| 10 | RLowLeg | 14 |
| 11 | RFoot | 15 |
| 12 | LThigh | 10 |
| 13 | LLowLeg | 11 |
| 14 | LFoot | 12 |

The adapter shifts the pose's quaternion values right four into runtime joint
fields 16..28, giving the original raw clip component multiplied by sixteen.
Translations shift right fifteen in the normal path, or twelve in its alternate
path. The caller chooses the alternate path for high/medium detail states 4/3;
low/slow states 2/1 use the normal path. Consequently high/medium body joints use
the clip's raw translation values, and low/slow use their arithmetic division by
eight. Applying the normal path to the high body collapses its bone lengths.

Sparse channels retain the pose's original initialization. Backend
`0x800d0408` looks up `AAAAAA`, opens it, explicitly requests key zero, applies it
without mirroring or heading rotation, and releases the clip. Its caller at
`0x800b9ac8` supplies the pose buffer. Case-insensitive lookup resolves the
original `aaaaaa` member in `ZMODAT.BIG/mopsx115.viv`. That 504-byte asset has
SHA-256 `7c3212c782a10791ce3988a1c64a33a78f386fde7345b26bd473214543bb1c3e`,
six keys, 121 channels and full `0xffff` translation/rotation masks. The
`mopsx130.viv` counterpart is byte-identical. Detailed lookup and initialization
evidence is in [motion playback recovery](./MOTION_PLAYBACK.md).

`recoverPcmdJointParameters(model, frame, {alternateScale, baseFrame})` overlays
the requested sparse key over this supplied original base frame. It retains
both missing translations and missing rotations; absent mapped channels fail
validation instead of receiving invented zero values. Only the unassigned dummy
root has zero parameters. The helper also enforces the observed player node
order and exposes raw source parent links. No commercial default-pose values
are embedded in source code or test fixtures.

The same parameter helper now recovers runtime parent indices. Parent-zero
children attach to pelvis1 except pelvis1 itself, which attaches to root0; the
loader's initialized -1 guard preserves root0's parent of -1. See the reviewed
initialization and remapping ranges in [model recovery](./MODEL_RECOVERY.md).

Hierarchical matrix rounding and partial-weight accumulation are now recovered
in the separate [model helper](./MODEL_RECOVERY.md). `recoverPlayerGeometry`
maps an unmirrored original key to indexed, textured model-space geometry, with
matching native and JS numerical paths. It retains original fixed-point
rounding rather than normalizing or authoring a pose. External camera, turning,
mirroring, interpolation and match animation selection remain separate.

Timing and the first nine channels are documented separately in
[motion playback recovery](./MOTION_PLAYBACK.md). An inspection animation driven
by supplied keys is not a recovered gameplay or match engine.
