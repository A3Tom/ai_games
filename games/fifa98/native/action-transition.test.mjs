import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { recoverActionFrame, actionRuntimeFlags } from '../scripts/action-transition.mjs'
import { parseMopClip } from '../scripts/animation.mjs'
import { inspectActionTransitionRecovery } from '../scripts/action-transition-recovery.mjs'

const bytes=await readFile(new URL('../.engine-build/fifa98-core.wasm',import.meta.url))
const build=JSON.parse(await readFile(new URL('../.engine-build/build.json',import.meta.url),'utf8'))
const module=await WebAssembly.compile(bytes),core=(await WebAssembly.instantiate(module)).exports
if(!core.fifa98_action_pose)throw new Error('Rebuild the native module with action-transition.c before its tests')
const hash=(value)=>createHash('sha256').update(value).digest('hex')
const mirrorMap=[0,1,2,3,7,8,9,4,5,6,13,14,15,10,11,12]
const frame=(dense)=>({index:0,translations:Array.from({length:16},(_,poseIndex)=>({poseIndex,valueRaw:dense.slice(poseIndex*7,poseIndex*7+3)})),rotations:Array.from({length:16},(_,poseIndex)=>({poseIndex,quaternionRaw:dense.slice(poseIndex*7+3,poseIndex*7+7)}))})

test('built native source and module hashes match without runtime imports',async()=>{
  assert.equal(build.sources.find((entry)=>entry.path==='action-transition.c')?.sha256,hash(await readFile(new URL('./action-transition.c',import.meta.url))))
  assert.equal(build.wasmSha256,hash(bytes));assert.deepEqual(WebAssembly.Module.imports(module),[])
})

test('native raw/runtime flags match source-shift semantics across word boundaries',()=>{
  for(const action of [0,1,0x100,0x60507,0x160507,0x7fffffff,0x80000000,0xffffffff])for(const retained of [0,32,0x80000000,0xffffffff])
    assert.equal(core.fifa98_action_runtime_flags(action,retained)>>>0,actionRuntimeFlags(action,{retainedChildFlags:retained}))
})

test('native sparse mirrored poses agree with independent raw-frame expressions',()=>{
  let random=0x98d0df0;const next=()=>random=(Math.imul(random,1664525)+1013904223)>>>0
  const base=frame(Array.from({length:112},()=>((next()&8191)-4096)))
  for(let iteration=0;iteration<5000;iteration++){
    const all=frame(Array.from({length:112},()=>((next()&8191)-4096)))
    const maskT=next()&65535,maskQ=next()&65535
    const key={...all,translations:all.translations.filter((row)=>maskT&(1<<row.poseIndex)),rotations:all.rotations.filter((row)=>maskQ&(1<<row.poseIndex))}
    const options={baseFrame:base,runtimeFlags:iteration&1?0x605:0x604,mirrorMap}
    assert.deepEqual(recoverActionFrame(key,{...options,nativeCore:core}),recoverActionFrame(key,options))
  }
})

test('native refuses out-of-frame negation and invalid domains before state writes',()=>{
  const base=frame(Array(112).fill(1)),key={index:0,translations:[{poseIndex:0,valueRaw:[-32768,0,0]}],rotations:[]}
  assert.throws(()=>recoverActionFrame(key,{baseFrame:base,runtimeFlags:1,mirrorMap,nativeCore:core}),/signed16 frame domain/)
  const address=core.fifa98_action_workspace(),memory=new Int32Array(core.memory.buffer,address,256)
  assert.deepEqual([...memory.subarray(0,112)],Array(112).fill(1))
  for(const flags of [0x20,0x40,0x100])assert.equal(core.fifa98_action_pose(address,address+512,0,0,flags,address+960),0)
  assert.equal(core.fifa98_action_pose(0,address+512,0,0,0,address+960),0)
})

test('actual115 mirrored control clips retain complete sparse pose without double mirroring',async(context)=>{
  let backend,actions,baseBytes
  try{[backend,actions,baseBytes]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/members/ZMODAT.BIG/aiseqs.tbi',import.meta.url)),readFile(new URL('../.work/reference/members/ZMODAT.BIG/mopsx115.viv.members/aaaaaa',import.meta.url))])}
  catch(error){if(error.code==='ENOENT'){context.skip('Original reference files are not prepared');return}throw error}
  const report=inspectActionTransitionRecovery(backend,actions);assert.equal(report.status,'reconstruction-only')
  const baseFrame=parseMopClip(baseBytes).frames[0]
  let previousFrame
  for(const id of [504,505,560,561,600,601,602,603,610,611,626,627]){
    const action=report.actions.find((entry)=>entry.actionId===id)
    let source
    for(const container of ['ZMODAT.BIG/mopsx115.viv.members',...Array.from({length:8},(_,index)=>`MOPSX115.BK${index+2}`)]){
      try{source=await readFile(new URL(`../.work/reference/members/${container}/${action.clipName}`,import.meta.url));break}
      catch(error){if(error.code!=='ENOENT')throw error}
    }
    assert.ok(source,`Original115 clip ${action.clipName} is required`)
    const clip=parseMopClip(source)
    for(const key of clip.frames){
      const options={baseFrame,previousFrame,runtimeFlags:action.runtimeFlags,mirrorMap:report.tables.mirrorMap.values}
      const js=recoverActionFrame(key,options),native=recoverActionFrame(key,{...options,nativeCore:core})
      assert.deepEqual(native,js);previousFrame=js
    }
  }
})
