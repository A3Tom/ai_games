import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerScene } from './player-scene.mjs'

function pose(offset = 0) {
  return { materials: [{ flagsRaw: 1, textureTag: 'fhoh' }], meshes: [{
    vertices: [[0, 0, 0], [20, 0, 0], [0, 40, 0]].map((position, id) => ({ id, position: position.map((v) => v + offset) })),
    faces: [{ materialIndex: 0, corners: [0, 1, 2].map((vertexId) => ({ vertexId, u: vertexId / 2, v: 1 - vertexId / 2 })), triangles: [[0, 1, 2]] }],
  }] }
}

test('player batching preserves original face/material data and uses a stable frame across keys', () => {
  const original = pose(), before = structuredClone(original), first = createPlayerScene(original)
  assert.deepEqual(first.counts, { models: 1, vertices: 3, triangles: 1 })
  assert.deepEqual(first.batches[0], { textureTag: 'fhoh', colour: 0xffffffff,
    triangles: [[[-0.5, -1, 0, 0, 1], [0.5, -1, 0, 0.5, 0.5], [-0.5, 1, 0, 1, 0]]] })
  const shifted = createPlayerScene(pose(10), first)
  assert.deepEqual(shifted.batches[0].triangles[0][0], [0, -0.5, 0.5, 0, 1])
  assert.deepEqual(original, before)
})

test('player batching rejects missing vertices, materials and invalid inspection normalization', () => {
  assert.throws(() => createPlayerScene({}), /recovered/)
  const missing = pose(); missing.meshes[0].faces[0].corners[0].vertexId = 4
  assert.throws(() => createPlayerScene(missing), /face/)
  const material = pose(); material.materials.length = 0
  assert.throws(() => createPlayerScene(material), /material/)
  assert.throws(() => createPlayerScene(pose(), { centreLoader: [0, 0, 0], scaleLoader: 0 }), /frame/)
})

test('separate head and body retain their own material and vertex index spaces', () => {
  const body = pose(), head = pose(50), before = structuredClone([body, head])
  head.materials[0].textureTag = 'hhge'; before[1].materials[0].textureTag = 'hhge'
  const scene = createPlayerScene([body, head])
  assert.deepEqual(scene.counts, { models: 2, vertices: 6, triangles: 2 })
  assert.deepEqual(scene.batches.map((batch) => batch.textureTag), ['fhoh', 'hhge'])
  assert.equal(scene.batches[0].triangles.length, 1)
  assert.equal(scene.batches[1].triangles.length, 1)
  assert.deepEqual([body, head], before)
})
