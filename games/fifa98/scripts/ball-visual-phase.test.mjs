import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { recoverBallVisualSpeed, advanceBallVisualPhase, inspectBallVisualPhase } from './ball-visual-phase.mjs'

const u = (value) => Number(BigInt.asUintN(32, value))
const s = (value) => BigInt.asIntN(32, BigInt(value >>> 0))
const normOracle = (dx, dz) => {
  let x = s(dx), z = s(dz)
  if (x < 0n) x = s(u(-x))
  if (z < 0n) z = s(u(-z))
  return u(x + z - ((z < x ? z : x) >> 1n))
}
const phaseOracle = (acc, speed, ticks, shortPath) => {
  const high = s(speed) > (shortPath ? 131071n : 32767n)
  const factor = high ? (shortPath ? 3755n : 1134n) : 25032n
  const add = high ? (shortPath ? 50065n : 12516n) : 0n
  const rate = BigInt.asUintN(32, ((factor * s(speed) + 32768n) >> 16n) + add)
  const result = Number((BigInt(acc) + rate * BigInt(ticks)) & 262143n)
  return [result, result >>> 16]
}
let random = 719312
const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0)

test('original displacement norm preserves source signs, odd halves and wrapped extremes', () => {
  assert.equal(recoverBallVisualSpeed(3, 5), 7)
  assert.equal(recoverBallVisualSpeed(-3, -5), 7)
  const values = [0, 1, 2, 3, 32767, 32768, 65536, 0x7fffffff, 0x80000000, 0xffffffff]
  for (const x of values) for (const z of values) assert.equal(recoverBallVisualSpeed(x, z), normOracle(x, z))
  for (let i = 0; i < 12000; i++) {
    const x = next(), z = next()
    assert.equal(recoverBallVisualSpeed(x, z), normOracle(x, z))
  }
})

test('both original phase paths preserve threshold inequalities, rounding and low-word arithmetic', () => {
  const speeds = [0, 1, 32766, 32767, 32768, 65536, 131070, 131071, 131072, 0x7fffffff, 0x80000000, 0xffffffff]
  for (const shortPath of [false, true]) for (const speed of speeds) for (let ticks = 0; ticks <= 6; ticks++) {
    const state = [262140, 3], copy = [...state]
    const actual = advanceBallVisualPhase(state, speed, ticks, { shortPath })
    assert.equal(actual.status, 'advanced')
    assert.deepEqual(actual.state, phaseOracle(state[0], speed, ticks, shortPath))
    assert.deepEqual(state, copy)
  }
  assert.notDeepEqual(advanceBallVisualPhase([0, 0], 65536, 1).state,
    advanceBallVisualPhase([0, 0], 65536, 1, { shortPath: true }).state)
  for (let i = 0; i < 18000; i++) {
    const acc = next() & 262143, speed = next(), ticks = next() % 7, shortPath = !!(next() & 1)
    assert.deepEqual(advanceBallVisualPhase([acc, acc >>> 16], speed, ticks, { shortPath }).state,
      phaseOracle(acc, speed, ticks, shortPath))
  }
})

test('source gates hold both words and other numeric flags do not pause the phase', () => {
  const input = [789, 2]
  for (const settings of [{ blocked: 1 }, { blocked: 0xffffffff }, { globalFlags: 32 }, { globalFlags: -1 }]) {
    const result = advanceBallVisualPhase(input, 65536, 6, settings)
    assert.equal(result.status, 'held'); assert.deepEqual(result.state, input)
  }
  assert.equal(advanceBallVisualPhase(input, 65536, 1, { globalFlags: 31 }).status, 'advanced')
  assert.deepEqual(advanceBallVisualPhase([0, 0], 0, 0).state, [0, 0])
  assert.deepEqual(advanceBallVisualPhase([65535, 0], 0, 6).state, [65535, 0])
})

test('source grouping uses last consumed displacement and total ticks', () => {
  const lastSpeed = recoverBallVisualSpeed(0x20000, 0x10000)
  const grouped = advanceBallVisualPhase([0, 0], lastSpeed, 2)
  assert.deepEqual(grouped.state, phaseOracle(0, lastSpeed, 2, false))
  const first = advanceBallVisualPhase([0, 0], recoverBallVisualSpeed(0x40000, 0x10000), 1)
  const ungrouped = advanceBallVisualPhase(first.state, lastSpeed, 1)
  assert.notEqual(grouped.state[0], ungrouped.state[0])
})

test('invalid state, tick, mode and word domains are rejected without mutation', () => {
  for (const state of [[-1, 0], [262144, 0], [0, -1], [0, 4], [0], null]) {
    assert.throws(() => advanceBallVisualPhase(state, 0, 1), /Invalid/)
  }
  for (const ticks of [-1, 7, 0.5, NaN]) assert.throws(() => advanceBallVisualPhase([0, 0], 0, ticks), /Invalid/)
  for (const settings of [{ shortPath: 1 }, { blocked: 0.5 }, { globalFlags: 0x100000000 }]) {
    assert.throws(() => advanceBallVisualPhase([0, 0], 0, 1, settings), /Invalid/)
  }
  for (const value of [Infinity, NaN, 0.5, -0x80000001, 0x100000000]) {
    assert.throws(() => recoverBallVisualSpeed(value, 0), /Invalid/)
    assert.throws(() => advanceBallVisualPhase([0, 0], value, 1), /Invalid/)
  }
})

test('report rejects unknown images and fingerprints the optional exact local sources', async () => {
  const unknown = await inspectBallVisualPhase(new Uint8Array(0), new Uint8Array(0))
  assert.equal(unknown.status, 'unsupported'); assert.deepEqual(unknown.regions, [])
  let backend, resident
  try {
    backend = await readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url))
    resident = await readFile(new URL('../.work/reference/disc/SLES_009.14', import.meta.url))
  } catch (error) { if (error.code === 'ENOENT') return; throw error }
  const actual = await inspectBallVisualPhase(backend, resident)
  assert.equal(actual.status, 'reconstruction-only'); assert.equal(actual.regions.length, 10)
  assert.equal(actual.tickSeconds, null); assert.equal(actual.simulation.speedThreshold, 32767)
  assert.equal(actual.shortPath.speedThreshold, 131071)
  assert.ok(actual.regions.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)))
  backend[0] ^= 1
  assert.equal((await inspectBallVisualPhase(backend, resident)).status, 'unsupported')
})
