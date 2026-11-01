import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { inspectBallInteractionRecovery } from '../scripts/ball-interaction-recovery.mjs'

const bytes=await readFile(new URL('../.engine-build/fifa98-core.wasm',import.meta.url))
const build=JSON.parse(await readFile(new URL('../.engine-build/build.json',import.meta.url),'utf8'))
const module=await WebAssembly.compile(bytes),core=(await WebAssembly.instantiate(module)).exports
const base=core.fifa98_action_workspace()+256*4,ptr=(offset)=>base+offset*4
const memory=new Int32Array(core.memory.buffer,base,512)
const tables={atan:Array.from({length:257},(_,i)=>i>>1),sine:Array.from({length:257},(_,i)=>i*256)}
function load(t=tables){new Uint8Array(core.memory.buffer,ptr(64),257).set(t.atan);memory.set(t.sine,132)}
const hash=(value)=>createHash('sha256').update(value).digest('hex')
function keys(header,start,end){memory.set(header);const code=core.fifa98_action_calibration_keys(ptr(0),start,end,ptr(8));return{code,out:Array.from(memory.slice(8,13))}}
function keyOracle(header,a,b){
  const phase=(s)=>s===-100?header[2]*256:s===-99?(header[3]-2)*256:s===-98?(header[4]<0?header[2]:header[4])*256:
    s===-97?(header[1]-1)*(512<< (header[0]&1)):Number(BigInt.asIntN(32,BigInt(s)*256n))
  const start=phase(a),end=phase(b)
  if(start<0||end<start)return null
  const key=(p)=>Math.min(header[1]-1,Math.floor(p/(512<<(header[0]&1))))
  return[start,end,key(start),key(end),Math.floor((end-start)/256)]
}
function vectorOracle(a,b,ar,br,mirror,offset,t){
  const dx=(b[3+br*3]-a[3+ar*3])*4096*(mirror?-1:1),dz=(b[5+br*3]-a[5+ar*3])*4096
  const x=BigInt(Math.abs(dx)>>16),z=BigInt(Math.abs(dz)>>16),lo=x<z?x:z,hi=x<z?z:x
  const acute=x===z?128:t.atan[Number((lo*256n+hi/2n)/hi)]
  const angle=x>=z?acute:256-acute,axis=angle<=128?x:z,trig=t.sine[angle<=128?256-angle:angle]
  const distance=Number((axis<<15n)/(BigInt(trig)>>1n))
  let heading=0
  if(distance){
    const ax=BigInt(Math.abs(dx)),az=BigInt(Math.abs(dz)),minor=ax<az?ax:az,major=ax<az?az:ax
    let h
    if(ax===az)h=128
    else {const index=minor<8388608n?(minor*256n+major/2n)/major:(((minor<<32n)/major+8388608n)>>24n);h=t.atan[Number(index)];if(ax>az)h=256-h}
    heading=dz<0?(dx<0?h-512:512-h):(dx<0?-h:h)
    heading=(heading+offset)&1023;if(heading>512)heading-=1024
  }
  return[distance,heading,dx,dz]
}
function vectors(a,b,ar,br,mirror,offset){
  memory.set(a,16);memory.set(b,32)
  const code=core.fifa98_action_calibration_vectors(ptr(16),ptr(32),ar,br,mirror,offset,ptr(64),ptr(132),ptr(48))
  return{code,out:Array.from(memory.slice(48,52))}
}
let seed=0xba46098;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0

