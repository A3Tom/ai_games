import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadNative } from '../web/native.mjs'
import { decodeMopDeltas } from '../scripts/animation.mjs'

const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const native = await loadNative(bytes), core = native.core

// Construct little-endian halfwords from a sequential bit string, independently
// of the decoder's word/bit indexing. Negative values retain two's complement.
function pack(values, widths) {
  let stream = ''
  for (let index = 0; index < values.length; index++) if (widths[index]) {
    stream += BigInt.asUintN(widths[index], BigInt(values[index])).toString(2).padStart(widths[index], '0')
  }
  stream = stream.padEnd(Math.ceil(stream.length / 16) * 16, '0')
  const result = new Uint8Array(stream.length / 8)
  for (let index = 0; index < stream.length; index += 16) {
    const word = parseInt(stream.slice(index, index + 16), 2)
    result[index / 8] = word & 255; result[index / 8 + 1] = word >>> 8
  }
  return result
}

test('native motion deltas consume LE halfwords MSB first, cross words and wrap signed channels', () => {
  const widths = [0, 1, 7, 16, 3, 12, 16], deltas = [0, -1, -64, -32768, 3, -1025, 32767]
  const previous = [-32768, -32768, 32767, 32767, 32767, -32768, 32767]
  const packed = pack(deltas, widths)
  const expected = previous.map((value, index) => Number(BigInt.asIntN(16, BigInt(value + deltas[index]))))
  assert.deepEqual(native.decodeMotionDeltas(previous, packed, widths), expected)
  assert.deepEqual(decodeMopDeltas(previous, packed, widths), expected)
  assert.deepEqual(native.decodeMotionDeltas([], new Uint8Array(), []), [])
})

test('native delta decoder agrees with an independent signed sum oracle across packed widths', () => {
  let seed = 0x98f1fa
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0 }
  for (let sample = 0; sample < 1500; sample++) {
    const count = sample === 0 ? 233 : random() % 234
    const widths = Array.from({ length: count }, () => random() % 17)
    const previous = widths.map(() => (random() & 65535) - 32768)
    const deltas = widths.map((width) => width ? Number(BigInt.asIntN(width, BigInt(random()))) : 0)
    const expected = previous.map((value, index) => Number(BigInt.asIntN(16, BigInt(value + deltas[index]))))
    const packed = pack(deltas, widths)
    assert.deepEqual(native.decodeMotionDeltas(previous, packed, widths), expected)
    assert.deepEqual(decodeMopDeltas(previous, packed, widths), expected)
  }
})

test('invalid motion buffers fail before changing native output', () => {
  const output = new Int32Array(core.memory.buffer, core.fifa98_mop_decoded(), 233)
  const previous = new Int32Array(core.memory.buffer, core.fifa98_mop_previous(), 233)
  const widths = new Uint32Array(core.memory.buffer, core.fifa98_mop_widths(), 233)
  output.fill(12345); previous.fill(0); widths.fill(16)
  for (const [count, length] of [[234, 466], [233, 465], [0, 467], [-1, 0]]) {
    assert.equal(core.fifa98_mop_decode_deltas(count, length), -1)
    assert.ok(output.every((value) => value === 12345))
  }
  widths[232] = 17
  assert.equal(core.fifa98_mop_decode_deltas(233, 466), -1)
  widths[232] = 16; previous[232] = -32769
  assert.equal(core.fifa98_mop_decode_deltas(233, 466), -1)
  assert.ok(output.every((value) => value === 12345))
  assert.throws(() => native.decodeMotionDeltas([65536], new Uint8Array(2), [16]), /Invalid/)
  assert.throws(() => native.decodeMotionDeltas([0], new Uint8Array(1), [16]), /truncated/)
  assert.throws(() => native.decodeMotionDeltas([0], new Uint8Array(2), [17]), /Invalid/)
  assert.throws(() => native.decodeMotionDeltas(new Array(1), new Uint8Array(2), [16]), /Invalid/)
})
