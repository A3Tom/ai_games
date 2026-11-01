/** Source-phase/key selection and reviewed MOPSX prefix consumers.
 * Runtime helpers use browser APIs and integers only. They do not establish a
 * browser FPS, animation clock, looping policy or gameplay movement controller.
 */
const freeze = Object.freeze
const hex = (value) => `0x${value.toString(16).padStart(8, '0')}`
const BACKEND_BASE = 0x8005ae28
const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const BASE_CLIP_HASH = '7c3212c782a10791ce3988a1c64a33a78f386fde7345b26bd473214543bb1c3e'

function timing(clip) {
  if (!clip || !Number.isInteger(clip.flags) || clip.flags < 0 || clip.flags > 65535 ||
      !Number.isInteger(clip.keyCount) || clip.keyCount < 1 || clip.keyCount > 4096) throw new Error('Expected bounded parsed MOPSX timing metadata.')
  const keyStepShift = 1 + (clip.flags & 1)
  return { keyStepShift, keyStepPhaseRaw: 256 * (1 << keyStepShift) }
}

function phaseWord(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) throw new Error('Motion phase must be a 32-bit integer word.')
  return value | 0
}

/** Exact 0x800d0568 cache-selection expression, retaining SLL32 wrap.
 * directKeyIndex separately describes the simpler prefix getters' SRA(9+bit).
 * They agree in the ordinary clip range but can differ after 32-bit wrap.
 */
export function selectMotionKeys(clip, phaseRaw) {
  const { keyStepShift, keyStepPhaseRaw } = timing(clip)
  const phase = phaseWord(phaseRaw)
  const scaledRaw = (phase >> keyStepShift) << 8
  const rawKeyIndex = scaledRaw >> 16
  const clamp = (index) => Math.max(0, Math.min(clip.keyCount - 1, index))
  return freeze({ phaseRaw: phase, keyStepShift, keyStepPhaseRaw, scaledRaw,
    rawKeyIndex, keyIndex: clamp(rawKeyIndex), nextKeyIndex: clamp(rawKeyIndex + 1),
    fraction16: scaledRaw & 65535,
    directKeyIndex: clamp(phase >> (keyStepShift + 8)),
    lastKeyPhaseRaw: (clip.keyCount - 1) * keyStepPhaseRaw })
}

/** Original endpoint query 0x800d08b8, generalized to a validated key index. */
export function motionPhaseForKey(clip, keyIndex) {
  const { keyStepPhaseRaw } = timing(clip)
  if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= clip.keyCount) throw new Error('Motion key index is outside the clip.')
  return keyIndex * keyStepPhaseRaw
}

/** Return an original decoded key, compatible with recoverPcmdJointParameters.
 * A sparse key only supplies its masked channels. The pose consumer must retain
 * the authentic initialized base frame for missing channels; zero is not the
 * original default. This selector deliberately does not merge or mutate keys.
 * The original midpoint path operates on scaled integer pose fields. It must
 * not be represented as an invented floating-point/slerp frame, so interpolation
 * stays disabled until the consumer accepts that separate runtime-pose ABI.
 */
export function sampleMotionPose(clip, phaseRaw, { interpolate = false } = {}) {
  if (interpolate !== false) throw new Error('Pose interpolation is not enabled; sample original decoded keys explicitly.')
  const selection = selectMotionKeys(clip, phaseRaw)
  if (!Array.isArray(clip.frames) || clip.frames.length !== clip.keyCount || !clip.frames[selection.keyIndex]) throw new Error('Decoded frame count disagrees with motion metadata.')
  return clip.frames[selection.keyIndex]
}

/** The original initializer selects AAAAAA key zero before sparse pose writes.
 * Hash identity establishes the reviewed full-pose resource, not an invented
 * zero/rest pose. Decode it with parseMopClip and retain its frame-zero values
 * for channels a subsequently selected sparse key does not write.
 */
export async function verifyMotionBaseClip(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Base motion clip must be a Uint8Array.')
  if (input.length !== 504 || await digest(input) !== BASE_CLIP_HASH) throw new Error('Base motion clip differs from the reviewed AAAAAA resource.')
  return true
}

/** Consumers 0x800d0738/0790/0824: signed heading offset and two reference
 * vectors. The vectors are used by displacement-measurement callers, but this
 * does not make either a complete player/world root-motion update.
 */
export function extractMotionPrefix(frame, { mirrorX = false } = {}) {
  const prefix = frame?.prefixRaw
  if (!Array.isArray(prefix) || prefix.length !== 9 || prefix.some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) throw new Error('Expected nine signed 16-bit MOPSX prefix channels.')
  if (typeof mirrorX !== 'boolean') throw new Error('mirrorX must be boolean.')
  const vector = (index) => freeze(prefix.slice(index, index + 3).map((value, axis) => value * 4096 * (axis === 0 && mirrorX ? -1 : 1)))
  return freeze({ prefixRaw: freeze([...prefix]),
    headingOffsetRaw: (mirrorX ? -prefix[1] : prefix[1]) || 0,
    referenceAFixed12: vector(3), referenceBFixed12: vector(6),
    unresolved: freeze({ channel0: prefix[0], channel2: prefix[2] }) })
}

