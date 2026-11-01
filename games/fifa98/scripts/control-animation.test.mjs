import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createControlAnimation } from './control-animation.mjs'
const module = await WebAssembly.compile(await readFile(new URL('../.engine-build/fifa98-core.wasm', import.meta.url)))
const core = (await WebAssembly.instantiate(module)).exports
function fixture(flags = 4 << 8) {
  const categoryBytes = Array.from({ length: 252 }, (_, index) => index % 18 ? 1 : 0)
  const actionHalfwords = Array(330).fill(0)
  actionHalfwords[2] = 1; actionHalfwords[3] = 2048; actionHalfwords[166] = 1
  const tables = { categoryBytes, actionHalfwords, runVariant: { actionId: 1, referenceRaw: 2048 },
    mirrorMap:[0,1,2,3,7,8,9,4,5,6,13,14,15,10,11,12],
    actions: [{ actionId: 0, clipName: 'synthetic-idle', actionFlags: 4 << 8 }, { actionId: 1, clipName: 'synthetic-run', actionFlags: flags }] }
  const baseFrame = { translations:Array.from({length:16},(_,poseIndex)=>({poseIndex,valueRaw:[0,0,0]})), rotations:Array.from({length:16},(_,poseIndex)=>({poseIndex,quaternionRaw:[0,0,0,4096]})) }
  const clips = new Map([0,1].map((id) => [id, { flags: id, keyCount: 5, frames: Array.from({ length: 5 }, (_, index) => ({ index, prefixRaw:[0,0,0,index,0,index*2,index+10,8,index*3], translations:[{poseIndex:4,valueRaw:[10+index,0,20+index]}], rotations:[] })) }]))
  const player = { speed: 0, turnClass: 0, facing: 0, heading: 0, ticks: 0, steeringState: Array(14).fill(0) }
  return { tables, clips, player, animation: createControlAnimation(core, tables, clips, {baseFrame}) }
}
test('action-record loop flags govern playback independently of MOP header flags', () => {
  const { animation, player } = fixture()
  assert.equal(animation.step(player, 0).held, false)
  assert.equal(animation.step({ ...player, ticks: 1 }, 1).frame.index, 0)
  assert.equal(animation.step({ ...player, ticks: 2 }, 1).frame.index, 1)
  animation.reset(); assert.equal(animation.step(player, 0).phase, 0)
})
test('action start uses source unit rate and retention deadline; same-action zero rate preserves child rate', () => {
  const { animation, player } = fixture()
  animation.step(player, 0)
  const moving = { ...player, speed: 98304, ticks: 5 }
  const changed = animation.step(moving, 1)
  assert.equal(changed.actionId, 1); assert.equal(changed.rate, 65536)
  assert.equal(changed.selectorState[2], 35)
  const same = animation.step({ ...moving, ticks: 6 }, 1)
  assert.equal(same.rate, 73728)
  const turned = { ...moving, ticks: 7, steeringState: [...moving.steeringState] }; turned.steeringState[10] = 27
  const retained = animation.step(turned, 1)
  assert.equal(retained.actionId, 1); assert.equal(retained.rate, 73728)
})
test('linked, held and non-loop action previews keep a known first key instead of inventing callbacks', () => {
  for (const flags of [0, 0x24, 0x44, 0x104].map(value=>value<<8)) {
    const { animation, player } = fixture(flags)
    animation.step(player, 0)
    for (let ticks = 1; ticks < 20; ticks++) {
      const pose = animation.step({ ...player, speed: 65536, ticks }, 1)
      assert.equal(pose.actionId, 1); assert.equal(pose.held, true); assert.equal(pose.frame.index, 0); assert.equal(pose.phase, 0)
    }
  }
})
test('raw mirror bit becomes runtime mirror, advances keys and retains prior destination channels', () => {
  const { animation, player } = fixture(0x501)
  animation.step(player,0)
  const moving = {...player,speed:65536,ticks:1}
  let pose = animation.step(moving,1)
  assert.equal(pose.held,false);assert.equal(pose.mirrored,true)
  for(let ticks=2;ticks<10;ticks++)pose=animation.step({...moving,ticks},1)
  assert.ok(pose.frame.index>0)
  assert.deepEqual(pose.frame.translations[7].valueRaw,[10+pose.frame.index,0,-20-pose.frame.index])
  assert.deepEqual(pose.frame.translations[4].valueRaw,[10,0,20])
})
test('unknown resources reject and independent controllers restore native transfer tables', () => {
  const first = fixture(), other = fixture()
  first.animation.step(first.player, 0); other.tables.actionHalfwords.fill(2)
  assert.throws(() => other.animation.step(other.player, 0), /Unsupported/)
  assert.equal(first.animation.step(first.player, 1).actionId, 0)
  assert.throws(() => first.animation.step(first.player, 7), /0–6/)
})
test('attachment exposes original neighboring prefixes and source fractional phase without pre-mirroring',()=>{
  const {animation,player,clips}=fixture(0x501)
  animation.step(player,0)
  const pose=animation.step({...player,speed:65536,ticks:1},1)
  assert.equal(pose.marker.mirror,true)
  assert.deepEqual(pose.marker.prefixA,clips.get(pose.actionId).frames[0].prefixRaw)
  assert.deepEqual(pose.marker.prefixB,clips.get(pose.actionId).frames[1].prefixRaw)
  assert.equal(pose.marker.fraction16,16384)
  pose.marker.prefixA[6]=999
  assert.equal(animation.pose().marker.prefixA[6],10)
})
test('marker heading follows the source selector category byte and signed action-row offset',()=>{
  const {animation,player,tables}=fixture()
  tables.actions[0].headingOffsetRaw=-6;tables.actions[1].headingOffsetRaw=256
  const standing=animation.step({...player,facing:100,heading:200},0)
  assert.equal(standing.selectorState[0],0);assert.equal(standing.marker.headingRaw,94)
  const moving=animation.step({...player,speed:65536,facing:100,heading:200,ticks:1},1)
  assert.notEqual(moving.selectorState[0],0);assert.equal(moving.marker.headingRaw,456)
})
