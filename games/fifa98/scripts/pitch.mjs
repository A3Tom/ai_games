/** Original grass-grid geometry subset, expressed without console execution.
 * Rendering, camera, selected texture and margin are explicit preview choices.
 * Evidence and scope: native/PITCH_RECOVERY.md and scripts/pitch-recovery.mjs.
 */
export const pitchProfiles = Object.freeze([
  Object.freeze([4080, 5664]), Object.freeze([3840, 5376]),
  Object.freeze([3648, 5088]), Object.freeze([3600, 4800]),
  Object.freeze([2160, 2784]),
])
const signed16 = (value) => value << 16 >> 16

/** Read logical XYZ/quad/256-domain UV data from C, or derive an independent
 * JavaScript reference for the supported normal profile-coordinate domain.
 * It does not select a live match mode, weather, grass palette or line markings.
 */
export function createPitchGeometry({ profile = 2, margin = 192, nativeCore } = {}) {
  if (!Number.isInteger(profile) || profile < 0 || profile >= pitchProfiles.length) throw new Error('Pitch profile must be an integer from 0 through 4.')
  const extents = pitchProfiles[profile]
  if (!Number.isInteger(margin) || margin < 0 || margin > 32767 - Math.max(...extents)) throw new Error('Pitch margin exceeds the signed-halfword preview coordinate range.')
  const maxX = extents[0] + margin, maxZ = extents[1] + margin
  if (nativeCore) {
    for (const name of ['fifa98_pitch_vertices', 'fifa98_pitch_quads', 'fifa98_pitch_uv', 'fifa98_pitch_vertex_capacity', 'fifa98_pitch_quad_capacity', 'fifa98_pitch_profile_extent', 'fifa98_pitch_generate']) {
      if (typeof nativeCore[name] !== 'function') throw new Error(`Native pitch export is missing: ${name}`)
    }
    if (!(nativeCore.memory instanceof WebAssembly.Memory) || nativeCore.fifa98_pitch_vertex_capacity() !== 192 || nativeCore.fifa98_pitch_quad_capacity() !== 165 ||
        extents.some((value, axis) => nativeCore.fifa98_pitch_profile_extent(profile, axis) !== value) ||
        nativeCore.fifa98_pitch_generate(-maxX, -maxZ, maxX, maxZ) !== 192) throw new Error('Native pitch profile or geometry capacity differs from the recovered layout.')
    const positions = new Int16Array(nativeCore.memory.buffer, nativeCore.fifa98_pitch_vertices(), 192 * 3)
    const indices = new Uint16Array(nativeCore.memory.buffer, nativeCore.fifa98_pitch_quads(), 165 * 4)
    const uv = new Uint16Array(nativeCore.memory.buffer, nativeCore.fifa98_pitch_uv(), 8)
    return { vertices: Array.from({ length: 192 }, (_, i) => Array.from(positions.subarray(i * 3, i * 3 + 3))),
      quads: Array.from({ length: 165 }, (_, i) => Array.from(indices.subarray(i * 4, i * 4 + 4))),
      uv: Array.from({ length: 4 }, (_, i) => Array.from(uv.subarray(i * 2, i * 2 + 2))), profile, margin }
  }
  const stepX = Math.trunc(maxX * 2 / 11), stepZ = Math.trunc(maxZ * 2 / 15)
  const vertices = Array.from({ length: 192 }, (_, index) => [signed16(maxX - (index % 12) * stepX), 0, signed16(maxZ - Math.floor(index / 12) * stepZ)])
  const quads = Array.from({ length: 165 }, (_, index) => {
    const top = Math.floor(index / 11) * 12 + index % 11
    return [top, top + 1, top + 12, top + 13]
  })
  return { vertices, quads, uv: [[256, 0], [0, 0], [256, 256], [0, 256]], profile, margin }
}
