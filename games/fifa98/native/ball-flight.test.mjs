import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {inspectBallFlightRecovery} from '../scripts/ball-flight-recovery.mjs'
const wasm=await readFile(new URL('../.engine-build/fifa98-core.wasm',import.meta.url))
const build=JSON.parse(await readFile(new URL('../.engine-build/build.json',import.meta.url),'utf8'))
const module=await WebAssembly.compile(wasm),core=(await WebAssembly.instantiate(module)).exports
if(!core.fifa98_ball_loft_launch||!core.fifa98_ball_speed_launch||!core.fifa98_ball_flight_duration||!core.fifa98_ball_height_launch)throw Error('Rebuild native core with ball-flight.c speed/height-selected exports')
const base=core.fifa98_control_workspace(),memory=new Uint32Array(core.memory.buffer,base,1024),pointer=i=>base+i*4
const u=v=>Number(BigInt.asUintN(32,BigInt(v))),s=v=>BigInt.asIntN(32,BigInt(v>>>0))
const add=(a,b)=>u(BigInt(a)+BigInt(b)),sub=(a,b)=>u(BigInt(a)-BigInt(b)),asr=(a,b)=>u(s(a)>>BigInt(b)),mul=(a,b)=>u((s(a)*s(b)+32768n)>>16n)
const div=(a,b)=>u((s(a)<<16n)/s(b)),hash=v=>createHash('sha256').update(v).digest('hex')
const fixture={atan8:Array.from({length:257},(_,i)=>Math.floor(i/2)),atan16:Array.from({length:257},(_,i)=>i*32),sine:Array.from({length:257},(_,i)=>i*256),exponential:Array(113).fill(131072)}
function configure(t=fixture){new Uint8Array(core.memory.buffer,base,257).set(t.atan8);memory.set(t.atan16,80);memory.set(t.sine,352);memory.set(t.exponential,624)}
function coarse(angle,sine){const i=angle&255,a=sine[i],b=sine[256-i];return [[a,b],[b,-a],[-a,-b],[-b,a]][(angle>>>8)&3].map(u)}
function heading(x,z,table,wide=false){let a=s(x),b=s(z),base=0,flip=false;if(b<0n){b=-b;base=wide?32768:512;flip=true}if(a<0n){a=-a;base=-base;flip=!flip}if(a>b){[a,b]=[b,a];base+=flip?-(wide?16384:256):(wide?16384:256);flip=!flip}let result=wide?8192:128;if(a!==b){if(wide){const ratio=(a<<32n)/b,i=Number(ratio>>24n),f=Number((ratio>>8n)&65535n);result=table[i]+(u(BigInt(table[i+1]-table[i])*BigInt(f))>>>16)}else{let i;if(a>=0x800000n){const r=(a<<32n)/b;i=Number((r>>24n)+((r&0x800000n)?1n:0n))}else i=Number(((a<<8n)+(b>>1n))/b);result=table[i]}}return u(flip?base-result:base+result)}
function length(x,z,t){let angle=Number(s(heading(z,x,t.atan8)));angle=Math.abs(angle);if(angle>256)angle=512-angle;const vector=coarse(angle,t.sine),axis=angle<=128?Math.abs(Number(s(x))):Math.abs(Number(s(z))),den=asr(vector[angle<=128?1:0],1);return den?u((BigInt(axis)<<15n)/BigInt(den)):0xffffffff}
function curve(vx,vz,spin){vx=sub(vx,mul(203,vx));vz=sub(vz,mul(203,vz));if(spin){vx=add(vx,mul(mul(spin,vz),10000));vz=sub(vz,mul(mul(spin,vx),10000));spin=mul(spin,0xf9db)}return[vx,vz,spin]}
function tables(t){const factors=[0],angles=[0];let x=65536,z=0,vx=65536,vz=0,spin=1000;for(let i=1;i<320;i++){z=add(z,vz);[vx,vz,spin]=curve(vx,vz,spin);factors.push(Math.min(65535,div(65536,length(asr(x,16),asr(z,16),t)<<16)));x=add(x,vx)}x=0;z=0;vx=0;vz=262144;spin=u(-1000);for(let i=1;i<320;i++){z=add(z,vz);[vx,vz,spin]=curve(vx,vz,spin);angles.push(div(heading(x,z,t.atan16,true),u(-1000))&65535);x=add(x,vx)}return{factors,angles}}
function exponential(input,t){if(!input)return 65536;if(s(input)<-681391n)return 0;let digits=-s(input),row=0,result=0;while(digits){const digit=Number(digits&31n);digits>>=5n;if(digit){const factor=t[row*31+digit-1];result=result===0?factor:mul(result,factor)}row++}const mag=BigInt(result),q=0xffffffffn/mag,r=0xffffffffn%mag;return Number(q+(r>mag/2n?1n:0n))}
function vector16(angle,t){const [a,b]=coarse(asr(angle,6),t.sine),c=((angle&63)*411774)>>>9;return[add(a,asr(u(s(asr(b,2))*BigInt(c)),21)),add(b,asr(u(s(asr(sub(0,a),2))*BigInt(c)),21))]}
function launch(position,target,duration,spin,t,generated){const dx=sub(target[0],position[0]),dz=sub(target[2],position[2]),distance=length(asr(dx,16),asr(dz,16),t);let horizontal=mul(generated.factors[duration],distance<<16),vertical=983040;if(duration){const time=duration<<16,n=sub(asr(mul(832149,sub(target[1],position[1])),12),asr(mul(u(-2386092),time),8)),e=asr(mul(u(-208360),time),10),den=sub(65536,exponential(e,t.exponential));vertical=add(u(-3006669),div(n,den))}let flag=0;if(s(horizontal)>2293760n){horizontal=2293760;flag=1}if(s(vertical)>1638400n){vertical=1638400;flag=1}let angle=sub(heading(dx,dz,t.atan16,true),mul(spin,generated.angles[duration]));if(s(angle)>65536n)angle=sub(angle,65536);else if(s(angle)<0n)angle=add(angle,65536);const v=vector16(angle,t);return{flag,output:[mul(horizontal,v[0]),vertical,mul(horizontal,v[1]),horizontal,distance,angle,spin,duration]}}
function invoke(position,target,duration,spin){memory.set(position,752);memory.set(target,756);const flag=core.fifa98_ball_loft_launch(pointer(752),pointer(756),duration,spin,pointer(0),pointer(80),pointer(352),pointer(624),pointer(764));return{flag,output:[...memory.subarray(764,772)]}}
// A recursive mathematical search tree makes the source's previous-span test
// explicit independently of the C loop. Strict best-error ties retain the
// first visited node, including a final child when the previous span was one.
function durationSelection(distance,speed,factors){
  const ratio=(BigInt(speed)<<16n)/BigInt(distance)
  if(BigInt(factors[1])<ratio)return 1
  if(ratio<BigInt(factors[319]))return 319
  const visits=[]
  function visit(lo,hi,span){
    const middle=lo+Math.floor(span/2),error=BigInt(factors[middle])-ratio
    visits.push({middle,error,absolute:error<0n?-error:error})
    if(error===0n)return
    const nextLo=error>0n?middle+1:lo,nextHi=error<0n?middle-1:hi
    if(span>0)visit(nextLo,nextHi,nextHi-nextLo)
  }
  visit(1,319,318)
  return visits.reduce((best,current)=>current.absolute<best.absolute?current:best).middle
}
function speedLaunch(position,target,requested,cap,spin,t,generated){
  const dx=sub(target[0],position[0]),dz=sub(target[2],position[2]),distance=length(asr(dx,16),asr(dz,16),t)
  const duration=durationSelection(distance*65536,requested,generated.factors),horizontal=mul(generated.factors[duration],distance*65536)
  const time=duration*65536,n=sub(asr(mul(832149,sub(target[1],position[1])),12),asr(mul(u(-2386092),time),8))
  const exponent=asr(mul(u(-208360),time),10),den=sub(65536,exponential(exponent,t.exponential))
  let vertical=add(u(-3006669),div(n,den)),flag=0,error=s(requested)-s(horizontal)
  if(error<0n)error=-error
  if(error>32768n)flag|=2
  if(s(cap)<s(vertical)){vertical=cap;flag|=1}
  let angle=sub(heading(dx,dz,t.atan16,true),mul(spin,generated.angles[duration]))
  if(s(angle)>65536n)angle=sub(angle,65536);else if(s(angle)<0n)angle=add(angle,65536)
  const vector=vector16(angle,t)
  return{flag,output:[mul(horizontal,vector[0]),vertical,mul(horizontal,vector[1]),horizontal,distance,angle,spin,duration]}
}
function invokeSpeed(position,target,requested,cap,spin=0){memory.set(position,752);memory.set(target,756);const flag=core.fifa98_ball_speed_launch(pointer(752),pointer(756),spin,requested,cap,pointer(0),pointer(80),pointer(352),pointer(624),pointer(764));return{flag,output:[...memory.subarray(764,772)]}}
function positiveOrNegativeExponential(input,t){
  if(s(input)<=0n)return exponential(input,t)
  if(input>681391)return null
  let digits=BigInt(input),row=0,result=0
  while(digits){const digit=Number(digits&31n);digits>>=5n;if(digit){const factor=t[row*31+digit-1];result=result===0?factor:mul(result,factor)}row++}
  return result
}
function inverse(input,tables){
  if(s(input)>0n)return null
  const scaled=mul(182420805,sub(0,input)),high=Number(s(scaled)>>16n)-512,low=high-1
  if(high>=512||low<0)return null
  const f=scaled&65535
  return tables.map(table=>add(mul(table[low],65536-f),mul(table[high],f)))
}
function heightLaunch(position,target,height,hcap,vcap,spin,t,generated){
  const delta=sub(height,position[1]),firstExponent=asr(mul(u(-145331),delta),15),firstExp=positiveOrNegativeExponential(firstExponent,t.exponential)
  if(firstExp===null)return{failure:'first-exponential'}
  const firstInput=asr(mul(u(-395007066),firstExp),14),firstInverse=inverse(firstInput,[t.inverseB])
  if(!firstInverse||!firstInverse[0])return{failure:'height-index'}
  const intermediate=sub(add(mul(u(-21107860),firstInverse[0]),mul(delta,u(-1428))),21140645)
  if(s(intermediate)<0n)return{failure:'negative-intermediate-time'}
  const secondExponent=asr(mul(208360,intermediate),10),secondExp=positiveOrNegativeExponential(secondExponent,t.exponential)
  if(secondExp===null)return{failure:'positive-exponential'}
  let vertical=mul(u(-3006669),sub(65536,secondExp))
  const anchor=asr(sub(mul(u(-91422),sub(target[1],position[1])),mul(u(-29415702),vertical)),6)
  const scale=add(u(-395007066),mul(u(-8609919),vertical)),rootExponent=asr(mul(anchor,u(-208360)),10),rootExp=positiveOrNegativeExponential(rootExponent,t.exponential)
  if(rootExp===null)return{failure:'root-exponential'}
  const rootInput=asr(mul(scale,rootExp),14),roots=inverse(rootInput,[t.inverseA,t.inverseB])
  if(!roots)return{failure:'root-index'}
  const rootAnchor=add(21140645,anchor),late=sub(rootAnchor,mul(roots[0],u(-21107860))),early=sub(rootAnchor,mul(roots[1],u(-21107860)))
  const selected=s(late)<0n&&s(early)>0n?early:late,duration=asr(add(selected,32768),16)
  if(duration>319)return{failure:'rounded-duration',selected,late,early}
  const dx=sub(target[0],position[0]),dz=sub(target[2],position[2]),distance=length(asr(dx,16),asr(dz,16),t)
  let horizontal=mul(generated.factors[duration],distance*65536),flag=0
  if(s(hcap)<s(horizontal)){horizontal=hcap;flag=1}
  if(s(vcap)<s(vertical)){vertical=vcap;flag=1}
  let angle=sub(heading(dx,dz,t.atan16,true),mul(spin,generated.angles[duration]))
  if(s(angle)>65536n)angle=sub(angle,65536);else if(s(angle)<0n)angle=add(angle,65536)
  const vector=vector16(angle,t)
  return{flag,output:[mul(horizontal,vector[0]),vertical,mul(horizontal,vector[1]),horizontal,distance,angle,spin,duration],selected,late,early,positiveExponent:secondExponent}
}
const flightBase=core.fifa98_ball_flight_workspace(),flightMemory=new Uint32Array(core.memory.buffer,flightBase,core.fifa98_ball_flight_workspace_words())
function configureInverse(t){flightMemory.set(t.inverseA,0);flightMemory.set(t.inverseB,512)}
function invokeHeight(position,target,height,hcap,vcap,spin=0){memory.set(position,752);memory.set(target,756);const flag=core.fifa98_ball_height_launch(pointer(752),pointer(756),spin,height,hcap,vcap,pointer(0),pointer(80),pointer(352),pointer(624),flightBase,flightBase+2048,pointer(764));return{flag,output:[...memory.subarray(764,772)]}}
async function actualFlightTables(context){let be,boot;try{[be,boot]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/disc/SLES_009.14',import.meta.url))])}catch(error){if(error.code==='ENOENT'){context.skip('Original reference not prepared');return null}throw error}const report=inspectBallFlightRecovery(be,boot);assert.equal(report.status,'reconstruction-only');return Object.fromEntries(['atan8','atan16','sine','exponential','inverseA','inverseB'].map(name=>[name,report.tables[name].values]))}

test('native source/module hashes match without runtime imports',async()=>{assert.equal(build.sources.find(e=>e.path==='ball-flight.c')?.sha256,hash(await readFile(new URL('./ball-flight.c',import.meta.url))));assert.equal(build.wasmSha256,hash(wasm));assert.deepEqual(WebAssembly.Module.imports(module),[])})
test('both320-entry tables match independent BigInt source recurrences',()=>{configure();assert.equal(core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352)),1);const expected=tables(fixture);assert.deepEqual([...new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_factors(),320)],expected.factors);assert.deepEqual([...new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_angles(),320)],expected.angles);assert.equal(expected.factors[0],0);assert.equal(expected.factors[1],65535);assert.equal(core.fifa98_ball_flight_tables(0,pointer(80),pointer(352)),0);assert.deepEqual([...new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_factors(),320)],expected.factors)})
test('loft velocities, signed quotient, caps and curve headings match BigInt across bounded inputs',()=>{configure();core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));const generated=tables(fixture);let seed=0x98c590;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(let i=0;i<5000;i++){const position=[u(((random()%3000)-1500)*65536),random()%(1024*65536+1),u(((random()%3000)-1500)*65536)],target=[u(((random()%3000)-1500)*65536),random()%(1024*65536+1),u(((random()%3000)-1500)*65536)],duration=random()%320,spin=u((random()%16001)-8000);assert.deepEqual(invoke(position,target,duration,spin),launch(position,target,duration,spin,fixture,generated))}})
test('wrapper spin modes consume one RNG draw or none, and rejection is transactional',()=>{configure();core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));memory.set([0,0,0],752);memory.set([0,0,192*65536],756);for(const mode of[0,1,2]){core.fifa98_random_seed(0,pointer(776));memory.set(memory.subarray(776,782),784);const value=core.fifa98_random_next(pointer(784))>>>0;const expected=[2000,3000,3000,4000,4000,4000,5000,5000,5000,6000,6000,6000,7000,7000,8000,8000][value&15];const original=[...memory.subarray(776,782)];const result=core.fifa98_ball_loft_random_launch(pointer(752),pointer(756),60,mode,pointer(776),pointer(0),pointer(80),pointer(352),pointer(624),pointer(764));assert.ok(result===0||result===1);assert.equal(memory[770],mode===2?0:u(mode===1?-expected:expected));assert.deepEqual([...memory.subarray(776,782)],mode===2?original:[...memory.subarray(784,790)])}const rng=[...memory.subarray(776,782)],out=[...memory.subarray(764,772)];assert.equal(core.fifa98_ball_loft_random_launch(pointer(752),pointer(756),320,0,pointer(776),pointer(0),pointer(80),pointer(352),pointer(624),pointer(764)),-1);assert.deepEqual([...memory.subarray(776,782)],rng);assert.deepEqual([...memory.subarray(764,772)],out);for(const[duration,spin]of[[320,0],[60,8001],[60,u(-8001)]])assert.equal(invoke([0,0,0],[0,0,1],duration,spin).flag,-1)})
test('actual source tables produce an airborne60-index launch without invented velocity',async(context)=>{let be,boot;try{[be,boot]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/disc/SLES_009.14',import.meta.url))])}catch(e){if(e.code==='ENOENT'){context.skip('Original reference not prepared');return}throw e}const report=inspectBallFlightRecovery(be,boot);assert.equal(report.status,'reconstruction-only');const t=Object.fromEntries(['atan8','atan16','sine','exponential'].map(name=>[name,report.tables[name].values]));configure(t);assert.equal(core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352)),1);const expected=tables(t);assert.deepEqual([...new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_factors(),320)],expected.factors);assert.deepEqual([...new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_angles(),320)],expected.angles);const result=invoke([0,0,0],[0,0,192*65536],60,0);assert.deepEqual(result,launch([0,0,0],[0,0,192*65536],60,0,t,expected));assert.ok(s(result.output[1])>0n);assert.ok(s(result.output[2])>0n)})

test('source duration search preserves quotient truncation, strict ties and previous-span terminal pass',()=>{
  const factors=Array.from({length:320},(_,i)=>65535-100*i),input=new Uint16Array(core.memory.buffer,pointer(800),320)
  input.set(factors)
  // Rechecking the updated span>0 omits source's final index319 evaluation.
  assert.equal(core.fifa98_ball_flight_duration(65536,33635,pointer(800)),319)
  // Equal errors at318/319 retain318, which was visited first.
  assert.equal(core.fifa98_ball_flight_duration(65536,33685,pointer(800)),318)
  // 101657/3 truncates33885. The first equal-error visit317 wins. Rounded
  // division33886 would select316, so a host floating quotient is not valid.
  assert.equal(core.fifa98_ball_flight_duration(3*65536,101657,pointer(800)),317)
  assert.equal(core.fifa98_ball_flight_duration(65536,33886,pointer(800)),316)
  assert.equal(core.fifa98_ball_flight_duration(65536,0,pointer(800)),319)
  assert.equal(core.fifa98_ball_flight_duration(65536,65535,pointer(800)),1)
  input.fill(100)
  assert.equal(core.fifa98_ball_flight_duration(65536,100,pointer(800)),160)
  input.fill(0)
  assert.equal(core.fifa98_ball_flight_duration(65536,0,pointer(800)),160)
  for(const[d,speed]of[[0,1],[65537,1],[32768*65536,1],[65536,50*65536+1]])assert.equal(core.fifa98_ball_flight_duration(d,speed,pointer(800)),-1)
  assert.equal(core.fifa98_ball_flight_duration(65536,1,0),-1)
})

test('duration search matches independent BigInt search-tree oracle on generated and synthetic factors',()=>{
  configure();core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352))
  const generated=tables(fixture).factors,input=new Uint16Array(core.memory.buffer,pointer(800),320)
  let seed=0x98c71c;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0
  for(const factors of[generated,Array.from({length:320},(_,i)=>65535-100*i),Array(320).fill(32768)]){
    input.set(factors)
    for(let i=0;i<5000;i++){
      const distance=(1+random()%32767)*65536,speed=random()%(50*65536+1)
      assert.equal(core.fifa98_ball_flight_duration(distance,speed,pointer(800)),durationSelection(distance,speed,factors))
    }
  }
})

test('speed-selected launch matches BigInt source solver including all original result flags',()=>{
  configure();core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));const generated=tables(fixture)
  let seed=0x98c83c;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,seen=new Set()
  for(let i=0;i<7000;i++){
    const position=[u((random()%3000-1500)*65536),random()%(1024*65536+1),u((random()%3000-1500)*65536)]
    const target=[u((random()%3000-1500)*65536),random()%(1024*65536+1),u((random()%3000-1500)*65536)]
    if(position[0]===target[0]&&position[2]===target[2])continue
    const requested=random()%(50*65536+1),cap=random()%(50*65536+1),spin=u(random()%16001-8000)
    const actual=invokeSpeed(position,target,requested,cap,spin)
    assert.deepEqual(actual,speedLaunch(position,target,requested,cap,spin,fixture,generated));seen.add(actual.flag)
  }
  assert.deepEqual([...seen].sort(),[0,1,2,3])
})

