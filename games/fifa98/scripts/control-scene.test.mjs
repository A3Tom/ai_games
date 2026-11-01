import test from 'node:test'
import assert from 'node:assert/strict'
import { createControlScene } from './control-scene.mjs'
const geometry = { materials: [{ flagsRaw: 0, colorRaw: 0xffffff }], meshes: [{
  vertices: [{ id: 0, position: [0, 0, 0] }, { id: 1, position: [256, 0, 0] }, { id: 2, position: [0, 256, 0] }],
  faces: [{ materialIndex: 0, corners: [0, 1, 2].map((vertexId) => ({ vertexId, u: 0, v: 0 })), triangles: [[0, 1, 2]] }],
}] }
const pitch = { vertices: [[0,0,0],[256,0,0],[0,0,256],[256,0,256]], quads: [[0,1,2,3]], uv: [[0,0],[256,0],[0,256],[256,256]] }
test('following camera preserves player size while field moves by world displacement', () => {
  const source = JSON.stringify({ geometry, pitch })
  const first = createControlScene(geometry, pitch, [0, 0], [0, 65536])
  const moved = createControlScene(geometry, pitch, [512, 256], [0, 65536])
  assert.deepEqual(first.batches[0], moved.batches[0])
  assert.equal(first.batches[1].triangles[0][0][0] - moved.batches[1].triangles[0][0][0], 2)
  assert.equal(first.batches[1].triangles[0][0][2] - moved.batches[1].triangles[0][0][2], 1)
  assert.equal(JSON.stringify({ geometry, pitch }), source)
})
test('facing rotates original geometry without changing height or scale', () => {
  const turned = createControlScene(geometry, pitch, [0, 0], [65536, 0])
  assert.equal(turned.batches[0].triangles[0][1][0], 0)
  assert.equal(turned.batches[0].triangles[0][1][2], -1)
  assert.equal(turned.batches[0].triangles[0][2][1], 0.5)
  const shifted = createControlScene(geometry, pitch, [0, 0], [65536, 0], -6)
  assert.equal(shifted.batches[0].triangles[0][2][1], 0.5 - 6/256)
  assert.deepEqual(shifted.batches[1], turned.batches[1], 'packed player Y does not displace source grass')
  assert.throws(() => createControlScene(geometry, pitch, [NaN, 0], [0, 65536]), /Invalid/)
})
test('shared player/ball inspection centre preserves the player world displacement',()=>{
  const following=createControlScene(geometry,pitch,[512,256],[0,65536])
  const shared=createControlScene(geometry,pitch,[512,256],[0,65536],0,[256,128])
  assert.deepEqual(shared.centreLoader,[256,128,128])
  const point=shared.batches[0].triangles[0][0]
  assert.equal(point[0]-following.batches[0].triangles[0][0][0],1)
  assert.equal(point[2]-following.batches[0].triangles[0][0][2],0.5)
  const grass=shared.batches[1].triangles[0][0]
  assert.equal(grass[0]-following.batches[1].triangles[0][0][0],1)
  assert.equal(grass[2]-following.batches[1].triangles[0][0][2],0.5)
})
