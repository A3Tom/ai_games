import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { inspectPlayerTable } from './player-recovery.mjs'
import { inspectBallInteractionRecovery } from './ball-interaction-recovery.mjs'
import { decodeInstruction } from './code-map.mjs'

const BASE = 0x8005ae28
const profiles = [
  { image:'BECODE.BIN',size:939136,sha256:'254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0' },
  { image:'SLES_009.14',size:251904,sha256:'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644' },
]
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex')
export const ballFlightNativeExports=Object.freeze(['fifa98_ball_flight_tables','fifa98_ball_flight_factors','fifa98_ball_flight_angles','fifa98_ball_loft_launch','fifa98_ball_loft_random_launch','fifa98_ball_flight_duration','fifa98_ball_speed_launch','fifa98_ball_height_launch','fifa98_ball_flight_workspace','fifa98_ball_flight_workspace_words'])
const regions=[
  ['loft-launch-containing-wrapper',0x800757e4,320,'5ae48e8d7b0969022fd6739af91f7b2c0b0115db5df64bf0f5bbb9b6aecd3265'],
  ['loft-launch-numerics',0x8007c590,396,'1807de7121d18fc0f03f66d6c15b1c61f91411647ba6b0db9f9675d051b85c3c'],
  ['vertical-launch-solution',0x8007d5ac,172,'c9d379b415899d04ed1ebc4a8f9a0db6a2c9ddb7d0e2442deb5da9ccc8f3ad02'],
  ['horizontal-flight-table-builder',0x8007c2f8,320,'7d9a057af9eb05d68ac1c3b3b581e3e508f50d81ad124361171ebb97e3c47cd9'],
  ['spin-heading-table-builder',0x8007c438,344,'189675be57ec93fd990569b9bb4f375c672103b1d7433489224ec3cdbcc13f82'],
  ['table-builders-original-arguments',0x8007ce00,44,'58cd74ac85c9f1cbe09a3a3ebcd234f3ae9660369aa57986b8ed5022d2ecc689'],
  ['nearest-factor-duration-search',0x8007c71c,288,'61fb32b948355f099f942b456831f3e1495692f6a6d34ee5716840468670d2a9'],
  ['speed-selected-airborne-numerics',0x8007c83c,472,'c0c5481bb1a49109d57b3707c9b13eab042ba1858a9d9f4ca9071369151c810c'],
  ['general-football-launch-dispatch-context',0x80075924,1440,'7150adb8cdd2e2fe76e9b0252eec56c7aab537a2bbf9e7b4dcff2593df8298e9'],
  ['height-selected-airborne-numerics',0x8007ca14,556,'99464043bb84eb6fe38143df622ec01b72be57e5a7e6de1ff44f4552328ac345'],
  ['height-reference-to-time',0x8007d780,152,'14f3c062f7ef68cf47e09c99ab2d34bb82f1e380b4c65cf0da5a4272d3e08e8d'],
  ['time-to-vertical-velocity',0x8007d4ec,76,'5146f523383c892c8dc248fc6543ce06409f8305001576f761c49455b9cd0a13'],
  ['two-height-crossing-times',0x8007d658,296,'d06d5262197046449c396764391c463ee75d40c0fba4d5a26b0d818436581476'],
  ['inverse-second-branch-lookup',0x8007d194,164,'92e7e91c1bcc0994d00a065ba491aaf54f85833cc391156443ef29122fd3ef7c'],
  ['inverse-paired-branch-lookup',0x8007d238,272,'eef665b2dbac0a913f06419d3ebf65a85d4aac3ff05fb76a120ecad1d89409cd'],
]

