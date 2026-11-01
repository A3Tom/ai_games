import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const directory = new URL('../.engine-build/', import.meta.url)
let bytes
try { bytes = await readFile(new URL('fifa98-core.wasm', directory)) }
catch (error) { throw new Error('Build the native module first: node games/fifa98/scripts/build-native.mjs', { cause: error }) }
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'))
const source = await readFile(new URL('./core.c', import.meta.url))
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const module = await WebAssembly.compile(bytes)
const { exports: core } = await WebAssembly.instantiate(module)
const memory = new Uint8Array(core.memory.buffer)

test('native module matches source and has no runtime imports', () => {
  assert.equal(manifest.sourceSha256, sha256(source), 'Rebuild after changing core.c')
  assert.equal(manifest.wasmSha256, sha256(bytes))
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('all compiled native sources match the build manifest', async () => {
  assert.ok(manifest.sources.length >= 2)
  for (const entry of manifest.sources) assert.equal(sha256(await readFile(new URL(entry.path, import.meta.url))), entry.sha256, `Rebuild after changing ${entry.path}`)
})

test('recovered arithmetic agrees with independent division across boundaries and samples', () => {
  const expected = (value) => {
    const shifted = ((BigInt(value >>> 0) * 64n) + 7n) % (2n ** 32n)
    const result = Number(shifted / 15n) + 35
    return Math.min(result, 99)
  }
  for (let input = 0; input < 65536; input++) assert.equal(core.fifa98_attribute_display(input), expected(input))
  for (const input of [0x03ffffff, 0x04000000, 0x07ffffff, 0x80000000, 0xfffffffe, 0xffffffff]) {
    assert.equal(core.fifa98_attribute_display(input), expected(input))
  }
  let state = 0x14f098
  for (let i = 0; i < 10000; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    assert.equal(core.fifa98_attribute_display(state), expected(state))
  }
})

test('indexed conversion preserves transparency, full colour and nibble order', () => {
  const palette = new DataView(core.memory.buffer, core.fifa98_palette(), 512)
  ;[0x0000, 0x001f, 0x03e0, 0x7c00, 0x8000].forEach((colour, i) => palette.setUint16(i * 2, colour, true))
  memory.set([0x10, 0x32, 0x04], core.fifa98_pixels())
  assert.equal(core.fifa98_decode_indexed(5, 1, 4, 5), 5)
  assert.deepEqual([...memory.subarray(core.fifa98_rgba(), core.fifa98_rgba() + 20)], [
    0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255,
  ])
  memory.set([4, 3, 2, 1, 0], core.fifa98_pixels())
  assert.equal(core.fifa98_decode_indexed(5, 1, 8, 5), 5)
  assert.deepEqual([...memory.subarray(core.fifa98_rgba(), core.fifa98_rgba() + 4)], [0, 0, 0, 255])
})

test('recovered reciprocal preserves rounding, sign, wrapping and zero behavior', () => {
  const expected = (input) => {
    const signed = BigInt(input | 0)
    if (signed === 0n) return 0
    if (signed === -2147483648n) return 0xffffffff
    const magnitude = signed < 0n ? -signed : signed
    // Round to nearest, with exact half-way cases rounding down.
    const rounded = (2n * 0xffffffffn + magnitude - 1n) / (2n * magnitude)
    return Number(BigInt.asUintN(32, signed < 0n ? -rounded : rounded))
  }
  for (const input of [0, 1, -1, 2, -2, 0x7fffffff, -0x7fffffff, -2147483648]) {
    assert.equal(core.fifa98_signed_reciprocal(input) >>> 0, expected(input))
  }
  for (let input = 1; input < 50000; input++) {
    assert.equal(core.fifa98_signed_reciprocal(input) >>> 0, expected(input))
    assert.equal(core.fifa98_signed_reciprocal(-input) >>> 0, expected(-input))
  }
})

test('all 16-bit palette words agree with independently calculated RGB levels', () => {
  const palette = new DataView(core.memory.buffer, core.fifa98_palette(), 512)
  const expectedLevel = (level) => Math.floor(level * 8 + level / 4)
  memory[core.fifa98_pixels()] = 0
  for (let word = 0; word < 65536; word++) {
    palette.setUint16(0, word, true)
    assert.equal(core.fifa98_decode_indexed(1, 1, 8, 1), 1)
    assert.deepEqual([...memory.subarray(core.fifa98_rgba(), core.fifa98_rgba() + 4)], [
      expectedLevel(word & 31), expectedLevel((word >> 5) & 31),
      expectedLevel((word >> 10) & 31), word === 0 ? 0 : 255,
    ])
  }
})

test('bounds and invalid palette indices fail before changing output', () => {
  const output = memory.subarray(core.fifa98_rgba(), core.fifa98_rgba() + 16)
  output.fill(0xa9)
  assert.equal(core.fifa98_decode_indexed(0, 1, 8, 16), -1)
  assert.equal(core.fifa98_decode_indexed(1025, 1024, 8, 16), -1)
  assert.equal(core.fifa98_decode_indexed(1, 1, 16, 16), -2)
  assert.equal(core.fifa98_decode_indexed(1, 1, 4, 17), -3)
  memory[core.fifa98_pixels()] = 2
  assert.equal(core.fifa98_decode_indexed(1, 1, 8, 2), -4)
  assert.deepEqual([...output], Array(16).fill(0xa9))
  assert.equal(core.memory.buffer.byteLength, 33554432)
  assert.equal(core.fifa98_capacity(), 1024 * 1024)
})
