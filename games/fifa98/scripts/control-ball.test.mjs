import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createControlBall } from './control-ball.mjs'
import { inspectBallInteractionRecovery } from './ball-interaction-recovery.mjs'
const module = await WebAssembly.compile(await readFile(new URL('../.engine-build/fifa98-core.wasm',import.meta.url)))
const core = (await WebAssembly.instantiate(module)).exports
function fixture(overrides = {}, native = core) {
  const controls = { sine: Array.from({length:257},(_,i) => i*256), atan: Array.from({length:257},(_,i) => i>>1), bounds:[1824,2544,228] }
  const config = { atan16:Array.from({length:257},(_,i) => i*32), exponential:Array.from({length:113},(_,i) => 65536+(i+1)*1000),
    material:[0x9eb8,0xbae1,0x8000], parameter:10,flight:{duration:60}, gravity:0xfe000000,options:0,seed:0,...overrides }
  const player = {fixedPosition:[0,0],target:[0,0,192],facing:0}
  return { ball:createControlBall(native,config,controls),config,controls,player }
}
test('isolated test uses source launch, rolls to rest, snapshots are detached and reset removes ball', () => {
  const {ball,player} = fixture()
  assert.equal(ball.snapshot().exists,false)
  const launched = ball.launchFrom(player)
  assert.equal(launched.exists,true); assert.equal(launched.active,true); assert.deepEqual(launched.position,[0,0,0])
  assert.equal(launched.velocity[0],0); assert.equal(launched.velocity[1],0); assert.ok(launched.velocity[2]>0)
  assert.equal(launched.sourceLaunch.parameter,10); assert.equal(launched.sourceLaunch.distance,192)
  launched.position[2] = -1; launched.sourceLaunch.target[2] = -1
  assert.deepEqual(ball.snapshot().position,[0,0,0]); assert.equal(ball.snapshot().sourceLaunch.target[2],192)
  let final
  for (let i=0;i<200;i++) { final=ball.step(1); if (!final.active) break }
  assert.equal(final.stopReason,'rest'); assert.ok(final.position[2]>0); assert.equal(final.position[1],0)
  assert.equal(final.spin,0); assert.deepEqual(final.velocity,[0,0,0])
  assert.deepEqual(ball.step(6),final)
  ball.reset(); assert.equal(ball.snapshot().exists,false); assert.equal(ball.snapshot().ticks,0)
})
test('resting player uses native analog target construction; each launch starts at current fixed position', () => {
  const {ball,player} = fixture()
  const state={...player,fixedPosition:[10*65536+1234,-8*65536+5678],target:[10,0,-8]}
  const result=ball.launchFrom(state)
  assert.deepEqual(result.fixedPosition,[...state.fixedPosition.slice(0,1),0,state.fixedPosition[1]])
  assert.deepEqual(result.sourceLaunch.target,[10,0,184])
  ball.step(4)
  assert.deepEqual(ball.launchFrom(player).position,[0,0,0])
})
test('missing boundary behavior stops before contact without clamping or fabricated bounce', () => {
  const {ball,player,controls,config}=fixture()
  const bounded=createControlBall(core,config,{...controls,bounds:[10,10,1]})
  bounded.launchFrom({...player,target:[0,0,1000]})
  let previous=bounded.snapshot(),final
  for(let i=0;i<20;i++){final=bounded.step(1);if(!final.active)break;previous=final}
  assert.equal(final.stopReason,'boundary');assert.ok(final.position[2]<10)
  assert.deepEqual(final.position,previous.position);assert.deepEqual(final.velocity,previous.velocity)
  assert.equal(ball.snapshot().exists,false)
})
test('multi-tick native failure is atomic and transfer tables restore between independent sessions', () => {
  let calls=0
  const failing={...core,fifa98_ball_motion_tick(...args){calls++;return calls===2?0:core.fifa98_ball_motion_tick(...args)}}
  const {ball,player}=fixture({},failing)
  ball.launchFrom(player);const before=ball.snapshot()
  assert.throws(()=>ball.step(3),/rejected/);assert.deepEqual(ball.snapshot(),before)
  const first=fixture(),second=fixture({parameter:20})
  first.ball.launchFrom(first.player);const expected=first.ball.step(1)
  first.ball.reset();second.ball.launchFrom(second.player);first.ball.launchFrom(first.player)
  assert.deepEqual(first.ball.step(1),expected)
  assert.throws(()=>first.ball.step(0),/1–6/)
  assert.throws(()=>first.ball.launchFrom({...first.player,target:[NaN,0,0]}),/Invalid player/)
  assert.throws(()=>fixture({parameter:0}),/configuration/)
})
test('sprite heading follows consumed displacement and retains its last moving value at rest',()=>{
  const {ball,player,controls}=fixture()
  let state=ball.launchFrom({...player,target:[191,0,98]})
  const scratch=core.fifa98_control_workspace()+1700*4
  new Uint8Array(core.memory.buffer,scratch,257).set(controls.atan)
  const expected=core.fifa98_control_heading(state.velocity[0],state.velocity[2],scratch)&1023
  assert.equal(state.visualHeading,expected)
  assert.notEqual(state.visualHeading,(state.sourceLaunch.heading>>6)&1023,'full-resolution launch heading is a different source calculation')
  for(let i=0;i<200;i++){
    const previous=state;state=ball.step()
    if(!state.active){assert.equal(state.stopReason,'rest');assert.equal(state.visualHeading,previous.visualHeading);return}
  }
  assert.fail('synthetic rolling trajectory did not stop')
})
test('loft launches use original duration tables, rise, bounce and preserve seeded curve direction',async()=>{
  const [backend,boot]=await Promise.all(['BECODE.BIN','SLES_009.14'].map((name)=>readFile(new URL(`../.work/reference/disc/${name}`,import.meta.url))))
  const {tables}=inspectBallInteractionRecovery(backend,boot)
  const setup=fixture(),controls={...setup.controls,sine:tables.sine.values,atan:tables.atan8.values}
  const config={...setup.config,atan16:tables.atan16.values,exponential:tables.exponential.values}
  const first={...setup,ball:createControlBall(core,config,controls)},second={...setup,ball:createControlBall(core,config,controls)}
  const plain=first.ball.launchFrom(first.player,{kind:'loft'})
  assert.equal(plain.sourceLaunch.kind,'loft');assert.equal(plain.sourceLaunch.duration,60)
  assert.equal(plain.spin,0);assert.ok(plain.velocity[1]>0)
  assert.ok(first.ball.step().position[1]>0)
  first.ball.reset();second.ball.reset()
  const curved=first.ball.launchFrom(first.player,{kind:'curve'})
  const reverse=second.ball.launchFrom(second.player,{kind:'reverse-curve'})
  assert.equal(curved.spin,-reverse.spin)
  assert.equal(curved.velocity[1],reverse.velocity[1]);assert.equal(curved.velocity[2],reverse.velocity[2])
  assert.equal(Math.sign(curved.velocity[0]),-Math.sign(reverse.velocity[0]))
  let state,peak=0
  for(let i=0;i<3000;i++){
    state=first.ball.step();peak=Math.max(peak,state.position[1])
    if(!state.active)break
  }
  assert.ok(peak>0);assert.equal(state.stopReason,'rest');assert.equal(state.position[1],0)
  const before=first.ball.snapshot()
  assert.throws(()=>first.ball.launchFrom(first.player,{kind:'invented'}),/Unknown/)
  assert.deepEqual(first.ball.snapshot(),before)
})
test('visual phase uses the last consumed displacement once per group and survives failed groups atomically',()=>{
  const calls=[]
  const observed={...core,fifa98_ball_visual_phase(...args){calls.push(args.slice(1));return core.fifa98_ball_visual_phase(...args)}}
  const grouped=fixture({},observed),single=fixture()
  grouped.ball.launchFrom(grouped.player);single.ball.launchFrom(single.player)
  let previous,last
  for(let i=0;i<6;i++){previous=single.ball.snapshot();last=single.ball.step()}
  const expectedSpeed=core.fifa98_ball_visual_speed((last.fixedPosition[0]-previous.fixedPosition[0])|0,(last.fixedPosition[2]-previous.fixedPosition[2])|0)>>>0
  const state=grouped.ball.step(6)
  assert.equal(calls.length,1);assert.deepEqual(calls[0],[expectedSpeed,6,0,0,0])
  assert.deepEqual(state.fixedPosition,last.fixedPosition)
  assert.ok(state.visualPhase>=0 && state.visualPhase<=3)
  let failPhase=false
  const failing={...core,fifa98_ball_visual_phase(...args){return failPhase?0:core.fifa98_ball_visual_phase(...args)}}
  const guarded=fixture({},failing);guarded.ball.launchFrom(guarded.player);guarded.ball.step()
  const before=guarded.ball.snapshot();failPhase=true
  assert.throws(()=>guarded.ball.step(6),/visual phase rejected/)
  assert.deepEqual(guarded.ball.snapshot(),before)
})
test('test-owned ball follows source animation anchors and releases from its current position',()=>{
  const {ball,player}=fixture()
  const marker={prefixA:[0,0,0,0,0,0,0,0,256],prefixB:[0,0,0,0,0,0,0,0,256],fraction16:0,headingRaw:0,headingOffsetRaw:0,mirror:false}
  let state=ball.carryFrom(player)
  assert.equal(state.owned,true);assert.deepEqual(state.position,[0,0,0])
  state=ball.step(1,{player,marker})
  assert.deepEqual(state.position,[0,0,15],'source component clamp limits travel to15; no teleport to16-unit anchor')
  state=ball.step(1,{player,marker})
  assert.deepEqual(state.position,[0,0,16]);assert.equal(state.spin,0)
  state=ball.step(3,{player:{...player,fixedPosition:[0,20*65536]},marker})
  assert.equal(state.position[2],35.99969482421875,'source rounded reciprocal retains fractional position')
  const before=ball.snapshot(),released=ball.launchFrom(player)
  assert.equal(released.owned,false);assert.deepEqual(released.fixedPosition,before.fixedPosition)
  assert.notDeepEqual(released.position,[0,0,0]);assert.equal(released.sourceLaunch.kind,'ground')
  assert.ok(ball.step().position[2]>released.position[2])
  ball.reset();assert.equal(ball.snapshot().owned,false);assert.equal(ball.snapshot().exists,false)
})
test('owned-ball unsupported contacts and late failures preserve public state',()=>{
  const {ball,player}=fixture()
  ball.carryFrom(player)
  const marker={prefixA:[0,0,0,0,0,0,0,256,256],prefixB:[0,0,0,0,0,0,0,256,256],fraction16:0,headingRaw:0,headingOffsetRaw:0,mirror:false}
  const before=ball.snapshot()
  assert.throws(()=>ball.step(1,{player,marker}),/unrecovered contact/)
  assert.deepEqual(ball.snapshot(),before)
  assert.throws(()=>ball.step(),/Invalid player/)
  assert.deepEqual(ball.snapshot(),before)
  assert.throws(()=>ball.step(1,{player,marker:{...marker,prefixA:[1]}}),/attachment marker/)
  assert.deepEqual(ball.snapshot(),before)
})
