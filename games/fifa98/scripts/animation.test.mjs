import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeMopDeltas, parseMopClip, recoverPcmdJointParameters, MOP_PCMD_POSE_MAP } from './animation.mjs'

// Independent bit-string encoder: concatenate two's-complement fields from the
// most significant bit, then store each 16-bit word in little-endian order.
function pack(values, widths) {
  let bits = ''
  for (let index = 0; index < widths.length; index++) {
    const width = widths[index]
    if (width) bits += Number(BigInt.asUintN(width, BigInt(values[index]))).toString(2).padStart(width, '0')
  }
  bits = bits.padEnd(Math.ceil(bits.length / 16) * 16, '0')
  const bytes = Buffer.alloc(bits.length / 8)
  for (let index = 0; index < bits.length; index += 16) bytes.writeUInt16LE(parseInt(bits.slice(index, index + 16), 2), index / 8)
  return bytes
}

function fixture({ absolute = false, large = false } = {}) {
  const count = large ? 121 : 16
  const offset = large ? 160 : 52
  const widths = large ? Array(count - 9).fill(0) : [2, 3, 5, 16, 4, 2, 0]
  const first = large ? Array.from({ length: count }, (_, index) => index) : [...Array.from({ length: 9 }, (_, index) => index), 32767, -10, 12, 255, -256, 0, 100]
  const deltas = large ? Array(count - 9).fill(0) : [1, -3, 7, -32768, 7, -1, 0]
  const packed = pack(deltas, widths)
  const firstSize = Math.ceil((2 + count * 2) / 4) * 4
  const secondSize = absolute ? firstSize : Math.ceil((20 + packed.length) / 4) * 4
  const bytes = Buffer.alloc(offset + firstSize + secondSize, 0)
  bytes[0] = 1
  bytes[1] = 11
  bytes.writeUInt16LE(offset, 2)
  bytes.writeUInt16LE(8, 4)
  bytes.writeUInt16LE(2, 6)
  bytes.writeUInt16LE(absolute ? 0x8001 : 1, 14)
  bytes.writeUInt16LE(count, 16)
  bytes.writeUInt32LE(large ? 65535 : 1, 28)
  bytes.writeUInt32LE(large ? 65535 : 2, 32)
  bytes.set([...Array(9).fill(16), ...widths], 36)
  bytes.writeUInt16LE(firstSize, offset)
  first.forEach((value, index) => bytes.writeInt16LE(value, offset + 2 + index * 2))
  bytes.fill(0xab, offset + 2 + count * 2, offset + firstSize)
  const next = offset + firstSize
  bytes.writeUInt16LE(secondSize, next)
  if (absolute) first.forEach((value, index) => bytes.writeInt16LE(index + 10, next + 2 + index * 2))
  else {
    for (let index = 0; index < 9; index++) bytes.writeInt16LE(index + 10, next + 2 + index * 2)
    packed.copy(bytes, next + 20)
  }
  return { bytes, offset, next, count, first }
}

test('signed delta unpacking crosses 16-bit word boundaries and wraps signed halfwords', () => {
  const widths = [0, 1, 3, 5, 16, 2, 16]
  const deltas = [0, -1, -3, 12, -32768, 1, 32767]
  const previous = [1, 0, 5, -2, 1, 32767, 2]
  assert.deepEqual(decodeMopDeltas(previous, pack(deltas, widths), widths), [1, -1, 2, 10, -32767, -32768, -32767])
  assert.throws(() => decodeMopDeltas(previous, new Uint8Array(0), widths), /exceed/)
  assert.throws(() => decodeMopDeltas([0], new Uint8Array(4), [17]), /width/)
})

test('decodes original packet layout, absolute prefix, sparse translations and quaternion channels', () => {
  const source = fixture()
  const before = Buffer.from(source.bytes)
  const clip = parseMopClip(source.bytes)
  assert.equal(clip.format, 'MOPSX')
  assert.equal(clip.keyCount, 2)
  assert.equal(clip.keyStepShift, 2)
  assert.deepEqual(clip.frames[0].channelsRaw, source.first)
  assert.deepEqual(clip.frames[1].prefixRaw, [10, 11, 12, 13, 14, 15, 16, 17, 18])
  assert.deepEqual(clip.frames[1].channelsRaw.slice(9), [-32768, -13, 19, -32513, -249, -1, 100])
  assert.deepEqual(clip.frames[1].translations, [{ poseIndex: 0,
    valueRaw: [-32768, -13, 19], shiftedBy12: [-134217728, -53248, 77824] }])
  assert.deepEqual(clip.frames[0].rotations, [{ poseIndex: 1,
    quaternionRaw: [255, -256, 0, 100], shiftedBy8: [65280, -65536, 0, 25600] }])
  assert.deepEqual(source.bytes, before)
  assert.throws(() => { clip.frames[0].channelsRaw[0] = 99 }, TypeError)
})

