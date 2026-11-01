import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { inspectSteeringRecovery } from '../scripts/steering-recovery.mjs'

const wasm = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const build = JSON.parse(await readFile(new URL('../.engine-build/build.json', import.meta.url), 'utf8'))
const module = await WebAssembly.compile(wasm), core = (await WebAssembly.instantiate(module)).exports
if (!core.fifa98_player_steer || !core.fifa98_player_speed_clamp) throw new Error('Rebuild native module with steering.c before its tests')
const memory = new Uint32Array(core.memory.buffer), byteMemory = new Uint8Array(core.memory.buffer)
const workspace = core.fifa98_match_workspace() / 4
const atanAt = workspace, thresholdsAt = workspace + 128, stateAt = workspace + 160,
  inputAt = workspace + 200, detailAt = workspace + 220, profileAt = workspace + 240,
  capsAt = workspace + 260, outputAt = workspace + 280
const atan = Array.from({ length: 257 }, (_, index) => Math.floor(index / 2))
const thresholds = [228, 469, 171, 455, 114, 398], caps = [786432, 327680, 327680]
byteMemory.set(atan, atanAt * 4); memory.set(thresholds, thresholdsAt); memory.set(caps, capsAt)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const u = (value) => Number(BigInt.asUintN(32, BigInt(value)))
const s = (value) => BigInt.asIntN(32, BigInt(value >>> 0))
const lt = (left, right) => s(left) < s(right)
const wrapAdd = (left, right) => u(BigInt(left) + BigInt(right))
const wrapSub = (left, right) => u(BigInt(left) - BigInt(right))
const wrapMul = (left, right) => u(BigInt(left) * BigInt(right))
const neg = (value) => wrapSub(0, value)
const shift = (value, amount) => u(s(value) >> BigInt(amount))
const angle = (value) => u((value & 1023) > 512 ? (value & 1023) - 1024 : value & 1023)
const magnitude = (value) => (value & 1023) > 512 ? 1024 - (value & 1023) : value & 1023
const classify = (value, prior) => value <= thresholds[prior * 2] ? 0 : value <= thresholds[prior * 2 + 1] ? 1 : 2

function headingOracle(dx, dz) {
  let x = s(dx), z = s(dz)
  if (x === -2147483648n || z === -2147483648n) return null
  let base = 0, subtract = false
  if (z < 0n) { z = -z; base = 512; subtract = true }
  if (x < 0n) { x = -x; base = -base; subtract = !subtract }
  if (x > z) { [x, z] = [z, x]; base += subtract ? -256 : 256; subtract = !subtract }
  let result = 128
  if (x !== z) {
    let index
    if (x >= 0x800000n) {
      const ratio = (x << 32n) / z
      index = Number((ratio >> 24n) + ((ratio & 0x800000n) ? 1n : 0n))
    } else index = Number(((x << 8n) + (z >> 1n)) / z)
    result = atan[index]
  }
  return u(subtract ? base - result : base + result)
}

function steeringOracle(original, input) {
  const output = original.map(u), flags = output[6], prior = output[4]
  let facing = output[0], movement = output[1], delta = 0, slowdown = 0, status = output[7] & 65535
  const near = lt(input[1], 9), desired = near ? facing : headingOracle(input[2], input[3])
  if (desired === null) return null
  const callback = (action, heading, address) => ({ result: -2, state: original.map(u), detail: [0, action, heading, address] })
  const callbacksAvailable = (input[5] & 512) && output[9] !== 1
  if (lt(output[5], 19660)) movement = desired
  if (movement !== desired) {
    delta = angle(wrapSub(desired, movement))
    const difference = magnitude(wrapSub(desired, movement))
    if (difference >= 456) {
      const preferred = s(angle(wrapSub(output[2], movement)))
      if (preferred > 0n && s(delta) < 0n) delta = wrapAdd(delta, 1024)
      if (preferred < 0n && s(delta) > 0n) delta = wrapSub(delta, 1024)
    }
    if (difference >= 200 && !(flags & 9) && ((flags & 2 && lt(output[3], 28)) || lt(output[5], 19660)) && callbacksAvailable)
      return callback(difference < 342 ? s(delta) < 0n ? 1 : 2 : s(delta) < 0n ? 3 : 4, movement, 0x8008ceec)
    const coefficient = wrapAdd(wrapSub(input[4], shift(output[5], 16)), 14)
    let limit = wrapMul(coefficient, input[0])
    if (flags & 32) {
      limit = shift(limit, 1)
      if (lt(limit, 2)) limit = 2
      delta = lt(delta, neg(limit)) ? neg(limit) : lt(limit, delta) ? limit : delta
    } else if (lt(limit, delta)) {
      if (lt(wrapMul(coefficient, 4), wrapSub(delta, limit))) slowdown = 1
      delta = limit
    } else if (lt(delta, neg(limit))) {
      if (lt(wrapAdd(delta, limit), wrapMul(neg(coefficient), 4))) slowdown = 1
      delta = neg(limit)
    }
    movement = angle(wrapAdd(movement, delta))
  }
  let offset
  if ((flags & 16) && !near) {
    offset = angle(wrapSub(movement, facing)); status |= (flags & 2 ? 8 : 0) | 64
  } else if ((flags & 2) && !lt(output[5], 19661)) {
    offset = angle(wrapSub(output[2], movement))
    offset = lt(offset, u(-114)) ? u(-114) : lt(114, offset) ? 114 : offset
    offset = angle(wrapSub(wrapAdd(offset, movement), facing)); status |= 8
  } else offset = angle(wrapSub(output[2], facing))
  if ((prior === 0 || prior === 2) && !(flags & 9) && magnitude(offset) >= 428 && callbacksAvailable)
    return callback(5, output[1], 0x8008d11c)
  let limit = wrapMul(wrapAdd(input[4], 14), input[0])
  if (flags & 32) limit = shift(limit, 1)
  offset = lt(offset, neg(limit)) ? neg(limit) : lt(limit, offset) ? limit : offset
  if (near) delta = offset
  facing = angle(wrapAdd(facing, offset))
  const separation = angle(wrapSub(movement, facing)), difference = magnitude(wrapSub(movement, facing))
  const next = classify(difference, prior), side = next === 1 && s(separation) < 0n ? 1 : 0
  if (next !== prior || side !== (output[8] & 65535)) output[9] = (output[9] | 256) >>> 0
  output[0] = facing; output[1] = movement; output[3] = difference; output[4] = next
  output[7] = status; output[8] = side; output[10] = delta; output[11] = ((facing + 64) & 1023) >> 7
  output[12] = facing; output[13] = movement
  return { result: 1, state: output, detail: [slowdown, 0, 0, 0] }
}

