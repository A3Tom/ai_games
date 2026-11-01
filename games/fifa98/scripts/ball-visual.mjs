/** Original ball asset/sprite arithmetic, recovered by static inspection.
 * The ball is an indexed image quad, not an authored replacement sphere.
 * Projection in createBallVisualBatch is explicitly the new inspection camera.
 */
import { decodePsh } from './textures.mjs'

const freeze = Object.freeze
const fail = (message) => { throw new Error(`Invalid ball visual: ${message}`) }
const signed16 = (value) => value << 16 >> 16
const isWord = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff
const fixed = (left, right) => Math.floor((left * right + 32768) / 65536) | 0
const BACKEND_BASE = 0x8005ae28
const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const RESIDENT_HASH = 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644'
const ASSET_HASH = '1e282d650ef468d92364b2d4fb042c1f5d693f06866212afce603b5f29dfc6c0'

/** PSH geometry frames use a separately chosen source CLUT. Normal palette1
 * is b01z; palette0/2 preserve the other two source setting branches.
 */
export function decodeBallVisual(input, { paletteIndex = 1 } = {}) {
  if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex > 2) fail('palette index must be0..2')
  const decoded = decodePsh(input, { maxTextures: 13, maxPixels: 768, maxDecodedBytes: 65536 })
  if (decoded.textures.length !== 13 || decoded.textures.some((texture, index) =>
    texture.name !== (index === 12 ? 'b01p' : `b${String(index).padStart(2, '0')}z`) ||
    texture.width !== (index === 12 ? 16 : 32) || texture.height !== (index === 12 ? 1 : 24) ||
    texture.bitsPerPixel !== 4 || texture.centerX || texture.centerY || !texture.indices || texture.palette?.length !== 16)) fail('unsupported original gameball layout')
  const palette = decoded.textures[paletteIndex].palette
  const frames = decoded.textures.slice(0, 12).map((texture) => {
    const rgba = new Uint8Array(32 * 24 * 4), stp = new Uint8Array(32 * 24)
    for (let pixel = 0; pixel < texture.indices.length; pixel++) {
      const value = palette[texture.indices[pixel]], at = pixel * 4
      for (let channel = 0; channel < 3; channel++) {
        const component = value >>> (channel * 5) & 31
        rgba[at + channel] = component << 3 | component >>> 2
      }
      rgba[at + 3] = value === 0 ? 0 : 255
      stp[pixel] = value >>> 15
    }
    return freeze({ index: texture.index, name: texture.name, width: 32, height: 24,
      paletteName: decoded.textures[paletteIndex].name, rgba, stp, indices: texture.indices.slice() })
  })
  return freeze({ format: 'FIFA98-BALL-SPRITES', width: 32, height: 24, paletteIndex,
    paletteName: decoded.textures[paletteIndex].name, frames: freeze(frames),
    warnings: freeze(['Original indexed images and selected source palette. Source phase scheduling is supplied separately; lighting, shadows and camera parity remain separate.']) })
}

/** Snapshot high halves followed by original doubled render coordinates. */
export function recoverBallRenderPosition(fixedXYZ) {
  if (!Array.isArray(fixedXYZ) || fixedXYZ.length !== 3 || fixedXYZ.some((value) => !isWord(value))) fail('expected three fixed-point position words')
  return freeze(fixedXYZ.map((value) => signed16((value | 0) >> 16 << 1)))
}

/** Original selector 0x80076474. Heading period1024; camera angle period65536. */
export function selectBallVisualFrame(rollPhase, ballHeadingRaw, cameraAngleRaw, orientationTable) {
  if (!Number.isInteger(rollPhase) || rollPhase < 0 || rollPhase > 3 || !isWord(ballHeadingRaw) || !isWord(cameraAngleRaw) ||
      !(Array.isArray(orientationTable) || orientationTable instanceof Uint8Array) || orientationTable.length !== 32 ||
      [...orientationTable].some((value) => !Number.isInteger(value) || value < 0 || value > 255 || (value & 15) > 11)) fail('unsupported orientation table or angle inputs')
  const sector = ((ballHeadingRaw + ((cameraAngleRaw | 0) >> 6) + 64) & 1023) >> 7
  return freeze({ textureIndex: orientationTable[rollPhase * 8 + sector] & 15,
    mirrorX: sector === 1 || sector === 5, sector })
}

/** DA6BC: signed multiply-high division, depth clamp and original0xc000 base. */
export function recoverBallSpriteScale(viewDepthRaw, zoomRaw = 5440) {
  if (!Number.isInteger(viewDepthRaw) || viewDepthRaw < -32768 || viewDepthRaw > 32767 ||
      !Number.isInteger(zoomRaw) || zoomRaw < 1000 || zoomRaw > 6800) fail('unsupported source view depth or zoom')
  const product = Math.imul(viewDepthRaw, zoomRaw)
  const high = Number(BigInt(product) * 0x60606061n >> 32n)
  const quotient = (high >> 11) - (product >> 31)
  return 49152 + Math.max(0, Math.min(8191, quotient)) * 8
}

