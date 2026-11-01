import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseMopClip } from '../scripts/animation.mjs';
import { selectMotionKeys } from '../scripts/motion-playback.mjs';
import { inspectPlayerBallRecovery } from '../scripts/player-ball-recovery.mjs';

const directory = new URL('../.engine-build/',import.meta.url);
const bytes = await readFile(new URL('fifa98-core.wasm',directory));
const manifest = JSON.parse(await readFile(new URL('build.json',directory),'utf8'));
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports;
if (!core.fifa98_player_ball_follow) throw new Error('Build main Wasm with native/player-ball.c first');
const base = core.fifa98_control_workspace();
const words = new Uint32Array(core.memory.buffer,base,core.fifa98_control_workspace_words());
const ptr = (index) => base+index*4;
const at = { quarter:0, first:300, second:312, position:324, marker:328, ownership:332, ball:340, state:360 };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const u = (value) => Number(BigInt.asUintN(32,BigInt(value)));
const s = (value) => BigInt.asIntN(32,BigInt(value>>>0));
const multiply = (left,right) => u((s(left)*s(right)+32768n)>>16n);
const high = (value) => u(s(value)>>16n);
const syntheticQuarter = Array.from({length:257},(_,index)=>index*256);
function vector(heading,quarter) {
  const angle = Number(BigInt.asUintN(10,BigInt(heading))), index=angle%256;
  return (angle<256 ? [quarter[index],quarter[256-index]] : angle<512 ? [quarter[256-index],-quarter[index]] :
    angle<768 ? [-quarter[index],-quarter[256-index]] : [-quarter[256-index],quarter[index]]).map(u);
}
function markerOracle(first,second,fraction,position,heading,mirror,quarter=syntheticQuarter) {
  const blend = (index) => u(BigInt(first[index])*4096n+BigInt(multiply(fraction,u(BigInt(second[index]-first[index])*4096n))));
  const root=[3,4,5].map(blend), marker=[6,7,8].map(blend);
  const x=u(mirror ? BigInt(root[0])-BigInt(marker[0]) : BigInt(marker[0])-BigInt(root[0]));
  const z=u(BigInt(marker[2])-BigInt(root[2]));
  const [sin,cos]=vector(u(-BigInt(heading)),quarter);
  return [u(BigInt(position[0])+BigInt(multiply(x,cos))+BigInt(multiply(z,u(-BigInt(sin))))),marker[1],
    u(BigInt(position[1])+BigInt(multiply(x,sin))+BigInt(multiply(z,cos)))];
}
function stageMarker(first,second,fraction,position,heading,mirror) {
  words.set(first.map(u),at.first);words.set(second.map(u),at.second);words.set(position.map(u),at.position);
  const result=core.fifa98_player_ball_marker(ptr(at.first),ptr(at.second),fraction,ptr(at.position),heading,mirror,ptr(at.quarter),ptr(at.marker));
  return {result,marker:Array.from(words.slice(at.marker,at.marker+3))};
}
function attachOracle(marker,owners,entityFlags,ball) {
  if (!(entityFlags&4096)||!owners[0]||owners[0]!==owners[1]||owners[0]!==owners[2]) return {result:0,ball:[...ball]};
  const xyz=marker.map(high);xyz[1]=u(s(xyz[1])-8n);if(s(xyz[1])<0n)xyz[1]=0;
  return {result:1,ball:[...xyz,...ball.slice(0,3),...xyz,(ball[9]|64)>>>0]};
}
function followOracle(ball,ticks,state) {
  const divisor=BigInt(ticks)*65536n;
  const inverse=Number(0xffffffffn/divisor+(0xffffffffn%divisor>divisor/2n?1n:0n));
  const start=state.slice(0,3), velocity=ball.slice(6,9).map((anchor,axis)=>{
    const product=s(multiply(u(BigInt(anchor)*65536n-BigInt(start[axis])),inverse));
    const limit=BigInt(axis===1?10:15)*65536n;
    return u(product < -limit ? -limit : product>limit?limit:product);
  });
  const previous=start.map((position,axis)=>u(BigInt(position)+BigInt(ticks-1)*BigInt(velocity[axis])));
  const position=previous.map((value,axis)=>u(BigInt(value)+BigInt(velocity[axis])));
  return {ball:[...position.map(high),...previous.map(high),...ball.slice(6,9),(ball[9]&~64)>>>0],state:[...position,...velocity,...previous]};
}
let seed=0x98cafe17;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};

test('owned-ball source and main Wasm hashes match without imported runtime',async()=>{
  assert.equal(manifest.sources.find((entry)=>entry.path==='player-ball.c')?.sha256,hash(await readFile(new URL('./player-ball.c',import.meta.url))),'Rebuild after changing player-ball.c');
  assert.equal(manifest.wasmSha256,hash(bytes));assert.deepEqual(WebAssembly.Module.imports(module),[]);
});

