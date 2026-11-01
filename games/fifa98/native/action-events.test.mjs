import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const build = JSON.parse(await readFile(new URL('../.engine-build/build.json', import.meta.url), 'utf8'))
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports
if (!core.fifa98_action_window || !core.fifa98_action_nonloop_step) throw Error('Rebuild native core with the action window/step exports')
const base = core.fifa98_action_workspace(), memory = new Uint32Array(core.memory.buffer, base, 256)
const hash = (value) => createHash('sha256').update(value).digest('hex')
const signed = (word) => BigInt.asIntN(32, BigInt(word >>> 0))
const window = (flags, phase, a, b) => {
  let result = BigInt(flags >>> 0), start = BigInt(a) * 256n, end = BigInt(b - 2) * 256n
  if (start >= 0n && signed(phase) >= start && !(result & 0x28000n)) result |= 0xa000n
  if (end >= 0n && signed(phase) >= end && !(result & 0x20000n)) result = (result & 0xffff7fffn) | 0x24000n
  return Number(result)
}
function oracle(state, clock, a, b, endpoint) {
  let [flags, phase, stamp, rate] = state
  const out = [flags, phase, stamp, 0, 0, 0]
  if (flags & 64 || signed(stamp) >= signed(clock)) return { result: 0, out }
  const elapsed = signed(clock) - signed(stamp), delta = ((elapsed > 3072n ? 3072n : elapsed) * BigInt(rate) + 32768n) >> 16n
  if (!delta) return { result: 0, out }
  out[3] = Number(delta)
  if (!(flags & 256)) phase += Number(delta)
  out[1] = phase
  if (phase >= endpoint) { out[0] |= 16; out[5] = 1; return { result: 2, out: out.map((v) => v >>> 0) } }
  if (a >= 0 && phase >= a * 256 && !(flags & 0x28000)) { flags |= 0xa000; out[4] |= 1 }
  if (b >= 2 && phase >= (b - 2) * 256 && !(flags & 0x20000)) { flags = (flags & 0xffff7fff) | 0x24000; out[4] |= 2 }
  out[0] = flags >>> 0; out[2] = clock
  return { result: 1, out }
}
function invoke(state, clock, a = 4, b = 6, end = 8192) {
  memory.set(state, 0); memory.fill(0xdeadbeef, 8, 14)
  const result = core.fifa98_action_nonloop_step(base, clock, a, b, end, base + 32)
  assert.deepEqual([...memory.subarray(0, 4)], state.map((v) => v >>> 0))
  return { result, out: [...memory.subarray(8, 14)] }
}

test('source/module hashes match and native module has no imports', async () => {
  assert.equal(build.sources.find((row) => row.path === 'action-transition.c')?.sha256, hash(await readFile(new URL('./action-transition.c', import.meta.url))))
  assert.equal(build.wasmSha256, hash(bytes)); assert.deepEqual(WebAssembly.Module.imports(module), [])
})
test('snapshot preserves source signed halves, ordered equal windows and persistent done flag', () => {
  for (const [phase, expected] of [[1023, 0], [1024, 0x26000], [1025, 0x26000]]) assert.equal(core.fifa98_action_window(0, phase, 4, 6) >>> 0, expected)
  assert.equal(core.fifa98_action_window(0, 1024, 4, 10) >>> 0, 0xa000)
  assert.equal(core.fifa98_action_window(0x20000, 1024, 4, 6) >>> 0, 0x20000)
  assert.equal(core.fifa98_action_window(0, 0x80000000, 0, 2) >>> 0, 0)
  assert.equal(core.fifa98_action_window(123, 0, -32769, 2) >>> 0, 123)
  let seed = 0xd4780; const random = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  for (let i = 0; i < 15000; i++) { const flags = random(), phase = random(), a = (random() & 65535) - 32768, b = (random() & 65535) - 32768; assert.equal(core.fifa98_action_window(flags, phase, a, b) >>> 0, window(flags, phase, a, b)) }
})
test('null-callback phase branch matches independent integer oracle across bounded states', () => {
  let seed = 0xd4044; const random = () => seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
  for (let i = 0; i < 15000; i++) {
    const end = 1 + random() % 67106816, phase = random() % (end + 1), stamp = random() % 1000000, clock = stamp + random() % 10000
    const state = [random() & ~0xb4, phase, stamp, random() & 0x7fffffff].map((v) => v >>> 0), a = (random() & 65535) - 32768, b = (random() & 65535) - 32768
    assert.deepEqual(invoke(state, clock, a, b, end), oracle(state, clock, a, b, end))
  }
})
test('equal flag writes, cap3072, endpoint skip/removal timestamp and external phase are exact', () => {
  assert.deepEqual(invoke([0, 0, 10, 65536], 1034), { result: 1, out: [0x26000, 1024, 1034, 1024, 3, 0] })
  assert.deepEqual(invoke([0, 0, 10, 65536], 10000), { result: 1, out: [0x26000, 3072, 10000, 3072, 3, 0] })
  assert.deepEqual(invoke([0, 8000, 10, 65536], 1034), { result: 2, out: [16, 9024, 10, 1024, 0, 1] })
  assert.deepEqual(invoke([256, 0, 10, 65536], 1034), { result: 1, out: [256, 0, 1034, 1024, 0, 0] })
  for (const state of [[64, 0, 10, 65536], [0, 0, 10, 1]]) assert.equal(invoke(state, 11).result, 0)
})
test('unsupported or invalid cases refuse before output writes', () => {
  for (const flags of [4, 16, 32, 128]) assert.deepEqual(invoke([flags, 0, 0, 65536], 1), { result: -2, out: Array(6).fill(0xdeadbeef) })
  for (const args of [[[0, 8193, 0, 65536], 1], [[0, 0, 0, 0x80000000], 1], [[0, 0, 0x80000000, 65536], 0x7fffffff], [[0, 0, 0, 65536], 1, 32768]]) assert.deepEqual(invoke(...args), { result: -1, out: Array(6).fill(0xdeadbeef) })
  assert.equal(core.fifa98_action_nonloop_step(0, 1, 4, 6, 8192, base + 32), -1)
})