function cameraTrig(angleRaw, quarterSine) {
  if (!(Array.isArray(quarterSine) || quarterSine instanceof Uint32Array) || quarterSine.length !== 257 ||
      [...quarterSine].some((value) => !Number.isInteger(value) || value < 0 || value > 65536)) fail('expected verified257-entry quarter sine data')
  const angle = (angleRaw | 0) >> 6
  const sine = (heading) => {
    const offset = heading & 255
    const value = heading & 256 ? quarterSine[256 - offset] : quarterSine[offset]
    return heading & 512 ? -value : value
  }
  const sin = sine(angle), cos = sine(angle + 256), fraction = angleRaw & 63
  // Resident271D4/27258 keep this original sequence and low-word product.
  const coefficient = (Math.imul(fraction, 411774) >> 9)
  return [sin + (Math.imul(cos >> 2, coefficient) >> 21), cos + (Math.imul((-sin) >> 2, coefficient) >> 21)]
}

/** Resident166D4 unflipped branch, shift2, original32×24 image/zero centres.
 * Point order is left/top, right/top, right/bottom, left/bottom.
 */
export function recoverBallBillboard(origin, { cameraAngleRaw = 0, scaleRaw, quarterSine } = {}) {
  if (!Array.isArray(origin) || origin.length !== 3 || origin.some((value) => !Number.isInteger(value) || value < -32768 || value > 32767) ||
      !isWord(cameraAngleRaw) || !Number.isInteger(scaleRaw) || scaleRaw < 49152 || scaleRaw > 114680) fail('unsupported source billboard input')
  const [sin, cos] = cameraTrig(cameraAngleRaw, quarterSine)
  const right = fixed(33, scaleRaw) << 2, top = fixed(25, scaleRaw) << 2
  const dx = fixed(right, cos), dz = fixed(right, sin)
  const point = (x, y, z) => freeze([signed16(origin[0] + x), signed16(origin[1] + y), signed16(origin[2] + z)])
  return freeze([point(0, top, 0), point(dx, top, dz), point(dx, 0, dz), point(0, 0, 0)])
}

/** Original DA76C..DA82C integer screen correction and positive-depth guard. */
export function recoverBallScreenQuad(cornersXY, depths) {
  if (!Array.isArray(cornersXY) || cornersXY.length !== 4 || cornersXY.some((point) => !Array.isArray(point) || point.length !== 2 ||
      point.some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) ||
      !Array.isArray(depths) || depths.length !== 4 || depths.some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) fail('unsupported projected source quad')
  if (depths.some((value) => value <= 0)) return freeze({ visible: false, corners: freeze([]), depthBucket: 0 })
  const width = cornersXY[2][0] - cornersXY[3][0], margin = width >> 3, top = margin + (width >> 4)
  const left = signed16(cornersXY[3][0] - margin), right = signed16(cornersXY[3][0] + margin)
  return freeze({ visible: true,
    corners: freeze([[left, signed16(cornersXY[3][1] - top)], [right, signed16(cornersXY[2][1] - top)],
      [right, cornersXY[2][1]], [left, cornersXY[3][1]]].map(freeze)),
    depthBucket: depths.reduce((sum, value) => sum + value, 0) >> 4 })
}

/** Adapter for the independently written projectScene inspection camera.
 * It supplies platform-projected integer points to the original correction,
 * retaining source billboard geometry, scale expression and orientation.
 * It does not reproduce original GTE projection, affine UVs or ordering tables.
 */
