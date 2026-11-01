/** Original action database and locomotion selector, recovered by static reading.
 * No console code is executed. Source tables are supplied as verified assets;
 * no commercial clip data or invented clock rate is embedded here.
 */
const freeze = Object.freeze
const BACKEND_BASE = 0x8005ae28
const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const ACTION_HASH = '914994f8e4edef1878214d5c4fd967769e0c2946e033251e11b1577fca5fc270'
const fail = (message) => { throw new Error(`Invalid locomotion animation: ${message}`) }
const word = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff

export function parseAnimationActions(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Expected action database bytes.')
  if (input.length < 52 || input.length > 1024 * 1024) fail('database size exceeds supported bounds')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const count = view.getUint32(0, true), descriptorOffset = view.getUint32(4, true)
  if (!count || count > 4096 || descriptorOffset !== 8 + count * 20 || descriptorOffset > input.length - 24 ||
      (input.length - descriptorOffset) % 24) fail('inconsistent action/descriptor boundaries')
  const descriptors = [], names = new Set()
  for (let offset = descriptorOffset; offset < input.length; offset += 24) {
    const raw = input.subarray(offset, offset + 24)
    if (raw.every((value) => value === 0)) {
      if (offset !== input.length - 24) fail('descriptor terminator precedes trailing data')
      continue
    }
    if (offset === input.length - 24) fail('missing descriptor terminator')
    const terminator = raw.subarray(0, 10).indexOf(0)
    if (terminator < 1) fail('unterminated or empty clip name')
    const bytes = raw.subarray(0, terminator)
    if ([...bytes].some((value) => value < 33 || value > 126 || value === 47 || value === 92)) fail('unsafe clip name')
    const clipName = String.fromCharCode(...bytes).toLowerCase()
    if (names.has(clipName)) fail('duplicate clip name')
    names.add(clipName)
    const index = descriptors.length
    if (view.getUint16(offset + 10, true) !== index) fail('descriptor index does not match its row')
    descriptors.push(freeze({ index, offset, clipName,
      flagsRaw: view.getUint16(offset + 12, true), unknownHalfwordRaw: view.getUint16(offset + 14, true),
      pointerRaw: view.getUint32(offset + 16, true), unknownWordRaw: view.getUint32(offset + 20, true) }))
  }
  if (!descriptors.length) fail('database contains no clip descriptors')
  const records = []
  for (let index = 0; index < count; index++) {
    const offset = 8 + index * 20
    const descriptorPointer = view.getUint32(offset + 12, true)
    const descriptorIndex = (descriptorPointer - descriptorOffset) / 24
    const nextActionId = view.getUint16(offset + 2, true), fallbackActionId = view.getUint16(offset + 4, true)
    if (view.getUint16(offset, true) !== index || nextActionId >= count || fallbackActionId >= count ||
        !Number.isInteger(descriptorIndex) || descriptorIndex < 0 || descriptorIndex >= descriptors.length) fail('action references exceed the database')
    records.push(freeze({ actionId: index, offset, nextActionId, fallbackActionId,
      headingOffsetRaw: view.getInt16(offset + 6, true), flagsRaw: view.getUint32(offset + 8, true),
      descriptorIndex, clipName: descriptors[descriptorIndex].clipName,
      initialBlendRaw: view.getUint16(offset + 16, true), transitionBlendRaw: view.getUint16(offset + 18, true) }))
  }
  return freeze({ format: 'FIFA98-AISEQS', byteLength: input.length, actionCount: count,
    records: freeze(records), descriptors: freeze(descriptors) })
}

