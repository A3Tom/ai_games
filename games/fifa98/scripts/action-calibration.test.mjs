import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { calibrateAction } from './action-calibration.mjs'
import { parseMopClip } from './animation.mjs'
import { parseAnimationActions } from './locomotion-animation.mjs'
import { inspectBallInteractionRecovery } from './ball-interaction-recovery.mjs'

const core=(await WebAssembly.instantiate(await readFile(new URL('../.engine-build/fifa98-core.wasm',import.meta.url)))).instance.exports
const tables={atan:Array.from({length:257},(_,i)=>i>>1),sine:Array.from({length:257},(_,i)=>i*256)}
const action={flagsRaw:0,headingOffsetRaw:0}
const fixture=()=>({flags:211,keyCount:3,headerWords:[0,0,0,0,4,6,65535,...Array(11).fill(0)],
  frames:[{prefixRaw:Array(9).fill(0)},{prefixRaw:[0,0,0,0,0,0,16,0,256]},{prefixRaw:Array(9).fill(0)}]})

test('native calibration reads exact discrete prefixes, mirrors action X and detaches its output',()=>{
  const clip=fixture(),plain=calibrateAction(core,clip,action,tables)
  assert.equal(plain.parameter,4);assert.equal(plain.queueParameter,4);assert.equal(plain.startKey,0);assert.equal(plain.endKey,1)
  assert.deepEqual(plain.displacement,[65536,1048576]);assert.ok(plain.distance>0)
  const mirrored=calibrateAction(core,clip,{...action,flagsRaw:0x100},tables)
  assert.deepEqual(mirrored.displacement,[-65536,1048576]);assert.equal(plain.distance,mirrored.distance);assert.equal(mirrored.heading,-plain.heading)
  plain.displacement[0]=999;assert.equal(calibrateAction(core,clip,action,tables).displacement[0],65536)
  const pose=new Int32Array(core.memory.buffer,core.fifa98_action_workspace(),256);pose.fill(45)
  calibrateAction(core,clip,action,tables);assert.ok(pose.every((value)=>value===45),'calibration must preserve the independent sparse pose workspace')
})
test('invalid phase returns null while malformed or failed native work is rejected',()=>{
  const clip=fixture();clip.headerWords[4]=65535
  assert.equal(calibrateAction(core,clip,action,tables),null)
  assert.throws(()=>calibrateAction(core,fixture(),{...action,headingOffsetRaw:32768},tables),/Invalid original/)
  assert.throws(()=>calibrateAction(core,fixture(),action,tables,{startReference:2}),/Invalid original/)
  assert.throws(()=>calibrateAction({...core,fifa98_action_workspace_words:()=>256},fixture(),action,tables),/incomplete/)
  const bad=fixture();bad.frames[1].prefixRaw=[1]
  assert.throws(()=>calibrateAction(core,bad,action,tables),/prefix/)
  assert.throws(()=>calibrateAction({...core,fifa98_action_calibration_vectors:()=>-1},fixture(),action,tables),/rejected its vectors/)
})
test('actual original kick clip supplies queued parameter4 from its phase and prefix data',async(t)=>{
  let backend,boot,db,bytes
  try{[backend,boot,db,bytes]=await Promise.all([
    'disc/BECODE.BIN','disc/SLES_009.14','members/ZMODAT.BIG/aiseqs.tbi','members/ZMODAT.BIG/mopsx115.viv.members/ckspfa2',
  ].map((name)=>readFile(new URL(`../.work/reference/${name}`,import.meta.url))))}
  catch(error){if(error.code==='ENOENT'){t.skip('Original reference assets not prepared');return}throw error}
  const recovered=inspectBallInteractionRecovery(backend,boot),original={atan:recovered.tables.atan8.values,sine:recovered.tables.sine.values}
  const actions=parseAnimationActions(db),clip=parseMopClip(bytes)
  const first=calibrateAction(core,clip,actions.records[384],original),second=calibrateAction(core,clip,actions.records[385],original)
  assert.equal(first.parameter,4);assert.equal(first.startPhase,0);assert.equal(first.endPhase,1024)
  assert.equal(first.distance,second.distance);assert.ok(first.distance>0)
  assert.equal(first.displacement[0],-second.displacement[0]);assert.equal(first.displacement[1],second.displacement[1])
  assert.deepEqual([first.startKey,first.endKey],[0,1]);assert.equal(clip.frames.length,9)
})
