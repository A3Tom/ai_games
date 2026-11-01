import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { decodePsh } from './textures.mjs'
import { decodeBallVisual, recoverBallRenderPosition, recoverBallSpriteScale, recoverBallBillboard,
  recoverBallScreenQuad, selectBallVisualFrame, createBallVisualBatch, inspectBallVisual } from './ball-visual.mjs'

const quarter = Array.from({ length: 257 }, (_, index) => index * 256)
const orientation = Array.from({ length: 32 }, (_, index) => index % 12)

function fixture() {
  const bytes = new Uint8Array(5568), view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('SHPP')); bytes.set(new TextEncoder().encode('GIMX'), 12)
  view.setUint32(4, bytes.length, true); view.setUint32(8, 13, true)
  let offset = 120
  for (let index = 0; index < 13; index++) {
    const name = index === 12 ? 'b01p' : `b${String(index).padStart(2, '0')}z`
    bytes.set(new TextEncoder().encode(name), 16 + index * 8)
    view.setUint32(20 + index * 8, offset, true)
    const width = index === 12 ? 16 : 32, height = index === 12 ? 1 : 24, payload = width * height / 2
    view.setUint32(offset, 0x40 | (16 + payload) << 8, true)
    view.setUint16(offset + 4, width, true); view.setUint16(offset + 6, height, true)
    bytes.fill(((index % 15) + 1) * 17, offset + 16, offset + 16 + payload)
    const palette = offset + 16 + payload
    bytes[palette] = 0x23; view.setUint16(palette + 4, 16, true); view.setUint16(palette + 6, 1, true)
    for (let colour = 0; colour < 16; colour++) view.setUint16(palette + 16 + colour * 2, colour + index * 32, true)
    offset = palette + 48
  }
  return bytes
}

test('ball image decoding applies the independently chosen source palette to every frame', () => {
  const bytes = fixture(), result = decodeBallVisual(bytes), raw = decodePsh(bytes)
  assert.equal(result.frames.length, 12)
  assert.equal(result.paletteName, 'b01z')
  assert.deepEqual([...result.frames[0].rgba.subarray(0, 4)], [8, 8, 0, 255])
  assert.deepEqual([...result.frames[1].rgba], [...raw.textures[1].rgba])
  assert.notDeepEqual([...result.frames[0].rgba], [...raw.textures[0].rgba])
  assert.equal(result.frames[7].name, 'b07z')
  const before = bytes.slice()
  result.frames[0].indices.fill(0)
  assert.deepEqual(bytes, before)
  assert.throws(() => decodeBallVisual(bytes, { paletteIndex: 3 }), /palette/)
  const corrupt = bytes.slice(); corrupt[16] = 65
  assert.throws(() => decodeBallVisual(corrupt), /layout/)
})

test('ball position uses snapshot integer halves and source doubling without player offset', () => {
  assert.deepEqual(recoverBallRenderPosition([0x18000, -1, -65536]), [2, -2, -2])
  assert.deepEqual(recoverBallRenderPosition([0x7fffffff, -0x80000000, 0]), [-2, 0, 0])
  assert.throws(() => recoverBallRenderPosition([0, 0, 1.5]), /position/)
})

test('source scale retains multiply-high division, depth clamps and exact scalar limits', () => {
  for (let depth = -32768; depth <= 32767; depth += 97) for (const zoom of [1000, 5440, 6800]) {
    const product = BigInt.asIntN(32, BigInt(depth) * BigInt(zoom))
    const high = product * 0x60606061n >> 32n
    const quotient = Number((high >> 11n) - (product >> 31n))
    assert.equal(recoverBallSpriteScale(depth, zoom), 49152 + Math.max(0, Math.min(8191, quotient)) * 8)
  }
  assert.equal(recoverBallSpriteScale(0), 49152)
  assert.equal(recoverBallSpriteScale(5440), 92672)
  assert.equal(recoverBallSpriteScale(32767, 6800), 114680)
  assert.throws(() => recoverBallSpriteScale(0, 999), /zoom/)
})