export function createBallVisualBatch(scene, fixedXYZ, { camera = {}, quarterSine, orientationTable,
  zoomRaw = 5440, rollPhase = 0, ballHeadingRaw = 0, cameraAngleRaw = 0, textureTag = '__ball' } = {}) {
  const { yaw = 0.5, pitch = 0.55, distance = 3.1, width = 512, height = 384 } = camera
  if (!Array.isArray(scene?.centreLoader) || scene.centreLoader.length !== 3 || !scene.centreLoader.every(Number.isFinite) ||
      !Number.isFinite(scene.scaleLoader) || scene.scaleLoader <= 0 || ![yaw, pitch, distance, width, height].every(Number.isFinite) ||
      distance < 0.1 || distance > 100 || width < 1 || width > 512 || height < 1 || height > 512 || typeof textureTag !== 'string') fail('unsupported inspection scene/camera')
  const selection = selectBallVisualFrame(rollPhase, ballHeadingRaw, cameraAngleRaw, orientationTable)
  const origin = recoverBallRenderPosition(fixedXYZ), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  const transform = (point) => {
    const [x, y, z] = point.map((value, axis) => (value - scene.centreLoader[axis]) / scene.scaleLoader)
    const xx = cy * x + sy * z, zz = -sy * x + cy * z
    return [xx, cp * y - sp * zz, distance - sp * y - cp * zz]
  }
  const centreDepth = transform(origin)[2]
  const viewDepthRaw = signed16(Math.trunc(centreDepth * scene.scaleLoader))
  const scaleRaw = recoverBallSpriteScale(viewDepthRaw, zoomRaw)
  const sourcePoints = recoverBallBillboard(origin, { cameraAngleRaw, scaleRaw, quarterSine })
  const points = sourcePoints.map(transform), focal = Math.min(width, height) * 0.95
  if (points.some((point) => point[2] < 0.05)) return { textureTag, colour: 0xffffffff, triangles: [], ...selection, visible: false }
  const screen = points.map(([x, y, z]) => [signed16(Math.trunc(width / 2 + x * focal / z)), signed16(Math.trunc(height / 2 - y * focal / z))])
  const depths = points.map((point) => signed16(Math.trunc(point[2] * scene.scaleLoader)))
  const corrected = recoverBallScreenQuad(screen, depths)
  const uv = [[0, 0], [31 / 32, 0], [31 / 32, 23 / 24], [0, 23 / 24]]
  const vertices = corrected.corners.map(([x, y], index) => [x, y, points[index][2],
    selection.mirrorX ? 31 / 32 - uv[index][0] : uv[index][0], uv[index][1]])
  return { textureTag, colour: 0xffffffff, triangles: corrected.visible ? [[0, 1, 3], [1, 3, 2]].map((triangle) => triangle.map((index) => vertices[index])) : [],
    ...selection, visible: corrected.visible, source: { origin, scaleRaw, viewDepthRaw, depthBucket: corrected.depthBucket } }
}

async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const backendRegions = [
  ['original-ball-image-loader', 0x800d7ccc, 116], ['frame-orientation-selector', 0x80076474, 92],
  ['orientation-table', 0x80125e98, 32], ['ball-world-position-and-scale', 0x800da658, 244],
  ['projected-ball-screen-correction', 0x800da76c, 212], ['ball-palette-selection', 0x800dd55c, 196],
  ['default-source-zoom', 0x800d76d0, 12], ['sprite-uv-and-corner-order', 0x800dc600, 420],
  ['orientation-mirror-flag', 0x800d6030, 24], ['orientation-corner-swap', 0x800dc4c8, 152],
]
const residentRegions = [['ball-billboard-builder', 0x800166d4, 620], ['fractional-sine', 0x800271d4, 132], ['fractional-cosine', 0x80027258, 136],
  ['image-centre-registration', 0x8001e564, 48], ['sprite-centre-descriptor', 0x8001e674, 48]]

export async function inspectBallVisual(backend, resident, asset) {
  if (![backend, resident, asset].every((value) => value instanceof Uint8Array)) throw new TypeError('Expected original backend, resident and ball image bytes.')
  const source = freeze({ backendSha256: await digest(backend), residentSha256: await digest(resident), assetSha256: await digest(asset) })
  if (backend.length !== 939136 || resident.length !== 251904 || asset.length !== 5568 ||
      source.backendSha256 !== BACKEND_HASH || source.residentSha256 !== RESIDENT_HASH || source.assetSha256 !== ASSET_HASH) {
    return freeze({ version: 1, status: 'unsupported', source, regions: freeze([]), orientationTable: freeze([]) })
  }
  const regions = []
  for (const [image, bytes, base, start, ranges] of [['backend', backend, BACKEND_BASE, 0, backendRegions], ['resident', resident, 0x80011800, 2048, residentRegions]]) {
    for (const [id, address, byteLength] of ranges) regions.push(freeze({ id, image, address, byteLength,
      sha256: await digest(bytes.subarray(address - base + start, address - base + start + byteLength)) }))
  }
  const decoded = decodeBallVisual(asset)
  return freeze({ version: 1, status: 'reconstruction-only', source, regions: freeze(regions),
    asset: freeze({ path: 'ZCRAM.BIG/gameball.psh', textureCount: 13, frames: decoded.frames.length, width: 32, height: 24, defaultPalette: 'b01z' }),
    orientationTable: freeze([...backend.subarray(0x80125e98 - BACKEND_BASE, 0x80125eb8 - BACKEND_BASE)]),
    defaultZoomRaw: 5440, positionScale: 2, playerYOffsetApplied: false,
    warnings: freeze(['Original sprite arithmetic and data only. Source phase scheduling is supplied separately; camera projection, lighting, shadow and ordering-table behavior remain separate.']) })
}
