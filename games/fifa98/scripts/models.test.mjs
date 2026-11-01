import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePcmd, recoverDirectGeometry, recoverPcmdDirectPosition, recoverPcmdUv, recoverPcmdQuaternionMatrix } from './models.mjs'

function fixture(weighted = true) {
  const parts = []
  let length = 0
  const push = (bytes) => { parts.push(bytes); length += bytes.length }
  const words = (...values) => {
    const bytes = Buffer.alloc(values.length * 4)
    values.forEach((value, index) => bytes.writeUInt32LE(value >>> 0, index * 4))
    push(bytes)
  }
  const node = (type, name, links, count) => {
    const offset = length
    words(type)
    const text = Buffer.alloc(20)
    text.write(name)
    push(text)
    words(...links, 65536, 65536, 65536, 0, 0, 0, 1000, 2000, 3000, 0, count)
    return offset
  }
  push(Buffer.from('PCMD'))
  words(256)
  push(Buffer.from('STADEX\0\0'))
  words(0, 0, 0, weighted ? 1 : 0)
  push(Buffer.from('MATR'))
  words(1, 1, 0x007f7f7f)
  push(Buffer.from('kit1'))
  words(0x569b00)
  push(Buffer.from('NODE'))
  words(weighted ? 2 : 1)
  const nodeOffsets = []
  const vertexOffsets = []
  if (weighted) {
    nodeOffsets.push(node(2, 'Joint', [-1, -1, 1], 5))
    for (const [id, weight, x, y] of [[0, 100, 0, 0], [1, 100, 65536, 0], [2, 50, 65536, 65536], [2, 50, 65536, 65536], [3, 100, 0, 65536]]) {
      vertexOffsets.push(length)
      words(x, y, -65536, 1, id, weight * 65536)
    }
    nodeOffsets.push(node(1, 'Mesh', [-1, -1, -1], 0))
  } else {
    nodeOffsets.push(node(1, 'Rigid', [-1, -1, -1], 4))
    for (const [x, y] of [[0, 0], [65536, 0], [65536, 65536], [0, 65536]]) {
      vertexOffsets.push(length)
      words(x, y, -65536)
    }
  }
  const faceCountOffset = length
  words(2)
  const faceOffsets = []
  for (const ids of [[0, 1, 2], [0, 1, 2, 3]]) {
    faceOffsets.push(length)
    words(1, 0, 0, ids.length)
    ids.forEach((id) => words(id, id * 100, 65535 - id * 100, id ? 0 : 0xabcdef))
  }
  return { bytes: Buffer.concat(parts), nodeOffsets, vertexOffsets, faceOffsets, faceCountOffset }
}

test('reads weighted node rows, shared global IDs and original indexed triangle/quad corners', () => {
  const source = fixture()
  const before = Buffer.from(source.bytes)
  const result = parsePcmd(source.bytes)
  assert.deepEqual(result.counts, { materials: 1, nodes: 2, directVertices: 0,
    weightedVertexRows: 5, weightedVertices: 4, vertices: 4, faces: 2, triangles: 1, quads: 1 })
  assert.equal(result.materials[0].textureTag, 'kit1')
  assert.equal(result.materials[0].colorRaw, 0x7f7f7f)
  assert.equal(result.nodes[0].name, 'Joint')
  assert.deepEqual(result.nodes[0].linksRaw, [-1, -1, 1])
  assert.deepEqual(result.nodes[0].transformRaw, [65536, 65536, 65536, 0, 0, 0, 1000, 2000, 3000, 0])
  assert.deepEqual(result.nodes[0].vertices[2].positionRaw, [65536, 65536, -65536])
  assert.equal(result.nodes[0].vertices[2].globalVertexId, 2)
  assert.equal(result.nodes[0].vertices[3].globalVertexId, 2)
  assert.equal(result.nodes[0].vertices[2].weightRaw, 50 * 65536)
  assert.equal(result.faces[0].nodeIndex, 1)
  assert.deepEqual(result.faces[0].corners[0], { vertexId: 0, uRaw: 0, vRaw: 65535, unknownRaw: 0xabcdef })
  assert.equal(result.nodes[1].faces[1], result.faces[1])
  assert.equal(result.warnings.length, 1)
  assert.deepEqual(source.bytes, before)
  assert.throws(() => { result.nodes[0].vertices[0].positionRaw.push(1) }, TypeError)
})

test('reads rigid type-1 vertices and nonzero-offset browser Uint8Arrays', () => {
  const input = fixture(false).bytes
  const outer = new Uint8Array(input.length + 11)
  outer.set(input, 7)
  const result = parsePcmd(outer.subarray(7, outer.length - 4))
  assert.equal(result.nodes[0].type, 1)
  assert.equal(result.counts.directVertices, 4)
  assert.equal(result.counts.weightedVertexRows, 0)
  assert.equal(result.faces[0].corners[2].vertexId, 2)
})