test('speed mismatch and vertical cap thresholds are strict and no horizontal post-clamp is added',()=>{
  configure();core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352))
  const nativeFactors=new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_factors(),320),nativeAngles=new Uint16Array(core.memory.buffer,core.fifa98_ball_flight_angles(),320)
  const oldFactors=[...nativeFactors],oldAngles=[...nativeAngles],generated={factors:Array(320).fill(32768),angles:Array(320).fill(0)}
  nativeFactors.set(generated.factors);nativeAngles.set(generated.angles)
  try{
    for(const[requested,flag]of[[32768,0],[32767,2],[98304,0],[98305,2],[0,2]]){
      const actual=invokeSpeed([0,0,0],[0,0,2*65536],requested,50*65536)
      assert.deepEqual(actual,speedLaunch([0,0,0],[0,0,2*65536],requested,50*65536,0,fixture,generated));assert.equal(actual.flag,flag)
      assert.equal(actual.output[3],65536)
    }
    // The preceding synthetic exponential131072 intentionally gives negative
    // vertical solutions here. Use a separate synthetic lookup with a positive
    // bounded solution to exercise both sides of the vertical-cap boundary.
    const verticalFixture={...fixture,exponential:Array(113).fill(80000)}
    configure(verticalFixture)
    const uncapped=speedLaunch([0,0,0],[0,300*65536,2*65536],65536,50*65536,0,verticalFixture,generated),vertical=uncapped.output[1]
    assert.ok(s(vertical)>0n&&s(vertical)<50n*65536n)
    assert.equal(invokeSpeed([0,0,0],[0,300*65536,2*65536],65536,vertical).flag,0)
    assert.equal(invokeSpeed([0,0,0],[0,300*65536,2*65536],65536,vertical-1).flag,1)
    // Tiny requested speed still retains actual factor-selected speed. It is
    // reported as an error, not silently clamped to that requested value.
    assert.ok(invokeSpeed([0,0,0],[0,0,2*65536],1,50*65536).output[3]>1)
  }finally{nativeFactors.set(oldFactors);nativeAngles.set(oldAngles)}
})