async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const categoryRanges = [[0x801293ac, 198], [0x80129474, 18], [0x80129488, 18], [0x8012949c, 18]]
const actionRanges = [[0x801294bc, 110], [0x80129598, 55], [0x80129608, 55], [0x80129678, 55], [0x801296e8, 55]]
const regions = [
  ['action-pointer-relocation', 0x800b8fa8, 72], ['action-clip-name-lookup', 0x800b8ff0, 104],
  ['selector-table-initialization', 0x800b9058, 612], ['locomotion-selector', 0x800b92bc, 804],
  ['missing-clip-fallback', 0x800ba904, 100], ['simulation-delta-to-animation-phase', 0x800b9c58, 32],
  ['animation-clock-add', 0x800d0054, 32], ['elapsed-phase-and-rate', 0x800d4044, 244],
  ['loop-endpoint-wrap', 0x800d42b0, 72], ['last-key-phase-endpoint', 0x800d08b8, 48],
  ['original-115-asset-selection', 0x8011d514, 204], ['central-animation-clock-call', 0x8006a4b0, 24],
  ['selector-category-constructor', 0x800b9c78, 96], ['run-variant-attribute-selection', 0x800a53f0, 76],
  ['player-snapshot-position-write', 0x800d6358, 128], ['player-snapshot-position-read', 0x800d607c, 36],
  ['player-render-position-conversion', 0x800d96dc, 180],
]

export async function inspectLocomotionAnimation(backend, actionBytes) {
  if (!(backend instanceof Uint8Array) || !(actionBytes instanceof Uint8Array)) throw new TypeError('Expected source image and action database bytes.')
  const source = freeze({ backendSha256: await digest(backend), actionSha256: await digest(actionBytes) })
  if (backend.length !== 939136 || source.backendSha256 !== BACKEND_HASH || actionBytes.length !== 25108 || source.actionSha256 !== ACTION_HASH) {
    return freeze({ version: 1, status: 'unsupported', source, regions: freeze([]), tables: freeze([]) })
  }
  const verified = await Promise.all(regions.map(async ([id, address, byteLength]) => freeze({ id, address, byteLength,
    sha256: await digest(backend.subarray(address - BACKEND_BASE, address - BACKEND_BASE + byteLength)) })))
  return freeze({ version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-locomotion-animation-v1', source,
    actionCount: parseAnimationActions(actionBytes).actionCount, regions: freeze(verified),
    tables: freeze([...categoryRanges.map(([address, byteLength]) => freeze({ address, byteLength, element: 'u8' })),
      ...actionRanges.map(([address, count]) => freeze({ address, byteLength: count * 2, element: 'u16le' }))]),
    assetSelection: freeze({ archive: 'ZMODAT.BIG', clips: 'mopsx115.viv', banks: 'mopsx115.bk%d', actions: 'aiseqs.tbi' }),
    timing: freeze({ phaseUnitsPerIntegerSimulationTick: 256, elapsedPhaseCap: 3072, wallClockSecondsPerTick: null }),
    renderPlacement: freeze({ simulationToModelScale: 2, simulationYOffsetBeforeScale: -3,
      coordinateInput: 'signed high16 snapshot XYZ within the supported pitch bounds',
      originalOutput: 'packed halfword model coordinates after subtracting doubled camera position' }),
  })
}

/** Startup 0x800b8fa8/8ff0/9058: resolve source names and initialize selectors.
 * The supported center clips have axis-aligned integer prefix displacement.
 * Refuse other displacement geometry until the original hypot is ported.
 */