test('billboard uses the source33/25 endpoints, fixed rounding and signed-halfword stores', () => {
  assert.deepEqual(recoverBallBillboard([10, 20, 30], { scaleRaw: 49152, quarterSine: quarter }),
    [[10, 96, 30], [110, 96, 30], [110, 20, 30], [10, 20, 30]])
  assert.deepEqual(recoverBallBillboard([10, 20, 30], { cameraAngleRaw: 16384, scaleRaw: 49152, quarterSine: quarter }),
    [[10, 96, 30], [10, 96, 130], [10, 20, 130], [10, 20, 30]])
  assert.equal(recoverBallBillboard([32760, 32760, 0], { scaleRaw: 49152, quarterSine: quarter })[1][0], -32676)
  assert.throws(() => recoverBallBillboard([0, 0, 0], { scaleRaw: 65536, quarterSine: [] }), /quarter sine/)
})

test('integer screen correction preserves source width/8 width/16 and positive-depth guard', () => {
  const quad = [[100, 20], [200, 20], [200, 100], [100, 100]]
  assert.deepEqual(recoverBallScreenQuad(quad, [100, 100, 100, 100]),
    { visible: true, corners: [[88, 82], [112, 82], [112, 100], [88, 100]], depthBucket: 25 })
  assert.deepEqual(recoverBallScreenQuad(quad, [100, 0, 100, 100]), { visible: false, corners: [], depthBucket: 0 })
  assert.throws(() => recoverBallScreenQuad(quad.slice(1), [100, 100, 100, 100]), /quad/)
})

test('source frame selector preserves angle domains, wrap and mirror-sector decisions', () => {
  for (let roll = 0; roll < 4; roll++) for (let sector = 0; sector < 8; sector++) {
    const selected = selectBallVisualFrame(roll, sector * 128, 0, orientation)
    assert.deepEqual(selected, { textureIndex: orientation[roll * 8 + sector], mirrorX: sector === 1 || sector === 5, sector })
  }
  assert.deepEqual(selectBallVisualFrame(0, 0, 8192, orientation), selectBallVisualFrame(0, 128, 0, orientation))
  assert.throws(() => selectBallVisualFrame(4, 0, 0, orientation), /orientation/)
})

test('platform adapter emits native-rasterizer triangles and keeps source frame metadata', () => {
  const scene = { centreLoader: [0, 128, 0], scaleLoader: 256 }
  const batch = createBallVisualBatch(scene, [0, 0, 0], { camera: { yaw: 0, pitch: 0.65, distance: 2.5, width: 512, height: 384 }, quarterSine: quarter, orientationTable: orientation })
  assert.equal(batch.triangles.length, 2)
  assert.equal(batch.textureIndex, 0)
  assert.ok(batch.triangles.flat().flat().every(Number.isFinite))
  assert.ok(batch.triangles.flat().every((vertex) => vertex.length === 5 && vertex[2] > 0))
  assert.deepEqual(batch.source.origin, [0, 0, 0])
  const hidden = createBallVisualBatch(scene, [0, 1000 * 65536, 0], { camera: { yaw: 0, pitch: 1, distance: 0.1 }, quarterSine: quarter, orientationTable: orientation })
  assert.equal(hidden.visible, false)
})

test('original source and ball asset are fingerprinted when local extraction is available', async (t) => {
  let backend, resident, asset
  try {
    [backend, resident, asset] = await Promise.all([
      readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)),
      readFile(new URL('../.work/reference/disc/SLES_009.14', import.meta.url)),
      readFile(new URL('../.work/reference/members/ZCRAM.BIG/gameball.psh', import.meta.url)),
    ])
  } catch (error) { if (error.code === 'ENOENT') { t.skip('Local reference extraction is unavailable.'); return } throw error }
  const report = await inspectBallVisual(backend, resident, asset), decoded = decodeBallVisual(asset), raw = decodePsh(asset)
  assert.equal(report.status, 'reconstruction-only')
  assert.equal(report.regions.length, 15)
  assert.equal(selectBallVisualFrame(0, 0, 0, report.orientationTable).textureIndex, 7)
  assert.deepEqual([...decoded.frames[7].rgba], [...raw.textures[7].rgba])
  assert.notDeepEqual([...decoded.frames[0].rgba], [...raw.textures[0].rgba])
  const unknown = backend.slice(); unknown[0] ^= 1
  assert.equal((await inspectBallVisual(unknown, resident, asset)).status, 'unsupported')
})
