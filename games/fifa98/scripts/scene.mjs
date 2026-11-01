/** Platform mesh preparation for original, unskinned PCMD geometry.
 * Coordinates are uniformly normalized for inspection. Camera and rasterizer
 * are new browser platform code, not recovered original drawing behavior.
 */
import { recoverDirectGeometry } from './models.mjs'
const identity = [65536, 65536, 65536, 0, 0, 0, 0, 0, 0, 0]

export function createDirectScene(models, nativeCore) {
  if (!Array.isArray(models) || !models.length || models.length > 64) throw new Error('Expected 1–64 direct models')
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity]
  let vertexCount = 0, triangleCount = 0
  const batches = new Map()
  for (const model of models) {
    if (model.format !== 'PCMD') throw new Error('Expected parsed PCMD models')
    for (const node of model.nodes) {
      if (node.type !== 1 || node.transformRaw.some((value, i) => value !== identity[i])) throw new Error('Skinned or transformed nodes require original transform recovery')
    }
    const recovered = recoverDirectGeometry(model)
    for (const node of recovered.meshes) {
      const vertices = new Map(node.vertices.map((vertex) => [vertex.id, nativeCore
        ? vertex.positionRaw.map((raw, axis) => nativeCore.fifa98_pcmd_position_component(raw, axis)) : vertex.position]))
      for (const point of vertices.values()) for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], point[axis])
        maximum[axis] = Math.max(maximum[axis], point[axis])
      }
      vertexCount += vertices.size
      if (vertexCount > 100000) throw new Error('Scene exceeds vertex budget')
      for (const face of node.faces) {
        const material = model.materials[face.materialIndex]
        const textureTag = (material.flagsRaw & 1) ? material.textureTag : null
        const colour = textureTag ? 0xffffffff : (0xff000000 | material.colorRaw) >>> 0
        const key = `${textureTag ?? ''}:${colour}`
        if (!batches.has(key)) batches.set(key, { textureTag, colour, triangles: [] })
        const target = batches.get(key).triangles
        for (const triangle of face.triangles) {
          if (++triangleCount > 100000) throw new Error('Scene exceeds triangle budget')
          target.push(triangle.map((cornerIndex) => {
            const corner = face.corners[cornerIndex]
            const position = vertices.get(corner.vertexId)
            if (!position) throw new Error('Scene references a missing direct vertex')
            const u = nativeCore ? nativeCore.fifa98_pcmd_uv_component(corner.uRaw, 0) / 256 : corner.u
            const v = nativeCore ? nativeCore.fifa98_pcmd_uv_component(corner.vRaw, 1) / 256 : corner.v
            return [...position, u, v]
          }))
        }
      }
    }
  }
  if (!vertexCount || !triangleCount) throw new Error('Scene has no drawable geometry')
  const centre = minimum.map((value, axis) => (value + maximum[axis]) / 2)
  const scale = Math.max(...maximum.map((value, axis) => value - minimum[axis])) / 2
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Scene geometry has zero or invalid extent')
  for (const batch of batches.values()) for (const triangle of batch.triangles) for (const vertex of triangle) {
    for (let axis = 0; axis < 3; axis++) vertex[axis] = (vertex[axis] - centre[axis]) / scale
  }
  return { batches: [...batches.values()], boundsLoader: { minimum, maximum }, centreLoader: centre, scaleLoader: scale,
    counts: { models: models.length, vertices: vertexCount, triangles: triangleCount } }
}

/** Attach the recovered procedural grass grid in the stadium's loader frame.
 * The caller chooses a source grass texture; original weather/shading selection
 * and pitch markings are separate recovery work.
 */
export function appendPitch(scene, pitch, textureTag = '__grass') {
  const normalize = ([x, y, z], uv) => [x, y, z].map((value, axis) => (value - scene.centreLoader[axis]) / scene.scaleLoader).concat(uv.map((value) => value / 256))
  const triangles = []
  for (const quad of pitch.quads) for (const corners of [[0, 1, 2], [1, 2, 3]]) {
    triangles.push(corners.map((corner) => normalize(pitch.vertices[quad[corner]], pitch.uv[corner])))
  }
  return { ...scene, batches: [...scene.batches, { textureTag, colour: 0xffffffff, triangles }],
    counts: { ...scene.counts, vertices: scene.counts.vertices + pitch.vertices.length, triangles: scene.counts.triangles + triangles.length } }
}

/** Perspective projection with near-plane clipping. Returned triangles can be
 * uploaded directly as x/y/cameraDepth/u/v vertices to the native rasterizer.
 */
export function projectScene(scene, { yaw = 0.5, pitch = 0.55, distance = 3.1, width = 512, height = 384 } = {}) {
  if (![yaw, pitch, distance, width, height].every(Number.isFinite) || distance < 0.1 || distance > 100 ||
      width < 1 || height < 1 || width > 512 || height > 512) throw new Error('Invalid scene camera')
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  const near = 0.05, focal = Math.min(width, height) * 0.95
  const transform = ([x, y, z, u, v]) => {
    const xx = cy * x + sy * z, zz = -sy * x + cy * z
    return [xx, cp * y - sp * zz, distance - sp * y - cp * zz, u, v]
  }
  const screen = ([x, y, z, u, v]) => [width / 2 + x * focal / z, height / 2 - y * focal / z, z, u, v]
  return scene.batches.map((batch) => {
    const triangles = []
    for (const source of batch.triangles) {
      const polygon = source.map(transform), clipped = []
      for (let index = 0; index < polygon.length; index++) {
        const a = polygon[index], b = polygon[(index + 1) % polygon.length]
        if (a[2] >= near) clipped.push(a)
        if ((a[2] >= near) !== (b[2] >= near)) {
          const fraction = (near - a[2]) / (b[2] - a[2])
          clipped.push(a.map((value, axis) => value + (b[axis] - value) * fraction))
        }
      }
      for (let index = 1; index < clipped.length - 1; index++) triangles.push([clipped[0], clipped[index], clipped[index + 1]].map(screen))
    }
    return { textureTag: batch.textureTag, colour: batch.colour, triangles }
  })
}
