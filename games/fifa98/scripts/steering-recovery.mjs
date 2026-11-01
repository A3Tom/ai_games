import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { inspectPlayerTable } from './player-recovery.mjs'
import { decodeInstruction } from './code-map.mjs'

const BASE = 0x8005ae28
const HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hex = (value) => `0x${value.toString(16).padStart(8, '0')}`
export const steeringNativeExports = Object.freeze(['fifa98_player_steer', 'fifa98_player_speed_clamp'])

const regions = [
  ['steering-routine', 0x8008cd44, 1432, '9e992e624d65068e8cf95ad8a6ed3a0c0bcabd8ccb4ee9116aa068bd44a682ce'],
  ['motion-speed-selection-prefix', 0x8008d2dc, 648, 'c9286f4f5f2bc1535c57043659864b3df4680f2202c895a590d6104aa7872c7d'],
  ['animation-request-guard', 0x800ba0c0, 172, '8957639d57443e4f80fa6db244fb671b106ca12daf167cd1357c836de72e71e4'],
  ['motion-caller', 0x8008dc80, 844, 'bc0a9f554d15c94bd063525d783f13ac69957db03ea2d9d5202da36ffc21149f'],
  ['attribute-turn-coefficient', 0x800a539c, 32, 'c908389691d3818ecc2f11996db0f4d5de08fd4aed8dd4f6db95288a02654ee2'],
  ['alternate-attribute-turn-coefficient', 0x800a5568, 32, 'c908389691d3818ecc2f11996db0f4d5de08fd4aed8dd4f6db95288a02654ee2'],
  ['motion-constructor', 0x8008dbac, 212, '85d90135f6b14701b6d7a94826b25ece298bca12a003d1fabb7963baac32f637'],
  ['per-update-flags-clear', 0x800878c0, 12, 'a72e611fc8bd8a9109c9af67cad232736e85993c21d50f764a94a98de3162419'],
  ['conditional-face-movement-flag-a', 0x800a5d60, 24, '27bc4ee65f93eb773cfd5759722e1b81e26d3d4e64e9d39d782838f3c77981f9'],
  ['conditional-face-movement-flag-b', 0x800a5fa0, 24, '27bc4ee65f93eb773cfd5759722e1b81e26d3d4e64e9d39d782838f3c77981f9'],
  ['desired-facing-reference-selector', 0x800a6020, 56, 'bff1e19f22aee5824b38f02767e7d60f9600dfcec0394839d4ed295e42b453e3'],
]

const tables = [
  ['turnThresholds', 0x801277bc, 6, 'd09a895252f5eb53ebafcc24c5ade1d1b0770e9dcc0b0b52637379a7685da5aa'],
  ['classSpeedCaps', 0x80127730, 3, 'f0b3ff092d72474826cea1d5a32a1e5f30372212e22433780b9829974063686c'],
]

