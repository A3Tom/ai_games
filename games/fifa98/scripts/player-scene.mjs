/** Browser platform batching of recovered player vertices. The caller supplies
 * an original skinned pose; this module only centers an inspection camera and
 * groups source faces by material. It does not author poses or move players.
 */
export function createPlayerScene(geometry, normalization = null) {
  const models = Array.isArray(geometry) ? geometry : [geometry]
  if (!models.length || models.length > 8 || models.some((model) => !Array.isArray(model?.meshes) || !Array.isArray(model?.materials))) throw new Error('Expected recovered player geometry')
  const batches = new Map(), minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity]
  let vertexCount = 0, triangleCount = 0
  for (const model of models) for (const mesh of model.meshes) {
    const vertices = new Map()
    for (const vertex of mesh.vertices) {
      if (vertices.has(vertex.id) || vertex.position.length !== 3 || !vertex.position.every(Number.isFinite)) throw new Error('Invalid recovered player vertex')
      vertices.set(vertex.id, vertex.position)
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], vertex.position[axis])
        maximum[axis] = Math.max(maximum[axis], vertex.position[axis])
      }
      if (++vertexCount > 10000) throw new Error('Player geometry exceeds vertex budget')
    }
    for (const face of mesh.faces) {
      const material = model.materials[face.materialIndex]
      if (!material) throw new Error('Missing player material')
      const textureTag = material.flagsRaw & 1 ? material.textureTag : null
      const colour = textureTag ? 0xffffffff : (0xff000000 | material.colorRaw) >>> 0
      const key = `${textureTag ?? ''}:${colour}`
      if (!batches.has(key)) batches.set(key, { textureTag, colour, triangles: [] })
      for (const indices of face.triangles) {
        if (++triangleCount > 20000) throw new Error('Player geometry exceeds triangle budget')
        if (indices.length !== 3) throw new Error('Expected triangulated player faces')
        batches.get(key).triangles.push(indices.map((index) => {
          const corner = face.corners[index], position = vertices.get(corner?.vertexId)
          if (!position || !Number.isFinite(corner.u) || !Number.isFinite(corner.v)) throw new Error('Invalid recovered player face')
          return [...position, corner.u, corner.v]
        }))
      }
    }
  }
  const centreLoader = normalization?.centreLoader ?? minimum.map((value, axis) => (value + maximum[axis]) / 2)
  const scaleLoader = normalization?.scaleLoader ?? Math.max(...maximum.map((value, axis) => value - minimum[axis])) / 2
  if (!vertexCount || !triangleCount || !Array.isArray(centreLoader) || centreLoader.length !== 3 ||
      !centreLoader.every(Number.isFinite) || !Number.isFinite(scaleLoader) || scaleLoader <= 0) throw new Error('Invalid player inspection frame')
  for (const batch of batches.values()) for (const triangle of batch.triangles) for (const vertex of triangle) {
    for (let axis = 0; axis < 3; axis++) vertex[axis] = (vertex[axis] - centreLoader[axis]) / scaleLoader
  }
  return { batches: [...batches.values()], centreLoader: [...centreLoader], scaleLoader, boundsLoader: { minimum, maximum },
    counts: { models: models.length, vertices: vertexCount, triangles: triangleCount } }
}
