import test from 'node:test'
import assert from 'node:assert/strict'
import { actionRuntimeFlags, isPlainActionLoop, recoverActionFrame } from './action-transition.mjs'

const mirrorMap = [0,1,2,3,7,8,9,4,5,6,13,14,15,10,11,12]
const baseFrame = { index: 0, translations: Array.from({ length: 16 }, (_, poseIndex) => ({ poseIndex, valueRaw: [poseIndex+1,2,3] })),
  rotations: Array.from({ length: 16 }, (_, poseIndex) => ({ poseIndex, quaternionRaw: [4,5,6,7] })) }
const key = (poseIndex, t = [11,12,13], q = [14,15,16,17]) => ({ index: 3,
  translations: [{ poseIndex, valueRaw: t }], rotations: [{ poseIndex, quaternionRaw: q }] })

test('raw action metadata is shifted before runtime loop/mirror classification', () => {
  assert.equal(actionRuntimeFlags(0x60507),0x605)
  assert.equal(actionRuntimeFlags(0x60407),0x604)
  assert.equal(actionRuntimeFlags(0x60507,{retainedChildFlags:0xffffffff}),0x80000625)
  assert.equal(isPlainActionLoop(0x60507),true)
  assert.equal(isPlainActionLoop(0x160507),true)
  for(const runtime of [0x20,0x40,0x100]) assert.equal(isPlainActionLoop((runtime|4)<<8),false)
  assert.throws(()=>actionRuntimeFlags(-1),/unsigned32/)
})

test('mirroring uses original source-to-destination map and distinct pelvis transforms', () => {
  const pelvis=recoverActionFrame(key(0),{baseFrame,runtimeFlags:0x605,mirrorMap})
  assert.deepEqual(pelvis.translations[0].valueRaw,[-11,12,13])
  assert.deepEqual(pelvis.rotations[0].quaternionRaw,[-16,17,-14,15])
  const limb=recoverActionFrame(key(4),{baseFrame,runtimeFlags:0x605,mirrorMap})
  assert.deepEqual(limb.translations[7].valueRaw,[11,12,-13])
  assert.deepEqual(limb.rotations[7].quaternionRaw,[-14,-15,16,17])
  assert.deepEqual(limb.translations[4].valueRaw,baseFrame.translations[4].valueRaw)
  assert.equal(limb.index,3)
})

test('retained sparse output is never mirrored a second time, including action changes', () => {
  const first=recoverActionFrame(key(4),{baseFrame,runtimeFlags:0x605,mirrorMap})
  const second=recoverActionFrame(key(5,[21,22,23],[24,25,26,27]),{baseFrame,previousFrame:first,runtimeFlags:0x605,mirrorMap})
  assert.deepEqual(second.translations[7].valueRaw,[11,12,-13])
  assert.deepEqual(second.translations[8].valueRaw,[21,22,-23])
  assert.deepEqual(second.rotations[7].quaternionRaw,[-14,-15,16,17])
  const changed=recoverActionFrame(key(10),{baseFrame,previousFrame:second,runtimeFlags:0x604,mirrorMap})
  assert.deepEqual(changed.translations[7].valueRaw,second.translations[7].valueRaw)
  assert.deepEqual(changed.translations[10].valueRaw,[11,12,13])
  assert.equal(changed.poseApplication.retained,true)
  assert.deepEqual(first.translations[8].valueRaw,baseFrame.translations[8].valueRaw)
})

test('scaled-only edge values and unsupported phase runtimes are refused rather than narrowed', () => {
  assert.throws(()=>recoverActionFrame(key(0,[-32768,0,0]),{baseFrame,runtimeFlags:1,mirrorMap}),/signed16 frame domain/)
  assert.throws(()=>recoverActionFrame(key(4,[0,0,-32768]),{baseFrame,runtimeFlags:1,mirrorMap}),/signed16 frame domain/)
  assert.throws(()=>recoverActionFrame(key(4),{baseFrame,runtimeFlags:0x24,mirrorMap}),/separate recovery/)
  assert.throws(()=>recoverActionFrame(key(16),{baseFrame,runtimeFlags:4,mirrorMap}),/slots0..15/)
  assert.throws(()=>recoverActionFrame(key(4),{baseFrame:{translations:[],rotations:[]},runtimeFlags:4,mirrorMap}),/all16/)
  assert.throws(()=>recoverActionFrame(key(4),{baseFrame,runtimeFlags:4,mirrorMap:Array(16).fill(0)}),/permutation/)
})
