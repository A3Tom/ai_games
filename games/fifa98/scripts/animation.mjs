/**
 * Original MOPSX v1/codec11 clip decoding, recovered by static inspection of
 * SLES_009.14 BECODE.BIN: packet lookup 0x800d04e4, cache 0x800d572c,
 * signed delta unpacker 0x800d5b44, sparse pose application 0x800d0b44.
 * No console instructions are executed. The original player pose map is known;
 * runtime matrix construction and weighted geometry are separate model helpers.
 */

const frozen = (value) => Object.freeze(value)
const align4 = (value) => Math.ceil(value / 4) * 4
function invalid(message) { throw new Error(`Invalid MOPSX animation: ${message}`) }
function popcount(value) {
  let count = 0
  for (let bit = 0; bit < 32; bit++) count += (value >>> bit) & 1
  return count
}

// BECODE.BIN table 0x8005c76c, consumed by 0x800dd96c. Joint zero has
// no pose assignment; flags 0x300 accompany each of the remaining entries.
export const MOP_PCMD_POSE_MAP = frozen([null, 0, 1, 2, 3, 4, 5, 7, 8, 13, 14, 15, 10, 11, 12])
const jointNames = ['TorsoChn', 'LowerTorso', 'UpperTorso', 'Neck', 'Head', 'LUpperArm', 'LLowArm',
  'RUpperArm', 'RLowArm', 'RThigh', 'RLowLeg', 'RFoot', 'LThigh', 'LLowLeg', 'LFoot']

/**
 * Recover original runtime joint parameters, not skinned vertices or matrices.
 * The source adapter shifts pose quaternions by four and translations by 15
 * (or 12 in its alternate path). Sparse channels retain the original AAAAAA
 * key-zero initialization; callers supply that source frame as baseFrame.
 */
export function recoverPcmdJointParameters(model, frame, { alternateScale = false, baseFrame } = {}) {
  if (model?.format !== 'PCMD' || !Array.isArray(model.nodes) || !Array.isArray(frame?.rotations) || !Array.isArray(frame?.translations)) {
    invalid('a parsed player model and decoded frame are required')
  }
  const joints = model.nodes.filter((node) => node.type === 2)
  if (joints.length !== 15 || joints.some((node, index) => node.index !== index ||
      !new RegExp(`^${jointNames[index]}(?:_|$)`).test(node.name))) invalid('unsupported player joint order')
  if (typeof alternateScale !== 'boolean') invalid('alternateScale must be boolean')
  const translations = new Map(), rotations = new Map()
  const applyFrame = (input) => {
    if (!Array.isArray(input?.translations) || !Array.isArray(input?.rotations)) invalid('base pose must be a decoded original frame')
    for (const [rows, field, size, target] of [[input.translations, 'valueRaw', 3, translations], [input.rotations, 'quaternionRaw', 4, rotations]]) {
      const seen = new Set()
      for (const row of rows) {
        if (!Number.isInteger(row?.poseIndex) || row.poseIndex < 0 || row.poseIndex > 31 || seen.has(row.poseIndex) ||
            !Array.isArray(row[field]) || row[field].length !== size || row[field].some((value) =>
              !Number.isInteger(value) || value < -32768 || value > 32767)) invalid('pose channels must be unique signed 16-bit rows')
        seen.add(row.poseIndex)
        target.set(row.poseIndex, row[field])
      }
    }
  }
  if (baseFrame !== undefined) applyFrame(baseFrame)
  applyFrame(frame)
  const shift = alternateScale ? 12 : 15
  return frozen(joints.map((joint, index) => {
    const poseIndex = MOP_PCMD_POSE_MAP[index]
    const quaternion = poseIndex === null ? [0, 0, 0, 0] : rotations.get(poseIndex)
    if (!quaternion) invalid(`frame omits required pose rotation ${poseIndex}`)
    const translation = poseIndex === null ? [0, 0, 0] : translations.get(poseIndex)
    if (!translation) invalid(`frame omits required pose translation ${poseIndex}; supply the original AAAAAA key-zero baseFrame`)
    const parentLinkRaw = joint.linksRaw[0]
    if (!Number.isInteger(parentLinkRaw) || parentLinkRaw < -1 || parentLinkRaw >= index) invalid('unsupported player parent order')
    // The source reader redirects children of the dummy TorsoChn to pelvis1,
    // while keeping pelvis1 attached to dummy0. The initialized -1 guard keeps
    // the source root parent at -1 rather than making a cyclic hierarchy.
    const parentIndex = parentLinkRaw === 0 && index !== 1 ? 1 : parentLinkRaw
    return frozen({ nodeIndex: joint.index, name: joint.name, poseIndex, parentLinkRaw, parentIndex,
      quaternion12: frozen(quaternion.map((value) => value * 16)),
      translation: frozen(translation.map((value) => (value * 4096) >> shift)) })
  }))
}

