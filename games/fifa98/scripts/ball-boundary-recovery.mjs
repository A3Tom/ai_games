import { createHash } from 'node:crypto'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { inspectBallInteractionRecovery } from './ball-interaction-recovery.mjs'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const backendHash = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const residentHash = 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644'
export const ballBoundaryNativeExports = Object.freeze(['fifa98_ball_outside_pitch', 'fifa98_ball_boundary_geometry', 'fifa98_ball_goal_plane'])
const regions = [
  ['pitch-goal-dimensions', 0x800b595c, 1028, '541c83468f597e77663509bc0f1239371b15f8a640e62406086fd29c74e1475b'],
  ['source-ball-radius', 0x80074540, 64, '034db5ba563d659ea66200d54a681e429d7e0da207a3cf6adbdeb274d9658fb0'],
  ['derived-net-bounds', 0x80077068, 304, 'a877c0344b37c4cec3d26439dace7e2dce0aa3c3bc58a1ac04717ff77a626493'],
  ['plane-fraction', 0x80077198, 72, 'bbc334aa4ad5a1ce7a79a321136406e3a431b124187bb74327c9317d74e1b12c'],
  ['inner-side-plane', 0x80077c64, 592, '9282c88e6529991f3038c1c1d6b68c52895274da345f8427b5e01c9d8506172f'],
  ['inner-roof-plane', 0x80077eb4, 508, '1515f5388acb5d638dafea7a8deb7d5142c09495121c5e4ea713c4df7ccda45a'],
  ['outer-roof-plane', 0x80078258, 484, '5bcd600433959e5f84e5fb3bb5ab5f18dd8f0c7b3179099fcefab4c94028af5f'],
  ['outer-side-plane', 0x8007843c, 580, '0318ac70600a02046170d812b7b0a2da8bdde2a737f8459c9598b35437e6a72f'],
  ['pitch-outside-flag', 0x8007a5f8, 116, '38f1955ab60d8ef0b6607d05f3003dcf65b618803d5524261c343375039153d7'],
]

/** Complete-image identity gates precede static evidence and table export. */
export function inspectBallBoundaryRecovery(backend, resident) {
  if (!(backend instanceof Uint8Array) || !(resident instanceof Uint8Array)) throw new TypeError('Boundary recovery requires backend and resident bytes')
  const sources = [{ image: 'BECODE.BIN', size: backend.length, sha256: hash(backend) },
    { image: 'SLES_009.14', size: resident.length, sha256: hash(resident) }]
  if (backend.length !== 939136 || resident.length !== 251904 || sources[0].sha256 !== backendHash || sources[1].sha256 !== residentHash) {
    return { version: 1, status: 'unsupported', sources, regions: [], tables: {} }
  }
  const evidence = regions.map(([id, address, size, sha256]) => ({ id,
    ...inspectRecoveredRegion(backend, { base: 0x8005ae28, address, size, sha256 }) }))
  evidence.push({ id: 'joint-sine-cosine', image: 'resident', ...inspectRecoveredRegion(resident.subarray(2048), {
    base: 0x80011800, address: 0x800272e0, size: 188, sha256: '27e63dd3e1c892371a208621c78b9083d9d379a3f272112fe40b4d156072e2e5',
  }) })
  const dependency = inspectBallInteractionRecovery(backend, resident)
  return { version: 1, status: 'reconstruction-only', sources, nativeSource: 'native/ball-boundary.c', nativeExports: ballBoundaryNativeExports,
    regions: evidence, tables: { atan16: dependency.tables.atan16, sine: dependency.tables.sine },
    fixture: { profile: 2, params: [1824, 2544, 5, 228, 152, 6, 6, 152, 76],
      label: 'Explicit profile2 source geometry; no match initialization or rule state inferred.' },
    normalProfile2: { halfWidth: 1824, halfLength: 2544, radius: 5, goalHalfWidth: 228, goalHeight: 152,
      postDiameter: 6, barDiameter: 6, netLowerDepth: 152, netUpperDepth: 76 },
    globals: { halfWidth: '0x8013fd7c', halfLength: '0x8013fd80', ballRadius: '0x8013ded0', goalHalfWidth: '0x8013fd90',
      goalHeight: '0x8013fd54', postDiameter: '0x8013fd64', barDiameter: '0x8013fd68', lowerNetDepth: '0x8013fd60', upperNetDepth: '0x8013fd5c',
      innerBackLower: '0x8013af64', innerBackUpper: '0x8013f128', outerBackUpper: '0x80133320', outerBackLower: '0x8013c51c' },
    abi: { outside: { args: ['positionQ16_XYZ3', 'halfWidthInteger', 'halfLengthInteger', 'radiusInteger'], returns: { outside: 16, inside: 0, invalid: -1 },
        semantics: 'Original endpoint flag, strictabsX/Z>radius-adjusted halfextent; no swept event time or collision response.' },
      geometry: { params: ['halfWidth', 'halfLength', 'radius', 'goalHalfWidth', 'goalHeight', 'postDiameter', 'barDiameter', 'netLowerDepth', 'netUpperDepth'],
        output: ['firstSevenParams', 'innerBackLowerQ16', 'innerBackUpperQ16', 'outerBackUpperQ16', 'outerBackLowerQ16'], returns: { success: 1, invalid: 0 } },
      planes: { args: ['kind0..3', 'fromQ16_XYZ3', 'toQ16_XYZ3', 'geometry11', 'earliestQ16_1..65537', 'out4'],
        kinds: ['inner-side', 'inner-roof', 'outer-roof', 'outer-side'], output: ['fractionQ16', 'pointXQ16', 'pointYQ16', 'pointZQ16'],
        returns: { contact: 1, none: 0, invalid: -1 }, sourceBranch: 'Complete constrained/contact a3=1 branch. Probe-only a3=0 branches are excluded.' } },
    limitations: ['The source outside flag is not a scoring decision, a restart, a wall bounce or a recovered goalmouth-plane event.',
      'Four source net-plane predicates do not include circular posts/crossbar, sloping back-net plane779A8, earliest-case orchestration or response79000.',
      'Native geometry consumes explicit source params and verified tables; it does not recreate mutable match globals or choose match settings.',
      'Native calls reject invalid domains/storage transactionally. Source arithmetic and ties are preserved inside that bounded ABI.',
      'Original match scoring, laws, contact/ownership acquisition, player collision and resets remain separate.'] }
}
