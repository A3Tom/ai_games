/** New bounded composition of recovered native control routines for an isolated
 * horizontal player. This does not initialize or advance a complete match.
 * Each helper's branches and numeric behavior remain in compiled original code.
 * Source configuration is supplied explicitly rather than guessed from a roster.
 */
const words = (value, count, maximum = 0xffffffff) => Array.isArray(value) && value.length === count &&
  Array.from(value).every((item) => Number.isInteger(item) && item >= 0 && item <= maximum)
export function createControlSession(core, { sine, atan, thresholds, caps, bounds,
  turnCoefficient, motionFlags, entityFlags, entityState = 0, profileIndices = [10, 10] }) {
  const required = ['control_workspace', 'control_workspace_words', 'control_target', 'control_target_delta',
    'player_digital_direction', 'player_target_speed', 'player_steer', 'player_speed_clamp',
    'player_motion_integrate', 'player_motion_profile', 'player_heading_vector', 'player_render_position']
  if (required.some((name) => typeof core?.[`fifa98_${name}`] !== 'function') || !(core.memory instanceof WebAssembly.Memory)) throw new Error('Native control module is incomplete')
  if (!words(sine, 257) || !words(atan, 257, 255) || !words(thresholds, 6) || !words(caps, 3) ||
      !words(bounds, 3, 32767) || !words(profileIndices, 2, 19) ||
      ![turnCoefficient, motionFlags, entityFlags, entityState].every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) throw new Error('Invalid recovered control configuration')
  if (core.fifa98_control_workspace_words() < 512) throw new Error('Native control workspace is too small')
  const base = core.fifa98_control_workspace()
  const memory = new Uint32Array(core.memory.buffer, base, 512)
  const address = (offset) => base + offset * 4
  const put = (offset, data) => memory.set(data, offset)
  const get = (offset, count) => Array.from(memory.subarray(offset, offset + count))
  const expect = (result) => { if (result !== 1) throw new Error('Recovered native control step rejected its input') }
  let state, integrated, offsets, target, distance, tickCount
  // Separate storage from the renderer, skinning and motion decoder workspaces.
  put(0, sine); new Uint8Array(core.memory.buffer, address(257), 257).set(atan)
  put(330, thresholds); put(336, caps); put(412, bounds)
  expect(core.fifa98_player_motion_profile(...profileIndices, 0, 0, address(340)))
  const profile = get(340, 8)
  function configure() {
    put(0, sine); new Uint8Array(core.memory.buffer, address(257), 257).set(atan)
    put(330, thresholds); put(336, caps); put(340, profile); put(412, bounds)
  }
  function reset() {
    state = Array(14).fill(0); state[6] = motionFlags; state[9] = entityState
    integrated = [0, 0, 0, 0, 0, 0]; offsets = [0, 0]; target = [0, 0, 0]; distance = 0; tickCount = 0
  }
  function snapshot() {
    return { fixedPosition: [integrated[0] | 0, integrated[1] | 0],
      position: [(integrated[0] | 0) / 65536, (integrated[1] | 0) / 65536],
      speed: integrated[2] | 0, velocity: [integrated[3] | 0, integrated[4] | 0],
      facing: state[0] | 0, heading: state[1] | 0, turnClass: state[4],
      motionFlags: state[6], statusFlags: state[7], target: target.map((value) => value | 0),
      distance: distance | 0, offsets: offsets.map((value) => value | 0), ticks: tickCount,
      profile: [...profile], steeringState: [...state] }
  }
  function step(buttons, ticks = 1) {
    if (!Number.isInteger(buttons) || buttons < 0 || buttons > 15 || !Number.isInteger(ticks) || ticks < 1 || ticks > 255) throw new Error('Control test requires a direction nibble and 1–255 ticks')
    // Stage the entire composition. No public state commits until every native
    // helper succeeds; an unresolved animation request cannot partially move it.
    configure()
    put(400, offsets); put(360, state); memory[367] = 0
    // The complete dispatcher clears/recomputes these on every update. This
    // isolated test reapplies its explicit source-branch configuration.
    memory[366] = motionFlags; memory[369] = entityState
    // Inspection facing reference equals the current player position. The
    // original A6020..A6054 zero-delta branch retains current facing; live
    // action/ball reference selection is deliberately outside this composition.
    memory[362] = memory[360]
    put(460, integrated); put(408, [integrated[0] >> 16, 0, integrated[1] >> 16])
    if ((core.fifa98_player_digital_direction(buttons, address(404)) >>> 0) === 0xffffffff) throw new Error('Native direction mapping failed')
    put(380, [0, 0, 0, memory[404], memory[405], ticks, 0])
    expect(core.fifa98_control_target(address(400), address(380), address(408), address(412), address(0), address(416)))
    put(420, [0, 0, 0, 0, 0, 0, 0])
    expect(core.fifa98_control_target_delta(address(408), address(416), address(420)))
    put(430, [0, entityFlags]); put(434, [1, 0, 0, profile[0], 0])
    expect(core.fifa98_player_target_speed(address(430), address(434)))
    put(380, [ticks, memory[423], memory[424], memory[425], turnCoefficient, entityFlags])
    const result = core.fifa98_player_steer(address(360), address(380), address(257), address(330), address(390))
    if (result === -2) return { advanced: false, reason: 'animation-required', request: get(390, 4), state: snapshot() }
    expect(result)
    put(440, [memory[430], memory[426], memory[423], 0, memory[390], ticks])
    expect(core.fifa98_player_speed_clamp(address(360), address(440), address(340), address(330), address(336), address(448)))
    expect(core.fifa98_player_motion_integrate(address(460), address(448), address(0)))
    state = get(360, 14); integrated = get(460, 6); state[5] = integrated[2]
    offsets = get(400, 2); target = get(416, 3); distance = memory[423]; tickCount += ticks
    return { advanced: true, state: snapshot() }
  }
  function facingVector() {
    configure()
    expect(core.fifa98_player_heading_vector(state[0], address(0), address(468)))
    return get(468, 2).map((value) => value | 0)
  }
  function renderPosition() {
    put(480, [integrated[0], 0, integrated[1]])
    expect(core.fifa98_player_render_position(address(480), address(484)))
    return get(484, 3).map((value) => value | 0)
  }
  reset()
  return { step, reset, snapshot, facingVector, renderPosition }
}