/** Prefix readers use their direct clamped key path, not cache-SLL wrapping. */
export function motionPrefixAtPhase(clip, phaseRaw, options) {
  const selection = selectMotionKeys(clip, phaseRaw)
  if (!Array.isArray(clip.frames) || clip.frames.length !== clip.keyCount) throw new Error('Decoded frame count disagrees with motion metadata.')
  return freeze({ keyIndex: selection.directKeyIndex, ...extractMotionPrefix(clip.frames[selection.directKeyIndex], options) })
}

async function digest(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 evidence verification requires Web Crypto.')
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')
}

/** Generic bounded fingerprint inspection; returns words and executes none. */
export async function inspectMotionRegion(input, { base, address, size, sha256 } = {}) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Motion evidence input must be a Uint8Array.')
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(address) || !Number.isSafeInteger(size) || base < 0 || address < base ||
      address % 4 || size <= 0 || size % 4 || address + size > 0x100000000 || address - base > input.length - size) throw new Error('Motion evidence region is unaligned or outside its image.')
  const offset = address - base, bytes = input.subarray(offset, offset + size)
  const actual = await digest(bytes)
  if (actual !== sha256) throw new Error('Motion evidence fingerprint differs from the reviewed bytes.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { address: hex(address), fileOffset: offset, size, sha256: actual,
    words: Array.from({ length: size / 4 }, (_, index) => ({ address: hex(address + index * 4), word: hex(view.getUint32(index * 4, true)) })) }
}

const regions = [
  ['default-pose-initializer', 0x800d0408, 112, '3df286e227887a2438fbe2c368077735a96bc73e590f45167a86487cc1d5169d'],
  ['default-pose-initializer-caller', 0x800b9a68, 112, '0e174d1bc3343c9ca3135028ae0ba74412831730ca8437900ad62553d2618e06'],
  ['case-insensitive-motion-name-lookup', 0x800d0354, 144, '1c80842e9c35fea1054c790690a69855b4412d2d46c67bb3b0fa986de0b8f5fd'],
  ['case-insensitive-motion-name-comparison', 0x800d5a28, 132, 'e4af250910d4b21c6a94d878ae68fbb9d67d4dfe369bfe9dbf1e51713bbeb1a4'],
  ['packet-key-clamp', 0x800d04e4, 92, '001f8ac32edc048cacd314e64ef3295ada4886dc8782a78148dabacf96d55dbd'],
  ['cache-key-clamp', 0x800d575c, 48, 'a83c2dc43c4dab42527a1ad4fce96e8f5c2b986c2ec387a796dbb56a1a1749c6'],
  ['phase-and-neighbour-key-selection', 0x800d0568, 224, 'fe007b8e29c71a621bda87591dc8e1d5e1e47f8b95b87636e25116538f343e27'],
  ['heading-prefix-consumer', 0x800d0738, 88, '46d27eb27b55e9e85422ad630e699b3eb7356762f8d56818b97eae1ab8aa1bcf'],
  ['reference-a-prefix-consumer', 0x800d0790, 148, 'b4e7086db0841f549703ad0b8e6c7ecb1c7422590fe472a9d484c8fd1093c323'],
  ['reference-b-prefix-consumer', 0x800d0824, 148, 'bb503cc0462e79f9b5e15607e3dd7b139350c3b650020ec711b8c2f8bce07ce2'],
  ['last-key-phase-query', 0x800d08b8, 48, '84c17778b8f9a8cc64f5cd3ed07a68230b5bc8c48fb0ebb82fbdb345ff8955f5'],
  ['midpoint-path-selector', 0x800d1c20, 108, '7b9d0b8417a7d68c3fa894fd4b9f1719d3aaec10fecd8e52a3f6005df9990583'],
  ['non-root-translation-midpoint', 0x800d1d24, 92, '24ba28b8e10fb79cbb39371086742707b84ededa46c019ac040d4eb0d92eff59'],
  ['non-root-quaternion-midpoint', 0x800d1eac, 116, 'f0d4a7f3e5f2704c98205617a860cde77d0be49010d7b2954a85b0574f6c4758'],
  ['heading-offset-caller', 0x800bacf4, 80, 'b414b512e47690a4848750af92739da9cacceb73ab6d4928efa494831f48b832'],
  ['reference-vector-displacement-caller', 0x800ba620, 284, 'd8f5f71ee16b39da732095d33c1d0e8b338b6e854311d7b27de02506e16e9551'],
  ['packed-counter-phase-caller', 0x800d543c, 32, '7e67748dfc15ae7d47fe67b687e6fb1fb35d34bd4a85f59189562d4f6d2fa944'],
]