export async function prepareLocomotionTables(backend, actionBytes, decodedClipsByName) {
  const evidence = await inspectLocomotionAnimation(backend, actionBytes)
  if (evidence.status !== 'reconstruction-only') fail('source fingerprint differs from reviewed SLES_009.14 data')
  const database = parseAnimationActions(actionBytes)
  const clip = (name) => decodedClipsByName instanceof Map ? decodedClipsByName.get(name) :
    Object.hasOwn(decodedClipsByName ?? {}, name) ? decodedClipsByName[name] : undefined
  const resolve = (id) => clip(database.records[id].clipName) ? id : database.records[id].fallbackActionId
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength)
  const categoryBytes = categoryRanges.flatMap(([address, size]) => [...backend.subarray(address - BACKEND_BASE, address - BACKEND_BASE + size)])
  const actionHalfwords = actionRanges.flatMap(([address, count]) => Array.from({ length: count }, (_, index) => view.getUint16(address - BACKEND_BASE + index * 2, true)))
  const referenceFor = (id) => {
    const entry = database.records[id], motion = clip(entry.clipName)
    if (!motion || !Number.isInteger(motion.keyCount) || motion.keyCount < 2 || !Array.isArray(motion.frames) || motion.frames.length !== motion.keyCount) fail(`missing decoded calibration clip ${entry.clipName}`)
    const first = motion.frames[0].prefixRaw, last = motion.frames.at(-1).prefixRaw
    if (!Array.isArray(first) || !Array.isArray(last) || first.length !== 9 || last.length !== 9 ||
        [...first, ...last].some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) fail('invalid calibration prefix')
    // BA6A0..6CC: wrap fixed12 delta, take absolute value, then ASR16.
    const x = Math.floor(Math.abs(((last[3] - first[3]) << 12)) / 65536)
    const z = Math.floor(Math.abs(((last[5] - first[5]) << 12)) / 65536)
    if (x && z) fail('non-axis calibration requires the original integer hypot')
    const duration = (motion.keyCount - 1) * (2 << (motion.flags & 1))
    if (duration < 1 || duration > 32767) fail('unsupported calibration phase duration')
    // 27100 positive fixed divide of (distance<<16)/(duration<<16), then SRA5.
    return (Math.floor(Math.max(x, z) * 65536 / duration) >> 5) & 65535
  }
  for (let row = 0; row < 55; row++) {
    const id = resolve(actionHalfwords[row * 2])
    actionHalfwords[row * 2] = id
    actionHalfwords[row * 2 + 1] = referenceFor(id)
  }
  for (let index = 110; index < actionHalfwords.length; index++) actionHalfwords[index] = resolve(actionHalfwords[index])
  const runVariants = Array.from({ length: 3 }, (_, index) => {
    const id = resolve(view.getUint16(0x801294b0 - BACKEND_BASE + index * 4, true))
    return freeze({ actionId: id, referenceRaw: referenceFor(id) })
  })
  return freeze({ version: 1, source: evidence.source, evidence,
    database, categoryBytes: freeze(categoryBytes), actionHalfwords: freeze(actionHalfwords), runVariants: freeze(runVariants),
    warnings: freeze(['Selection preserves source numeric categories and flags. Controller initialization, action callbacks and wall-clock cadence remain separate.']) })
}

function validateSelector(state, motion, tables) {
  if (!Array.isArray(state) || state.length !== 3 || !Array.isArray(motion) || motion.length !== 9 ||
      [...state, ...motion].some((value) => !word(value)) || state[0] < 0 || state[0] > 11 || state[2] < 0 || state[2] > 65535 ||
      motion[1] < 0 || motion[1] > 2 || motion[7] < 0 || motion[7] > 660 || motion[8] < 0 || motion[8] > 65535 ||
      !Array.isArray(tables?.categoryBytes) || tables.categoryBytes.length !== 252 || tables.categoryBytes.some((value) => !Number.isInteger(value) || value < 0 || value > 10) ||
      !Array.isArray(tables?.actionHalfwords) || tables.actionHalfwords.length !== 330 || tables.actionHalfwords.some((value, index) =>
        !Number.isInteger(value) || value < 0 || value > (index < 110 && index % 2 ? 65535 : 660))) fail('selector input exceeds reviewed bounds')
  let speedIndex = ((motion[0] + 32768) | 0) >> 16
  if (!speedIndex && (motion[0] | 0) >= 19661) speedIndex = 1
  if (speedIndex < 0 || speedIndex > 17) fail('rounded speed exceeds reviewed table')
  return speedIndex
}

/** Complete 0x800b92bc..0x800b95dc numerical selector.
 * state3 = current category, companion playback rate word20, deadline halfword28.
 * motion9 = speed, turn category, signed turn value, facing, movement heading,
 *           animation motion flags24, whole clock, run-variant action/reference.
 */
