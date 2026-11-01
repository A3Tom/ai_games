import { sampleMotionPose, selectMotionKeys } from './motion-playback.mjs'
import { actionRuntimeFlags, isPlainActionLoop, recoverActionFrame } from './action-transition.mjs'

/** Inspection composition of the original numerical action selector and loop
 * phase update. The callback-free key path retains sparse pose channels and
 * mirrors new key channels. Cross-action phase alignment, callbacks, heading
 * offsets and blending remain excluded; phase restarts are inspection policy.
 */
export function createControlAnimation(core, tables, clips, { baseFrame } = {}) {
  const names = ['state', 'motion', 'categories', 'actions', 'phase_state', 'select', 'phase']
  if (names.some((name) => typeof core?.[`fifa98_locomotion_${name}`] !== 'function') || !(clips instanceof Map) ||
      !Array.isArray(tables?.categoryBytes) || tables.categoryBytes.length !== 252 ||
      !Array.isArray(tables?.actionHalfwords) || tables.actionHalfwords.length !== 330 ||
      !Array.isArray(tables?.actions) || !tables.runVariant || !Array.isArray(tables.mirrorMap) || !baseFrame) throw new Error('Invalid native locomotion setup')
  const categories = new Uint8Array(core.memory.buffer, core.fifa98_locomotion_categories(), 252)
  const actions = new Uint16Array(core.memory.buffer, core.fifa98_locomotion_actions(), 330)
  const selector = new Uint32Array(core.memory.buffer, core.fifa98_locomotion_state(), 3)
  const motion = new Uint32Array(core.memory.buffer, core.fifa98_locomotion_motion(), 9)
  const phaseBuffer = new Uint32Array(core.memory.buffer, core.fifa98_locomotion_phase_state(), 3)
  const byId = new Map(tables.actions.map((entry) => [entry.actionId, entry]))
  let state, phase, selected, rate, retainedPose, sampledPose,markerHeading
  function reset() { state = [0, 65536, 0]; phase = [0, 0, 0]; selected = null; rate = 65536; retainedPose = undefined; sampledPose = undefined;markerHeading=0 }
  function step(player, ticks = 0) {
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > 6) throw new Error('Animation test requires 0–6 source ticks')
    categories.set(tables.categoryBytes); actions.set(tables.actionHalfwords); selector.set(state)
    motion.set([player.speed, player.turnClass, player.steeringState[10], player.facing, player.heading,
      player.steeringState[9], player.ticks, tables.runVariant.actionId, tables.runVariant.referenceRaw])
    const actionId = core.fifa98_locomotion_select(core.fifa98_locomotion_state(), core.fifa98_locomotion_motion(),
      core.fifa98_locomotion_categories(), core.fifa98_locomotion_actions()) >>> 0
    const entry = byId.get(actionId), clip = clips.get(actionId)
    if (actionId === 0xffffffff || !entry || !clip) throw new Error(`Unsupported locomotion action ${actionId}`)
    const nextState = Array.from(selector)
    const endpoint = (clip.keyCount - 1) * (512 << (clip.flags & 1))
    // The original updater does not overwrite the child playback rate when
    // the selector's companion rate word is zero.
    const changed = selected?.actionId !== actionId
    const nextRate = changed ? 65536 : (nextState[1] || rate)
    // Source B9E8C action-start subset: retain the selected category for30
    // whole ticks. Other transition callbacks/blends remain outside this test.
    if (changed) nextState[2] = (player.ticks + 30) & 65535
    phaseBuffer.set(changed ? [phase[0], phase[0], 0] : phase)
    const plainLoop = isPlainActionLoop(entry.actionFlags)
    // Linked/held/nonloop actions need additional callbacks. Display their
    // known first key instead of inventing those mutations or looping them.
    if (plainLoop) {
      if (core.fifa98_locomotion_phase(core.fifa98_locomotion_phase_state(), ticks * 65536, nextRate, endpoint) !== 1) throw new Error('Native locomotion phase update rejected its input')
    } else phaseBuffer[2] = 0
    const rawFrame = sampleMotionPose(clip, phaseBuffer[2])
    if (!(actionRuntimeFlags(entry.actionFlags) & 0x160)) {
      sampledPose = recoverActionFrame(rawFrame, { baseFrame, previousFrame: retainedPose,
        runtimeFlags: actionRuntimeFlags(entry.actionFlags), mirrorMap: tables.mirrorMap, nativeCore: core })
      retainedPose = sampledPose
    } else sampledPose = rawFrame
    state = nextState; rate = nextRate; phase = Array.from(phaseBuffer); selected = entry
    // The selector's category is source owner byte36. BA2E4 selects facing132
    // for byte0, movement heading136 otherwise, then adds action row+6.
    markerHeading=((state[0]===0?player.facing:player.heading)+(entry.headingOffsetRaw??0))|0
    return pose()
  }
  function pose() {
    if (!selected) throw new Error('Select an original locomotion action first')
    const clip=clips.get(selected.actionId),keys=selectMotionKeys(clip,phase[2])
    return { actionId: selected.actionId, clipName: selected.clipName, rate, phase: phase[2],
      frame: sampledPose, selectorState: [...state], mirrored: !!(actionRuntimeFlags(selected.actionFlags) & 1),
      marker:{prefixA:[...clip.frames[keys.keyIndex].prefixRaw],prefixB:[...clip.frames[keys.nextKeyIndex].prefixRaw],
        fraction16:keys.fraction16,headingRaw:markerHeading,headingOffsetRaw:selected.headingOffsetRaw??0,mirror:!!(actionRuntimeFlags(selected.actionFlags)&1)},
      held: !isPlainActionLoop(selected.actionFlags) }
  }
  reset()
  return { reset, step, pose }
}
