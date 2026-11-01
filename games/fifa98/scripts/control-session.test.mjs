import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createControlSession } from './control-session.mjs'
const module = await WebAssembly.compile(await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url)))
const core = (await WebAssembly.instantiate(module)).exports
// Deliberately synthetic lookup values. The native arithmetic has separate
// source-table/oracle coverage; these tests exercise composition and isolation.
const fixture = { sine: Array.from({ length: 257 }, (_, i) => i * 256),
  atan: Array.from({ length: 257 }, (_, i) => Math.floor(i / 2)),
  thresholds: [228,469,171,455,114,398], caps: [786432,327680,327680],
  bounds: [1824,2544,228], turnCoefficient: 10, motionFlags: 16, entityFlags: 0x900 }
test('control composition accelerates, stops on release, reverses and stops at target boundary', () => {
  const session = createControlSession(core, fixture)
  for (let i = 0; i < 180; i++) assert.equal(session.step(1).advanced, true)
  const moving = session.snapshot()
  assert.equal(moving.speed, 334233); assert.equal(moving.heading, 256)
  assert.ok(moving.position[0] > 800); assert.equal(moving.position[1], 0)
  assert.deepEqual(session.renderPosition(), [(moving.fixedPosition[0] >> 16) * 2, -6, 0], 'native placement quantizes high16 before doubling')
  for (let i = 0; i < 100; i++) session.step(0)
  const stopped = session.snapshot()
  assert.equal(stopped.speed, 0); assert.deepEqual(stopped.offsets, [0, 0])
  assert.equal(stopped.position[1], 0, 'zero-delta facing reference preserves heading while stopping')
  for (let i = 0; i < 30; i++) session.step(0)
  assert.deepEqual(session.snapshot().position, stopped.position)
  for (let i = 0; i < 150; i++) session.step(2)
  assert.ok(session.snapshot().position[0] < stopped.position[0] - 500)
  session.reset()
  for (let i = 0; i < 1500; i++) session.step(1)
  assert.equal(session.snapshot().target[0], fixture.bounds[0])
  assert.ok(session.snapshot().position[0] <= fixture.bounds[0])
  assert.ok(session.snapshot().distance < 8); assert.equal(session.snapshot().speed, 0)
})
test('opposing keys use the source neutral mapper; reset and snapshots do not leak mutable state', () => {
  const session = createControlSession(core, fixture)
  for (let i = 0; i < 80; i++) session.step(3)
  assert.deepEqual(session.snapshot().position, [0, 0]); assert.equal(session.snapshot().speed, 0)
  session.step(8, 10)
  const leaked = session.snapshot(); leaked.position[0] = 1e9; leaked.steeringState.fill(99); leaked.profile.fill(0)
  assert.notEqual(session.snapshot().position[0], 1e9)
  session.reset(); assert.equal(session.snapshot().ticks, 0)
  assert.deepEqual(session.snapshot().fixedPosition, [0, 0])
  const before = session.snapshot()
  for (const input of [[16,1],[1,0],[1,256],[NaN,1]]) assert.throws(() => session.step(...input), /requires/)
  assert.deepEqual(session.snapshot(), before)
})
test('native animation requests halt the composition without partially committing targets or position', () => {
  const session = createControlSession(core, { ...fixture, entityFlags: 0xb00 })
  session.step(8, 1)
  const before = session.snapshot()
  const result = session.step(4, 1)
  assert.equal(result.advanced, false); assert.equal(result.reason, 'animation-required')
  assert.ok(result.request[1] >= 1 && result.request[1] <= 5)
  assert.deepEqual(session.snapshot(), before)
})
test('separate sessions restore their own tables, profile and bounds in shared transfer storage', () => {
  const first = createControlSession(core, fixture)
  const other = createControlSession(core, { ...fixture, bounds: [100,200,20], profileIndices: [0,0] })
  for (let i = 0; i < 120; i++) { first.step(1); other.step(1) }
  assert.ok(first.snapshot().position[0] > 400)
  assert.ok(other.snapshot().target[0] <= 100)
  assert.equal(first.snapshot().profile[0], 334233)
  assert.equal(other.snapshot().profile[0], 281804)
})
