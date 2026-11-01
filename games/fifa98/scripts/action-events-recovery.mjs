import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { parseMopClip } from './animation.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const BASE = 0x8005ae28
const SOURCE_SHA = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
export const actionEventsNativeExports = Object.freeze(['fifa98_action_window', 'fifa98_action_nonloop_step', 'fifa98_action_calibration_keys', 'fifa98_action_calibration_vectors'])
const regions = [
  ['clip-window-snapshot-initializer', 0x800d4780, 164, '0d34dac1b28d4a23e4e38ebc54880826094ad6433a42b3bc1a507b23420d1052'],
  ['phase-window-callback-removal-update', 0x800d4044, 1352, 'f034f79a5e39e15b346e62957acad501fd6d13f8c75e9bdd27549f6257d15367'],
  ['locomotion-owner-event-callback', 0x800b95e0, 464, '38f7981175396a6bf733693f441af4062d4da9df1a9fa1df87ac3276b2d2e946'],
  ['nonloop-owner-event-callback', 0x800b97b0, 332, 'c43ad3d1df28e691a76774608b8a255ebf6ab0c221c1b6d61b954d4a3f479850'],
  ['owner-action-end-handoff', 0x800a83d4, 244, '1790cf75731d3ae3b99a7b38316281013a5df47eeadcd4f5d83cef99bd379d1f'],
  ['queued-football-action-dispatch', 0x80071cec, 948, 'f366c9ee948f1de5a1084917fe8b6dd4cbaa065b64c7aa552bf03ffd4cfe8d28'],
  ['queued-action-selection-and-parameters', 0x800720f8, 2436, '3a2235994078120b398a7208aa1f4cec97314e91a7612c0706202ff648f8b49d'],
  ['action-prefix-phase-calibration', 0x800ba460, 784, 'dc3c5ec8e259cf7100dd2c7661df0684d13b8c70fae5f1f0b99c7f72f31efd5f'],
  ['calibration-root-prefix-discrete-reader', 0x800d0790, 148, 'b4e7086db0841f549703ad0b8e6c7ecb1c7422590fe472a9d484c8fd1093c323'],
  ['calibration-marker-prefix-discrete-reader', 0x800d0824, 148, 'bb503cc0462e79f9b5e15607e3dd7b139350c3b650020ec711b8c2f8bce07ce2'],
  ['calibration-last-key-phase', 0x800d08b8, 48, '84c17778b8f9a8cc64f5cd3ed07a68230b5bc8c48fb0ebb82fbdb345ff8955f5'],
  ['calibration-discrete-key-clamp', 0x800d04e4, 92, '001f8ac32edc048cacd314e64ef3295ada4886dc8782a78148dabacf96d55dbd'],
  ['calibration-action-clip-fallback', 0x800ba904, 100, 'e7ce73a940d0eb8647d9d0f92216de829e9e6e38eb44e9ed22314440bbba597d'],
  ['queue-calibration-parameter-store', 0x800728e8, 404, '418dca44bd2c686b40f4397428b4cf38631b6db5aab67a4085a1f0fbc7a12428'],
  ['queue-end-window-duration-query', 0x800ba9d4, 112, 'ca7648bce59358d6b003bf0f420ccc87cf964b966fa1657a07a53872cfc93071'],
  ['general-football-launch-dispatch', 0x80075924, 1440, '7150adb8cdd2e2fe76e9b0252eec56c7aab537a2bbf9e7b4dcff2593df8298e9'],
  ['launch-duration-search', 0x8007c71c, 288, '61fb32b948355f099f942b456831f3e1495692f6a6d34ee5716840468670d2a9'],
  ['speed-selected-airborne-launch', 0x8007c83c, 472, 'c0c5481bb1a49109d57b3707c9b13eab042ba1858a9d9f4ca9071369151c810c'],
  ['height-selected-airborne-launch', 0x8007ca14, 556, '99464043bb84eb6fe38143df622ec01b72be57e5a7e6de1ff44f4552328ac345'],
  ['ground-duration-logarithm-wrapper', 0x8007d3a4, 104, '2acae57667aa7aa13efdb9aeb50bff0f47bb1d72021dd5946151a8e7489e8b6d'],
]

