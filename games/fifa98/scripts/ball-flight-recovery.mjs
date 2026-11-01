import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { inspectPlayerTable } from './player-recovery.mjs'
import { inspectBallInteractionRecovery } from './ball-interaction-recovery.mjs'

const BASE = 0x8005ae28
const profiles = [
  { image:'BECODE.BIN',size:939136,sha256:'254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0' },
  { image:'SLES_009.14',size:251904,sha256:'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644' },
]
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex')
export const ballFlightNativeExports=Object.freeze(['fifa98_ball_flight_tables','fifa98_ball_flight_factors','fifa98_ball_flight_angles','fifa98_ball_loft_launch','fifa98_ball_loft_random_launch'])
const regions=[
  ['loft-launch-containing-wrapper',0x800757e4,320,'5ae48e8d7b0969022fd6739af91f7b2c0b0115db5df64bf0f5bbb9b6aecd3265'],
  ['loft-launch-numerics',0x8007c590,396,'1807de7121d18fc0f03f66d6c15b1c61f91411647ba6b0db9f9675d051b85c3c'],
  ['vertical-launch-solution',0x8007d5ac,172,'c9d379b415899d04ed1ebc4a8f9a0db6a2c9ddb7d0e2442deb5da9ccc8f3ad02'],
  ['horizontal-flight-table-builder',0x8007c2f8,320,'7d9a057af9eb05d68ac1c3b3b581e3e508f50d81ad124361171ebb97e3c47cd9'],
  ['spin-heading-table-builder',0x8007c438,344,'189675be57ec93fd990569b9bb4f375c672103b1d7433489224ec3cdbcc13f82'],
  ['table-builders-original-arguments',0x8007ce00,44,'58cd74ac85c9f1cbe09a3a3ebcd234f3ae9660369aa57986b8ed5022d2ecc689'],
]

