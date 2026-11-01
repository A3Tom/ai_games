# Original action flags and mirrored key poses

This recovery corrects the action/runtime flag boundary and implements the
original discrete mirrored key application. It enables the isolated control
viewer to inspect original turning clips instead of holding their first keys
because of a misclassified flag. It does not recover the complete action
transition graph, cross-fades, callbacks or cross-action phase matching.

## Action metadata is shifted before runtime use

Action start at`0x800b9ea8` shifts action record flags right8 into the child
template. Child initialization at`0x800d4684–0x800d4698` combines those flags
with retained child bits`0x80000020`:

```text
runtimeFlags = (actionFlags >>> 8) | (retainedChildFlags & 0x80000020)
plainLoopPhase = (runtimeFlags & 4) != 0 && (runtimeFlags & 0x160) == 0
mirror = (runtimeFlags & 1) != 0
```

Consequently action504 raw flags`0x60507` become runtime`0x605`: a mirrored
loop with no runtime externally-advanced flag`0x100`. Testing raw action bit
`0x100` as that runtime flag incorrectly holds this clip. The same distinction
applies to mirrored control actions560/600/602/611/626. Their ordinary source
counterparts505/561/601/603/610/627 share clips and have different mirror flags.

`actionRuntimeFlags(raw,{retainedChildFlags:0})` and native
`fifa98_action_runtime_flags(raw,retained)` preserve the exact conversion.
`isPlainActionLoop(raw,options)` tests the resulting runtime word. Retaining
linked bit32 does not implement its old-child behavior; it makes the plain-loop
guard reject that unsupported branch.

## Key-pose application and retained channels

`0x800d4c4c` passes the caller pose buffer to`0x800d0b44` for discrete-key
application when the original interpolation selection is zero. The sparse
application writes only masked channels. `0x800d4ef4` separately evaluates
linked old children and their blends; those produce scaled fractional pose
values and are outside this raw-frame helper.

The original initialized AAAAAA key-zero pose is the starting destination.
Later unlinked discrete keys overwrite only channels their masks supply.
Retained channels are already in destination orientation. They must not be
mirrored again when applying the next key, including an instantaneous action
change. Apply the mirror permutation and component expressions only to each
new raw key channel:

| Channel | Source pose0/pelvis | Other source poses |
| --- | --- | --- |
| Translation | `[-x,y,z]` | `[x,y,-z]` |
| Quaternion | `[-z,w,-x,y]` | `[-x,-y,z,w]` |

These expressions are the exact`0x800d0df0–0x800d1080` branch at heading
offset zero. The source pelvis takes a distinct quaternion path; generic
quaternion axis negation gives a different result. The destination slot is
`mirrorMap[sourceIndex]`. Original data at`0x8012dc00` supplies:

```text
[0,1,2,3,7,8,9,4,5,6,13,14,15,10,11,12]
```

Unmirrored keys copy their present channels to the same source/destination
slot. Missing translation and rotation channels preserve initialized or
previous output values in both branches.

The source stores translation components shifted12 and quaternion components
shifted8 into32-bit pose words. Negating raw-32768 can therefore produce a
scaled value corresponding to raw+32768. Existing decoded-frame consumers
accept signed16 raw values, so this bounded adapter explicitly refuses that
edge atomically. It does not narrow/wrap the source result. All reviewed
original115 control-turn clip keys fit this bounded raw-frame domain.

## Browser and native interfaces

Browser-pure `scripts/action-transition.mjs` exports:

- `actionRuntimeFlags(actionFlags,{retainedChildFlags})`.
- `isPlainActionLoop(actionFlags,options)`.
- `recoverActionFrame(frame,{baseFrame,previousFrame,runtimeFlags,mirrorMap,nativeCore})`.

`baseFrame` must be authentic complete AAAAAA key zero, verified separately
with `verifyMotionBaseClip`. `previousFrame`, when supplied, is the **previous
output** of this helper, not a previous raw clip packet. Both initialized and
retained frames contain all16 translation and rotation slots. The returned
frame is compatible with `recoverPcmdJointParameters` and
`recoverPlayerGeometry`; its original key index and prefix fields remain
available. Prefix fields are not themselves transformed by this pose helper.

