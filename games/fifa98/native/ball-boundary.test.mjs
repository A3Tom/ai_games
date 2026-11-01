import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { inspectBallBoundaryRecovery } from '../scripts/ball-boundary-recovery.mjs'
const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const build = JSON.parse(await readFile(new URL('../.engine-build/build.json', import.meta.url), 'utf8'))
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports
const base = core.fifa98_control_workspace(), memory = new Uint32Array(core.memory.buffer, base, 800)
const ptr = (word) => base + 4 * word
const hash = (value) => createHash('sha256').update(value).digest('hex')
const u = (value) => Number(BigInt.asUintN(32, BigInt(value)))
const s = (value) => BigInt.asIntN(32, BigInt(value >>> 0))
const multiply = (a, b) => u((s(a) * s(b) + 32768n) >> 16n)
const divide = (a, b) => u((s(a) << 16n) / s(b))
const q = (value) => u(BigInt(value) << 16n)
const fixture = [1824, 2544, 5, 228, 152, 6, 6, q(2691), q(2615), q(2625), q(2701)]

function planeOracle(kind, from, to, geometry, earliest) {
  const side = [0, 3].includes(kind), outer = kind >= 2
  let coordinate = side ? geometry[3] + (geometry[5] >> 1) + (outer ? geometry[2] : -geometry[2]) :
    geometry[4] + (geometry[6] >> 1) - (outer ? 0 : 2 * geometry[2])
  if (side && s(to[0]) <= 0n) coordinate = -coordinate
  const axis = side ? 0 : 1, delta = u(s(to[axis]) - s(from[axis]))
  if (!delta) return null
  const time = divide(u(BigInt(coordinate) * 65536n - s(from[axis])), delta)
  if (s(time) < 0n || time >= earliest) return null
  const point = from.map((start, i) => u(s(start) + s(multiply(time, u(s(to[i]) - s(start))))))
  const absZ = s(point[2]) < 0n ? -s(point[2]) : s(point[2])
  if (absZ <= BigInt(geometry[1]) * 65536n) return null
  if (!side) {
    const halfWidth = geometry[3] + (geometry[5] >> 1) + (outer ? geometry[2] : -geometry[2])
    const absX = s(point[0]) < 0n ? -s(point[0]) : s(point[0])
    if (absX >= BigInt(halfWidth) * 65536n || absZ >= s(geometry[outer ? 9 : 8])) return null
  } else {
    const roof = geometry[4] + (geometry[6] >> 1) - (outer ? 0 : 2 * geometry[2])
    const ratio = divide(point[1], q(roof))
    const lower = geometry[outer ? 10 : 7], upper = geometry[outer ? 9 : 8]
    let limit = s(lower)
    if (s(ratio) > 65536n) limit = s(upper)
    else if (s(ratio) >= 0n) limit -= s(multiply(ratio, lower)) - s(multiply(ratio, upper))
    if (outer) limit += 524288n
    if (absZ >= limit) return null
  }
  return [time, ...point]
}
function invoke(kind, from, to, geometry = fixture, earliest = 65537) {
  memory.set(from, 0); memory.set(to, 4); memory.set(geometry, 8); memory.set([11, 22, 33, 44], 24)
  const result = core.fifa98_ball_goal_plane(kind, ptr(0), ptr(4), ptr(8), earliest, ptr(24))
  return { result, output: Array.from(memory.slice(24, 28)) }
}