/** Exact-image-gated loft/table reconstruction evidence; no original execution. */
export function inspectBallFlightRecovery(backend,boot){
  if(!(backend instanceof Uint8Array)||!(boot instanceof Uint8Array))throw new TypeError('Ball flight recovery requires Uint8Array backend and resident images')
  const sources=[backend,boot].map((bytes,index)=>({image:profiles[index].image,size:bytes.length,sha256:hash(bytes)}))
  if(sources.some((source,index)=>source.size!==profiles[index].size||source.sha256!==profiles[index].sha256))return{version:1,status:'unsupported',reason:'unknown-ball-flight-images',sources,regions:[],tables:{}}
  const verified=regions.map(([id,address,size,sha256])=>({id,...inspectRecoveredRegion(backend,{base:BASE,address,size,sha256})}))
  const spin=inspectPlayerTable(backend,{base:BASE,address:0x80125e58,count:16,element:'u32',sha256:'b6327dab43138060940f542f74507881179455692cad183d26d7455e20caf07b'})
  const coefficients=inspectPlayerTable(backend,{base:BASE,address:0x80127080,count:12,element:'u32',sha256:'2a0c765da219d738748d513f55483cd1080bd0e6bcad38f8904beb2162d13612'})
  const dependency=inspectBallInteractionRecovery(backend,boot)
  const view=new DataView(backend.buffer,backend.byteOffset,backend.byteLength)
  return{version:1,status:'reconstruction-only',profile:'SLES_009.14-loft-flight-v1',sources,nativeSource:'native/ball-flight.c',nativeExports:ballFlightNativeExports,regions:verified,
    tables:{spin,coefficients,atan8:dependency.tables.atan8,atan16:dependency.tables.atan16,sine:dependency.tables.sine,exponential:dependency.tables.exponential},
    generatedTables:[{address:'0x8013a110',count:320,element:'u16',generator:'0x8007c2f8',purpose:'Horizontal launch factor indexed by explicit integer duration',initial:{positionX:65536,positionZ:0,velocityX:65536,velocityZ:0,spin:1000},sample:'Accumulate source position, apply drag/curve, use quantized integer length, then source Q16 divide1/length, capped65535.'},
      {address:'0x8013ff90',count:320,element:'u16',generator:'0x8007c438',purpose:'Heading compensation per unit spin indexed by duration',initial:{positionX:0,positionZ:0,velocityX:0,velocityZ:262144,spin:-1000},arguments:{drag:203,spinDecay:63963,curve:10000},sample:'Accumulate position, apply sequential updated-X curve, divide original heading16 by-1000 and retain low16.'}],
    abi:{tables:['atan8','atan16','sine'],launch:['positionFixedXYZ','targetFixedXYZ','durationIndex','signedSpin','atan8','atan16','sine','exponential113','output8'],randomLaunch:['positionFixedXYZ','targetFixedXYZ','durationIndex','spinMode','random6','atan8','atan16','sine','exponential113','output8'],output:['velocityX','velocityY','velocityZ','horizontalSpeed','integerDistance','heading16','spin','durationIndex'],returns:{uncapped:0,capped:1,invalid:-1},bounds:{duration:[0,319],spin:[-8000,8000],currentAndTargetY:[0,67108864],integerPlanarDistance:[0,32767]}},
    vertical:{source:'0x8007d5ac',durationZero:983040,formula:'time=duration<<16; n=ASR12(fixedMul(832149,targetY-currentY))-ASR8(fixedMul(-2386092,time)); e=ASR10(fixedMul(-208360,time)); vy=-3006669+fixedDivide(n,65536-negativeExponential(e)). All source word operations retain wrap and signed shifts.',maximum:1638400},
    launch:{horizontalMaximum:2293760,heading:'Exact heading16(dx,dz) minus fixedMultiply(spin,generatedHeadingFactor[duration]); original single-turn signed normalization then corrected source sine/cosine.',randomSpin:'Wrapper757E4 resets spin through749A8, skips RNG for selector2, otherwise samples spinTable[random&15], negating for selector1. Native modes0..2 preserve this subset; failed native launch stages RNG.'},
    gravity:{sourceAddress:'0x80125d18',sourceWord:view.getUint32(0x80125d18-BASE,true),relationship:'The vertical solver uses its reviewed coefficient words; it does not receive an arbitrary caller gravity. Subsequent original air stepping reads the separate gravity input. Recovered reference value is not asserted as all match settings.'},
    inspectionFixture:{duration:60,spinModes:{loft:2,curve:0,reverseCurve:1},label:'Explicit original duration index and numeric wrapper selectors for isolated inspection; no named action/default duration established.'},
    limitations:['These are original table generation and numeric launch paths, not possession, contact, animation timing, owner/action state or complete predictor initialization.',
      'Target is fixedQ16 XYZ for this loft ABI; the ground-launch wrapper uses a different integer target ABI. No launch target is invented by this helper.',
      'Duration is a source integer table index. No seconds-per-duration conversion or named chip/pass/shoot binding is established.',
      'The native Y/spin/distance bounds and transactional failure behavior are explicit API guards. Original wrapping inside the accepted domain is preserved.',
      'Analytical source launch coefficients and subsequent discrete gravity are separate source dependencies; changing match gravity settings without recovering their initialization is outside this profile.',
      'Generated mutable tables come from direct source numerical recurrences, not uninitialized overlay/RAM bytes, a CPU emulator or original-code execution.']}
}

async function main(){const{values}=parseArgs({options:{backend:{type:'string'},boot:{type:'string'},help:{type:'boolean',short:'h'}}});if(values.help){console.log('Usage: node games/fifa98/scripts/ball-flight-recovery.mjs [--backend BECODE.BIN] [--boot SLES_009.14]');return}const[b,r]=await Promise.all([readFile(values.backend??fileURLToPath(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url))),readFile(values.boot??fileURLToPath(new URL('../.work/reference/disc/SLES_009.14',import.meta.url)))]);console.log(JSON.stringify(inspectBallFlightRecovery(b,r),null,2))}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1})