Initialize the pose once, then retain output after each accepted key. Mirroring
is applied only to the new raw key, and drawing the same key twice does not
remirror missing retained channels. Resetting the whole pose to AAAAAA on each
action change is unnecessary for this explicit unlinked discrete branch.
Retaining prior output does not implement cross-fade interpolation or the
complete action state machine.

The native function is:

```text
fifa98_action_pose(pose112,key112,translationMask,rotationMask,runtimeFlags,mirror16)
```

Pose and key have16 rows of signed raw `[tx,ty,tz,qx,qy,qz,qw]`.
The initialized/retained pose is updated only on success. Return1 means
success;0 means unsupported/invalid input with no destination writes. Source
slots beyond15, invalid mirror permutations, non-signed16 components and
runtime linked/paused/external-phase flags`0x160` are refused. Supplied arrays
must be valid distinct storage. `fifa98_action_workspace()` provides256 words
of separate native transfer storage; `fifa98_action_workspace_words()` reports
its capacity. It does not share renderer, control-session or decoder buffers.

## Remaining transition boundaries

`0x800d4904` selects instantaneous unlinked replacement when there is no old
child, the blend duration is below512, or the original blend-enable global is
zero. Otherwise it creates a linked child and reciprocal blend weights.
Current source action blend parameters8/10, shifted8, can take that linked
path. Selecting an instantaneous inspection change must therefore remain
explicit rather than being described as the complete original transition.

Actions matching`(rawFlags&0x405)==0x405` call`0x800d5620`, which obtains old
motion references and calls`0x800d08e8` to search for an aligned new phase.
It also retains the old key fraction. Resetting phase to zero is an inspection
policy; the original alignment is not a simple normalized phase ratio.

The full updater`0x800d4044` handles marker, endpoint, periodic and blend
callbacks, linked child phases, non-loop completion and child removal. A
runtime loop-compatible flag word alone does not prove callback absence.
This helper consumes a supplied discrete key; it does not dispatch those
events or claim complete original loop/runtime behavior.

Nonzero action heading adjustments and runtime flag`0x1000` can alter the
pelvis heading supplied to key evaluation. Examples include action553 heading6
and actions560/561 headings256/-255. This implementation deliberately covers
the zero-heading pose branch. The inspection viewer must continue to disclose
its separate world-facing placement and unresolved action-relative heading,
phase matching, callbacks and blends.

## Evidence and tests

`inspectActionTransitionRecovery(backend,actionBytes)` verifies the full source
identities before exposing ten source regions, their complete disassembly,
the mirror table and derived per-action runtime flags. Backend SHA-256 is
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`.
The optional action table is the25108-byte original`ZMODAT.BIG/aiseqs.tbi`, SHA
`914994f8e4edef1878214d5c4fd967769e0c2946e033251e11b1577fca5fc270`.
Unknown sources return unsupported without inferred region or action labels.

Principal fingerprints:

| Address | Bytes | SHA-256 |
| --- | ---: | --- |
| `0x800b9ea4` flag-template conversion |64| `314d4368e0fd8afbd4bbd7f4e3970ac1352099a6a2e33894dd5f12017dc12f7a` |
| `0x800d45e8` child initialization |408| `901cf7cb140ec12e739b7c8d660c598eb1a0dda75b33c3567e1839b6415c39ec` |
| `0x800d0b44` full sparse pose application |1396| `b9542a6faa72fc0f584adff9847f22493f5d5266586d440592537aa67a2f1350` |
| `0x8012dc00` mirror table |64| `5438552a48c50977cb9a5313ce998b289c27389484f094ea576f4e923c853b2e` |

Four browser-module tests cover flag boundaries, root/non-root mirrors,
retention across keys/actions, and explicit unsupported-value refusal. Two
evidence tests cover unknown/mutated images and actual reviewed source data.
Five WASM tests bind native source/module hashes, compare5000 synthetic sparse
poses and every key across12 actual115 mirrored/ordinary control action
records, and verify transactional edge refusal. Synthetic tests embed no
commercial clip or executable bytes.
