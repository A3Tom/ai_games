import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { recoverBallVisualSpeed, advanceBallVisualPhase } from '../scripts/ball-visual-phase.mjs'
const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const build = JSON.parse(await readFile(new URL('../.engine-build/build.json', import.meta.url), 'utf8'))
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports
const base = core.fifa98_match_workspace(), memory = new Uint32Array(core.memory.buffer, base, 512)
const hash = (value) => createHash('sha256').update(value).digest('hex')
let random = 0x76580
const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0)

test('ball phase native source hash and import-free module match the build manifest', async () => {
  assert.equal(hash(bytes), build.wasmSha256)
  assert.equal(hash(await readFile(new URL('ball-motion.c', import.meta.url))), build.sources.find((entry) => entry.path === 'ball-motion.c').sha256)
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('native source norm matches independent JavaScript/BigInt-validated recovery', () => {
  for (const x of [0, 1, 3, 0x7fffffff, 0x80000000, 0xffffffff]) for (const z of [0, 1, 7, 0x80000000, 0xffffffff]) {
    assert.equal(core.fifa98_ball_visual_speed(x, z) >>> 0, recoverBallVisualSpeed(x, z))
  }
  for (let i = 0; i < 16000; i++) {
    const x = next(), z = next()
    assert.equal(core.fifa98_ball_visual_speed(x, z) >>> 0, recoverBallVisualSpeed(x, z))
  }
})

test('native both phase paths match source arithmetic and preserve source pause gates', () => {
  const speeds = [0, 1, 32767, 32768, 131071, 131072, 0x7fffffff, 0x80000000, 0xffffffff]
  for (let i = 0; i < 18000; i++) {
    const acc = next() & 262143, phase = next() & 3, speed = i < speeds.length ? speeds[i] : next()
    const ticks = next() % 7, shortPath = !!(next() & 1), blocked = i % 11 ? 0 : next(), flags = i % 7 ? 0 : 32
    const expected = advanceBallVisualPhase([acc, phase], speed, ticks, { shortPath, blocked, globalFlags: flags })
    memory.set([acc, phase, 0xfeed1234], 0)
    assert.equal(core.fifa98_ball_visual_phase(base, speed, ticks, +shortPath, blocked, flags), expected.status === 'held' ? 2 : 1)
    assert.deepEqual(Array.from(memory.slice(0, 3)), [...expected.state, 0xfeed1234])
  }
})

test('new native ABI rejects invalid inputs before any phase write', () => {
  for (const [acc, phase, ticks, mode] of [[262144, 0, 1, 0], [0, 4, 1, 0], [0, 0, 7, 0], [0, 0, 1, 2]]) {
    memory.set([acc, phase, 0xfeed1234], 0)
    assert.equal(core.fifa98_ball_visual_phase(base, 65536, ticks, mode, 0, 0), 0)
    assert.deepEqual(Array.from(memory.slice(0, 3)), [acc, phase, 0xfeed1234])
  }
  assert.equal(core.fifa98_ball_visual_phase(0, 0, 0, 0, 0, 0), 0)
})
