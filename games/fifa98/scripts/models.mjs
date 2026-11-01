/**
 * Structural reader for PCMD/STADEX models observed in FIFA98's ZGMPLYR3.BIG.
 * This is based on byte-level inspection, not a published PCMD specification.
 * Direct-coordinate and intermediate UV conversion is recovered from the
 * resident reader. Original unmirrored key poses use separately recovered
 * hierarchy and weighted-point arithmetic before external view transforms.
 * The parser retains raw values; no bind pose or animation is invented.
 */

import { recoverPcmdJointParameters } from './animation.mjs'

function invalid(message) { throw new Error(`Invalid PCMD model: ${message}`) }
function frozen(values) { return Object.freeze(values) }

function rawInteger(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) invalid('raw coordinate is not a 32-bit integer')
  return value | 0
}

/** Resident reader 0x80018788..0x800187d0: SRA15, negate X, SH. */
export function recoverPcmdDirectPosition(positionRaw) {
  if (!Array.isArray(positionRaw) || positionRaw.length !== 3) invalid('position must have three raw components')
  return frozen(positionRaw.map((value, axis) => {
    const shifted = rawInteger(value) >> 15
    const converted = axis === 0 ? -shifted : shifted
    return converted << 16 >> 16
  }))
}

/** Resident reader 0x800188ac..0x80018934: signed clamp, SRA8, V flip. */
export function recoverPcmdUv(uRaw, vRaw) {
  const coordinate = (raw) => Math.max(0, Math.min(65536, rawInteger(raw))) >> 8
  const u256 = coordinate(uRaw)
  const v256 = 256 - coordinate(vRaw)
  return frozen({ u256, v256, u: u256 / 256, v: v256 / 256 })
}

/** Exact local quaternion arithmetic at resident 0x80012ad0..0x80012bd0. */
export function recoverPcmdQuaternionMatrix(quaternion12) {
  if (!Array.isArray(quaternion12) || quaternion12.length !== 4 || quaternion12.some((value) =>
    !Number.isInteger(value) || value < -524288 || value > 524272)) invalid('quaternion components exceed the mapped signed16 × 16 range')
  const [x, y, z, w] = quaternion12
  const product = (left, right) => Math.imul(left, right * 2) >> 12
  const xx = product(x, x), wx = product(w, x), xy = product(x, y), yy = product(y, y)
  const wy = product(w, y), xz = product(x, z), yz = product(y, z), zz = product(z, z), wz = product(w, z)
  return frozen([
    4095 - yy - zz, xy + wz, xz - wy,
    xy - wz, 4095 - xx - zz, wx + yz,
    xz + wy, yz - wx, 4095 - xx - yy,
  ].map((value) => value << 16 >> 16))
}

const signedHalfword = (value) => value << 16 >> 16
const macShift12 = (sum) => {
  const modulus = 2 ** 44
  let value = ((sum % modulus) + modulus) % modulus
  if (value >= 2 ** 43) value -= modulus
  return Math.floor(value / 4096)
}
const transformPoint = (matrix, point) => [0, 1, 2].map((row) => macShift12(matrix[9 + row] * 4096 +
  matrix[row * 3] * signedHalfword(point[0]) + matrix[row * 3 + 1] * signedHalfword(point[1]) + matrix[row * 3 + 2] * signedHalfword(point[2])))
const composeRotation = (parent, local, flipMiddle) => Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3), column = index % 3
  let sum = 0
  for (let component = 0; component < 3; component++) {
    let coefficient = parent[row * 3 + component]
    if (flipMiddle && row === 1) coefficient = signedHalfword(-coefficient)
    sum += coefficient * local[component * 3 + column]
  }
  const value = Math.max(-32768, Math.min(32767, macShift12(sum)))
  return flipMiddle && row === 1 ? signedHalfword(-value) : value
})

