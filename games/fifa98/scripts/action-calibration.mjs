/** Bounded BA460 calibration for an already resolved original action/clip.
 * This reads discrete source prefixes, not an interpolated pose or a kick
 * callback. Native results can supply the original queue parameter fields;
 * action eligibility and the general launch dispatcher remain separate.
 */
export function calibrateAction(core, clip, action, { atan, sine }, {
  startSelector = 0, endSelector = -100, startReference = 0, endReference = 1,
} = {}) {
  const exports = ['action_workspace', 'action_workspace_words', 'action_calibration_keys', 'action_calibration_vectors']
  if (!(core?.memory instanceof WebAssembly.Memory) || exports.some((name) => typeof core[`fifa98_${name}`] !== 'function') ||
      core.fifa98_action_workspace_words() < 768) throw new Error('Native action calibration is incomplete')
  const integer = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum
  if (!integer(clip?.flags,0,65535) || !integer(clip?.keyCount,1,4096) ||
      !Array.isArray(clip.frames) || clip.frames.length !== clip.keyCount ||
      !Array.isArray(clip.headerWords) || clip.headerWords.length !== 18 ||
      !clip.headerWords.every((value) => integer(value,0,65535)) ||
      !integer(action?.flagsRaw,0,0xffffffff) || !integer(action.headingOffsetRaw,-32768,32767) ||
      !integer(startSelector,-2147483648,2147483647) || !integer(endSelector,-2147483648,2147483647) ||
      !integer(startReference,0,1) || !integer(endReference,0,1) ||
      !Array.isArray(atan) || atan.length !== 257 || !atan.every((value) => integer(value,0,255)) ||
      !Array.isArray(sine) || sine.length !== 257 || !sine.every((value) => integer(value,0,0xffffffff))) throw new Error('Invalid original action calibration input')
  // First256 words belong to sparse pose application. All calibration transfer
  // buffers, including both lookup tables, fit in the separate trailing512.
  const base = core.fifa98_action_workspace() + 256 * 4
  const memory = new Int32Array(core.memory.buffer,base,512), ptr = (offset) => base + offset * 4
  const signedHalf = (value) => value << 16 >> 16
  memory.set([clip.flags,clip.keyCount,...clip.headerWords.slice(4,7).map(signedHalf)],0)
  const result = core.fifa98_action_calibration_keys(ptr(0),startSelector,endSelector,ptr(8))
  if (result === 0) return null
  if (result !== 1) throw new Error('Original action calibration rejected its header')
  const keys = Array.from(memory.slice(8,13))
  for (const [offset,key] of [[16,keys[2]],[32,keys[3]]]) {
    const prefix = clip.frames[key]?.prefixRaw
    if (!Array.isArray(prefix) || prefix.length !== 9 || !prefix.every((value) => integer(value,-32768,32767))) throw new Error('Invalid original action calibration prefix')
    memory.set(prefix,offset)
  }
  new Uint8Array(core.memory.buffer,ptr(64),257).set(atan); memory.set(sine,132)
  if (core.fifa98_action_calibration_vectors(ptr(16),ptr(32),startReference,endReference,
    (action.flagsRaw & 0x100) >>> 8,action.headingOffsetRaw,ptr(64),ptr(132),ptr(48)) !== 1) throw new Error('Original action calibration rejected its vectors')
  const [distance,heading,deltaX,deltaZ] = memory.slice(48,52)
  return { startPhase:keys[0],endPhase:keys[1],startKey:keys[2],endKey:keys[3],parameter:keys[4],
    queueParameter:keys[4] << 16 >> 16,distance,heading,displacement:[deltaX,deltaZ] }
}