test('supports all-absolute packets, larger observed headers and omitted unused final padding', () => {
  const absolute = fixture({ absolute: true })
  const clip = parseMopClip(absolute.bytes.subarray(0, -2))
  assert.equal(clip.missingFinalPadding, 2)
  assert.equal(clip.frames[1].absolute, true)
  assert.equal(clip.frames[1].channelsRaw[15], 25)
  const larger = fixture({ large: true })
  const outer = new Uint8Array(larger.bytes.length + 12)
  outer.set(larger.bytes, 7)
  const result = parseMopClip(outer.subarray(7, outer.length - 5))
  assert.equal(result.dataOffset, 160)
  assert.equal(result.valueCount, 121)
  assert.equal(result.frames[0].translations.length, 16)
  assert.equal(result.frames[0].rotations.length, 16)
  assert.deepEqual(result.frames[1].channelsRaw.slice(9), result.frames[0].channelsRaw.slice(9))
})

test('uses the reviewed original pose map and exact parameter shifts without inventing matrices', () => {
  const names = ['TorsoChn', 'LowerTorso', 'UpperTorso', 'Neck', 'Head', 'LUpperArm', 'LLowArm',
    'RUpperArm', 'RLowArm', 'RThigh', 'RLowLeg', 'RFoot', 'LThigh', 'LLowLeg', 'LFoot']
  const model = { format: 'PCMD', nodes: names.map((name, index) => ({ index, name, type: 2, linksRaw: [index - 1, -1, -1] })) }
  model.nodes[9].linksRaw[0] = 0
  model.nodes[12].linksRaw[0] = 0
  const rotations = [...new Set(MOP_PCMD_POSE_MAP.filter((index) => index !== null))]
    .map((poseIndex) => ({ poseIndex, quaternionRaw: [poseIndex, -1, 0, 256] }))
  const frame = { rotations, translations: [{ poseIndex: 0, valueRaw: [17, -1, 32767] }] }
  const baseFrame = { rotations, translations: MOP_PCMD_POSE_MAP.slice(1).map((poseIndex) => ({ poseIndex, valueRaw: [24, -8, 16] })) }
  const parameters = recoverPcmdJointParameters(model, frame, { baseFrame })
  assert.equal(parameters.length, 15)
  assert.equal(parameters[9].poseIndex, 13)
  assert.equal(parameters[12].poseIndex, 10)
  assert.equal(parameters[0].parentIndex, -1)
  assert.equal(parameters[1].parentIndex, 0)
  assert.equal(parameters[9].parentIndex, 1)
  assert.equal(parameters[12].parentIndex, 1)
  assert.equal(parameters[9].parentLinkRaw, 0)
  assert.deepEqual(parameters[1].quaternion12, [0, -16, 0, 4096])
  assert.deepEqual(parameters[1].translation, [2, -1, 4095])
  assert.deepEqual(parameters[2].translation, [3, -1, 2])
  assert.deepEqual(parameters[0].quaternion12, [0, 0, 0, 0])
  assert.deepEqual(recoverPcmdJointParameters(model, frame, { alternateScale: true, baseFrame })[1].translation, [17, -1, 32767])
  assert.equal('matrix' in parameters[1], false)
  assert.throws(() => recoverPcmdJointParameters(model, frame), /original AAAAAA key-zero baseFrame/)
  assert.deepEqual(recoverPcmdJointParameters(model, { rotations: [], translations: [] }, { baseFrame })[1].quaternion12, [0, -16, 0, 4096])
  assert.throws(() => recoverPcmdJointParameters(model, frame, { baseFrame: { ...baseFrame, translations: [baseFrame.translations[0], baseFrame.translations[0]] } }), /unique signed/)
  assert.throws(() => recoverPcmdJointParameters(model, { ...frame, rotations: rotations.slice(1) }), /required pose/)
})

test('rejects unsupported headers, inconsistent packet sizes and real payload truncation', async (t) => {
  const cases = [
    ['version', (source) => { source.bytes[0] = 2 }, /version/],
    ['codec', (source) => { source.bytes[1] = 12 }, /codec/],
    ['data offset', (source) => source.bytes.writeUInt16LE(48, 2), /offset/],
    ['key count', (source) => source.bytes.writeUInt16LE(0, 6), /count/],
    ['pose masks', (source) => source.bytes.writeUInt32LE(0, 32), /masks/],
    ['delta width', (source) => { source.bytes[45] = 17 }, /width/],
    ['absolute prefix width', (source) => { source.bytes[36] = 15 }, /width/],
    ['packet size', (source) => source.bytes.writeUInt16LE(4, source.next), /packet size/],
  ]
  for (const [name, mutation, pattern] of cases) await t.test(name, () => {
    const source = fixture()
    mutation(source)
    assert.throws(() => parseMopClip(source.bytes), pattern)
  })
  assert.throws(() => parseMopClip(fixture().bytes.subarray(0, -2)), /payload/)
  assert.throws(() => parseMopClip(Buffer.concat([fixture().bytes, Buffer.alloc(4)])), /trailing/)
  assert.throws(() => parseMopClip(new Uint8Array(16)), /header/)
})