/** Specialized original fixed-point model-space skinning, before view/camera.
 * Joint rows: parent,qx,qy,qz,qw,tx,ty,tz. Vertex rows: joint,id,rawX,rawY,rawZ,weight.
 * This ports the reviewed matrix/point formulas; there is no instruction state,
 * console runtime, projection, or guessed bind pose.
 */
export function recoverPcmdSkin(joints, rows, vertexCount, modelScale = 512) {
  if (!Array.isArray(joints) || !joints.length || joints.length > 32 || !Array.isArray(rows) ||
      !rows.length || rows.length > 2048 || !Number.isInteger(vertexCount) || vertexCount < 1 || vertexCount > 512 ||
      !Number.isInteger(modelScale) || modelScale < 1 || modelScale > 4096) invalid('skinning input exceeds supported bounds')
  for (const [index, joint] of joints.entries()) {
    if (!Array.isArray(joint) || joint.length !== 8 || joint.some((value) => !Number.isInteger(value)) ||
        joint[0] < -1 || joint[0] >= index || joint.slice(1, 5).some((value) => value < -524288 || value > 524272) ||
        joint.slice(5).some((value) => value < -32768 || value > 32767)) invalid('invalid skinning joint parameters')
  }
  const weights = Array(vertexCount).fill(0), counts = Array(vertexCount).fill(0), rigid = Array(vertexCount).fill(false)
  for (const [index, row] of rows.entries()) {
    if (!Array.isArray(row) || row.length !== 6 || row.some((value) => !Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) ||
        row[0] < 0 || row[0] >= joints.length || row[1] < 0 || row[1] >= vertexCount || row[5] < 0 || row[5] > 6553600 ||
        (index && row[0] < rows[index - 1][0])) invalid('invalid weighted vertex row')
    weights[row[1]] += row[5]; counts[row[1]]++
    if (row[5] === 6553600) rigid[row[1]] = true
  }
  if (weights.some((weight, index) => weight !== 6553600 || (rigid[index] && counts[index] !== 1))) invalid('vertex weights do not match the observed original layout')
  const root = [4096, 0, 0, 0, -4096, 0, 0, 0, 4096, 0, 0, 0]
  const scale = [modelScale, 0, 0, 0, -modelScale, 0, 0, 0, modelScale, 0, 0, 0]
  const hierarchy = [], matrices = []
  for (const joint of joints) {
    const parent = joint[0] < 0 ? root : hierarchy[joint[0]]
    const local = recoverPcmdQuaternionMatrix(joint.slice(1, 5))
    const matrix = [...composeRotation(parent, local, true), ...transformPoint(parent, joint.slice(5))]
    hierarchy.push(matrix)
    matrices.push(frozen([...composeRotation(scale, matrix, false), ...transformPoint(scale, matrix.slice(9))]))
  }
  const vertices = Array(vertexCount)
  for (const row of rows) {
    const point = transformPoint(matrices[row[0]], row.slice(2, 5).map((value) => signedHalfword(value >> 15)))
    const id = row[1]
    if (row[5] === 6553600) vertices[id] = point
    else {
      const weight = Math.floor(row[5] / 25600)
      const contribution = point.map((value, axis) => Math.imul(axis === 1 ? -value : value, weight) >> 8)
      vertices[id] = contribution.map((value, axis) => signedHalfword(value + (vertices[id]?.[axis] ?? 0)))
    }
  }
  for (let id = 0; id < vertexCount; id++) {
    if (!rigid[id]) vertices[id][1] = -vertices[id][1] | 0
    frozen(vertices[id])
  }
  return frozen({ vertices: frozen(vertices), matrices: frozen(matrices) })
}

function recoveredFace(face) {
  return frozen({ ...face,
    corners: frozen(face.corners.map((corner) => frozen({ ...corner, ...recoverPcmdUv(corner.uRaw, corner.vRaw) }))),
    triangles: frozen((face.cornerCount === 4 ? [[0, 1, 3], [1, 3, 2]] : [[0, 1, 2]]).map(frozen)),
  })
}

