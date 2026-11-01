import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const build = JSON.parse(await readFile(new URL('../.engine-build/build.json', import.meta.url), 'utf8'))
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports
const base = core.fifa98_match_workspace(), memory = new Uint32Array(core.memory.buffer, base, 512)
const ptr = (word) => base + word * 4
const u = (x) => Number(BigInt.asUintN(32, BigInt(x)))
const s = (x) => BigInt.asIntN(32, BigInt(x >>> 0))
const multiply = (a,b) => u((s(a) * s(b) + 32768n) >> 16n)
const rng = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
// Independent unrolled limb additions, with explicit word truncation before
// every carry. Mirrors the source's numerical contract, not native loop code.
function randomOracle(input) {
  const w = input.map(BigInt), word = (v) => BigInt.asUintN(32,v), low = (v) => v & 65535n
  let sum = word(w[4] + w[5]); const r4 = low(sum)
  sum = word(r4 + word(w[3] + (sum >> 16n))); const r3 = low(sum)
  sum = word(r3 + word(w[2] + (sum >> 16n))); const r2 = low(sum)
  sum = word(r2 + word(w[1] + (sum >> 16n))); const r1 = low(sum)
  sum = word(r1 + word(w[0] + (sum >> 16n)))
  const out = [low(sum),r1,r2,r3,r4,low(w[5]+1n)]
  if (!out[5]) {
    // Increment the five-digit radix65536 number independently of generator
    // arithmetic. The source keeps the old result unless the high digit changes.
    const packed = out.slice(0,5).reduce((total,digit) => total * 65536n + digit,0n) + 1n
    for (let i = 0; i < 5; i++) out[i] = (packed >> BigInt((4-i)*16)) & 65535n
  }
  return { state: out.map(Number), result: Number(out[0]) }
}
function airOracle(velocity, spin, gravity, options, random) {
  const out = velocity.map((v) => u(s(v) - s(multiply(203,v))))
  let randomState = [...random], nextSpin = spin >>> 0
  if (nextSpin) {
    const factor = options & 64 ? 320000 : 10000
    out[0] = u(s(out[0]) + s(multiply(multiply(nextSpin,out[2]),factor)))
    out[2] = u(s(out[2]) - s(multiply(multiply(nextSpin,out[0]),factor)))
    if (options & 64) {
      const next = randomOracle(randomState); randomState = next.state
      if (!(next.result & 15)) nextSpin = u(-s(nextSpin))
    }
    nextSpin = multiply(nextSpin,63963)
  }
  out[1] = u(s(out[1]) + s(gravity) / 3600n)
  return { velocity: out, spin: nextSpin, random: randomState }
}