export async function inspectMotionPlayback(backend, { baseClip } = {}) {
  if (!(backend instanceof Uint8Array)) throw new TypeError('Backend must be a Uint8Array.')
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: await digest(backend) }
  if (backend.length !== 939136 || source.sha256 !== BACKEND_HASH) return { version: 1, status: 'unsupported', reason: 'unknown-backend-image', source, regions: [] }
  const baseClipVerified = baseClip === undefined ? false : await verifyMotionBaseClip(baseClip)
  const verified = await Promise.all(regions.map(async ([id, address, size, sha256]) => ({ id, ...await inspectMotionRegion(backend, { base: BACKEND_BASE, address, size, sha256 }) })))
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-mopsx-phase-prefix-v1', source, regions: verified,
    basePose: { initializer: '0x800d0408', caller: '0x800b9ac8', outputAddress: '0x8013a630',
      lookup: '0x800d0354', comparison: '0x800d5a28', literal: { address: '0x8005c53c', value: 'AAAAAA', size: 7,
        sha256: 'f35cba75462ebcf66593a3784baf7c7620b6b33554f42ea89c8fa6577bd07eb9' },
      keyIndex: 0, mirrorX: false, headingOffsetRaw: 0, baseClipVerified,
      member: { name: 'aaaaaa', size: 504, sha256: BASE_CLIP_HASH, keyCount: 6, valueCount: 121, translationMask: 65535, rotationMask: 65535 },
      resources: [
        { id: 'ZMODAT.BIG/mopsx115.viv/aaaaaa', archiveSha256: 'e3a54adc4d7585765359919dcd98db95ad099ae8411505d3649d7f38c04eef93', memberOffset: 3060 },
        { id: 'ZMODAT30.BIG/mopsx130.viv/aaaaaa', archiveSha256: 'ecd4541f9a7aaa89e025d899a13c2741467450a19d3c2d728037aef399d6dbd3', memberOffset: 3044 },
      ],
      behavior: 'Initialize the pose from full AAAAAA key zero. Later sparse applications preserve fields absent from their masks. An isolated clip inspection may reset to this base before applying its selected key; full transitions retain prior pose state.',
    },
    phase: { keyStepPhaseRaw: [512, 1024], selector: 'scaled=(signedPhase>>(1+(flags&1)))<<8 with 32-bit wrap; rawKey=scaled>>16; fraction16=scaled&65535; clamp each cache key independently.',
      directPrefixSelector: 'Clamp signedPhase>>(9+(flags&1)) to the key range.', lastKeyPhase: '(keyCount-1)*(512<<(flags&1))',
      caller: 'Observed packed-state caller passes (signed packedWord>>20)<<8. No seconds/FPS conversion is recovered.' },
    prefix: { headingOffset: { channel: 1, consumer: '0x800d0738', mirror: 'negate the signed halfword in a 32-bit word' },
      referenceA: { channels: [3, 4, 5], consumer: '0x800d0790', scale: 4096, mirror: 'negate X only' },
      referenceB: { channels: [6, 7, 8], consumer: '0x800d0824', scale: 4096, mirror: 'negate X only' }, unresolvedChannels: [0, 2] },
    interpolationEvidence: { enabledInApi: false, path: '0x800d1c20', selection: 'fraction16>>14 equal zero selects original key A; otherwise enters the arithmetic-midpoint path.',
      translation: '(signedHalfwordA+signedHalfwordB)<<11', quaternion: '(signedHalfwordA+signedHalfwordB)<<7',
      scope: 'These listed expressions cover ordinary non-root channels. Root heading adjustment, mirroring and alternate pose consumers remain separate; no floating-point lerp or quaternion slerp is substituted.' },
    limitations: [
      'Runtime API returns original discrete decoded keys; interpolation is explicitly disabled until its scaled-pose consumer is supported.',
      'Sparse frames require the authentic AAAAAA initialized pose or retained previous pose state. Missing translation/rotation channels must not be replaced by zero.',
      'Source phase units and neighbouring-key selection do not establish wall-clock playback frequency or loop/restart rules.',
      'The header timeValueRaw field remains raw; the verified endpoint query derives its result from key count and flag bit.',
      'Reference vectors participate in displacement/heading measurement; they are not automatically applied as entity/world root motion.',
      'Prefix channels 0 and 2, transition/contact events, clip-to-player action selection and complete gameplay animation scheduling remain unresolved.',
    ] }
}

export async function main(args = process.argv.slice(2)) {
  const [{ readFile }, path, { fileURLToPath }, { parseArgs }] = await Promise.all([import('node:fs/promises'), import('node:path'), import('node:url'), import('node:util')])
  const { values } = parseArgs({ args, strict: true, options: { directory: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/motion-playback.mjs [--directory EXTRACTED_DISC_DIRECTORY]\nPrints static source timing/prefix evidence. Does not run original code or assign an FPS.'); return }
  const directory = values.directory ?? fileURLToPath(new URL('../.work/reference/disc/', import.meta.url))
  console.log(JSON.stringify(await inspectMotionPlayback(await readFile(path.join(directory, 'BECODE.BIN'))), null, 2))
}

if (typeof process !== 'undefined' && process.versions?.node && process.argv[1]) {
  const [{ pathToFileURL }, path] = await Promise.all([import('node:url'), import('node:path')])
  if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