/** Recover a supplied original animation key using the original player map.
 * The optional native core performs hierarchy and weighted-point arithmetic.
 * The original body model setup writes scale 512 at BECODE 0x8010b31c..0x8010b32c.
 */
export function recoverPlayerGeometry(model, frame, nativeCore, { baseFrame } = {}) {
  if (model?.format !== 'PCMD' || !Array.isArray(model.nodes)) invalid('a parsed player model is required')
  const meshes = model.nodes.filter((node) => node.type === 1)
  if (meshes.length !== 1 || meshes[0].vertices.length) invalid('unsupported player mesh layout')
  const mesh = meshes[0]
  // Original detail selectors write 4/3 for high/medium, 2/1 for low/slow.
  // The sole runtime adapter caller selects raw translations for 4/3 and
  // translations divided by eight for 2/1 (BECODE 0x800db3a4..0x800db3c8).
  // Low/slow draw sets object scale to zero and uses another composition path.
  // Keep it out of this high/medium scale-512 adapter until separately ported.
  if (!['high_body1', 'medium2'].includes(mesh.name)) invalid('unsupported original body detail layout; only high/medium scale-512 geometry is recovered here')
  const parameters = recoverPcmdJointParameters(model, frame, { alternateScale: true, baseFrame })
  const joints = parameters.map((joint) => [joint.parentIndex, ...joint.quaternion12, ...joint.translation])
  const rows = []
  let vertexCount = 0
  for (const node of model.nodes.filter((node) => node.type === 2)) for (const vertex of node.vertices) {
    if (vertex.targetNodeIndex !== mesh.index) invalid('player vertex targets another mesh')
    rows.push([node.index, vertex.globalVertexId, ...vertex.positionRaw, vertex.weightRaw])
    vertexCount = Math.max(vertexCount, vertex.globalVertexId + 1)
  }
  let result
  if (nativeCore) {
    for (const name of ['fifa98_pcmd_skin_joints', 'fifa98_pcmd_skin_rows', 'fifa98_pcmd_skin_vertices', 'fifa98_pcmd_skin_matrices', 'fifa98_pcmd_skin']) {
      if (typeof nativeCore[name] !== 'function') invalid('native player skinning is missing; rebuild the native module')
    }
    if (joints.length > 32 || rows.length > 2048 || vertexCount > 512) invalid('player exceeds native skinning buffers')
    new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_joints(), 32 * 8).set(joints.flat())
    new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_rows(), 2048 * 6).set(rows.flat())
    if (nativeCore.fifa98_pcmd_skin(joints.length, rows.length, vertexCount, 512) !== vertexCount) invalid('native player skinning rejected its source data')
    const points = new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_vertices(), vertexCount * 3)
    const matrices = new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_matrices(), joints.length * 12)
    result = { vertices: Array.from({ length: vertexCount }, (_, index) => frozen(Array.from(points.subarray(index * 3, index * 3 + 3)))),
      matrices: Array.from({ length: joints.length }, (_, index) => frozen(Array.from(matrices.subarray(index * 12, index * 12 + 12)))) }
  } else result = recoverPcmdSkin(joints, rows, vertexCount)
  return frozen({ meshes: frozen([frozen({ nodeIndex: mesh.index, name: mesh.name,
    vertices: frozen(result.vertices.map((position, id) => frozen({ id, position }))), faces: frozen(mesh.faces.map(recoveredFace)) })]),
    materials: model.materials, jointParameters: parameters, matrices: frozen(result.matrices), modelScale: 512,
    warnings: frozen(['Original unmirrored key pose in model space. Interpolation, external object/view transforms, lighting and gameplay remain separate.']) })
}

/** Original flat attachment point conversion: SRA15/SH, then supplied matrix.
 * Rows are [globalId,rawX,rawY,rawZ], with one rigid row per vertex.
 */