function clampOracle(original, control, profile) {
  const outputState = original.map(u), flags = outputState[6]
  let target = control[0] >>> 0, status = outputState[7] & 65535
  if (flags & 448) {
    const limit = flags & 64 ? 98304 : flags & 128 ? 262144 : 425984
    if (lt(limit, target)) target = limit
  }
  if (!(control[1] & 65536) && lt(control[2], 160)) {
    if (lt(control[2], 8)) target = 0
    else {
      const limit = wrapAdd(shift(u(BigInt(control[2]) << 16n), 5), 65536)
      if (lt(limit, target)) target = limit
    }
  }
  const alternate = !!(flags & 1048576)
  let maximum = profile[alternate ? 1 : 0] >>> 0
  if (flags & 100663296) maximum = wrapSub(maximum, control[3])
  if (lt(maximum, target)) target = maximum
  if (alternate) status |= 4
  if (flags & 2) {
    const category = classify(magnitude(wrapSub(outputState[2], outputState[1])), outputState[4])
    if (!lt(target, shift(caps[category], 1))) status |= 1
  }
  const cap = caps[outputState[4]]
  if (lt(cap, target)) { target = cap; if (!lt(outputState[5], cap)) status |= 1 }
  if (control[4] && !(flags & 4)) target = 0
  outputState[7] = status
  return { state: outputState, output: [target, profile[alternate ? 3 : 2], profile[4], profile[alternate ? 6 : 5], profile[7], control[5], outputState[1]].map(u) }
}

function steer(state, input) {
  memory.set(state, stateAt); memory.set(input, inputAt); memory.fill(0xcccccccc, detailAt, detailAt + 4)
  const result = core.fifa98_player_steer(stateAt * 4, inputAt * 4, atanAt * 4, thresholdsAt * 4, detailAt * 4)
  return { result, state: [...memory.subarray(stateAt, stateAt + 14)], detail: [...memory.subarray(detailAt, detailAt + 4)] }
}

