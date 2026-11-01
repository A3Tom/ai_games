import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { decodeInstruction } from './code-map.mjs'

const BASE = 0x8005ae28
const HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hex = (number) => `0x${number.toString(16).padStart(8, '0')}`
export const ballMotionNativeExports = Object.freeze(['fifa98_random_seed', 'fifa98_random_next',
  'fifa98_ball_air_motion', 'fifa98_ball_motion_tick'])
const regions = [
  ['complete-air-drag-and-spin-routine', 0x8007a88c, 428, '3dfb1272355092c168d871a8702ba0a26f4acd8d87611b4224b9b253abdfd68b'],
  ['complete-random-initializer', 0x8008ad3c, 64, '35301446027fd87b0123cb98be5563ca801092efab0473d1e3538e7b0954ee15'],
  ['complete-random-generator', 0x8008ad7c, 372, '29b3d1a2d2d6196e8bbab3d9ac4afff0ebac69d78cd0e2d2af929d80998bca42'],
  ['predictor-air-ground-selection', 0x8007b520, 156, '7b3bbf8a8fb9e49bd4d632987e266654a68edacf646c8ba89d3c098f3a0448a5'],
]

/** Static exact-image evidence only; never runs original instructions. */
export function inspectBallMotionRecovery(backend) {
  if (!(backend instanceof Uint8Array)) throw new TypeError('Ball motion recovery requires Uint8Array bytes')
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) }
  if (source.size !== 939136 || source.sha256 !== HASH) return { version: 1, status: 'unsupported', source, regions: [], nativeExports: [], callPath: [] }
  const verified = regions.map(([id, address, size, sha256]) => ({ id,
    ...inspectRecoveredRegion(backend, { base: BASE, address, size, sha256 }) }))
  const seedBytes = backend.subarray(0x8005b180 - BASE, 0x8005b186 - BASE)
  if (digest(seedBytes) !== '2c86ecb82d6795f47a3748be32e2b7361c0a328bd3d2c7d846f8818d6ac9fdc9') throw new Error('Original random seed bytes differ')
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength)
  const callPath = [[0x8007a8a8,0x800271a8], [0x8007a918,0x800271a8], [0x8007a928,0x800271a8],
    [0x8007a944,0x800271a8], [0x8007a954,0x800271a8], [0x8007a968,0x8008ad7c],
    [0x8007a990,0x800271a8], [0x8007a99c,0x800271a8], [0x8007a9b8,0x800271a8],
    [0x8007a9c4,0x800271a8], [0x8007a9e0,0x800271a8], [0x8007b544,0x8007a88c],
  ].map(([at,target]) => {
    const instruction = decodeInstruction(view.getUint32(at - BASE, true), at)
    if (instruction.flow.kind !== 'call' || instruction.flow.target !== target) throw new Error('Original ball motion call differs')
    return { at: hex(at), target: hex(target), word: hex(instruction.word) }
  })
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-ball-motion-v1', source,
    nativeSource: 'native/ball-motion.c', nativeExports: ballMotionNativeExports, regions: verified, callPath,
    random: { seedAddress: '0x8005b180', seedBytes: [...seedBytes], stateAddress: '0x8012769c', words: 6,
      lastResultAddress: '0x8013c66c', resultRange: [0,65535], initializer: 'state[i] = (seed << 25) + seedBytes[i] with32-bit wrap',
      note: 'Explicit random state and returned value replace globals. Full match seed selection and consumption order are not established.' },
    spin: { velocityWords: 3, spinWords: 1, drag: 203, normalCurveFactor: 10000, alternateCurveFactor: 320000,
      decay: 63963, optionsAddress: '0x80054480', alternateMask: 64,
      order: ['drag all XYZ', 'add fixedMultiply(fixedMultiply(spin,draggedZ),factor) to X',
        'subtract fixedMultiply(fixedMultiply(spin,updatedX),factor) from Z',
        'in option64 branch consume one source random value; negate spin if low nibble zero',
        'spin = fixedMultiply(spin,0xf9db)', 'add source gravity/3600 expression to Y'],
      optionName: null, gravityAddress: '0x80125d18', gravity: -33554432,
      gravityPerStep: -9320 },
    composition: { kind: 'new-guarded-composition', state: ['positionXYZ','velocityXYZ','previousXYZ'],
      returnCodes: { advanced: 1, floorPhysicsApplied: 2, invalidOrBelowGround: 0, overflow: -1 },
      order: ['advance position', 'isolated original floor physics', 'original air-spin routine or rolling drag'],
      limitations: ['No complete predictor, trajectory/event records or callbacks', 'No player, net, post or wall contacts',
        'No special predictor states', 'Explicit coefficients/options/random seed are inspection configuration',
        'The successful C APIs require distinct valid arrays; guards are newly written platform checks'] },
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(inspectBallMotionRecovery(await readFile(fileURLToPath(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)))), null, 2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