export function recoverPcmdAttachment(matrix, rows, vertexCount) {
  if (!Array.isArray(matrix) || matrix.length !== 12 || matrix.some((value, index) => !Number.isInteger(value) ||
      value < (index < 9 ? -32768 : -0x80000000) || value > (index < 9 ? 32767 : 0x7fffffff)) ||
      !Number.isInteger(vertexCount) || vertexCount < 1 || vertexCount > 512 || !Array.isArray(rows) || rows.length !== vertexCount) invalid('unsupported attachment bounds or matrix')
  const vertices = Array(vertexCount)
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 4 || row.some((value) => !Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) ||
        row[0] < 0 || row[0] >= vertexCount || vertices[row[0]]) invalid('invalid rigid attachment vertex')
    vertices[row[0]] = frozen(transformPoint(matrix, row.slice(1).map((value) => signedHalfword(value >> 15))))
  }
  return frozen(vertices)
}

/** Original separate head attachment, using the body's completed Head_1 matrix.
 * Head loader a1=0 flattens weighted rows and removes runtime joints, so its
 * draw bypasses hierarchy and scale. Source: BECODE 0x800dce50..0x800dce84.
 */
export function recoverPlayerHeadGeometry(model, bodyGeometry, nativeCore) {
  if (model?.format !== 'PCMD' || !Array.isArray(model.nodes) || !Array.isArray(bodyGeometry?.matrices) || !bodyGeometry.matrices[4]) invalid('a parsed head and recovered body geometry are required')
  const meshes = model.nodes.filter((node) => node.type === 1)
  if (meshes.length !== 1 || meshes[0].vertices.length || !['head1', 'head_long1', 'head_bald1'].includes(meshes[0].name)) invalid('unsupported original head layout')
  const mesh = meshes[0], rows = []
  for (const node of model.nodes.filter((node) => node.type === 2)) for (const vertex of node.vertices) {
    if (node.index !== 4 || vertex.targetNodeIndex !== mesh.index || vertex.weightRaw !== 6553600) invalid('head is not rigidly attached to original joint4')
    rows.push([vertex.globalVertexId, ...vertex.positionRaw])
  }
  const matrix = bodyGeometry.matrices[4]
  // Validate and derive the bounded source conversion before native buffer
  // writes, including duplicate/missing global IDs and coefficient bounds.
  let vertices = recoverPcmdAttachment(matrix, rows, rows.length)
  if (nativeCore) {
    for (const name of ['fifa98_pcmd_skin_rows', 'fifa98_pcmd_skin_vertices', 'fifa98_pcmd_skin_matrices', 'fifa98_pcmd_attachment']) {
      if (typeof nativeCore[name] !== 'function') invalid('native attachment conversion is missing; rebuild the native module')
    }
    new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_matrices(), 12).set(matrix)
    new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_rows(), 2048 * 6).set(rows.flatMap(([id, ...xyz]) => [0, id, ...xyz, 6553600]))
    if (nativeCore.fifa98_pcmd_attachment(rows.length, rows.length) !== rows.length) invalid('native head attachment rejected its source data')
    const output = new Int32Array(nativeCore.memory.buffer, nativeCore.fifa98_pcmd_skin_vertices(), rows.length * 3)
    vertices = frozen(Array.from({ length: rows.length }, (_, index) => frozen(Array.from(output.subarray(index * 3, index * 3 + 3)))))
  }
  return frozen({ meshes: frozen([frozen({ nodeIndex: mesh.index, name: mesh.name,
    vertices: frozen(vertices.map((position, id) => frozen({ id, position }))), faces: frozen(mesh.faces.map(recoveredFace)) })]),
    materials: model.materials, attachmentNodeIndex: 4, attachmentMatrix: frozen([...matrix]),
    warnings: frozen(['Original separate head attached through body joint4 in model space. No second scale or authored attachment offset is applied.']) })
}

/**
 * Recover the resident reader's direct geometry conversion without console
 * execution. Weighted player meshes require their original animation pose and
 * are rejected here. Source nodes/flags and raw values remain available.
 */