/**
 * Decode signed deltas from MSB-first bits within little-endian 16-bit words.
 * Addition wraps to signed 16 bits, matching the original unpacker's SH stores.
 */
export function decodeMopDeltas(previous, packed, widths) {
  if (!(packed instanceof Uint8Array) || !Array.isArray(previous) || !Array.isArray(widths) ||
      previous.length !== widths.length || widths.length > 233) invalid('invalid delta decoder inputs')
  let bits = 0
  for (const width of widths) {
    if (!Number.isInteger(width) || width < 0 || width > 16) invalid('delta width must be 0..16')
    bits += width
  }
  const required = Math.ceil(bits / 16) * 2
  if (packed.length < required) invalid('packed deltas exceed the packet')
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
  let bitPosition = 0
  return frozen(previous.map((value, index) => {
    if (!Number.isInteger(value) || value < -32768 || value > 32767) invalid('previous channel must be signed 16-bit')
    const width = widths[index]
    let encoded = 0
    for (let bit = 0; bit < width; bit++) {
      const word = view.getUint16(Math.floor(bitPosition / 16) * 2, true)
      encoded = encoded * 2 + ((word >>> (15 - bitPosition % 16)) & 1)
      bitPosition++
    }
    const delta = width && encoded >= 2 ** (width - 1) ? encoded - 2 ** width : encoded
    return (value + delta) << 16 >> 16
  }))
}

function sparsePose(channels, translationMask, rotationMask) {
  let cursor = 9
  const translations = []
  const rotations = []
  for (let poseIndex = 0; poseIndex < 32; poseIndex++) {
    if ((translationMask >>> poseIndex) & 1) {
      const valueRaw = frozen(channels.slice(cursor, cursor + 3))
      translations.push(frozen({ poseIndex, valueRaw, shiftedBy12: frozen(valueRaw.map((value) => value * 4096)) }))
      cursor += 3
    }
  }
  for (let poseIndex = 0; poseIndex < 32; poseIndex++) {
    if ((rotationMask >>> poseIndex) & 1) {
      const quaternionRaw = frozen(channels.slice(cursor, cursor + 4))
      rotations.push(frozen({ poseIndex, quaternionRaw, shiftedBy8: frozen(quaternionRaw.map((value) => value * 256)) }))
      cursor += 4
    }
  }
  return { translations: frozen(translations), rotations: frozen(rotations) }
}