test('speed solver refuses unsupported target/domain inputs before any output write',()=>{
  configure();core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));memory.fill(0xdeadbeef,764,772)
  const initial=[...memory.subarray(764,772)]
  for(const[position,target,requested,cap,spin]of[
    [[0,0,0],[0,0,0],65536,20*65536,0],
    [[0,0,0],[0x80000000,0,0],65536,20*65536,0],
    [[0,0,0],[0,0,65536],50*65536+1,20*65536,0],
    [[0,0,0],[0,0,65536],65536,50*65536+1,0],
    [[0,0,0],[0,0,65536],65536,20*65536,8001],
    [[0,0,0],[0,1024*65536+1,65536],65536,20*65536,0],
  ]){assert.equal(invokeSpeed(position,target,requested,cap,spin).flag,-1);assert.deepEqual([...memory.subarray(764,772)],initial)}
  assert.equal(core.fifa98_ball_speed_launch(0,pointer(756),0,65536,20*65536,pointer(0),pointer(80),pointer(352),pointer(624),pointer(764)),-1)
  assert.deepEqual([...memory.subarray(764,772)],initial)
})

test('actual source tables drive source-selected duration, not the explicit60-index fixture',async(context)=>{
  let be,boot
  try{[be,boot]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/disc/SLES_009.14',import.meta.url))])}
  catch(e){if(e.code==='ENOENT'){context.skip('Original reference not prepared');return}throw e}
  const report=inspectBallFlightRecovery(be,boot),t=Object.fromEntries(['atan8','atan16','sine','exponential'].map(name=>[name,report.tables[name].values]))
  configure(t);core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));const generated=tables(t)
  for(const[position,target,requested,cap,spin]of[
    [[0,0,0],[0,0,192*65536],10*65536,20*65536,0],
    [[0,10*65536,0],[100*65536,0,600*65536],25*65536,20*65536,5000],
    [[0,0,0],[0,0,192*65536],0,20*65536,0],
  ]){
    const actual=invokeSpeed(position,target,requested,cap,spin)
    assert.deepEqual(actual,speedLaunch(position,target,requested,cap,spin,t,generated));assert.ok(actual.output[7]>=1&&actual.output[7]<=319)
  }
})