export function recoverDirectGeometry(model) {
  if (model?.format !== 'PCMD' || model.version !== 256 || !Array.isArray(model.nodes)) invalid('a parsed PCMD model is required')
  if (model.nodes.some((node) => node.type === 2 && node.vertices.length)) invalid('weighted player meshes require an original animation key through recoverPlayerGeometry')
  const meshes = model.nodes.filter((node) => node.type === 1).map((node) => frozen({
    nodeIndex: node.index, name: node.name, linksRaw: node.linksRaw, transformRaw: node.transformRaw,
    vertices: frozen(node.vertices.map((vertex) => frozen({ id: vertex.globalVertexId,
      position: recoverPcmdDirectPosition(vertex.positionRaw), positionRaw: vertex.positionRaw }))),
    faces: frozen(node.faces.map(recoveredFace)),
  }))
  return frozen({ meshes: frozen(meshes), materials: model.materials,
    evidence: frozen({ image: 'SLES_009.14', readerAddress: '0x800178fc',
      positions: '0x80018788..0x800187d0', uv: '0x800188ac..0x80018934', quadOrder: '0x80018964..0x800189a8' }),
    warnings: frozen(['These are loader-space coordinates and normalized intermediate UVs; scene transforms, texture pages and blending remain separate.']) })
}

