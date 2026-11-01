import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { inspectPlayerTable } from './player-recovery.mjs'
import { parseAnimationActions } from './locomotion-animation.mjs'
import { actionRuntimeFlags, isPlainActionLoop } from './action-transition.mjs'

const BASE = 0x8005ae28
const BACKEND_SHA = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const ACTION_SHA = '914994f8e4edef1878214d5c4fd967769e0c2946e033251e11b1577fca5fc270'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const actionTransitionNativeExports = Object.freeze(['fifa98_action_runtime_flags', 'fifa98_action_pose', 'fifa98_action_workspace', 'fifa98_action_workspace_words'])
const regions = [
  ['action-selector-dispatcher', 0x800b95e0, 464, '38f7981175396a6bf733693f441af4062d4da9df1a9fa1df87ac3276b2d2e946'],
  ['action-start-constructor', 0x800b9cd4, 944, '56b80b779576e0e0061f97ce904c4927f57bdc38bc323fcd2e3902f8d74c41c7'],
  ['action-to-runtime-flag-template', 0x800b9ea4, 64, '314d4368e0fd8afbd4bbd7f4e3970ac1352099a6a2e33894dd5f12017dc12f7a'],
  ['child-runtime-initialization', 0x800d45e8, 408, '901cf7cb140ec12e739b7c8d660c598eb1a0dda75b33c3567e1839b6415c39ec'],
  ['sparse-key-pose-application', 0x800d0b44, 1396, 'b9542a6faa72fc0f584adff9847f22493f5d5266586d440592537aa67a2f1350'],
  ['pose-key-evaluation-dispatch', 0x800d4c4c, 316, '2e46bdb618d00adc674420fdbee1af29ad36102464f59918a34416c323c6d2e5'],
  ['pose-output-and-linked-blends', 0x800d4ef4, 208, '01cd2a3bb52164bb7b2a1c0409fa03dff4af6b0757dab466c0a39cab315a8104'],
  ['instant-or-linked-action-change', 0x800d4904, 376, 'caf21a1b0851d37e3a70ab7543cb67dc1a09a75cb751e40a5deeaac0461ab09e'],
  ['cross-action-phase-search', 0x800d5620, 204, 'f1f49b69978a4f0e64649068754853f87ebc162f6e31e43b9deadbdeee440b04'],
  ['full-phase-update-and-callback-boundaries', 0x800d4044, 1352, 'f034f79a5e39e15b346e62957acad501fd6d13f8c75e9bdd27549f6257d15367'],
]