export function selectLocomotionAction(state, motion, tables) {
  const speed = validateSelector(state, motion, tables)
  const result = state.map((value) => value >>> 0)
  const [velocity, turnCategory, turnValue, facing, movement, flags, now, variantAction, variantReference] = motion
  const category = state[0] === 11 ? 0 : state[0]
  const style = flags & 4 ? 2 : flags & 1 ? 3 : flags & 2 ? 4 : flags & 8 ? 1 : 0
  const categories = tables.categoryBytes, actions = tables.actionHalfwords
  let next = turnCategory === 0 ? categories[category * 18 + speed] : turnCategory === 2 ? categories[198 + speed] :
    categories[(((facing - movement) & 1023) > 512 ? 216 : 234) + speed]
  if (next === category && (state[2] >>> 0) < (now >>> 0) && turnCategory === 0) next = categories[speed]
  result[0] = next
  const angleAction = (group) => actions[110 + group * 55 + style * 11 + next]
  if (flags & 64) return freeze({ actionId: angleAction(0), state: freeze(result) })
  if (flags & 128) return freeze({ actionId: angleAction(1), state: freeze(result) })
  let actionId, reference = 0, adjustRate = false
  if ((turnValue | 0) < -26) actionId = angleAction(0)
  else if ((turnValue | 0) < -9) actionId = angleAction(2)
  else if ((turnValue | 0) >= 27) actionId = angleAction(1)
  else if ((turnValue | 0) >= 10) actionId = angleAction(3)
  else {
    const offset = (style * 11 + next) * 2
    actionId = actions[offset]; reference = actions[offset + 1]; adjustRate = true
  }
  if ((flags & 512) && actionId === 554) { result[1] = 65536; actionId = 8 }
  else if ((flags & 32) && actionId === 499) { result[1] = 65536; actionId = 453 }
  else {
    if (actionId === 499) { actionId = variantAction; reference = variantReference }
    result[1] = adjustRate ? (65536 + (Math.max(-0x13330, Math.min(0x13330, (velocity - (reference << 5)) | 0)) >> 2)) >>> 0 : 0
  }
  return freeze({ actionId, state: freeze(result) })
}

/** Original initializer A53F8: numeric source fields, without stat labels. */
export function selectRunVariantIndex(attributeByte61, attributeHalfword24) {
  if (!Number.isInteger(attributeByte61) || attributeByte61 < 0 || attributeByte61 > 255 ||
      !Number.isInteger(attributeHalfword24) || attributeHalfword24 < 0 || attributeHalfword24 > 65535) fail('run variant attributes exceed their source widths')
  return Math.max(0, Math.min(2, (attributeByte61 - attributeHalfword24) >> 2))
}

/** Same-loop phase arithmetic from B9C58/D0054/D4044, excluding callbacks.
 * Caller must establish source runtime loop flag4 and absence of flags160h
 * (paused40h, linked20h, externally advanced100h). These are action/runtime
 * flags, not the unrelated MOP clip-header flag bits.
 * state3 = animation clock phase, clip timestamp, clip phase. Caller supplies
 * the same Q16 simulation delta, Q16 playback rate and positive loop endpoint.
 */
export function advanceLocomotionPhase(state, deltaQ16, rateQ16, endPhase) {
  if (!Array.isArray(state) || state.length !== 3 || state.some((value) => !word(value)) ||
      !Number.isInteger(deltaQ16) || deltaQ16 < 0 || deltaQ16 > 6 * 65536 ||
      !Number.isInteger(rateQ16) || rateQ16 < 0 || rateQ16 > 2 * 65536 ||
      !Number.isInteger(endPhase) || endPhase < 1 || endPhase > 4193280 ||
      state[2] < 0 || state[2] >= endPhase) fail('phase arithmetic exceeds supported same-loop bounds')
  const clock = (state[0] + (deltaQ16 >> 8)) | 0, stamp = state[1] | 0
  if (stamp >= clock) return freeze([clock >>> 0, stamp >>> 0, state[2] >>> 0])
  const elapsed = Math.min(3072, (clock - stamp) | 0)
  if (elapsed < 0) fail('animation clock difference wraps outside supported same-loop bounds')
  const advance = Math.floor((elapsed * rateQ16 + 32768) / 65536)
  if (!advance) return freeze([clock >>> 0, stamp >>> 0, state[2] >>> 0])
  return freeze([clock >>> 0, clock >>> 0, (state[2] + advance) % endPhase])
}