/** Exact-image-gated loft/table reconstruction evidence; no original execution. */
export function inspectBallFlightRecovery(backend,boot){
  if(!(backend instanceof Uint8Array)||!(boot instanceof Uint8Array))throw new TypeError('Ball flight recovery requires Uint8Array backend and resident images')
  const sources=[backend,boot].map((bytes,index)=>({image:profiles[index].image,size:bytes.length,sha256:hash(bytes)}))
  if(sources.some((source,index)=>source.size!==profiles[index].size||source.sha256!==profiles[index].sha256))return{version:1,status:'unsupported',reason:'unknown-ball-flight-images',sources,regions:[],tables:{}}
  const verified=regions.map(([id,address,size,sha256])=>({id,...inspectRecoveredRegion(backend,{base:BASE,address,size,sha256})}))
  const spin=inspectPlayerTable(backend,{base:BASE,address:0x80125e58,count:16,element:'u32',sha256:'b6327dab43138060940f542f74507881179455692cad183d26d7455e20caf07b'})
  const coefficients=inspectPlayerTable(backend,{base:BASE,address:0x80127080,count:12,element:'u32',sha256:'2a0c765da219d738748d513f55483cd1080bd0e6bcad38f8904beb2162d13612'})
  const signedTable=(address,count,sha256)=>{
    const table=inspectPlayerTable(backend,{base:BASE,address,count,element:'u32',sha256})
    return{...table,element:'i32',values:table.values.map((value)=>value|0)}
  }
  const inverseA=signedTable(0x8012607c,512,'56ff2048e8fd1e9b22939f5f719a6f6b2ab4f64ac4b7cce62786bb0e5c33e5f7')
  const inverseB=signedTable(0x8012687c,512,'7a007413897031c46805389ace6d0f65f528a8e64951ba51c098f7803325c1dd')
  const heightCoefficients=signedTable(0x8012707c,18,'74e42771e88f054889b49693edcced39c4a6874e1d5aa684c922be9fc456c362')
  const dependency=inspectBallInteractionRecovery(backend,boot)
  const view=new DataView(backend.buffer,backend.byteOffset,backend.byteLength)
  const callPath=[[0x8007c748,0x80027100],[0x8007c8b8,0x8002146c],[0x8007c8c8,0x8007c71c],
    [0x8007c8e8,0x800271a8],[0x8007c934,0x8007d5ac],[0x8007c95c,0x80124500],
    [0x8007c978,0x800271a8],[0x8007c9a8,0x800271d4],[0x8007c9c4,0x80027258],
    [0x80075e08,0x8007c83c],[0x8007ca9c,0x8007d780],[0x8007cab0,0x8007d4ec],
    [0x8007caf4,0x8007d658],[0x8007d7b8,0x8007d194],[0x8007d6f0,0x8007d238],
    [0x80075ddc,0x8007ca14]].map(([at,target])=>{
      const item=decodeInstruction(view.getUint32(at-BASE,true),at)
      if(item.flow.kind!=='call'||item.flow.target!==target)throw new Error('Reviewed speed-selected launch call differs')
      return{at:`0x${at.toString(16)}`,target:`0x${target.toString(16)}`,word:`0x${item.word.toString(16).padStart(8,'0')}`}
    })
  return{version:1,status:'reconstruction-only',profile:'SLES_009.14-loft-flight-v1',sources,nativeSource:'native/ball-flight.c',nativeExports:ballFlightNativeExports,regions:verified,
    callPath,
    tables:{spin,coefficients,inverseA,inverseB,heightCoefficients,atan8:dependency.tables.atan8,atan16:dependency.tables.atan16,sine:dependency.tables.sine,exponential:dependency.tables.exponential},
    generatedTables:[{address:'0x8013a110',count:320,element:'u16',generator:'0x8007c2f8',purpose:'Horizontal launch factor indexed by explicit integer duration',initial:{positionX:65536,positionZ:0,velocityX:65536,velocityZ:0,spin:1000},sample:'Accumulate source position, apply drag/curve, use quantized integer length, then source Q16 divide1/length, capped65535.'},
      {address:'0x8013ff90',count:320,element:'u16',generator:'0x8007c438',purpose:'Heading compensation per unit spin indexed by duration',initial:{positionX:0,positionZ:0,velocityX:0,velocityZ:262144,spin:-1000},arguments:{drag:203,spinDecay:63963,curve:10000},sample:'Accumulate position, apply sequential updated-X curve, divide original heading16 by-1000 and retain low16.'}],
    abi:{tables:['atan8','atan16','sine'],launch:['positionFixedXYZ','targetFixedXYZ','durationIndex','signedSpin','atan8','atan16','sine','exponential113','output8'],randomLaunch:['positionFixedXYZ','targetFixedXYZ','durationIndex','spinMode','random6','atan8','atan16','sine','exponential113','output8'],
      durationSearch:['positiveIntegerDistanceQ16','requestedSpeedQ16','factors_u16_320'],
      speedLaunch:['positionFixedXYZ','targetFixedXYZ','signedSpin','requestedHorizontalQ16','verticalCapQ16','atan8','atan16','sine','exponential113','output8'],
      heightLaunch:['positionFixedXYZ','targetFixedXYZ','signedSpin','absoluteHeightQ16','horizontalCapQ16','verticalCapQ16','atan8','atan16','sine','exponential113','inverseA_i32_512','inverseB_i32_512','output8'],workspaceWords:2048,
      output:['velocityX','velocityY','velocityZ','horizontalSpeed','integerDistance','heading16','spin','durationIndex'],returns:{uncapped:0,capped:1,invalid:-1},
      speedLaunchReturns:{verticalCapBit:1,speedErrorBit:2,invalid:-1},durationReturns:'selectedIndex1..319 or new-1 invalid',
      bounds:{duration:[0,319],spin:[-8000,8000],currentAndTargetY:[0,67108864],integerPlanarDistance:[0,32767],speedSelectedDistance:[1,32767],requestedAndVerticalCapQ16:[0,50*65536],durationDistanceQ16:'Integer multiple65536, from1Q16 to32767Q16'}},
    vertical:{source:'0x8007d5ac',durationZero:983040,formula:'time=duration<<16; n=ASR12(fixedMul(832149,targetY-currentY))-ASR8(fixedMul(-2386092,time)); e=ASR10(fixedMul(-208360,time)); vy=-3006669+fixedDivide(n,65536-negativeExponential(e)). All source word operations retain wrap and signed shifts.',maximum:1638400},
    launch:{horizontalMaximum:2293760,heading:'Exact heading16(dx,dz) minus fixedMultiply(spin,generatedHeadingFactor[duration]); original single-turn signed normalization then corrected source sine/cosine.',randomSpin:'Wrapper757E4 resets spin through749A8, skips RNG for selector2, otherwise samples spinTable[random&15], negating for selector1. Native modes0..2 preserve this subset; failed native launch stages RNG.'},
    durationSearch:{source:'0x8007c71c',ratio:'residentFixedDivide(requestedHorizontalQ16,integerDistanceQ16)',
      endpoints:'If factor[1]<signedratio return1; if signedratio<factor[319] return319. Both comparisons are strict.',
      initial:{low:1,high:319,bestError:0x0fffffff,bestIndex:319},
      update:'mid=low+ASR(high-low,1); error=factor[mid]-ratio; positiveerror raiseslow=mid+1,negative lowershigh=mid-1,equality zeroes the testedrange. Strictly smaller absoluteerror replacesbest; ties preserve earlierindex.',
      delaySlot:'C810 tests the PREVIOUS range before C814 updates high-low; retain the extra terminal iteration. A conventional fresh-range binary search differs.',
      divisionDomain:'The real caller supplies integer_length<<16. Public native helper rejects fractional/zero distance, making all source denominator-halving steps exact on the accepted fixed-divide domain.'},
    speedSelected:{source:'0x8007c83c',duration:'Select from source integer planar length and requestedhorizontal speed using7C71C, then actualHorizontal=fixedMultiply(factor[selected],integerDistance<<16).',
      errorFlag:'bit2 iff signed absolute(requested-actual)>32768; exact32768 leavesbit2clear.',
      vertical:'Reuse7D5AC(currentY,targetY,selectedDurationQ16); bit1 iff signed verticalCap<vertical,then replaceverticalwithcap.',
      horizontalCap:null,heading:'Same original spin-compensated heading and single-turn normalization as7C590; actualselectedhorizontal is not replaced by request or capped afterward.',
      boundary:'This is numeric7C83C, not general75924. The general dispatcher handles distance<16, action/actor attributes, launchtype branches, spin/RNG adjustments, ownership/statistics and predictor initialization.'},
    heightSelected:{source:'0x8007ca14',sourceOption:0,
      input:'absoluteHeightQ16-currentY drives7D780; this is an absolute source height reference, not a launchduration or queue54 calibration.',
      firstTime:'D780 combines heightdifference, negative exponential and interpolated inverseB. Its invalid inverse returns-1; native refuses rather than following undefined temporary states.',
      vertical:'D4EC uses POSITIVE exponential: fixedMul(-3006669,65536-positiveExp(ASR10(fixedMul(+208360,firstTime)))).',
      crossing:'D658 obtains two interpolated inverse values and writes two heightcrossing times only on success. Option0 chooses first output; ifselected<0 andalternate>0,source substitutesalternate.',
      duration:'selectedTime adds32768 then arithmetic>>16. Native rejects rounded index outside0..319 before sourcegeneratedtable reads.',
      inverse:'Require input<=0; scaled=fixedMul(182420805,-input); integer=ASR16(scaled),fraction=low16; valid integer513..1023 readsindices integer-513/integer-512. Each branch uses two separately rounded products with65536-fraction andfraction, thenwordaddition.',
      cap:'Horizontal andvertical each use signed cap<value replacement; either sets originalflag1. Heading/spin normalization and correctedtrig are unchanged.',
      bounds:{absoluteHeightQ16:'integer multiple65536 from1..1024Q16 and strictly above currentY',currentAndTargetY:[0,1024*65536],integerPlanarDistance:[1,32767],spin:[-8000,8000],capsQ16:[0,50*65536],positiveExponentialMaximum:681391},
      failure:'D658 failure leaves source outputtemporaries unwritten, but containing7CA14 later reads them. Native rejects inversefailure/negative firsttime/out-of-range duration atomically instead of inventing values or using stale memory.',
      tableWords:'Reports expose signed i32 inversevalues. Transfer as value>>>0 into nativewordstorage; do not embed commercial tabledata insource.'},
    gravity:{sourceAddress:'0x80125d18',sourceWord:view.getUint32(0x80125d18-BASE,true),relationship:'The vertical solver uses its reviewed coefficient words; it does not receive an arbitrary caller gravity. Subsequent original air stepping reads the separate gravity input. Recovered reference value is not asserted as all match settings.'},
    inspectionFixture:{duration:60,spinModes:{loft:2,curve:0,reverseCurve:1},heightQ16:16*65536,heightHorizontalCapQ16:35*65536,heightVerticalCapQ16:25*65536,label:'Explicit duration/spin/height inspection choices; no named action/default duration or queue20 input established.'},
    limitations:['These are original table generation and numeric launch paths, not possession, contact, animation timing, owner/action state or complete predictor initialization.',
      'Target is fixedQ16 XYZ for this loft ABI; the ground-launch wrapper uses a different integer target ABI. No launch target is invented by this helper.',
      'Duration is a source integer table index. No seconds-per-duration conversion or named chip/pass/shoot binding is established.',
      'The native Y/spin/distance bounds and transactional failure behavior are explicit API guards. Original wrapping inside the accepted domain is preserved.',
      'Analytical source launch coefficients and subsequent discrete gravity are separate source dependencies; changing match gravity settings without recovering their initialization is outside this profile.',
      'Generated mutable tables come from direct source numerical recurrences, not uninitialized overlay/RAM bytes, a CPU emulator or original-code execution.',
      'The speed-selected7C83C solver is a distinct numeric path. Its flagbits1/2 and uncapped actualhorizontal speed must not be replaced by duration-loft caps or the25Q16 grounded wrapper.',
      'General75924 and original queued action geometry/callback timing remain separate. An explicit speed/cap/spin/height fixture is not a recovered named shot or a source queue-triggered football action.',
      'Height-selected7CA14 supports sourceoption0 only, with exact inverse tabledata and explicit failure guards. Its absoluteheight input is not inferred from clip calibrationqueue54 or a named football action.']}
}

async function main(){const{values}=parseArgs({options:{backend:{type:'string'},boot:{type:'string'},help:{type:'boolean',short:'h'}}});if(values.help){console.log('Usage: node games/fifa98/scripts/ball-flight-recovery.mjs [--backend BECODE.BIN] [--boot SLES_009.14]');return}const[b,r]=await Promise.all([readFile(values.backend??fileURLToPath(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url))),readFile(values.boot??fileURLToPath(new URL('../.work/reference/disc/SLES_009.14',import.meta.url)))]);console.log(JSON.stringify(inspectBallFlightRecovery(b,r),null,2))}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1})