test('native steering matches built source and Wasm hashes, with no runtime imports', async () => {
  assert.equal(build.sources.find((source) => source.path === 'steering.c')?.sha256, hash(await readFile(new URL('./steering.c', import.meta.url))), 'Rebuild after steering.c changes')
  assert.equal(build.wasmSha256, hash(wasm)); assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('stationary snap, source face-movement rate and canonical half-turn tie are preserved', () => {
  const state = Array(14).fill(0); state[6] = 16
  const input = [1, 192, 192, 0, 10, 0x900]
  const first = steer(state, input)
  assert.deepEqual(first, steeringOracle(state, input))
  assert.equal(first.state[1], 256); assert.equal(first.state[0], 24)
  assert.equal(first.state[7] & 64, 64); assert.equal(first.state[10], 0)
  state[5] = 65536; state[6] = 0; state[2] = 512
  assert.deepEqual(steer(state, [1, 192, 0, u(-192), 10, 0]), steeringOracle(state, [1, 192, 0, u(-192), 10, 0]))
})

test('animation requests pause transactionally and original no-op gates permit continuation', () => {
  for (const [dx, dz, desiredFacing, action] of [[-192,0,0,1],[192,0,0,2],[0,-192,-100,3],[0,-192,100,4]]) {
    const state = Array(14).fill(0); state[2] = u(desiredFacing); state[5] = 65536; state[6] = 2
    const input = [1, 192, u(dx), u(dz), 10, 0x200]
    const paused = steer(state, input)
    assert.equal(paused.result, -2); assert.deepEqual(paused.state, state)
    assert.equal(paused.detail[1], action); assert.equal(paused.detail[3], 0x8008ceec)
    assert.deepEqual(paused, steeringOracle(state, input))
    for (const [ownerFlags, ownerState] of [[0,0],[0x200,1]]) {
      const guarded = [...state]; guarded[9] = ownerState
      assert.equal(steer(guarded, [...input.slice(0, 5), ownerFlags]).result, 1)
    }
  }
  const state = Array(14).fill(0); state[2] = 512
  const request = steer(state, [1, 0, 0, 0, 10, 0x200])
  assert.equal(request.result, -2); assert.equal(request.detail[1], 5); assert.equal(request.detail[3], 0x8008d11c)
})

test('steering matches independent BigInt word arithmetic across signed and wrapped domains', () => {
  let seed = 0x98cd44
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  for (let iteration = 0; iteration < 12000; iteration++) {
    const state = Array.from({ length: 14 }, next), input = Array.from({ length: 6 }, next)
    state[4] %= 3; input[0] &= 65535; input[5] = 0
    const expected = steeringOracle(state, input)
    assert.ok(expected); assert.deepEqual(steer(state, input), expected)
  }
})

test('speed clamps retain flag priority, range endpoints and unconditional class ceilings', () => {
  const profile = [1000000,1200000,111,222,333,444,555,666]
  const state = Array(14).fill(0)
  for (const [flags, distance, expected] of [[0,7,0],[0,8,81920],[0,159,391168],[0,160,786432],
    [64,192,98304],[128,192,262144],[256,192,425984],[448,192,98304]]) {
    state[6] = flags
    const control = [999999,0,distance,0,0,1]
    memory.set(state, stateAt); memory.set(control, inputAt); memory.set(profile, profileAt)
    assert.equal(core.fifa98_player_speed_clamp(stateAt*4,inputAt*4,profileAt*4,thresholdsAt*4,capsAt*4,outputAt*4),1)
    assert.equal(memory[outputAt], expected)
  }
  state[6] = 0
  for (const speed of [786431,786432]) {
    state[5] = speed
    memory.set(state,stateAt); memory.set([999999,65536,0,0,0,1],inputAt)
    core.fifa98_player_speed_clamp(stateAt*4,inputAt*4,profileAt*4,thresholdsAt*4,capsAt*4,outputAt*4)
    assert.equal(memory[outputAt], 786432, 'D530 delay-slot target clamp applies below and at current-speed cap')
    assert.equal(memory[stateAt + 7] & 1, speed < 786432 ? 0 : 1, 'Current speed gates only the status bit')
  }
})

test('speed selection matches independent BigInt oracle across original-word edge cases', () => {
  let seed = 0x98d2dc
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0)
  for (let iteration = 0; iteration < 12000; iteration++) {
    const state = Array.from({ length: 14 }, next), control = Array.from({ length: 6 }, next), profile = Array.from({ length: 8 }, next)
    state[4] %= 3; control[5] &= 65535
    memory.set(state,stateAt); memory.set(control,inputAt); memory.set(profile,profileAt)
    assert.equal(core.fifa98_player_speed_clamp(stateAt*4,inputAt*4,profileAt*4,thresholdsAt*4,capsAt*4,outputAt*4),1)
    const expected = clampOracle(state,control,profile)
    assert.deepEqual([...memory.subarray(stateAt,stateAt+14)],expected.state)
    assert.deepEqual([...memory.subarray(outputAt,outputAt+7)],expected.output)
  }
})

test('invalid classes, ticks, heading magnitudes and null pointers reject before state writes', () => {
  const state = Array(14).fill(17); state[4] = 3
  assert.equal(steer(state,[1,192,0,1,10,0]).result,0)
  state[4] = 0
  for (const input of [[65536,192,0,1,10,0],[1,192,0x80000000,1,10,0]]) {
    const result = steer(state,input); assert.equal(result.result,0); assert.deepEqual(result.state,state)
  }
  for (const index of [0,1,2,3,4]) {
    memory.set(state,stateAt); memory.set([1,192,0,1,10,0],inputAt)
    const pointers=[stateAt*4,inputAt*4,atanAt*4,thresholdsAt*4,detailAt*4]; pointers[index]=0
    assert.equal(core.fifa98_player_steer(...pointers),0)
    assert.deepEqual([...memory.subarray(stateAt,stateAt+14)],state)
  }
  memory.set([1,0,192,0,0,65536],inputAt)
  assert.equal(core.fifa98_player_speed_clamp(stateAt*4,inputAt*4,profileAt*4,thresholdsAt*4,capsAt*4,outputAt*4),0)
})

test('actual original evidence gates every region and provides exact steering tables', async (context) => {
  let backend
  try { backend=await readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)) }
  catch(error) { if(error.code==='ENOENT'){context.skip('Local original reference files are not prepared');return} throw error }
  const report=inspectSteeringRecovery(backend)
  assert.equal(report.status,'reconstruction-only'); assert.equal(report.regions.length,11)
  assert.deepEqual(report.tables.turnThresholds.values,thresholds)
  assert.deepEqual(report.tables.classSpeedCaps.values,caps)
})