test('height-selected solver reproduces original positive-exponential/inverse roots at numeric reference4',async(context)=>{
  const t=await actualFlightTables(context);if(!t)return
  assert.ok(flightMemory.length>=2048);configure(t);configureInverse(t);core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));const generated=tables(t)
  const position=[0,0,0],target=[0,0,192*65536],expected=heightLaunch(position,target,4*65536,35*65536,25*65536,0,t,generated)
  assert.equal(expected.failure,undefined);assert.ok(expected.positiveExponent>0)
  assert.deepEqual(invokeHeight(position,target,4*65536,35*65536,25*65536),{flag:expected.flag,output:expected.output})
  assert.equal(expected.output[7],4);assert.equal(expected.output[1],30968)
  assert.ok(expected.output[1]>0);assert.ok(expected.output[7]>0&&expected.output[7]<320)
  assert.equal(expected.output[7],Number(s(add(expected.selected,32768))>>16n))
  assert.deepEqual([...flightMemory.subarray(0,512)],t.inverseA.map(u));assert.deepEqual([...flightMemory.subarray(512,1024)],t.inverseB.map(u))
})

test('height solver matches BigInt wrapped source roots, time rounding and strict cap bits',async(context)=>{
  const t=await actualFlightTables(context);if(!t)return
  configure(t);configureInverse(t);core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));const generated=tables(t)
  let seed=0x98ca14;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0
  let accepted=0,refused=0,rounded=0;const seen=new Set()
  for(let i=0;i<7000;i++){
    const currentY=random()%(16*65536),height=(1+Math.floor(currentY/65536)+random()%1000)*65536
    const position=[u((random()%3000-1500)*65536),currentY,u((random()%3000-1500)*65536)],target=[u((random()%3000-1500)*65536),random()%(1024*65536+1),u((random()%3000-1500)*65536)]
    if(position[0]===target[0]&&position[2]===target[2])continue
    const hcap=random()%(50*65536+1),vcap=random()%(50*65536+1),spin=u(random()%16001-8000)
    const expected=heightLaunch(position,target,height,hcap,vcap,spin,t,generated),before=[...memory.subarray(764,772)],actual=invokeHeight(position,target,height,hcap,vcap,spin)
    if(expected.failure){assert.equal(actual.flag,-1);assert.deepEqual(actual.output,before);refused++}
    else{assert.deepEqual(actual,{flag:expected.flag,output:expected.output});accepted++;seen.add(actual.flag);if((expected.selected&65535)>=32768)rounded++}
  }
  assert.ok(accepted>1000);assert.ok(refused>100);assert.ok(rounded>100);assert.deepEqual([...seen].sort(),[0,1])
  const position=[0,0,0],target=[0,0,192*65536],uncapped=heightLaunch(position,target,16*65536,50*65536,50*65536,0,t,generated)
  assert.equal(uncapped.flag,0)
  const horizontal=uncapped.output[3],vertical=uncapped.output[1]
  assert.equal(invokeHeight(position,target,16*65536,horizontal,vertical).flag,0)
  assert.equal(invokeHeight(position,target,16*65536,horizontal-1,vertical).flag,1)
  assert.equal(invokeHeight(position,target,16*65536,horizontal,vertical-1).flag,1)
})

