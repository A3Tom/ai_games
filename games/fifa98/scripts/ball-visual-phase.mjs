/** Source ball sprite phase arithmetic. These are whole simulation ticks,
 * not a recovered relationship between ticks and browser wall-clock time. */
const freeze = Object.freeze
const word = (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0xffffffff
const fail = () => { throw new TypeError('Invalid source ball visual phase input.') }
const fixed = (left, right) => Math.floor((left * (right | 0) + 32768) / 65536) >>> 0

/** Original8A90C norm with signed comparisons and32-bit arithmetic. */
export function recoverBallVisualSpeed(dx, dz) {
  if (!word(dx) || !word(dz)) fail()
  let x = dx | 0, z = dz | 0
  if (x < 0) x = -x | 0
  if (z < 0) z = -z | 0
  return ((x + z | 0) - ((z < x ? z : x) >> 1)) >>> 0
}

/** Nonmutating original76580/76F80 accumulator tails. state=[Q16 accumulator,
 * four-state phase]. shortPath is the original ball+5984 bit0x20000 branch.
 * Main76650 consumes all ticks, then uses its LAST horizontal displacement
 * with the total tick count. Integrators must retain that source grouping.
 */
export function advanceBallVisualPhase(state, speed, ticks, { shortPath = false, blocked = 0, globalFlags = 0 } = {}) {
  if (!(Array.isArray(state) || state instanceof Uint32Array) || state.length !== 2 ||
      !Number.isInteger(state[0]) || state[0] < 0 || state[0] > 0x3ffff ||
      !Number.isInteger(state[1]) || state[1] < 0 || state[1] > 3 ||
      !word(speed) || !Number.isInteger(ticks) || ticks < 0 || ticks > 6 ||
      typeof shortPath !== 'boolean' || !word(blocked) || !word(globalFlags)) fail()
  if (blocked || (globalFlags & 0x20)) return freeze({ status: 'held', state: freeze([...state]) })
  const high = (speed | 0) > (shortPath ? 131071 : 32767)
  const rate = high ? ((fixed(shortPath ? 3755 : 1134, speed) + (shortPath ? 50065 : 12516)) >>> 0) : fixed(25032, speed)
  const accumulator = (state[0] + Math.imul(rate, ticks)) & 0x3ffff
  return freeze({ status: 'advanced', state: freeze([accumulator, accumulator >>> 16]) })
}

const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const RESIDENT_HASH = 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644'
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')
}
const backendRegions = [
  ['ball-reset-accumulator', 0x800746b8, 56],
  ['ball-mode-clear', 0x80074540, 64],
  ['global-visual-hold-setter', 0x80074c3c, 40],
  ['ball-update-branch', 0x8007bbc0, 76],
  ['short-path-visual-phase-and-heading', 0x80076580, 184],
  ['trajectory-displacement-and-speed', 0x800766a4, 192],
  ['main-path-visual-phase-and-heading', 0x80076f80, 184],
  ['horizontal-displacement-norm', 0x8008a90c, 56],
  ['ball-phase-heading-snapshot', 0x800d62a8, 44],
]

/** Entire-source identity gate plus independently reviewable region hashes. */
export async function inspectBallVisualPhase(backend, resident) {
  if (!(backend instanceof Uint8Array) || !(resident instanceof Uint8Array)) fail()
  const source = freeze({ backendSha256: await digest(backend), residentSha256: await digest(resident) })
  if (backend.length !== 939136 || resident.length !== 251904 || source.backendSha256 !== BACKEND_HASH || source.residentSha256 !== RESIDENT_HASH) {
    return freeze({ version: 1, status: 'unsupported', source, regions: freeze([]) })
  }
  const regions = []
  for (const [id, address, byteLength] of backendRegions) regions.push(freeze({ id, image: 'backend', address, byteLength,
    sha256: await digest(backend.subarray(address - 0x8005ae28, address - 0x8005ae28 + byteLength)) }))
  regions.push(freeze({ id: 'rounded-signed-fixed-multiply', image: 'resident', address: 0x800271a8, byteLength: 44,
    sha256: await digest(resident.subarray(0x800271a8 - 0x80011800 + 2048, 0x800271d4 - 0x80011800 + 2048)) }))
  return freeze({ version: 1, status: 'reconstruction-only', source, regions: freeze(regions),
    nativeExports: freeze(['fifa98_ball_visual_speed', 'fifa98_ball_visual_phase']),
    stateOffsets: freeze({ accumulator: 6228, phase: 6232, heading: 6236, blocked: 6240 }),
    supportedWholeTicks: freeze([0, 6]), accumulatorMask: 0x3ffff,
    simulation: freeze({ speedThreshold: 32767, lowMultiplier: 25032, highMultiplier: 1134, highAddend: 12516 }),
    shortPath: freeze({ speedThreshold: 131071, lowMultiplier: 25032, highMultiplier: 3755, highAddend: 50065 }),
    tickSeconds: null, warnings: freeze(['Source trajectory displacement, not next-step physics velocity, drives speed and heading. Source phase runs once per consumed group. Contact/event dispatch and wall-clock cadence remain separate.']) })
}