test('new ball motion source/Wasm hashes match and native module has no imports', async () => {
  const hash = (b) => createHash('sha256').update(b).digest('hex')
  assert.equal(hash(bytes), build.wasmSha256)
  assert.equal(hash(await readFile(new URL('ball-motion.c', import.meta.url))), build.sources.find((entry) => entry.path === 'ball-motion.c').sha256)
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})
test('original random seed shift, six-byte initializer and all seed residues', () => {
  for (let seed = 0; seed < 256; seed++) {
    assert.equal(core.fifa98_random_seed(seed,ptr(0)),1)
    assert.deepEqual(Array.from(memory.slice(0,6)), [65,114,67,97,68,101].map((v) => u((BigInt(seed) << 25n)+BigInt(v))))
  }
  assert.equal(core.fifa98_random_seed(0,0),0)
  assert.equal(core.fifa98_random_next(0) >>> 0,0xffffffff)
})
test('original random sequence preserves word wrap, all carry cascade depths and explicit state', () => {
  const next = rng(2318)
  const cases = [[65,114,67,97,68,101],Array(6).fill(0),Array(6).fill(65535),Array(6).fill(0xffffffff)]
  // At last-digit wrap: construct updated suffixes equal65535 to force each
  // carry depth, including incrementing the returned most-significant digit.
  for (let depth = 0; depth < 6; depth++) {
    const state = [0,0,0,0,0,65535]; if (depth < 5) state[4-depth] = 1
    cases.push(state)
  }
  for (let i = 0; i < 12000; i++) cases.push(Array.from({length:6},next))
  for (const state of cases) {
    memory.set(state,0); const expected = randomOracle(state)
    assert.equal(core.fifa98_random_next(ptr(0)) >>> 0,expected.result)
    assert.deepEqual(Array.from(memory.slice(0,6)),expected.state)
  }
  memory.set(cases[0],0)
  let state = cases[0]
  for (let i = 0; i < 10000; i++) {
    const expected = randomOracle(state); assert.equal(core.fifa98_random_next(ptr(0)) >>> 0,expected.result)
    state = expected.state
  }
  assert.deepEqual(Array.from(memory.slice(0,6)),state)
})
test('original full airborne drag, sequential curve, spin decay and random reversal agree with BigInt', () => {
  const next = rng(0x70129), edges = [0,1,0xffffffff,0x80000000,0x7fffffff,65536,0xffff0000]
  const cases = []
  for (const spin of edges) for (const value of edges) for (const options of [0,64]) cases.push({spin,velocity:[value,value,value],options,gravity:0xfe000000,random:[65,114,67,97,68,101]})
  for (let i = 0; i < 15000; i++) cases.push({spin:next(),velocity:[next(),next(),next()],options:next(),gravity:next(),random:Array.from({length:6},next)})
  let reversed = 0
  for (const entry of cases) {
    const expected = airOracle(entry.velocity,entry.spin,entry.gravity,entry.options,entry.random)
    memory.set(entry.velocity,16); memory[20] = entry.spin; memory.set(entry.random,24)
    assert.equal(core.fifa98_ball_air_motion(ptr(16),ptr(20),entry.gravity,entry.options,ptr(24)),1)
    assert.deepEqual(Array.from(memory.slice(16,19)),expected.velocity)
    assert.equal(memory[20],expected.spin); assert.deepEqual(Array.from(memory.slice(24,30)),expected.random)
    if (entry.spin && (entry.options & 64) && !(randomOracle(entry.random).result & 15)) reversed++
  }
  assert.ok(reversed > 100)
})
test('air guards are atomic and source random state is consumed only by nonzero alternate spin', () => {
  memory.set([10000,20000,30000,98765,65536,12345],16)
  const before = Array.from(memory.slice(16,30))
  assert.equal(core.fifa98_ball_air_motion(ptr(16),ptr(20),0xfe000000,64,0),0)
  assert.deepEqual(Array.from(memory.slice(16,30)),before)
  assert.equal(core.fifa98_ball_air_motion(0,ptr(20),0,0,0),0)
  assert.equal(core.fifa98_ball_air_motion(ptr(16),0,0,0,0),0)
  memory[20] = 0
  assert.equal(core.fifa98_ball_air_motion(ptr(16),ptr(20),0xfe000000,64,0),1)
})
test('spin-free new composition preserves existing surface helper for20,000 bounded states', () => {
  const next = rng(58181)
  for (let i = 0; i < 20000; i++) {
    const state = [next()%10000000,next()%10000000,next()%10000000,
      u((next()%2000000)-1000000),u((next()%2000000)-1000000),u((next()%2000000)-1000000),next(),next(),next()]
    memory.set(state,40); memory.set(state,56); memory[72] = 0
    assert.equal(core.fifa98_ball_surface_material(i%2,i%5,ptr(80)),1)
    const old = core.fifa98_ball_surface_tick(ptr(40),0xfe000000,ptr(80))
    assert.equal(core.fifa98_ball_motion_tick(ptr(56),ptr(72),0xfe000000,ptr(80),0,0),old)
    assert.deepEqual(Array.from(memory.slice(56,65)),Array.from(memory.slice(40,49)))
  }
})
test('guarded spin trajectory bounces to rest, retaining spin on pure rolling updates', () => {
  memory.set([0,20*65536,0,8*65536,2*65536,10*65536,0,0,0],40); memory[72] = 65536
  core.fifa98_ball_surface_material(0,0,ptr(80)); core.fifa98_random_seed(0,ptr(88))
  let contacts = 0, rolling = 0
  for (let i = 0; i < 2000; i++) {
    const spin = memory[72], air = (memory[41] | 0) + (memory[44] | 0) !== 0 || memory[44] !== 0
    const result = core.fifa98_ball_motion_tick(ptr(40),ptr(72),0xfe000000,ptr(80),0,ptr(88))
    assert.ok(result > 0); if (result === 2) contacts++
    if (!air) { rolling++; assert.equal(memory[72],spin) }
    if (!memory[41] && !memory[43] && !memory[44] && !memory[45]) break
  }
  assert.ok(contacts > 1); assert.ok(rolling > 0)
  assert.deepEqual(Array.from(memory.slice(43,46)),[0,0,0])
})
test('failed trajectory steps preserve position, spin and random storage', () => {
  for (const [state,expected] of [[[0,0xffffffff,0,0,0,0,0,0,0],0],[[0x7fffffff,0,0,1,0,0,0,0,0],-1]]) {
    memory.set(state,40); memory[72] = 65536; core.fifa98_random_seed(2,ptr(88))
    const before = Array.from(memory)
    assert.equal(core.fifa98_ball_motion_tick(ptr(40),ptr(72),0xfe000000,ptr(80),64,ptr(88)),expected)
    assert.deepEqual(Array.from(memory),before)
  }
})