/** Decode all keys from one supplied bank/VIV member, preserving source data. */
export function parseMopClip(input, { decodeDeltas = decodeMopDeltas } = {}) {
  if (!(input instanceof Uint8Array)) throw new TypeError('MOPSX input must be a Uint8Array')
  if (typeof decodeDeltas !== 'function') throw new TypeError('Expected a motion delta decoder')
  if (input.length < 36 || input.length > 16 * 1024 * 1024) invalid('clip header is truncated or exceeds 16 MiB')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const u16 = (offset) => view.getUint16(offset, true)
  const u32 = (offset) => view.getUint32(offset, true)
  if (input[0] !== 1 || input[1] !== 11) invalid('unsupported clip version or codec')
  const dataOffset = u16(2)
  const timeValueRaw = u16(4)
  const keyCount = u16(6)
  const flags = u16(14)
  const valueCount = u16(16)
  const translationMask = u32(28)
  const rotationMask = u32(32)
  if (!keyCount || keyCount > 4096 || valueCount < 9 || valueCount > 233 || keyCount * valueCount > 1000000) {
    invalid('key/channel count exceeds supported limits')
  }
  if (valueCount !== 9 + popcount(translationMask) * 3 + popcount(rotationMask) * 4) invalid('pose masks disagree with the channel count')
  if (dataOffset !== align4(36 + valueCount) || dataOffset > input.length) invalid('channel table or data offset is invalid')
  const widths = frozen(Array.from(input.subarray(36, 36 + valueCount)))
  if (widths.some((width) => width > 16) || widths.slice(0, 9).some((width) => width !== 16)) invalid('unsupported channel bit widths')
  const absoluteSize = align4(2 + valueCount * 2)
  const deltaBits = widths.slice(9).reduce((sum, width) => sum + width, 0)
  const deltaSize = align4(20 + Math.ceil(deltaBits / 8))
  const frames = []
  let cursor = dataOffset
  let missingFinalPadding = 0
  for (let index = 0; index < keyCount; index++) {
    if (cursor + 2 > input.length) invalid('missing key packet')
    const byteLength = u16(cursor)
    const absolute = index === 0 || Boolean(flags & 0x8000)
    const expected = absolute ? absoluteSize : deltaSize
    if (byteLength !== expected) invalid('key packet size disagrees with its encoding')
    const required = absolute ? 2 + valueCount * 2 : 20 + Math.ceil(deltaBits / 16) * 2
    if (cursor + required > input.length) invalid('key payload is truncated')
    const end = cursor + byteLength
    if (end > input.length) {
      if (index !== keyCount - 1 || end - input.length > byteLength - required) invalid('key packet exceeds the file')
      missingFinalPadding = end - input.length
    }
    let channels
    if (absolute) channels = Array.from({ length: valueCount }, (_, channel) => view.getInt16(cursor + 2 + channel * 2, true))
    else {
      const prefix = Array.from({ length: 9 }, (_, channel) => view.getInt16(cursor + 2 + channel * 2, true))
      const tail = decodeDeltas(frames[index - 1].channelsRaw.slice(9),
        input.subarray(cursor + 20, Math.min(end, input.length)), widths.slice(9))
      if (!Array.isArray(tail) || tail.length !== valueCount - 9 || tail.some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) invalid('delta decoder returned invalid channels')
      channels = [...prefix, ...tail]
    }
    channels = frozen(channels)
    frames.push(frozen({ index, offset: cursor, byteLength, absolute, channelsRaw: channels,
      prefixRaw: frozen(channels.slice(0, 9)), ...sparsePose(channels, translationMask, rotationMask) }))
    cursor = end
  }
  if (cursor - missingFinalPadding !== input.length) invalid('unparsed trailing data remains')
  const warnings = ['This reader preserves raw prefix channels and keys. Original match scheduling, mirrored poses and turning paths are not provided here.']
  if (missingFinalPadding) warnings.push(`The final packet omits ${missingFinalPadding} unused alignment bytes, as observed in some original VIV members.`)
  return frozen({ format: 'MOPSX', version: 1, codec: 11, byteLength: input.length,
    dataOffset, timeValueRaw, keyCount, valueCount, flags, translationMask, rotationMask,
    keyStepShift: 1 + (flags & 1), headerWords: frozen(Array.from({ length: 18 }, (_, index) => u16(index * 2))),
    channelWidths: widths, frames: frozen(frames), missingFinalPadding, warnings: frozen(warnings) })
}
