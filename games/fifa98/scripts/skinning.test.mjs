import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverPcmdSkin, recoverPlayerGeometry, recoverPcmdAttachment, recoverPlayerHeadGeometry } from './models.mjs'
import { MOP_PCMD_POSE_MAP } from './animation.mjs'

const root = [-1, 0, 0, 0, 0, 0, 0, 0]
const row = (joint, id, xyz, percent) => [joint, id, ...xyz.map((value) => value * 32768), percent * 65536]

test('original local diagonal quantization and model scale remain visible in rigid geometry', () => {
  const result = recoverPcmdSkin([root], [row(0, 0, [4096, 4096, 4096], 100)], 1)
  assert.deepEqual(result.vertices, [[511, 511, 511]])
  assert.deepEqual(result.matrices, [[511, 0, 0, 0, 511, 0, 0, 0, 511, 0, 0, 0]])
  assert.ok(Object.isFrozen(result.vertices[0]))
})

test('hierarchy preserves negative rounding and converts translations before model scaling', () => {
  const joints = [root, [0, 0, 0, 0, 0, 8, 8, 8]]
  const result = recoverPcmdSkin(joints, [row(1, 0, [0, 0, 0], 100)], 1)
  // Parent diagonal is [4095,-4095,4095]: [8,8,8] becomes
  // [7,-8,7], and scale [512,-512,512] produces [0,1,0].
  assert.deepEqual(result.vertices, [[0, 1, 0]])
  assert.deepEqual(result.matrices[1].slice(9), [0, 1, 0])
})

test('partial weights keep the original truncated factors and per-contribution halfword stores', () => {
  const rows = [row(0, 0, [1024, 1024, 1024], 30), row(0, 0, [1024, 1024, 1024], 70)]
  const result = recoverPcmdSkin([root], rows, 1)
  // The transformed point is 127. Factors floor(30*256/100)=76
  // and floor(70*256/100)=179 sum to 255, not 256. Source Y is
  // negated before each product and converted back after the stores.
  assert.deepEqual(result.vertices, [[125, 127, 125]])
  assert.deepEqual(rows[0], row(0, 0, [1024, 1024, 1024], 30))
  assert.deepEqual(recoverPcmdSkin([root], [row(0, 0, [0, 0, 0], 50), row(0, 0, [0, 0, 0], 50)], 1).vertices, [[0, 0, 0]])
})

test('source positions truncate through signed halfwords before rigid transformation', () => {
  assert.deepEqual(recoverPcmdSkin([root], [row(0, 0, [8, -8, -1], 100)], 1).vertices, [[0, -1, -1]])
  assert.deepEqual(recoverPcmdSkin([root], [[0, 0, 2147483647, -2147483648, 0, 6553600]], 1).vertices, [[-1, 0, 0]])
})

test('skinning validates topology, weight layout and bounded integer inputs', () => {
  const valid = row(0, 0, [1, 2, 3], 100)
  const reject = (joints, rows, count = 1, scale = 512) => assert.throws(() => recoverPcmdSkin(joints, rows, count, scale), /Invalid PCMD model/)
  reject([[0, 0, 0, 0, 0, 0, 0, 0]], [valid])
  reject([root], [row(0, 0, [0, 0, 0], 99)])
  reject([root], [valid, row(0, 0, [0, 0, 0], 0)])
  reject([root], [valid], 2)
  reject([root], [[1, ...valid.slice(1)]])
  reject([root], [[0, 0, 0.5, 0, 0, 6553600]])
  reject([root], [valid], 1, 4097)
  reject([[-1, 524288, 0, 0, 0, 0, 0, 0]], [valid])
  reject([root, [0, 0, 0, 0, 0, 0, 0, 0]], [row(1, 0, [0, 0, 0], 50), row(0, 0, [0, 0, 0], 50)])
})

test('body detail selects the original translation path and preserves supplied base pose channels', () => {
  const names = ['TorsoChn', 'LowerTorso', 'UpperTorso', 'Neck', 'Head', 'LUpperArm', 'LLowArm',
    'RUpperArm', 'RLowArm', 'RThigh', 'RLowLeg', 'RFoot', 'LThigh', 'LLowLeg', 'LFoot']
  const nodes = names.map((name, index) => ({ index, name, type: 2, linksRaw: [index - 1, -1, -1],
    vertices: index === 1 ? [{ globalVertexId: 0, targetNodeIndex: 15, positionRaw: [0, 0, 0], weightRaw: 6553600 }] : [] }))
  const mesh = { index: 15, name: 'high_body1', type: 1, vertices: [], faces: [] }
  const model = { format: 'PCMD', nodes: [...nodes, mesh], materials: [] }
  const ids = MOP_PCMD_POSE_MAP.slice(1)
  const baseFrame = {
    translations: ids.map((poseIndex) => ({ poseIndex, valueRaw: [80, 0, 0] })),
    rotations: ids.map((poseIndex) => ({ poseIndex, quaternionRaw: [0, 0, 0, 256] })),
  }
  const frame = { translations: [], rotations: [] }
  assert.deepEqual(recoverPlayerGeometry(model, frame, undefined, { baseFrame }).meshes[0].vertices[0].position, [9, 0, 0])
  assert.throws(() => recoverPlayerGeometry({ ...model, nodes: [...nodes, { ...mesh, name: 'low_player' }] }, frame, undefined, { baseFrame }), /only high\/medium/)
  assert.throws(() => recoverPlayerGeometry(model, { ...frame, rotations: baseFrame.rotations }), /AAAAAA/)
  assert.throws(() => recoverPlayerGeometry({ ...model, nodes: [...nodes, { ...mesh, name: 'unknown_body' }] }, frame, undefined, { baseFrame }), /body detail/)
})

test('flat rigid attachments use the supplied body matrix without a second skeleton or scale', () => {
  const matrix = [4096, 0, 0, 0, 4096, 0, 0, 0, 4096, 10, -20, 30]
  const positions = recoverPcmdAttachment(matrix, [[1, 2147483647, -2147483648, 0], [0, 32768, -32768, 65536]], 2)
  assert.deepEqual(positions, [[11, -21, 32], [9, -20, 30]])
  assert.throws(() => recoverPcmdAttachment(matrix, [[0, 0, 0, 0], [0, 0, 0, 0]], 2), /attachment vertex/)
  assert.throws(() => recoverPcmdAttachment([32768, ...matrix.slice(1)], [[0, 0, 0, 0]], 1), /matrix/)
  const model = { format: 'PCMD', materials: [], nodes: [
    { type: 2, index: 4, vertices: [{ globalVertexId: 0, targetNodeIndex: 15, positionRaw: [32768, 0, 0], weightRaw: 6553600 }] },
    { type: 1, index: 15, name: 'head1', vertices: [], faces: [] },
  ] }
  const body = { matrices: Array.from({ length: 5 }, () => matrix) }
  assert.deepEqual(recoverPlayerHeadGeometry(model, body).meshes[0].vertices[0], { id: 0, position: [11, -20, 30] })
  assert.equal(recoverPlayerHeadGeometry(model, body).attachmentNodeIndex, 4)
  assert.throws(() => recoverPlayerHeadGeometry({ ...model, nodes: [{ ...model.nodes[0], index: 3 }, model.nodes[1]] }, body), /joint4/)
})