export function parsePcmd(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('PCMD input must be a Uint8Array')
  if (input.length > 16 * 1024 * 1024) invalid('model exceeds 16 MiB')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  let cursor = 0
  const requireBytes = (length) => {
    if (!Number.isSafeInteger(length) || length < 0 || length > input.length - cursor) invalid('record exceeds the file')
  }
  const u32 = () => { requireBytes(4); const value = view.getUint32(cursor, true); cursor += 4; return value }
  const i32 = () => { requireBytes(4); const value = view.getInt32(cursor, true); cursor += 4; return value }
  const magic = (value) => {
    requireBytes(value.length)
    for (let index = 0; index < value.length; index++) if (input[cursor + index] !== value.charCodeAt(index)) invalid(`expected ${value} section`)
    cursor += value.length
  }
  const integers = (count, signed = false) => frozen(Array.from({ length: count }, () => signed ? i32() : u32()))
  const boundedCount = (count, size, label, maximum = 1000000) => {
    if (count > maximum || count > Math.floor((input.length - cursor) / size)) invalid(`${label} count exceeds the file or supported limit`)
    return count
  }
  magic('PCMD')
  const version = u32()
  if (version !== 0x100) invalid('unsupported version')
  magic('STADEX\0\0')
  const headerWords = integers(4)
  magic('MATR')
  const materialCount = boundedCount(u32(), 16, 'material', 65536)
  const materials = []
  for (let index = 0; index < materialCount; index++) {
    const offset = cursor
    const rawWords = integers(4)
    materials.push(frozen({ index, offset, rawWords, flagsRaw: rawWords[0], colorRaw: rawWords[1],
      textureTag: String.fromCharCode(...input.subarray(offset + 8, offset + 12)), unknownRaw: rawWords[3] }))
  }
  magic('NODE')
  const nodeCount = boundedCount(u32(), 80, 'node', 4096)
  if (!nodeCount) invalid('model contains no nodes')
  const nodes = []
  const faces = []
  const counts = { materials: materialCount, nodes: nodeCount, directVertices: 0, weightedVertexRows: 0,
    weightedVertices: 0, vertices: 0, faces: 0, triangles: 0, quads: 0 }
  for (let index = 0; index < nodeCount; index++) {
    const offset = cursor
    requireBytes(80)
    const type = u32()
    if (type !== 1 && type !== 2) invalid('unsupported node type')
    const nameBytes = input.subarray(cursor, cursor + 20)
    const terminator = nameBytes.indexOf(0)
    if (terminator === -1) invalid('unterminated node name')
    let name = ''
    for (const byte of nameBytes.subarray(0, terminator)) {
      if (byte < 32 || byte > 126) invalid('non-ASCII node name')
      name += String.fromCharCode(byte)
    }
    cursor += 20
    const linksRaw = integers(3, true)
    if (linksRaw.some((link) => link < -1 || link >= nodeCount)) invalid('node link exceeds the node table')
    const transformRaw = integers(10, true)
    const vertexCount = boundedCount(u32(), type === 2 ? 24 : 12, 'vertex')
    const vertices = []
    const nodeFaces = []
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      const vertexOffset = cursor
      const positionRaw = integers(3, true)
      const row = { index: vertexIndex, offset: vertexOffset, positionRaw }
      if (type === 2) {
        row.targetNodeIndex = u32()
        row.globalVertexId = u32()
        row.weightRaw = i32()
        if (row.targetNodeIndex >= nodeCount || row.globalVertexId >= 1000000) invalid('weighted vertex target exceeds supported bounds')
      } else row.globalVertexId = vertexIndex
      vertices.push(frozen(row))
    }
    if (type === 2) counts.weightedVertexRows += vertexCount
    else {
      counts.directVertices += vertexCount
      const faceCount = boundedCount(u32(), 64, 'face')
      for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
        const faceOffset = cursor
        const headerRaw = integers(4)
        const materialIndex = headerRaw[2]
        const cornerCount = headerRaw[3]
        if (materialIndex >= materialCount) invalid('face material index exceeds the material table')
        if (cornerCount !== 3 && cornerCount !== 4) invalid('unsupported polygon corner count')
        requireBytes(cornerCount * 16)
        const corners = []
        for (let cornerIndex = 0; cornerIndex < cornerCount; cornerIndex++) {
          corners.push(frozen({ vertexId: u32(), uRaw: u32(), vRaw: u32(), unknownRaw: u32() }))
        }
        const face = frozen({ index: faces.length, nodeFaceIndex: faceIndex, nodeIndex: index,
          offset: faceOffset, headerRaw, materialIndex, cornerCount, corners: frozen(corners) })
        faces.push(face)
        nodeFaces.push(face)
        counts[cornerCount === 3 ? 'triangles' : 'quads']++
      }
    }
    nodes.push(frozen({ index, offset, byteLength: cursor - offset, type, name, linksRaw, transformRaw,
      vertices: frozen(vertices), faces: frozen(nodeFaces) }))
  }
  if (cursor !== input.length) invalid('unparsed trailing bytes remain')
  const available = new Set()
  const weights = new Map()
  for (const node of nodes) {
    for (const vertex of node.vertices) {
      const target = node.type === 2 ? vertex.targetNodeIndex : node.index
      if (nodes[target].type !== 1) invalid('weighted vertex does not target a mesh node')
      const key = `${target}:${vertex.globalVertexId}`
      available.add(key)
      if (node.type === 2) weights.set(key, (weights.get(key) ?? 0) + vertex.weightRaw)
    }
  }
  for (const face of faces) {
    for (const corner of face.corners) if (!available.has(`${face.nodeIndex}:${corner.vertexId}`)) invalid('face references a missing vertex')
  }
  counts.weightedVertices = weights.size
  counts.vertices = available.size
  counts.faces = faces.length
  const irregularWeights = [...weights.values()].filter((value) => value !== 100 * 65536).length
  const warnings = ['Raw source fields are retained. Direct geometry and original unmirrored player key poses are available through separate conversion helpers; external view transforms and gameplay remain separate.']
  if (irregularWeights) warnings.push(`${irregularWeights} vertex weight sums differ from the observed 100 × 65536 total.`)
  return frozen({ format: 'PCMD', version, byteLength: input.length, headerWords,
    materials: frozen(materials), nodes: frozen(nodes), faces: frozen(faces), counts: frozen(counts), warnings: frozen(warnings) })
}