/** Read-only exact-image-gated steering/clamp evidence. No code is executed. */
export function inspectSteeringRecovery(backend) {
  if (!(backend instanceof Uint8Array)) throw new TypeError('Steering recovery requires Uint8Array backend bytes')
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) }
  if (source.size !== 939136 || source.sha256 !== HASH) return { version: 1, status: 'unsupported', reason: 'unknown-steering-image', source, regions: [], tables: {}, callPath: [] }
  const verified = regions.map(([id, address, size, sha256]) => ({ id, ...inspectRecoveredRegion(backend, { base: BASE, address, size, sha256 }) }))
  const data = Object.fromEntries(tables.map(([id, address, count, sha256]) => [id,
    inspectPlayerTable(backend, { base: BASE, address, count, element: 'u32', sha256 })]))
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength)
  const callPath = [[0x8008dcfc, 0x8008cd44], [0x8008dd0c, 0x8008d2dc],
    [0x8008cdc4, 0x80026fd0], [0x8008ceec, 0x800ba0c0], [0x8008d11c, 0x800ba0c0],
    [0x800ba148, 0x800ba084], [0x800a603c, 0x80026fd0], [0x800a6060, 0x8008dc80]].map(([at, target]) => {
      const decoded = decodeInstruction(view.getUint32(at - BASE, true), at)
      if (decoded.flow.kind !== 'call' || decoded.flow.target !== target) throw new Error('Reviewed steering call path differs from source')
      return { at: hex(at), target: hex(target), word: hex(decoded.word) }
    })
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-steering-clamps-v1', source,
    nativeSource: 'native/steering.c', nativeExports: steeringNativeExports, regions: verified, tables: data, callPath,
    abi: {
      state: ['facing132', 'movementHeading136', 'desiredFacing144', 'angularMagnitude152', 'turnClass156', 'speed160', 'motionFlags216', 'status220', 'turnSide222', 'ownerStateFlags24', 'headingDelta140', 'facingSector148', 'copyFacing16', 'copyMovement20'],
      steeringInput: ['ticks', 'distance96', 'desiredDX100', 'desiredDZ104', 'turnCoefficient24', 'ownerFlags36'],
      steeringDetail: ['originalSlowdownReturn', 'requestedAnimationAction', 'requestedHeading', 'sourceCallAddress'],
      clampControl: ['desiredSpeed176', 'rangeFlags92', 'distance96', 'speedPenalty188', 'steeringSlowdown', 'ticks'],
      clampProfile: ['normalMaximum', 'alternateMaximum', 'normalAcceleration', 'alternateAcceleration', 'deceleration', 'inverseNormalAcceleration', 'inverseAlternateAcceleration', 'inverseDeceleration'],
      clampOutput: ['postClampTargetSpeed', 'selectedAcceleration', 'deceleration', 'inverseSelectedAcceleration', 'inverseDeceleration', 'ticks', 'movementHeading'],
      returns: { success: 1, invalid: 0, unsupportedAnimation: -2 },
      pointerAdaptation: 'Motion+0 points to its owning runtime/animation object. Owner+24/+36 are relative to that linked object; constructor receives the outer player+84 as owner, and the outer player+124 as motion. They are not the outer player attribute-pointer/flags fields.',
    },
    steering: { anglePeriod: 1024, signedFoldRange: [-511, 512], stoppedSpeedThreshold: 19660,
      travelTurnCoefficient: 'turnCoefficient24 - (signed speed160 >> 16) + 14; multiply by ticks and retain low32',
      facingTurnCoefficient: 'turnCoefficient24 + 14; multiply by ticks and retain low32',
      halfRateFlag: 32, nearTargetDistance: 9,
      animationGuard: 'BA0C0 returns zero without side effects when !(ownerFlags36&0x200) or ownerStateFlags24==1. Otherwise the native subset returns -2 at the request, leaves state untouched, and reports action/heading/call address; no callback result is invented.',
    },
    speedClamps: { flagCaps: [{ flag: 64, maximum: 98304 }, { flag: 128, maximum: 262144 }, { flag: 256, maximum: 425984 }],
      priority: 'Flag0x40 before0x80 before0x100; all comparisons signed.',
      range: 'Unless rangeFlags92&0x10000, distance<8 sets zero; distance8..159 caps at65536+distance*2048; distance>=160 leaves target unchanged.',
      alternateProfileFlag: 0x100000, penaltyFlags: 0x6000000,
      classCap: 'A target above the current class cap is always reduced to the cap by delay-slot0x8008d530. Current speed at or above the cap additionally sets status bit1; lower current speed skips only that status store.',
      slowdown: 'Nonzero steering slowdown forces target zero unless motionFlags216&4.',
    },
    initialization: { turnCoefficient: { attributeByte: 43, expression: 'min(attributeByte43>>2,12)', source: '0x800a539c' },
      flags: { constructor: 0, perUpdateClear: '0x800878c4', faceMovementFlag: 16, faceMovementWrites: ['0x800a5d6c', '0x800a5fac'], selection: 'State-dependent; no universal active locomotion flags are asserted.' },
      desiredFacing: '0x800a6020..0x800a6054 stores atan2(selectedReferenceX-positionX,selectedReferenceZ-positionZ), or current facing when both deltas are zero. The selected reference depends on action/state; it is not universally the movement target.',
    },
    inspectionRecipe: { label: 'Explicit source-branch inspection configuration; not recovered full match initialization',
      attributeByte43: 40, turnCoefficient: 10, motionFlags216: 16, ownerFlags36: 0x900, ownerStateFlags24: 0,
      sourceMeaning: '0x900 enables the caller horizontal and steering branches while clearing animation-availability0x200. Flag16 selects the original face-movement branch away from the target; choosing this combination is inspection configuration.',
      initialState: Array(14).fill(0).map((value, index) => index === 6 ? 16 : value),
      order: ['construct original control target', 'derive target distance/delta', 'select original target speed', 'reapply explicit inspection flags216 and set ownerStateFlags24=arithmetic(flags216>>16)', 'select an inspection facing reference; a zero delta copies current facing', 'clear status220', 'steer; pause on unsupported animation', 'apply source speed clamps', 'integrate original horizontal arithmetic'],
      desiredFacing: 'Choose the inspection facing reference equal to current position: source0x800a604c/6054 then copies currentFacing132 to desiredFacing144 each tick. This selects a verified zero-reference branch without claiming the full action-dependent source reference selector.',
      time: 'ticks is an explicit source-unit step; browser inspection cadence is not asserted as the original clock.',
    },
    limitations: [
      'Animation callback success, its clip/state mutations, and the table-entry661 no-op case are not ported. Unsupported requests stop before committing native state.',
      'This covers original steering and speed-prefix arithmetic only. The remaining motion routine, animated height, contacts, action selection and complete match initialization are separate.',
      'Flags are recomputed per original update by action/controller code. A persistent inspection flag configuration is not the full gameplay dispatcher.',
      'Desired-facing reference selection can differ from movement target; no generic direction-facing policy is substituted.',
      'Tick bounds, null checks and transactional failure are new native API guards; no console instructions, registers, virtual memory or CPU runtime are executed.',
    ],
  }
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/steering-recovery.mjs [--backend BECODE.BIN]\nPrint source-verified steering and speed-clamp evidence without executing original code.'); return }
  console.log(JSON.stringify(inspectSteeringRecovery(await readFile(values.backend ?? fileURLToPath(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)))), null, 2))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
