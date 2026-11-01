import assert from 'node:assert/strict'
import test from 'node:test'
import { createDirectScene, appendPitch, projectScene } from './scene.mjs'

function model() {
  return { format: 'PCMD', version: 256, materials: [{ flagsRaw: 1, textureTag: 'TEST', colorRaw: 0x7f7f7f }],
    nodes: [{ type: 1, transformRaw: [65536, 65536, 65536, 0, 0, 0, 0, 0, 0, 0],
      vertices: [[-20, -10, 0], [20, -10, 0], [20, 10, 0], [-20, 10, 0]].map((position, globalVertexId) => ({ positionRaw: position.map((v) => v * 32768), globalVertexId })),
      faces: [{ cornerCount: 4, materialIndex: 0, corners: [0, 1, 2, 3].map((vertexId) => ({ vertexId, uRaw: vertexId === 1 || vertexId === 2 ? 65536 : 0, vRaw: vertexId < 2 ? 0 : 65536 })) }] }] }
}

test('direct geometry keeps uniform proportions, material tags and original UVs without mutating model', () => {
  const input = model(), before = structuredClone(input)
  const scene = createDirectScene([input])
  assert.deepEqual(scene.counts, { models: 1, vertices: 4, triangles: 2 })
  assert.equal(scene.batches[0].textureTag, 'TEST')
  assert.deepEqual(scene.batches[0].triangles[0], [[1, -0.5, 0, 0, 1], [-1, -0.5, 0, 1, 1], [1, 0.5, 0, 0, 0]])
  assert.deepEqual(input, before)
})

test('camera projection has known perspective and clips crossing triangles at the near plane', () => {
  const scene = createDirectScene([model()])
  const projected = projectScene(scene, { yaw: 0, pitch: 0, distance: 2, width: 400, height: 400 })
  assert.deepEqual(projected[0].triangles[0][0], [390, 295, 2, 0, 1])
  const triangle = [[-0.01, 0, 0, 0, 0], [0.01, 0, 0, 1, 0], [0, 0.01, 0.2, 0.5, 1]]
  const clipped = projectScene({ batches: [{ textureTag: null, colour: 0xffffffff, triangles: [triangle] }] }, { yaw: 0, pitch: 0, distance: 0.1 })
  assert.equal(clipped[0].triangles.length, 2)
  assert.ok(clipped[0].triangles.flat(2).every(Number.isFinite))
  assert.ok(clipped[0].triangles.flat().every((vertex) => vertex[2] >= 0.05 - 1e-10))
})

test('rejects unsupported skinning/transforms and invalid cameras rather than inventing a pose', () => {
  const weighted = model(); weighted.nodes[0].type = 2
  assert.throws(() => createDirectScene([weighted]), /Skinned/)
  const moved = model(); moved.nodes[0].transformRaw[7] = 1
  assert.throws(() => createDirectScene([moved]), /transformed/)
  assert.throws(() => createDirectScene([]), /1–64/)
  assert.throws(() => projectScene({}, { yaw: NaN }), /camera/)
  assert.throws(() => projectScene({}, { width: 1024 }), /camera/)
})

test('grass uses the shared loader frame and original strip diagonal without changing stadium geometry', () => {
  const scene = { centreLoader: [10, 20, 30], scaleLoader: 10, batches: [], counts: { models: 1, vertices: 4, triangles: 2 } }
  const pitch = { vertices: [[0, 0, 0], [10, 0, 0], [0, 0, 10], [10, 0, 10]], quads: [[0, 1, 2, 3]], uv: [[256, 0], [0, 0], [256, 256], [0, 256]] }
  const result = appendPitch(scene, pitch)
  assert.deepEqual(result.batches[0].triangles[0], [[-1, -2, -3, 1, 0], [0, -2, -3, 0, 0], [-1, -2, -2, 1, 1]])
  assert.deepEqual(result.batches[0].triangles[1][2], [0, -2, -2, 0, 1])
  assert.deepEqual(result.counts, { models: 1, vertices: 8, triangles: 4 })
  assert.deepEqual(scene.batches, [])
})
