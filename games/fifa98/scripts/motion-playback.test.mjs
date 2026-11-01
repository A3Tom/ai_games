import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { selectMotionKeys, motionPhaseForKey, sampleMotionPose, extractMotionPrefix, motionPrefixAtPhase, inspectMotionRegion, inspectMotionPlayback, verifyMotionBaseClip } from './motion-playback.mjs'

const clip = (flags = 0, keyCount = 3) => ({ flags, keyCount, frames: Array.from({ length: keyCount }, (_, index) => ({ index, prefixRaw: [index, -32768, -7, -32768, 2, 3, 4, 5, 6] })) })

test('phase selection preserves flag-dependent key spacing, fractions and endpoint clamping', () => {
  for (const flags of [0, 1, 0x8000, 0x8001]) {
    const source = clip(flags), step = flags & 1 ? 1024 : 512
    assert.equal(motionPhaseForKey(source, 2), step * 2)
    for (let key = 0; key < 3; key++) {
      const selected = selectMotionKeys(source, key * step)
      assert.equal(selected.keyIndex, key)
      assert.equal(selected.nextKeyIndex, Math.min(2, key + 1))
      assert.equal(selected.fraction16, 0)
      assert.equal(selected.lastKeyPhaseRaw, step * 2)
      assert.equal(sampleMotionPose(source, key * step), source.frames[key])
    }
    assert.equal(selectMotionKeys(source, step / 2).fraction16, 32768)
    assert.equal(selectMotionKeys(source, step / 4).fraction16, 16384)
    assert.equal(selectMotionKeys(source, -1).keyIndex, 0)
    assert.equal(selectMotionKeys(source, step * 20).keyIndex, 2)
  }
})

test('large phase words retain original SLL32 overflow rather than simplifying away the wrap', () => {
  const source = clip()
  const selection = selectMotionKeys(source, 0x7fffffff)
  assert.equal(selection.scaledRaw, -256)
  assert.equal(selection.rawKeyIndex, -1)
  assert.equal(selection.keyIndex, 0)
  assert.equal(selection.nextKeyIndex, 0)
  assert.equal(selection.fraction16, 65280)
  assert.equal(selection.directKeyIndex, 2)
  assert.equal(sampleMotionPose(source, 0x7fffffff), source.frames[0])
  assert.equal(motionPrefixAtPhase(source, 0x7fffffff).keyIndex, 2)
  assert.equal(selectMotionKeys(source, 0xffffffff).phaseRaw, -1)
})

test('prefix getters preserve signed conversion and mirror only the verified components', () => {
  const frame = clip().frames[0], before = JSON.stringify(frame)
  const direct = extractMotionPrefix(frame), mirrored = extractMotionPrefix(frame, { mirrorX: true })
  assert.equal(direct.headingOffsetRaw, -32768)
  assert.equal(mirrored.headingOffsetRaw, 32768)
  assert.deepEqual(direct.referenceAFixed12, [-134217728, 8192, 12288])
  assert.deepEqual(mirrored.referenceAFixed12, [134217728, 8192, 12288])
  assert.deepEqual(mirrored.referenceBFixed12, [-16384, 20480, 24576])
  assert.deepEqual(direct.unresolved, { channel0: 0, channel2: -7 })
  assert.equal(JSON.stringify(frame), before)
})

test('unsupported interpolation and malformed timing/prefix data fail explicitly', () => {
  assert.throws(() => sampleMotionPose(clip(), 0, { interpolate: true }), /not enabled/)
  assert.throws(() => selectMotionKeys(clip(), NaN), /32-bit/)
  assert.throws(() => selectMotionKeys(clip(), 0x100000000), /32-bit/)
  assert.throws(() => selectMotionKeys(clip(0, 0), 0), /metadata/)
  assert.throws(() => motionPhaseForKey(clip(), 3), /outside/)
  assert.throws(() => sampleMotionPose({ flags: 0, keyCount: 2, frames: [] }, 0), /count/)
  assert.throws(() => extractMotionPrefix({ prefixRaw: Array(9).fill(32768) }), /signed 16-bit/)
  assert.throws(() => extractMotionPrefix(clip().frames[0], { mirrorX: 1 }), /boolean/)
})

test('generic static evidence validates exact ranges and hashes without executing words', async () => {
  const bytes = new Uint8Array([0x21, 0x10, 0x85, 0, 8, 0, 0xe0, 3])
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const region = await inspectMotionRegion(bytes, { base: 0x80010000, address: 0x80010000, size: 8, sha256 })
  assert.deepEqual(region.words.map((word) => word.word), ['0x00851021', '0x03e00008'])
  await assert.rejects(inspectMotionRegion(bytes, { base: 0x80010000, address: 0x80010000, size: 8, sha256: '0'.repeat(64) }), /fingerprint/)
  await assert.rejects(inspectMotionRegion(bytes, { base: 0x80010000, address: 0x80010002, size: 8, sha256 }), /unaligned/)
  await assert.rejects(inspectMotionRegion(bytes, { base: 0x80010000, address: 0x80010000, size: 12, sha256 }), /outside/)
  const unknown = await inspectMotionPlayback(new Uint8Array(939136))
  assert.equal(unknown.status, 'unsupported')
  assert.deepEqual(unknown.regions, [])
})

test('base-pose identity refuses same-sized substitutes and invalid input', async () => {
  await assert.rejects(verifyMotionBaseClip(new Uint8Array(504)), /differs/)
  await assert.rejects(verifyMotionBaseClip(new Uint8Array(503)), /differs/)
  await assert.rejects(verifyMotionBaseClip({ length: 504 }), /Uint8Array/)
})
