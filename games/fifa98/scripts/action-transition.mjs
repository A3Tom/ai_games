/** Original action/runtime flag conversion and bounded zero-heading key poses.
 * This module is browser-pure. It does not dispatch action callbacks, blend
 * clips, advance linked children or infer a wall-clock animation rate.
 */
const freeze = Object.freeze
function word(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Action flags must be an unsigned32 word')
  return value
}
export function actionRuntimeFlags(actionFlags, { retainedChildFlags = 0 } = {}) {
  return ((word(actionFlags) >>> 8) | (word(retainedChildFlags) & 0x80000020)) >>> 0
}
export function isPlainActionLoop(actionFlags, options) {
  const flags = actionRuntimeFlags(actionFlags, options)
  return !!(flags & 4) && !(flags & 0x160)
}
function mapValues(map) {
  if (!Array.isArray(map) || map.length !== 16 || map.some((index) => !Number.isInteger(index) || index < 0 || index >= 16) ||
      new Set(map).size !== 16 || map[0] !== 0 || map.some((index, source) => map[index] !== source)) throw new Error('Expected the bounded original mirror permutation')
  return map
}
function channels(frame, dense, { requireComplete = false } = {}) {
  if (!Array.isArray(frame?.translations) || !Array.isArray(frame?.rotations)) throw new Error('Expected decoded original pose channels')
  let tmask = 0, rmask = 0
  for (const [rows, field, size, offset] of [[frame.translations, 'valueRaw', 3, 0], [frame.rotations, 'quaternionRaw', 4, 3]]) {
    let mask = 0
    for (const row of rows) {
      if (!Number.isInteger(row?.poseIndex) || row.poseIndex < 0 || row.poseIndex >= 16 || (mask & (1 << row.poseIndex)) ||
          !Array.isArray(row[field]) || row[field].length !== size || row[field].some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) throw new Error('Pose channels must be unique signed16 rows in source slots0..15')
      mask |= 1 << row.poseIndex
      dense.set(row[field], row.poseIndex * 7 + offset)
    }
    if (requireComplete && mask !== 65535) throw new Error('Original initialized pose must supply all16 translation and rotation slots')
    if (offset === 0) tmask = mask; else rmask = mask
  }
  return [tmask, rmask]
}

/** Apply one original key after initialized/retained pose state, heading zero.
 * Mirroring is original D0DF0 behavior, including its distinct pelvis formula.
 * Output remains compatible with recoverPcmdJointParameters. A transformed
 * +32768 cannot fit that raw-frame ABI and is explicitly rejected, not wrapped.
 * Supply previousFrame to retain channels across keys/clip changes; otherwise
 * the authentic full AAAAAA base is an explicit isolated-inspection reset.
 */
export function recoverActionFrame(frame, { baseFrame, previousFrame, runtimeFlags, mirrorMap, nativeCore } = {}) {
  const flags = word(runtimeFlags), permutation = mapValues(mirrorMap)
  if (flags & 0x160) throw new Error('Linked, paused or externally advanced action runtime requires separate recovery')
  const pose = new Int32Array(112), key = new Int32Array(112)
  channels(baseFrame, pose, { requireComplete: true })
  if (previousFrame !== undefined) channels(previousFrame, pose, { requireComplete: true })
  const [translationMask, rotationMask] = channels(frame, key)
  if (nativeCore) {
    for (const name of ['fifa98_action_workspace', 'fifa98_action_workspace_words', 'fifa98_action_pose']) if (typeof nativeCore[name] !== 'function') throw new Error('Native action-pose recovery is missing; rebuild the module')
    if (nativeCore.fifa98_action_workspace_words() < 256) throw new Error('Native action-pose workspace is too small')
    const base = nativeCore.fifa98_action_workspace(), memory = new Int32Array(nativeCore.memory.buffer, base, 256)
    memory.set(pose, 0); memory.set(key, 128); memory.set(permutation, 240)
    if (nativeCore.fifa98_action_pose(base, base + 512, translationMask, rotationMask, flags, base + 960) !== 1) throw new Error('Native action pose exceeds the supported raw signed16 frame domain')
    pose.set(memory.subarray(0, 112))
  } else {
    for (let source = 0; source < 16; source++) {
      const destination = flags & 1 ? permutation[source] : source
      const sourceOffset = source * 7, destinationOffset = destination * 7
      if (translationMask & (1 << source)) {
        pose[destinationOffset] = key[sourceOffset] * ((flags & 1) && source === 0 ? -1 : 1)
        pose[destinationOffset + 1] = key[sourceOffset + 1]
        pose[destinationOffset + 2] = key[sourceOffset + 2] * ((flags & 1) && source !== 0 ? -1 : 1)
      }
      if (rotationMask & (1 << source)) {
        const q = Array.from(key.subarray(sourceOffset + 3, sourceOffset + 7))
        pose.set(!(flags & 1) ? q : source === 0 ? [-q[2], q[3], -q[0], q[1]] : [-q[0], -q[1], q[2], q[3]], destinationOffset + 3)
      }
    }
    if ([...pose].some((value) => value < -32768 || value > 32767)) throw new Error('Action pose exceeds the supported raw signed16 frame domain')
  }
  return freeze({ ...frame,
    translations: freeze(Array.from({ length: 16 }, (_, poseIndex) => freeze({ poseIndex, valueRaw: freeze(Array.from(pose.subarray(poseIndex * 7, poseIndex * 7 + 3))) }))),
    rotations: freeze(Array.from({ length: 16 }, (_, poseIndex) => freeze({ poseIndex, quaternionRaw: freeze(Array.from(pose.subarray(poseIndex * 7 + 3, poseIndex * 7 + 7))) }))),
    poseApplication: freeze({ runtimeFlags: flags, mirrored: !!(flags & 1), headingOffsetRaw: 0, retained: previousFrame !== undefined }),
  })
}