test('unusual weight totals remain explicit raw values with a warning', () => {
  const source = fixture()
  source.bytes.writeInt32LE(25 * 65536, source.vertexOffsets[0] + 20)
  const result = parsePcmd(source.bytes)
  assert.equal(result.nodes[0].vertices[0].weightRaw, 25 * 65536)
  assert.match(result.warnings[1], /1 vertex weight sums differ/)
})

test('recovered direct conversion preserves original quantization, signs, UV flip and quad diagonal', () => {
  assert.deepEqual(recoverPcmdDirectPosition([32768, -1, 2147483647]), [-1, -1, -1])
  assert.deepEqual(recoverPcmdDirectPosition([-1, -2147483648, 32767]), [1, 0, 0])
  assert.deepEqual(recoverPcmdDirectPosition([2147483647, 65536, -65536]), [1, 2, -2])
  assert.deepEqual(recoverPcmdUv(65536, 0), { u256: 256, v256: 256, u: 1, v: 1 })
  assert.deepEqual(recoverPcmdUv(65535, 65535), { u256: 255, v256: 1, u: 255 / 256, v: 1 / 256 })
  assert.deepEqual(recoverPcmdUv(0xffffffff, 100000), { u256: 0, v256: 0, u: 0, v: 0 })
  const model = parsePcmd(fixture(false).bytes)
  const geometry = recoverDirectGeometry(model)
  assert.deepEqual(geometry.meshes[0].vertices[1].position, [-2, 0, -2])
  assert.deepEqual(geometry.meshes[0].faces[1].triangles, [[0, 1, 3], [1, 3, 2]])
  assert.equal(geometry.meshes[0].faces[0].corners[0].unknownRaw, 0xabcdef)
  assert.equal(geometry.meshes[0].faces[0].headerRaw, model.faces[0].headerRaw)
  assert.throws(() => recoverDirectGeometry(parsePcmd(fixture().bytes)), /weighted player meshes require an original animation key/)
  assert.throws(() => recoverPcmdDirectPosition([NaN, 0, 0]), /32-bit/)
})

test('recovered quaternion coefficients preserve the original4095 diagonal and signed storage', () => {
  assert.deepEqual(recoverPcmdQuaternionMatrix([0, 0, 0, 4096]), [4095, 0, 0, 0, 4095, 0, 0, 0, 4095])
  assert.deepEqual(recoverPcmdQuaternionMatrix([0, 0, 2896, 2896]), [0, 4095, 0, -4095, 0, 0, 0, 0, 4095])
  assert.deepEqual(recoverPcmdQuaternionMatrix([4096, 0, 0, 0]), [4095, 0, 0, 0, -4097, 0, 0, 0, -4097])
  assert.deepEqual(recoverPcmdQuaternionMatrix([4096, 4096, 4096, 4096]), [-12289, 16384, 0, 0, -12289, 16384, 16384, 0, -12289])
  assert.throws(() => recoverPcmdQuaternionMatrix([0, 0, 0, 999999]), /range/)
})

test('rejects truncated, unsupported, out-of-range and partially parsed structures', async (t) => {
  const cases = [
    ['signature', (source) => source.bytes.write('FAKE'), /expected PCMD/],
    ['version', (source) => source.bytes.writeUInt32LE(257, 4), /version/],
    ['material count', (source) => source.bytes.writeUInt32LE(1000, 36), /material count/],
    ['node type', (source) => source.bytes.writeUInt32LE(3, source.nodeOffsets[0]), /node type/],
    ['node link', (source) => source.bytes.writeInt32LE(2, source.nodeOffsets[0] + 24), /node link/],
    ['node name', (source) => source.bytes.fill(0x41, source.nodeOffsets[0] + 4, source.nodeOffsets[0] + 24), /unterminated/],
    ['vertex count', (source) => source.bytes.writeUInt32LE(0xffffffff, source.nodeOffsets[0] + 76), /vertex count/],
    ['target bounds', (source) => source.bytes.writeUInt32LE(2, source.vertexOffsets[0] + 12), /target/],
    ['target is joint', (source) => source.bytes.writeUInt32LE(0, source.vertexOffsets[0] + 12), /mesh node/],
    ['missing vertex', (source) => source.bytes.writeUInt32LE(99, source.faceOffsets[0] + 16), /missing vertex/],
    ['material bounds', (source) => source.bytes.writeUInt32LE(1, source.faceOffsets[0] + 8), /material index/],
    ['polygon arity', (source) => source.bytes.writeUInt32LE(5, source.faceOffsets[0] + 12), /corner count/],
    ['face count', (source) => source.bytes.writeUInt32LE(100, source.faceCountOffset), /face count/],
  ]
  for (const [name, mutate, pattern] of cases) await t.test(name, () => {
    const source = fixture()
    mutate(source)
    assert.throws(() => parsePcmd(source.bytes), pattern)
  })
  const source = fixture().bytes
  assert.throws(() => parsePcmd(source.subarray(0, -1)), /exceeds/)
  assert.throws(() => parsePcmd(Buffer.concat([source, Buffer.alloc(4)])), /trailing/)
  assert.throws(() => parsePcmd('PCMD'), TypeError)
})