test('built native boundary source and module hashes match', async () => {
  assert.equal(hash(bytes), build.wasmSha256)
  assert.equal(hash(await readFile(new URL('ball-boundary.c', import.meta.url))), build.sources.find((entry) => entry.path === 'ball-boundary.c')?.sha256)
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})
test('outside flag uses source strict radius-adjusted endpoints and signed axes', () => {
  for (const x of [-1830, -1829, -1828, 0, 1828, 1829, 1830]) for (const z of [-2550, -2549, -2548, 0, 2548, 2549, 2550]) {
    memory.set([q(x), q(0), q(z)], 0)
    assert.equal(core.fifa98_ball_outside_pitch(ptr(0), 1824, 2544, 5), Math.abs(x) > 1829 || Math.abs(z) > 2549 ? 16 : 0)
  }
  memory.set([q(1829) + 1, 0, 0], 0)
  assert.equal(core.fifa98_ball_outside_pitch(ptr(0), 1824, 2544, 5), 16)
  assert.equal(core.fifa98_ball_outside_pitch(0, 1824, 2544, 5), -1)
  for (const bad of [[0, 2544, 5], [1824, 32767, 1], [1824, 2544, 257]]) assert.equal(core.fifa98_ball_outside_pitch(ptr(0), ...bad), -1)
})
test('four original constrained planes preserve strict seams, mirrored sides and earliest ties', () => {
  for (let kind = 0; kind < 4; kind++) for (const sign of [-1, 1]) {
    const side = kind === 0 || kind === 3
    const from = side ? [q(sign * 200), q(80), q(sign * 2570)] : [0, q(130), q(sign * 2570)]
    const to = side ? [q(sign * 250), q(80), q(sign * 2570)] : [0, q(170), q(sign * 2570)]
    const expected = planeOracle(kind, from, to, fixture, 65537)
    assert.ok(expected); assert.deepEqual(invoke(kind, from, to), { result: 1, output: expected })
    assert.deepEqual(invoke(kind, from, to, fixture, expected[0]), { result: 0, output: [11, 22, 33, 44] })
    const seamFrom = [...from], seamTo = [...to]; seamFrom[2] = seamTo[2] = q(sign * 2544)
    assert.equal(invoke(kind, seamFrom, seamTo).result, 0)
    assert.equal(invoke(kind, from, from).result, 0)
  }
  const edge = fixture[3] + fixture[5] / 2 - fixture[2]
  assert.equal(invoke(1, [q(edge), q(130), q(2570)], [q(edge), q(170), q(2570)]).result, 0)
})
test('source predicates match independently structured BigInt checks for bounded random segments', () => {
  let seed = 0x77c64
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  let contacts = 0
  for (let i = 0; i < 18000; i++) {
    const kind = i & 3, side = kind === 0 || kind === 3, sign = next() & 1 ? -1 : 1
    const from = [q(sign * (180 + next() % 90)), q(next() % 200), q(sign * (2530 + next() % 200))]
    const to = side ? [q(sign * (180 + next() % 90)), from[1], from[2]] : [from[0], q(next() % 200), from[2]]
    const earliest = 1 + next() % 65537, expected = planeOracle(kind, from, to, fixture, earliest)
    const actual = invoke(kind, from, to, fixture, earliest)
    assert.equal(actual.result, expected ? 1 : 0)
    assert.deepEqual(actual.output, expected ?? [11, 22, 33, 44])
    if (expected) contacts++
  }
  assert.ok(contacts > 100)
})
test('geometry supports equal-depth source branch and rejects inputs without writes', () => {
  const quarter = Array.from({ length: 257 }, (_, i) => i * 256), atan16 = Array.from({ length: 257 }, (_, i) => i * 32)
  memory.set(quarter, 64); memory.set(atan16, 336); memory.set([1824, 2544, 5, 228, 152, 6, 6, 152, 152], 608)
  assert.equal(core.fifa98_ball_boundary_geometry(ptr(608), ptr(336), ptr(64), ptr(624)), 1)
  assert.deepEqual(Array.from(memory.slice(624, 635)), [1824, 2544, 5, 228, 152, 6, 6, q(2691), q(2691), q(2701), q(2701)])
  const previous = Array.from(memory.slice(624, 635)); memory[608] = 0
  assert.equal(core.fifa98_ball_boundary_geometry(ptr(608), ptr(336), ptr(64), ptr(624)), 0)
  assert.deepEqual(Array.from(memory.slice(624, 635)), previous)
  assert.equal(core.fifa98_ball_boundary_geometry(0, ptr(336), ptr(64), ptr(624)), 0)
  for (const kind of [4, 0xffffffff]) assert.equal(invoke(kind, [0, 0, 0], [0, 0, 1]).result, -1)
  for (const time of [0, 65538]) assert.equal(invoke(0, [0, 0, 0], [1, 0, 0], fixture, time).result, -1)
})
test('exact source geometry uses joint cosine rounding and report is hash-gated', async (context) => {
  assert.equal(inspectBallBoundaryRecovery(new Uint8Array(), new Uint8Array()).status, 'unsupported')
  let backend, resident
  try { [backend, resident] = await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)), readFile(new URL('../.work/reference/disc/SLES_009.14', import.meta.url))]) }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Original reference not prepared'); return }; throw error }
  const report = inspectBallBoundaryRecovery(backend, resident)
  assert.equal(report.status, 'reconstruction-only'); assert.equal(report.regions.length, 10)
  memory.set(report.tables.sine.values, 64); memory.set(report.tables.atan16.values, 336); memory.set(report.fixture.params, 608)
  assert.equal(core.fifa98_ball_boundary_geometry(ptr(608), ptr(336), ptr(64), ptr(624)), 1)
  const angle = core.fifa98_ball_heading16(155, 76, ptr(336)), half = Math.trunc(angle / 2)
  const index = half >>> 6, fraction = half & 63, sine = report.tables.sine.values[index], cosine = report.tables.sine.values[256 - index]
  const correction = fraction * 411774 >> 9
  const sin = u(BigInt(sine) + (BigInt.asIntN(32, BigInt(cosine >> 2) * BigInt(correction)) >> 21n))
  const cos = u(BigInt(cosine) - (BigInt.asIntN(32, BigInt(sine >> 2) * BigInt(correction)) >> 21n))
  const tangent = divide(sin, cos), denominator = BigInt(tangent)
  const quotient = 0xffffffffn / denominator, remainder = 0xffffffffn % denominator
  const reciprocal = Number(quotient + (remainder > denominator / 2n ? 1n : 0n))
  const along = multiply(q(5), reciprocal), across = multiply(q(5), tangent)
  const expected = [1824, 2544, 5, 228, 152, 6, 6, u(BigInt(q(2696)) - BigInt(along)), u(BigInt(q(2620)) - BigInt(across)), u(BigInt(q(2620)) + BigInt(across)), u(BigInt(q(2696)) + BigInt(across))]
  assert.deepEqual(Array.from(memory.slice(624, 635)), expected)
  backend[0] ^= 1; assert.equal(inspectBallBoundaryRecovery(backend, resident).status, 'unsupported')
})