test('height solver refuses missing inverse roots and unsupported source domains atomically',async(context)=>{
  const t=await actualFlightTables(context);if(!t)return
  configure(t);configureInverse(t);core.fifa98_ball_flight_tables(pointer(0),pointer(80),pointer(352));const generated=tables(t)
  memory.fill(0xdeadbeef,764,772);const before=[...memory.subarray(764,772)]
  const highTarget=[0,64*65536,192*65536],expected=heightLaunch([0,0,0],highTarget,4*65536,35*65536,25*65536,0,t,generated)
  assert.equal(expected.failure,'root-index')
  assert.equal(invokeHeight([0,0,0],highTarget,4*65536,35*65536,25*65536).flag,-1)
  for(const[position,target,height,hcap,vcap,spin]of[
    [[0,0,0],[0,0,192*65536],0,35*65536,25*65536,0],
    [[0,0,0],[0,0,192*65536],4*65536+1,35*65536,25*65536,0],
    [[0,4*65536,0],[0,0,192*65536],4*65536,35*65536,25*65536,0],
    [[0,0,0],[0,0,192*65536],1025*65536,35*65536,25*65536,0],
    [[0,0,0],[0,0,0],4*65536,35*65536,25*65536,0],
    [[0,0,0],[0,0,192*65536],4*65536,50*65536+1,25*65536,0],
    [[0,0,0],[0,0,192*65536],4*65536,35*65536,50*65536+1,0],
    [[0,0,0],[0,0,192*65536],4*65536,35*65536,25*65536,8001],
  ]){assert.equal(invokeHeight(position,target,height,hcap,vcap,spin).flag,-1);assert.deepEqual([...memory.subarray(764,772)],before)}
  flightMemory.fill(0,512,1024)
  assert.equal(invokeHeight([0,0,0],[0,0,192*65536],4*65536,35*65536,25*65536).flag,-1)
  assert.deepEqual([...memory.subarray(764,772)],before)
  configureInverse(t)
  assert.equal(core.fifa98_ball_height_launch(pointer(752),pointer(756),0,4*65536,35*65536,25*65536,pointer(0),pointer(80),pointer(352),pointer(624),0,flightBase+2048,pointer(764)),-1)
  assert.deepEqual([...memory.subarray(764,772)],before)
})