/** Clip metadata only: validating/parsing this file does not identify a match action. */
export function inspectActionEventClip(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Clip bytes must be Uint8Array')
  const clip = parseMopClip(bytes)
  const signed = (word) => word < 32768 ? word : word - 65536
  const startHalf = signed(clip.headerWords[4]), endHalf = signed(clip.headerWords[5])
  const startPhase = startHalf * 256, endPhase = (endHalf - 2) * 256
  return { size: bytes.length, sha256: digest(bytes), keyCount: clip.keyCount, flags: clip.flags,
    startHalf, endHalf, startPhase: startPhase < 0 ? null : startPhase,
    endPhase: endPhase < 0 ? null : endPhase,
    endpoint: (clip.keyCount - 1) * (512 << (clip.flags & 1)),
    simultaneousWindows: startPhase >= 0 && startPhase === endPhase,
  }
}

/** Hash-gated static evidence. None of these instruction words is executed. */
export function inspectActionEventsRecovery(backend) {
  if (!(backend instanceof Uint8Array)) throw new TypeError('Action events require Uint8Array backend')
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) }
  if (source.size !== 939136 || source.sha256 !== SOURCE_SHA)
    return { version: 1, status: 'unsupported', reason: 'unknown-action-event-source', source, regions: [] }
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-action-window-v1', source,
    nativeSource: 'native/action-transition.c', nativeExports: actionEventsNativeExports,
    regions: regions.map(([id, address, size, sha256]) => ({ id, ...inspectRecoveredRegion(backend, { base: BASE, address, size, sha256 }) })),
    snapshot: { address: '0x800d4780', start: 'signedLH(clip+8)*256', end: '(signedLH(clip+10)-2)*256',
      startFlags: 'If start>=0 && phase>=start && !(flags&0x28000), flags|=0xa000.',
      endFlags: 'If end>=0 && phase>=end && !(flags&0x20000), flags=(flags&0xffff7fff)|0x24000.',
      seek: 'A phase scrub must start with fresh runtime flags. Existing end20000 suppresses later tests; this is stateful source initialization, not a reverse-seek operation.',
      equalBoundary: 'The initializer applies start then end; equal boundaries leave8000 clear. In the full callback-bearing update the source can invoke two ordered callbacks at that same phase.' },
    nonloop: { source: '0x800d4044..0x800d4588', branch: 'Callback pointer144 is NULL; flags4/10/20/80 are refused. No linked child or fade state is synthesized.',
      state4: ['flags20', 'phase24', 'timestamp36', 'rate60'],
      out6: ['flags20', 'phase24', 'timestamp36', 'advance', 'windowFlagWrites1Start2End', 'removalRequired'],
      clock: 'Signed timestamp<clock; elapsed capped3072, rounded fixedMultiply(elapsed,rate). Zero advance retains timestamp. Paused40 is idle; externally-advanced100 suppresses phase addition.',
      endpoint: 'phase>=endpoint skips both window tests, sets10 and requests removal. Phase is not clamped. Removal precedes source timestamp update, so output retains the previous timestamp.',
      endpointSemantics: { skipsWindowTests: true, setsFlag: 16, removalRequired: true, clampsPhase: false, updatesTimestamp: false },
      returns: { idle: 0, advanced: 1, removalRequired: 2, invalid: -1, unsupported: -2 },
      guards: ['Signed-halfword clip headers', 'phase0..endpoint, endpoint1..67106816', 'nonnegative rate<=INT_MAX', 'No signed clock-difference overflow', 'Invalid/unsupported inputs leave output unchanged'],
    },
    eventHandoff: { attachmentOwnerFlag: 'owner+36 bit0x1000',
      callback: 'B95E0 and B97B0 clear transient child0x16000. Old child4000 samples marker only when owner1000 is set, clears owner1000, then calls A83D4. Otherwise child8000 sets owner1000.',
      marker: 'D4A7C supplies original marker XYZ. Its high signed halfwords are used; Y becomes max(0,Y-8) before7514C.',
      queue: 'A83D4 reads current actor8013c634, requires actor408 bit200000, then calls71CEC(actor+352) for queue type byte59<15; other types clear pending state via71CA8.',
      launch: '71CEC performs ball/marker proximity and owner/world checks, selects spin, then reads LHqueue20 at71F90/71FB4 and invokes75924. This route is distinct from direct BF8C→75694 ground launch, which reads queue54.',
      unported: ['World-dependent callback branches/successor action changes', 'General75924 launch dispatcher and possession/statistic side effects', 'Periodic callback, loop, linked blend and child allocation/removal'],
    },
    queueParameters: { base: 'actor+352', actionId: 52, parameter: 54, directGroundParameter:54, generalSolverParameter:20, packedDistanceFlags: 56, launchTypeByte: 59, initialHeading: 60, launchHeading: 62,
      producer: '720F8..72A74 chooses an action then callsBA460(action,0,-100,0,1,...). It stores returned phase difference>>8 at queue54, prefix distance at queue56 low19, and computed heading at queue62.',
      calibration: 'BA460 -100 sentinel selects signed clipheader8<<8. It samples first prefixA and end prefixB at source discrete keys, computes original integer length and signed10-bit heading plus action offset. These fields are not arbitrary user power values.',
      duration:'SH72A28 stores the full calibration return low16 unchanged. BA9D4 returns signed(header10-2), or-1 for missing/negative metadata; comparison calibratedDuration<thatValue controls packedbit19, not a duration clamp.',
      generalParameter:'Queue20 is original720F8 a3 low16: SWa3 to104(sp) at7213C, LHU104(sp) at72A08, SHqueue20 in72A2C. Its source input/default is not established by calibration. The71CEC path reads queue20, while BF3C/BF8C reads actor406=queue54.',
      heading:'72934 adds source initialheading s4 to signed calibrationheading, masks1023 and subtracts1024 only if>512; SH72A44 stores queue62, SH72A24 stores s4 atqueue60. Invalid negative calibration return zeroes distance and finalheading.',
      packed:'72A0C..40 replaces low19 with calibrateddistance&7FFFFh, replacesbit19 with durationcomparison and ORsbit22. Typebyte59 is written separately into the upper byte of the same packedword56.' },
    calibration: {
      source:'0x800ba460..0x800ba76c',phaseResolver:'Inline0x800ba4d4..0x800ba604, not a separate source leaf',
      phaseSelectors:{minus100:'signedLH(clip+8)<<8',minus99:'(signedLH(clip+10)-2)<<8',minus98:'signedLH(clip+12)<<8; ifnegative fall back to signedLH(clip+8)<<8',minus97:'(keyCount-1)*(512<<(clip.flags&1))',ordinary:'selector<<8 with source word wrap'},
      invalid:'Negative resolved start/end or wrapped signed end-start<0 returns source-1 after clip unlock. Native key helper adapts this to0 without writes and malformed storage to-1.',
      discrete:'D0790(rootreference0)/D0824(markerreference1) use clamp(signedPhase>>(9+(clip.flags&1)),0,keyCount-1), then signed raw halfwords<<12. This is distinct from interpolated marker attachment.',
      references:{root:[3,4,5],marker:[6,7,8],mirror:'Raw action-row flags100h negatesX only'},
      modeDomain:'Both starta3 and stack16 endreference must be0 or1. Other source values skip the getter and can leave stack data undefined; native rejects them.',
      length:'Compute signed fixed deltaend-start X/Z; pass absWrapped(delta)>>16 to original2146C integer norm. Y is unused. Subunit nonzero deltas can quantize to length0.',
      heading:'If integerlength0 returnheading0; otherwise26FD0(signedFixedDeltaX,Z)+signedactionrow+6,mask1023,subtract1024 only if>512. The actionheadingoffset is not a power or controller input.',
      keysAbi:{header5:['flags','keyCount','signedHeader8','signedHeader10','signedHeader12'],arguments:['header5','startSelector','endSelector','out5'],out5:['startPhase','endPhase','startKey','endKey','phaseDifference>>8']},
      vectorsAbi:{arguments:['prefixStart9','prefixEnd9','startReference0or1','endReference0or1','mirror0or1','signedActionHeadingOffset','atan8','sine257','out4'],out4:['integerLength','signedHeading1024','deltaFixedX','deltaFixedZ']},
      bounds:'Native supports keyCount1..65535,flagsu16,headers/actionheading signed16,original decodedprefix halfwords; adapter parsed clips remain bounded by their existing4096-key reader. Tables are existing fingerprinted source lookups.',
      excluded:'Action fallback/resource lock-unlock are caller responsibilities. Calibration does not dispatch75924, infer named actions, set ownership or replay football callbacks.',
    },
    recordedClipEvidence: { verification: 'Recorded static fingerprints, not verification of a caller-loaded clip. These action IDs refer to aiseqs.tbi SHA256914994f8e4edef1878214d5c4fd967769e0c2946e033251e11b1577fca5fc270.',
      prefix: 'ZMODAT.BIG/mopsx115.viv.members/',
      clips: [
        { name: 'ckspfa2', actionIds: [384, 385], actionFlags: [24, 280], headingOffsets: [-113, 114], size: 824, sha256: '68933e957c4997f203ccaac0ea4136d0afa1cfafa62c18377be0530f0bf44e17', startHalf: 4, endHalf: 6, startPhase: 1024, endPhase: 1024, endpoint: 8192 },
        { name: 'pkssfa4', actionIds: [412, 413], size: 736, sha256: 'b454e229606497965afd09090042e819b687682cef6f99839a18f068b8db4229', startHalf: 8, endHalf: 10, startPhase: 2048, endPhase: 2048, endpoint: 6144 },
        { name: 'ckskaa4', actionIds: [380, 381, 419, 420], size: 1000, sha256: '4b53710e265bbca28f415a3657050ee74f96b8c988bcbb8d2fd25af7f83f0237', startHalf: 8, endHalf: 10, startPhase: 2048, endPhase: 2048, endpoint: 10240 },
        { name: 'ckspca2', actionIds: [428, 430], size: 824, sha256: '54b4bfee9822ac59d60c412d9e43122847e074c1b70c5d932d6d130195b29885', startHalf: 8, endHalf: 10, startPhase: 2048, endPhase: 2048, endpoint: 8192 },
        { name: 'pkrpfa2', actionIds: [410, 411], size: 1040, sha256: '25e3ee72a74e1ddac64eb06b6593a6ae39dd5c019e54dbcb5ac8d304a39f9e56', startHalf: 4, endHalf: 6, startPhase: 1024, endPhase: 1024, endpoint: 10240 },
      ],
      interpretation: 'These are literal original clip names and phase metadata. No friendly pass/shot action meaning or automatic football callback is assigned.' },
    nextRecovery: { generalLaunch: '0x80075924',
      type2: 'Distance16..480 uses7D3A4(distanceQ16,9Q16), then7CC40 with horizontal cap50Q16. Distance>480 selects mutable trajectory tables80125d98.. prepared by7CE00.',
      otherTypes: 'Positive duration/height parameter selects7CA14; nonpositive selects7C83C. Type3 may consume RNG and strengthen speed/spin; actor attributes and match mode adjust source caps.',
      reusable: ['Existing rounded fixed multiply and signed divide', 'Existing original heading16/vector16', 'Existing320-entry flight factor/angle tables and vertical7D5AC'],
      recoveredNumericDependencies: ['7C71C duration search','7C83C speed-selected solver (see ball-flight recovery)','7CA14 option0 with7D780/7D4EC/7D658 and inverse tables (see ball-flight recovery)'],
      missing: ['7D098 logarithm used by7D3A4','General dispatcher world-state effects and queued-input selection'],
      warning: 'Existing25-capped ground-launch wrapper cannot substitute for this source50-capped path.' },
    limitations: ['Window bits and callback-null phase arithmetic are recovered; no football action dispatcher is implemented by these exports.',
      'Source clip phase units are explicit. No browser wall-clock FPS, named shot/pass interpretation or complete match scheduling is inferred.',
      'A code report does not verify a separately loaded clip; inspectActionEventClip reports that file independently.'],
  }
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, clip: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/action-events-recovery.mjs [--backend BECODE.BIN] [--clip original115clip]\nReport action window evidence without executing original code.'); return }
  const result = inspectActionEventsRecovery(await readFile(values.backend ?? fileURLToPath(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url))))
  if (values.clip) result.clip = inspectActionEventClip(await readFile(values.clip))
  console.log(JSON.stringify(result, null, 2))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
