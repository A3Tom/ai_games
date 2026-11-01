import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { selectLocomotionAction, advanceLocomotionPhase, selectRunVariantIndex } from '../scripts/locomotion-animation.mjs'

const directory = new URL('../.engine-build/', import.meta.url)
const bytes = await readFile(new URL('fifa98-core.wasm', directory))
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'))
const module = await WebAssembly.compile(bytes)
const core = (await WebAssembly.instantiate(module)).exports

test('tested locomotion module binds to the reviewed C source and has no runtime imports', async () => {
  const sha = (input) => createHash('sha256').update(input).digest('hex')
  assert.equal(manifest.sources.find((row) => row.path === 'locomotion-animation.c')?.sha256, sha(await readFile(new URL('./locomotion-animation.c', import.meta.url))))
  assert.equal(manifest.wasmSha256, sha(bytes))
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('native source selector matches JS across original signed branches and table boundaries', () => {
  const stateBuffer = new Uint32Array(core.memory.buffer, core.fifa98_locomotion_state(), 3)
  const motionBuffer = new Uint32Array(core.memory.buffer, core.fifa98_locomotion_motion(), 9)
  const categoryBuffer = new Uint8Array(core.memory.buffer, core.fifa98_locomotion_categories(), 252)
  const actionBuffer = new Uint16Array(core.memory.buffer, core.fifa98_locomotion_actions(), 330)
  let seed = 0x980b92bc
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  for (let sample = 0; sample < 5000; sample++) {
    const tables = {
      categoryBytes: Array.from({ length: 252 }, () => random() % 11),
      actionHalfwords: Array.from({ length: 330 }, (_, index) => random() % (index < 110 && index % 2 ? 65536 : 661)),
    }
    const state = [random() % 12, random(), random() & 65535]
    const motion = [(random() % (17 * 65536)), random() % 3,
      sample % 3 ? ((random() % 100) - 50) : random(), random(), random(), random(), random(), random() % 661, random() & 65535]
    stateBuffer.set(state); motionBuffer.set(motion); categoryBuffer.set(tables.categoryBytes); actionBuffer.set(tables.actionHalfwords)
    const actionId = core.fifa98_locomotion_select(stateBuffer.byteOffset, motionBuffer.byteOffset, categoryBuffer.byteOffset, actionBuffer.byteOffset) >>> 0
    assert.deepEqual({ actionId, state: [...stateBuffer] }, selectLocomotionAction(state, motion, tables))
  }
  const before = [...stateBuffer]
  motionBuffer[0] = 18 * 65536
  assert.equal(core.fifa98_locomotion_select(stateBuffer.byteOffset, motionBuffer.byteOffset, categoryBuffer.byteOffset, actionBuffer.byteOffset) >>> 0, 0xffffffff)
  assert.deepEqual([...stateBuffer], before)
  assert.equal(core.fifa98_locomotion_select(0, motionBuffer.byteOffset, categoryBuffer.byteOffset, actionBuffer.byteOffset) >>> 0, 0xffffffff)
})

test('native same-loop phase arithmetic matches independent integer expectations', () => {
  const stateBuffer = new Uint32Array(core.memory.buffer, core.fifa98_locomotion_phase_state(), 3)
  let seed = 0x980d4044
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  for (let sample = 0; sample < 5000; sample++) {
    const clock = random() % 1000000000, stamp = clock - (random() % Math.min(4000, clock + 1))
    const endpoint = 1 + random() % 1000000, phase = random() % endpoint
    const delta = random() % (6 * 65536 + 1), rate = random() % (2 * 65536 + 1)
    const state = [clock, stamp, phase], nextClock = clock + Math.floor(delta / 256)
    const elapsed = Math.min(3072, nextClock - stamp)
    const advance = Number((BigInt(elapsed) * BigInt(rate) + 32768n) >> 16n)
    const expected = [nextClock, advance ? nextClock : stamp, (phase + advance) % endpoint]
    stateBuffer.set(state)
    assert.equal(core.fifa98_locomotion_phase(stateBuffer.byteOffset, delta, rate, endpoint), 1)
    assert.deepEqual([...stateBuffer], expected)
    assert.deepEqual([...stateBuffer], advanceLocomotionPhase(state, delta, rate, endpoint))
  }
  const before = [...stateBuffer]
  assert.equal(core.fifa98_locomotion_phase(stateBuffer.byteOffset, 0, 65536, 4193281), 0)
  assert.deepEqual([...stateBuffer], before)
  for (let byte = 0; byte < 256; byte++) for (const halfword of [0, 4, 100, 252, 255, 65535]) {
    assert.equal(core.fifa98_locomotion_run_variant(byte, halfword), selectRunVariantIndex(byte, halfword))
  }
  assert.equal(core.fifa98_locomotion_run_variant(256, 0), -1)
})