test('source interpolated marker/root channels, mirrored X and original heading rotation match BigInt',()=>{
  words.set(syntheticQuarter,at.quarter);
  for(let index=0;index<12000;index++){
    const first=Array.from({length:9},()=>random()%65536-32768),second=Array.from({length:9},()=>random()%65536-32768);
    const fraction=random()&65535,position=[random(),random()],heading=random(),mirror=random()&1;
    assert.deepEqual(stageMarker(first,second,fraction,position,heading,mirror),
      {result:1,marker:markerOracle(first,second,fraction,position,heading,mirror)});
  }
  const first=[0,0,0,16,32,48,80,96,128],second=[0,0,0,32,64,96,160,192,256];
  for(const fraction of[0,1,32767,32768,65535])for(const heading of[0,256,512,768,0xffffffff])for(const mirror of[0,1]){
    assert.deepEqual(stageMarker(first,second,fraction,[0,0],heading,mirror).marker,markerOracle(first,second,fraction,[0,0],heading,mirror));
  }
});

test('marker guards are atomic and do not clamp malformed prefixes or fractions',()=>{
  words.set(syntheticQuarter,at.quarter);words.fill(0,at.first,at.first+9);words.fill(0,at.second,at.second+9);
  words.set([123,456,789],at.marker);const before=words.slice(at.marker,at.marker+3);
  for(const[first,second,fraction,position,mirror,quarter,out]of[
    [0,ptr(at.second),0,ptr(at.position),0,ptr(at.quarter),ptr(at.marker)],
    [ptr(at.first),0,0,ptr(at.position),0,ptr(at.quarter),ptr(at.marker)],
    [ptr(at.first),ptr(at.second),65536,ptr(at.position),0,ptr(at.quarter),ptr(at.marker)],
    [ptr(at.first),ptr(at.second),0,ptr(at.position),2,ptr(at.quarter),ptr(at.marker)],
    [ptr(at.first),ptr(at.second),0,0,0,ptr(at.quarter),ptr(at.marker)],
    [ptr(at.first),ptr(at.second),0,ptr(at.position),0,0,ptr(at.marker)],
    [ptr(at.first),ptr(at.second),0,ptr(at.position),0,ptr(at.quarter),0]]){
    assert.equal(core.fifa98_player_ball_marker(first,second,fraction,position,0,mirror,quarter,out),0);
    assert.deepEqual(words.slice(at.marker,at.marker+3),before);
  }
  words[at.first+3]=32768;
  assert.equal(core.fifa98_player_ball_marker(ptr(at.first),ptr(at.second),0,ptr(at.position),0,0,ptr(at.quarter),ptr(at.marker)),0);
  assert.deepEqual(words.slice(at.marker,at.marker+3),before);
});

test('source identity guards, signed marker high halves and Y-minus8 floor preserve full integer attachment state',()=>{
  for(let index=0;index<6000;index++){
    const marker=[random(),random(),random()],owners=index%5===0?[1,1,1]:[random(),random(),random()];
    const entity=index%3?4096:0,ball=Array.from({length:10},random);
    words.set(marker,at.marker);words.set(owners,at.ownership);words.set(ball,at.ball);
    const result=core.fifa98_player_ball_attach(ptr(at.marker),ptr(at.ownership),entity,ptr(at.ball));
    assert.deepEqual({result,ball:Array.from(words.slice(at.ball,at.ball+10))},attachOracle(marker,owners,entity,ball));
  }
  for(const y of[-32768,-1,0,7,8,9,32767]){
    const marker=[u(-65535),u(y*65536+65535),0x7fffffff],ball=[1,2,3,4,5,6,7,8,9,0xffffffff];
    words.set(marker,at.marker);words.set([7,7,7],at.ownership);words.set(ball,at.ball);
    assert.equal(core.fifa98_player_ball_attach(ptr(at.marker),ptr(at.ownership),4096,ptr(at.ball)),1);
    assert.deepEqual(Array.from(words.slice(at.ball,at.ball+10)),attachOracle(marker,[7,7,7],4096,ball).ball);
  }
  const before=words.slice(at.ball,at.ball+10);
  assert.equal(core.fifa98_player_ball_attach(0,ptr(at.ownership),4096,ptr(at.ball)),-1);
  assert.deepEqual(words.slice(at.ball,at.ball+10),before);
});