/** Exact source identity gates; unknown variants never acquire this profile. */
export function inspectActionTransitionRecovery(backend, actionBytes) {
  if (!(backend instanceof Uint8Array) || (actionBytes !== undefined && !(actionBytes instanceof Uint8Array))) throw new TypeError('Action recovery requires Uint8Array source images')
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) }
  const actionsSource = actionBytes === undefined ? null : { image: 'ZMODAT.BIG/aiseqs.tbi', size: actionBytes.length, sha256: digest(actionBytes) }
  if (source.size !== 939136 || source.sha256 !== BACKEND_SHA ||
      (actionsSource && (actionsSource.size !== 25108 || actionsSource.sha256 !== ACTION_SHA))) return { version: 1, status: 'unsupported', reason: 'unknown-action-transition-source', source, actionsSource, regions: [], tables: {}, actions: [] }
  const verified = regions.map(([id, address, size, sha256]) => ({ id, ...inspectRecoveredRegion(backend, { base: BASE, address, size, sha256 }) }))
  const mirrorMap = inspectPlayerTable(backend, { base: BASE, address: 0x8012dc00, count: 16, element: 'u32', sha256: '5438552a48c50977cb9a5313ce998b289c27389484f094ea576f4e923c853b2e' })
  const database = actionBytes === undefined ? null : parseAnimationActions(actionBytes)
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-action-flags-key-mirror-v1', source, actionsSource,
    nativeSource: 'native/action-transition.c', nativeExports: actionTransitionNativeExports, regions: verified, tables: { mirrorMap },
    actions: database?.records.map((record) => ({ actionId: record.actionId, clipName: record.clipName, actionFlags: record.flagsRaw,
      runtimeFlags: actionRuntimeFlags(record.flagsRaw), mirrored: !!(actionRuntimeFlags(record.flagsRaw) & 1),
      plainLoopPhase: isPlainActionLoop(record.flagsRaw), headingOffsetRaw: record.headingOffsetRaw,
      initialBlendRaw: record.initialBlendRaw, transitionBlendRaw: record.transitionBlendRaw })) ?? [],
    flagConversion: { expression: '(actionFlags>>>8)|(retainedChildFlags&0x80000020)', actionShiftAt: '0x800b9ea8', childMergeAt: '0x800d4684..0x800d4698',
      plainLoop: '(runtimeFlags&4)!=0 && (runtimeFlags&0x160)==0', mirrorFlag: 1,
      warning: 'Raw action flag0x100 becomes runtime mirror1. It is not runtime externally-advanced flag0x100.' },
    pose: { input: 'Sixteen raw signed16 rows [tx,ty,tz,qx,qy,qz,qw], separate translation/rotation masks; initialized or retained original pose is the destination.',
      headingOffsetRaw: 0, sparse: 'Only present key channels are transformed/written. Previous output remains in destination orientation and is never mirrored again.',
      mirroredTranslation: { pelvis: '[-x,y,z]', other: '[x,y,-z]' },
      mirroredQuaternion: { pelvis: '[-z,w,-x,y]', other: '[-x,-y,z,w]' },
      destination: 'mirrorMap[sourcePoseIndex]', signed16Adapter: 'Reject a transformed+32768 instead of narrowing/wrapping; original scaled32 pose storage has a wider domain.',
      branch: 'D4C4C passes the caller pose directly to D0B44 when global interpolation selection is zero. D4EF4 separately handles linked old-child blends; that path is not ported here.',
    },
    transitionScope: { recovered: 'Original flag conversion and the unlinked, zero-heading, discrete sparse key-pose application, including mirroring.',
      retainedPose: 'Retain previously applied output for this bounded branch. Initialize AAAAAA once; applying a mirrored sparse key transforms its new raw channels only, leaving absent output slots unchanged.',
      instantChange: 'D4904 chooses unlinked replacement when no old child, blend duration<512, or the original blend-enable global is zero. This inspection branch can retain output pose across a child change; it does not implement the linked branch.',
      phaseSearch: 'Actions matching raw(flags&0x405)==0x405 call D5620→D08E8 to align a new clip against old prefix motion; it is not a simple normalized phase ratio.',
      notRecovered: ['Linked cross-fades and fractional scaled-pose interpolation', 'Cross-action phase alignment/search', 'Action callback mutation at marker/endpoint/periodic paths', 'Action-relative heading adjustment and runtime0x1000 heading subtraction', 'Complete action/owner scheduling and root-motion updates'],
    },
    limitations: ['Loop-compatible runtime flags do not prove the absence of event callbacks. This helper applies a supplied key and does not claim full animation-runtime completion.',
      'The root and non-root mirror formulas differ. Generic axis negation or mirroring an already transformed retained pose gives different source results.',
      'Source child construction defaults rate65536, but resetting phase on action changes remains inspection policy until the original phase-search and callbacks are recovered.',
      'No console code is executed; source instruction words are read-only evidence for direct typed C and browser integer data transforms.'],
  }
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, actions: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/action-transition-recovery.mjs [--backend BECODE.BIN] [--actions aiseqs.tbi]\nPrint original flag/mirror and unresolved transition evidence without running original code.'); return }
  const [backend, actions] = await Promise.all([readFile(values.backend ?? fileURLToPath(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url))), readFile(values.actions ?? fileURLToPath(new URL('../.work/reference/members/ZMODAT.BIG/aiseqs.tbi', import.meta.url)))])
  console.log(JSON.stringify(inspectActionTransitionRecovery(backend, actions), null, 2))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
