import { createPlayerScene } from './player-scene.mjs'
import { appendPitch } from './scene.mjs'

/** New inspection-camera placement of the recovered player and grass. This
 * changes only drawing coordinates. Movement words remain in the original
 * simulation's fixed-point domain. Camera framing is not original match code.
 */
export function createControlScene(geometry, pitch, position, facingVector, verticalOffset = 0, cameraCentre = position) {
  if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite) ||
      !Array.isArray(facingVector) || facingVector.length !== 2 || !facingVector.every(Number.isFinite) || !Number.isFinite(verticalOffset) ||
      !Array.isArray(cameraCentre) || cameraCentre.length !== 2 || !cameraCentre.every(Number.isFinite)) throw new Error('Invalid control-scene transform')
  const scene = createPlayerScene(geometry, { centreLoader: [0, 0, 0], scaleLoader: 1 })
  const [sin, cos] = facingVector.map((value) => value / 65536)
  const centreLoader = [cameraCentre[0], 128, cameraCentre[1]], scaleLoader = 256
  for (const batch of scene.batches) for (const triangle of batch.triangles) for (const vertex of triangle) {
    const [x, y, z] = vertex
    vertex[0] = (cos * x + sin * z + position[0] - cameraCentre[0]) / scaleLoader
    vertex[1] = (y + verticalOffset - centreLoader[1]) / scaleLoader
    vertex[2] = (-sin * x + cos * z + position[1] - cameraCentre[1]) / scaleLoader
  }
  return appendPitch({ ...scene, centreLoader, scaleLoader }, pitch)
}
