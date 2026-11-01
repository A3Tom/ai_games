import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { recoverPcmdSkin, recoverPcmdAttachment } from '../scripts/models.mjs'

const bytes = await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url))
const core = (await WebAssembly.instantiate(bytes)).instance.exports

function nativeSkin(joints, rows, count, scale = 512) {
  new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_joints(), 32 * 8).set(joints.flat())
  new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_rows(), 2048 * 6).set(rows.flat())
  const result = core.fifa98_pcmd_skin(joints.length, rows.length, count, scale)
  if (result < 0) return result
  const vertices = new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_vertices(), count * 3)
  const matrices = new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_matrices(), joints.length * 12)
  return {
    vertices: Array.from({ length: count }, (_, index) => [...vertices.subarray(index * 3, index * 3 + 3)]),
    matrices: Array.from({ length: joints.length }, (_, index) => [...matrices.subarray(index * 12, index * 12 + 12)]),
  }
}

test('native hierarchy and weighted geometry agree with JS across signed arithmetic boundaries', () => {
  const root = [-1, 0, 0, 0, 0, 0, 0, 0]
  const zeros = [[0, 0, 0, 0, 0, 3276800], [0, 0, 0, 0, 0, 3276800]]
  assert.deepEqual(nativeSkin([root], zeros, 1), recoverPcmdSkin([root], zeros, 1))
  let state = 0x98012bd4
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) | 0)
  for (let sample = 0; sample < 1200; sample++) {
    const joints = Array.from({ length: 1 + (random() >>> 0) % 15 }, (_, index) => [
      index ? (random() >>> 0) % index : -1,
      ...Array.from({ length: 4 }, () => (random() << 16 >> 16) * 16),
      ...Array.from({ length: 3 }, () => random() << 16 >> 16),
    ])
    const rows = []
    const vertexCount = 3
    for (let id = 0; id < vertexCount; id++) {
      const firstJoint = (random() >>> 0) % joints.length
      if (id === 0) rows.push([firstJoint, id, random(), random(), random(), 6553600])
      else {
        const percent = 1 + (random() >>> 0) % 99
        rows.push([firstJoint, id, random(), random(), random(), percent * 65536])
        rows.push([(random() >>> 0) % joints.length, id, random(), random(), random(), (100 - percent) * 65536])
      }
    }
    rows.sort((a, b) => a[0] - b[0])
    const scale = 1 + (random() >>> 0) % 4096
    assert.deepEqual(nativeSkin(joints, rows, vertexCount, scale), recoverPcmdSkin(joints, rows, vertexCount, scale))
  }
})

test('native skinning rejects unsupported counts, parent cycles and invalid weights', () => {
  const root = [-1, 0, 0, 0, 0, 0, 0, 0]
  const row = [0, 0, 0, 0, 0, 6553600]
  assert.equal(nativeSkin([[0, ...root.slice(1)]], [row], 1), -1)
  assert.equal(nativeSkin([root], [[...row.slice(0, 5), 6553599]], 1), -1)
  assert.equal(nativeSkin([root], [row], 2), -1)
  assert.equal(nativeSkin([root], [row], 1, 0), -1)
  assert.equal(core.fifa98_pcmd_skin(33, 1, 1, 512), -1)
  assert.equal(core.fifa98_pcmd_skin(1, 2049, 1, 512), -1)
  assert.equal(core.fifa98_pcmd_skin(1, 1, 513, 512), -1)
})

test('native flat attachments match an independent signed fixed-point point oracle', () => {
  const matrixInput = new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_matrices(), 12)
  const rowInput = new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_rows(), 2048 * 6)
  const output = new Int32Array(core.memory.buffer, core.fifa98_pcmd_skin_vertices(), 3)
  let state = 0x98dce50
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) | 0)
  for (let sample = 0; sample < 3000; sample++) {
    const matrix = [...Array.from({ length: 9 }, () => random() << 16 >> 16), random(), random(), random()]
    const point = [random(), random(), random()]
    matrixInput.set(matrix)
    rowInput.set([0, 0, ...point, 6553600])
    assert.equal(core.fifa98_pcmd_attachment(1, 1), 1)
    const expected = [0, 1, 2].map((row) => {
      let sum = BigInt(matrix[9 + row]) * 4096n
      for (let column = 0; column < 3; column++) {
        sum += BigInt(matrix[row * 3 + column]) * BigInt.asIntN(16, BigInt(point[column]) >> 15n)
      }
      return Number(BigInt.asIntN(44, sum) >> 12n)
    })
    assert.deepEqual([...output], expected)
    assert.deepEqual([...output], recoverPcmdAttachment(matrix, [[0, ...point]], 1)[0])
  }
  const before = [...output]
  matrixInput[0] = 32768
  assert.equal(core.fifa98_pcmd_attachment(1, 1), -1)
  assert.deepEqual([...output], before)
  matrixInput[0] = 4096
  rowInput[5] = 3276800
  assert.equal(core.fifa98_pcmd_attachment(1, 1), -1)
  assert.equal(core.fifa98_pcmd_attachment(513, 513), -1)
})