test('action calibration source and WASM match the build with zero host imports',async()=>{
  assert.equal(build.sources.find((s)=>s.path==='action-transition.c').sha256,hash(await readFile(new URL('./action-transition.c',import.meta.url))))
  assert.equal(hash(bytes),build.wasmSha256);assert.deepEqual(WebAssembly.Module.imports(module),[])
  assert.ok(core.fifa98_action_workspace_words()>=768)
})
test('original phase sentinels, signed SLL wrap, discrete keys and clamping match an independent oracle',()=>{
  const selectors=[-2147483648,-100,-99,-98,-97,-96,-1,0,1,4,128,32767,8388607,8388608,16777216,2147483647]
  for(const flag of [0,1,210,211])for(const header of [[flag,9,4,6,-1],[flag,3,-1,12,20],[flag,65535,32767,-32768,32767]])for(const a of selectors)for(const b of selectors){
    const expected=keyOracle(header,a,b),actual=keys(header,a,b)
    assert.equal(actual.code,expected?1:0,JSON.stringify({header,a,b}));if(expected)assert.deepEqual(actual.out,expected)
  }
  assert.deepEqual(keys([211,9,4,6,-1],0,-100).out,[0,1024,0,1,4])
  assert.deepEqual(keys([211,9,4,6,-1],-98,-97).out,[1024,8192,1,8,28])
})
test('prefix calibration preserves mirror, quantized zero length, offset wrap and source integer norm',()=>{
  load()
  const a=Array(9).fill(0),b=[0,0,0,0,0,0,0,0,15]
  assert.deepEqual(vectors(a,b,0,1,0,400).out,[0,0,0,15*4096])
  for(let i=0;i<12000;i++){
    const first=Array.from({length:9},()=>((next()&65535)-32768)),last=Array.from({length:9},()=>((next()&65535)-32768))
    const ar=next()&1,br=next()&1,mirror=next()&1,offset=(next()&65535)-32768
    assert.deepEqual(vectors(first,last,ar,br,mirror,offset),{code:1,out:vectorOracle(first,last,ar,br,mirror,offset,tables)})
  }
})
test('malformed input and original invalid phase branches preserve staged output',()=>{
  load();memory.fill(123456,8,13)
  for(const header of [[0,0,4,6,0],[65536,2,4,6,0],[0,2,32768,6,0]]){
    assert.equal(keys(header,0,-100).code,-1);assert.deepEqual(Array.from(memory.slice(8,13)),Array(5).fill(123456))
  }
  assert.equal(keys([0,2,-1,0,0],0,-100).code,0);assert.deepEqual(Array.from(memory.slice(8,13)),Array(5).fill(123456))
  const prefix=Array(9).fill(1);memory.fill(98765,48,52)
  for(const [ar,br,mirror,offset] of [[2,0,0,0],[0,2,0,0],[0,0,2,0],[0,0,0,32768]]){
    assert.equal(vectors(prefix,prefix,ar,br,mirror,offset).code,-1);assert.deepEqual(Array.from(memory.slice(48,52)),Array(4).fill(98765))
  }
  assert.equal(vectors([...prefix.slice(0,8),32768],prefix,0,0,0,0).code,-1)
  assert.deepEqual(Array.from(memory.slice(48,52)),Array(4).fill(98765))
  assert.equal(core.fifa98_action_calibration_keys(0,0,-100,ptr(8)),-1)
  assert.equal(core.fifa98_action_calibration_vectors(ptr(16),ptr(32),0,1,0,0,0,ptr(132),ptr(48)),-1)
})
test('fingerprinted original trigonometry agrees for actual source-domain prefix differences',async(t)=>{
  let backend,boot
  try{[backend,boot]=await Promise.all(['BECODE.BIN','SLES_009.14'].map((name)=>readFile(new URL(`../.work/reference/disc/${name}`,import.meta.url))))}
  catch(error){if(error.code==='ENOENT'){t.skip('Original reference images not prepared');return}throw error}
  const r=inspectBallInteractionRecovery(backend,boot),actual={atan:r.tables.atan8.values,sine:r.tables.sine.values};assert.equal(r.status,'reconstruction-only');load(actual)
  for(let i=0;i<2000;i++){
    const a=Array.from({length:9},()=>((next()&65535)-32768)),b=Array.from({length:9},()=>((next()&65535)-32768)),offset=(next()&65535)-32768
    assert.deepEqual(vectors(a,b,0,1,i&1,offset),{code:1,out:vectorOracle(a,b,0,1,i&1,offset,actual)})
  }
})