test('owned no-contact ground following retains source reciprocal, fractional start, caps and multi-tick samples',()=>{
  for(let index=0;index<12000;index++){
    const position=[u((random()%4000-2000)*65536+(random()&65535)),0,u((random()%4000-2000)*65536+(random()&65535))];
    const anchor=[u(random()%4000-2000),0,u(random()%4000-2000)],ticks=1+random()%6;
    const state=[...position,random(),0,random(),...position];
    const ball=[...anchor,...position.map(high),...anchor,0x12345678|64];
    words.set(ball,at.ball);words.set(state,at.state);
    assert.equal(core.fifa98_player_ball_follow(ptr(at.ball),ticks,0,ptr(at.state)),1);
    const expected=followOracle(ball,ticks,state);
    assert.deepEqual(Array.from(words.slice(at.state,at.state+9)),expected.state);
    assert.deepEqual(Array.from(words.slice(at.ball,at.ball+10)),expected.ball);
  }
  const state=[32768,0,u(-32768),0,0,0,0,0,0],anchor=[2,0,u(-2)];
  const ball=[...anchor,...state.slice(0,3).map(high),...anchor,64];
  words.set(ball,at.ball);words.set(state,at.state);
  assert.equal(core.fifa98_player_ball_follow(ptr(at.ball),3,0,ptr(at.state)),1);
  assert.deepEqual(Array.from(words.slice(at.state,at.state+9)),followOracle(ball,3,state).state);
});

test('follow guards stop unsupported contacts and invalid state without partial writes',()=>{
  const state=[0,0,0,7,8,9,10,11,12],validBall=[0,0,0,0,0,0,10,0,10,64];
  for(const[ball,ticks,blocker,inputState,result]of[
    [validBall,0,0,state,-1],[validBall,7,0,state,-1],[validBall,1,1,state,0],
    [[...validBall.slice(0,9),0],1,0,state,0],
    [validBall,1,0,[0,1,0,...state.slice(3)],-1],
    [[...validBall.slice(0,7),1,10,64],1,0,state,-1],
    [[0,0,0,1,0,0,10,0,10,64],1,0,state,-1],
    [[0,0,0,0,0,0,32768,0,10,64],1,0,state,-1],
    [[0,0,0,u(-32768),0,0,32767,0,0,64],1,0,[0x80000000,0,0,...state.slice(3)],-1]]){
    words.set(ball,at.ball);words.set(inputState,at.state);
    assert.equal(core.fifa98_player_ball_follow(ptr(at.ball),ticks,blocker,ptr(at.state)),result);
    assert.deepEqual(Array.from(words.slice(at.ball,at.ball+10)),ball.map(u));
    assert.deepEqual(Array.from(words.slice(at.state,at.state+9)),inputState.map(u));
  }
  assert.equal(core.fifa98_player_ball_follow(0,1,0,ptr(at.state)),-1);
});

test('actual source clip marker pairs and attachment/follow chain validate without embedding original bytes',async(t)=>{
  let backend,boot,config;
  try{[backend,boot,config]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),
    readFile(new URL('../.work/reference/disc/SLES_009.14',import.meta.url)),readFile(new URL('../.work/web/control-config.json',import.meta.url),'utf8')]);}
  catch(error){if(error.code==='ENOENT'){t.skip('Local extracted reference/control assets not prepared');return;}throw error;}
  const report=inspectPlayerBallRecovery(backend,boot);assert.equal(report.status,'reconstruction-only');
  words.set(report.tables.sine.values,at.quarter);const actions=JSON.parse(config).animation.actions;
  let samples=0;
  for(const action of actions){
    const clip=parseMopClip(await readFile(new URL(`../.work/web/${action.asset.path}`,import.meta.url)));
    for(const phase of[0,255,512,(clip.keyCount-1)*(512<<(clip.flags&1))-1]){
      const keys=selectMotionKeys(clip,phase),first=clip.frames[keys.keyIndex].prefixRaw,second=clip.frames[keys.nextKeyIndex].prefixRaw;
      const mirror=(action.actionFlags>>>8)&1,heading=(256+action.headingOffsetRaw)&1023,position=[100*65536,u(-100*65536)];
      const marker=stageMarker(first,second,keys.fraction16,position,heading,mirror).marker;
      assert.deepEqual(marker,markerOracle(first,second,keys.fraction16,position,heading,mirror,report.tables.sine.values));
      const initial=[...position.slice(0,1),0,position[1]],state=[...initial,0,0,0,...initial];
      const ball=[...initial.map(high),...initial.map(high),...initial.map(high),0];
      words.set([1,1,1],at.ownership);words.set(ball,at.ball);words.set(state,at.state);
      assert.equal(core.fifa98_player_ball_attach(ptr(at.marker),ptr(at.ownership),4096,ptr(at.ball)),1);
      assert.equal(words[at.ball+7],0,'Current control clips produce ground-clamped marker');
      const attached=Array.from(words.slice(at.ball,at.ball+10));
      assert.equal(core.fifa98_player_ball_follow(ptr(at.ball),1,0,ptr(at.state)),1);
      assert.deepEqual(Array.from(words.slice(at.state,at.state+9)),followOracle(attached,1,state).state);samples++;
    }
  }
  assert.ok(samples>=40);assert.equal(report.eventProvenance.implemented,false);
  assert.equal(report.normBound.maximumSquaredQ16,550*65536);
  assert.equal(report.normBound.maximumNormQ16,1540977);
  assert.ok(report.normBound.intervals.every((row)=>row.maximumNorm<30*65536));
});
