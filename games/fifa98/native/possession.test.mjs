import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectPossessionRecovery } from '../scripts/possession-recovery.mjs';

const directory=new URL('../.engine-build/',import.meta.url);
const bytes=await readFile(new URL('fifa98-core.wasm',directory));
const manifest=JSON.parse(await readFile(new URL('build.json',directory),'utf8'));
const module=await WebAssembly.compile(bytes),core=(await WebAssembly.instantiate(module)).exports;
if(!core.fifa98_possession_claim_unowned)throw new Error('Build main Wasm with native/possession.c first');
const base=core.fifa98_control_workspace(),memory=new Uint32Array(core.memory.buffer,base,core.fifa98_control_workspace_words());
const at={actor:0,state:8,teams:24,history:40};
const ptr=(index)=>base+index*4;
const hash=(value)=>createHash('sha256').update(value).digest('hex');
const u=(value)=>Number(BigInt.asUintN(32,BigInt(value)));
const zeroHistory=()=>[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
function oracle(actor,argument,state,teams,history){
  const resultState=[...state],resultTeams=[...teams],resultHistory=[...history];
  const identity=actor[0],actor4=actor[1];
  if(!identity||state[0]||(actor[3]===0&&(actor[2]!==0||(actor[4]&128))))return{result:0,state:resultState,teams:resultTeams,history:resultHistory};
  resultState[3]=u((BigInt(state[3])&~40n)|((BigInt(argument)&1n)<<5n));
  if(state[1]===identity)resultState[1]=state[2];
  resultState[0]=identity;for(const index of[4,5,6,7,8])resultState[index]=0;
  resultTeams[0]=identity;
  if(!teams[1]||teams[2]===identity)resultTeams[2]=0;
  if(teams[3]===identity)resultTeams[3]=0;
  resultTeams[5]=0;resultTeams[6]=0;resultTeams[7]=0;
  resultTeams[4]=actor4!==0?1:(!resultState[1]||(resultState[3]&32))?0:1;
  resultHistory[3]=0;
  if(actor4!==0&&history[0]!==0)resultHistory[0]=0;
  if(actor4!==0&&history[1]===1)resultHistory[1]=0;
  if(history[2]===1)resultHistory[2]=0;
  if(history[6+history[4]*2]!==identity){
    resultHistory[4]=(history[4]+1)%5;
    resultHistory[5+resultHistory[4]*2]=0;
    resultHistory[6+resultHistory[4]*2]=identity;
  }
  return{result:1,state:resultState,teams:resultTeams,history:resultHistory};
}
function call(actor,argument,state,teams,history){
  memory.set(actor,at.actor);memory.set(state,at.state);memory.set(teams,at.teams);memory.set(history,at.history);
  const result=core.fifa98_possession_claim_unowned(ptr(at.actor),argument,ptr(at.state),ptr(at.teams),ptr(at.history));
  return{result,state:Array.from(memory.slice(at.state,at.state+10)),teams:Array.from(memory.slice(at.teams,at.teams+8)),history:Array.from(memory.slice(at.history,at.history+15))};
}
let seed=0x98facade;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};

test('possession C/main Wasm hashes match and source needs no imported runtime',async()=>{
  assert.equal(manifest.sources.find((entry)=>entry.path==='possession.c')?.sha256,hash(await readFile(new URL('./possession.c',import.meta.url))),'Rebuild after changing possession.c');
  assert.equal(manifest.wasmSha256,hash(bytes));assert.deepEqual(WebAssembly.Module.imports(module),[]);
});

test('unowned claim updates source owner/counters/teams and keeps distinct attachment permission unchanged',()=>{
  const state=[0,17,19,0xffffffff,3,4,5,6,7,23],teams=[99,0,81,7,4,5,6,7],history=[1,1,1,44,4,10,1,11,2,12,3,13,4,14,5];
  const actual=call([7,0,0,0,0],0,state,teams,history);
  assert.deepEqual(actual,oracle([7,0,0,0,0],0,state,teams,history));
  assert.deepEqual(actual.state,[7,17,19,0xffffffd7,0,0,0,0,0,23]);
  assert.deepEqual(actual.teams,[7,0,0,0,1,0,0,0]);
  assert.equal(actual.history[4],0);assert.deepEqual(actual.history.slice(5,7),[0,7]);
});

test('same last history identity preserves rows while selected source flags reset exactly',()=>{
  const history=[2,1,1,99,2,31,11,32,12,33,7,34,14,35,15];
  for(const actor4 of[0,1,0xffffffff]){
    const actual=call([7,actor4,0,0,0],1,[0,7,0,0,1,2,3,4,5,0],[0,8,9,10,11,12,13,14],history);
    assert.equal(actual.result,1);assert.equal(actual.history[4],2);assert.deepEqual(actual.history.slice(5),history.slice(5));
    assert.deepEqual(actual.history.slice(0,4),actor4?[0,0,0,0]:[2,1,0,0]);
    assert.equal(actual.state[1],0);assert.equal(actual.teams[4],actor4?1:0);
  }
});

test('claimed team flags, owner history recapture and bit20 argument preserve source branch ordering',()=>{
  for(const field4 of[0,1])for(const previous of[0,7,9])for(const prior of[0,7,13])for(const argument of[0,1,2,3,0xffffffff])for(const field280 of[0,12])for(const field292 of[7,8]){
    const actor=[7,field4,0,0,0],state=[0,previous,prior,0xfffffff7,5,6,7,8,9,11],teams=[1,field280,field292,7,4,5,6,7],history=zeroHistory();
    assert.deepEqual(call(actor,argument,state,teams,history),oracle(actor,argument,state,teams,history));
  }
});

test('random valid source-state transitions retain opaque words and independent arrays',()=>{
  for(let index=0;index<24000;index++){
    const identity=random()||1,actor=[identity,index%3?random():0,0,index%4?0:random()||1,random()&~128];
    if(actor[3]){actor[2]=random();actor[4]=random();}
    const state=Array.from({length:10},random);state[0]=0;if(index%4===0)state[1]=identity;if(index%7===0)state[1]=0;
    const teams=Array.from({length:8},random);if(index%3===0)teams[1]=0;if(index%5===0)teams[2]=identity;if(index%7===0)teams[3]=identity;
    const history=Array.from({length:15},random);history[4]=random()%5;
    for(let row=0;row<5;row++)history[5+row*2]=random()&65535;
    if(index%4===0)history[6+history[4]*2]=identity;
    if(index%3===0)history[1]=1;if(index%5===0)history[2]=1;
    const argument=random();assert.deepEqual(call(actor,argument,state,teams,history),oracle(actor,argument,state,teams,history));
  }
});

test('unsupported callbacks/existing owners and malformed storage reject without partial mutations',()=>{
  const state=[0,0,0,0xffffffff,1,2,3,4,5,6],teams=Array.from({length:8},(_,index)=>index+1),history=zeroHistory();
  for(const actor of[[0,0,0,0,0],[7,0,1,0,0],[7,0,0,0,128],[7,0,1,0,128]]){
    assert.deepEqual(call(actor,1,state,teams,history),{result:0,state,teams,history});
  }
  const occupied=[7,...state.slice(1)];
  assert.deepEqual(call([7,0,0,0,0],1,occupied,teams,history),{result:0,state:occupied,teams,history});
  for(const invalid of[[...history.slice(0,4),5,...history.slice(5)],[...history.slice(0,5),65536,...history.slice(6)]]){
    assert.deepEqual(call([7,0,0,0,0],1,state,teams,invalid),{result:-1,state,teams,history:invalid});
  }
  memory.set(state,at.state);memory.set(teams,at.teams);memory.set(history,at.history);
  for(const [actorPointer,statePointer,teamsPointer,historyPointer]of[[0,ptr(at.state),ptr(at.teams),ptr(at.history)],[ptr(at.actor),0,ptr(at.teams),ptr(at.history)],
    [ptr(at.actor),ptr(at.state),0,ptr(at.history)],[ptr(at.actor),ptr(at.state),ptr(at.teams),0]]){
    assert.equal(core.fifa98_possession_claim_unowned(actorPointer,0,statePointer,teamsPointer,historyPointer),-1);
    assert.deepEqual(Array.from(memory.slice(at.state,at.state+10)),state);assert.deepEqual(Array.from(memory.slice(at.teams,at.teams+8)),teams);
    assert.deepEqual(Array.from(memory.slice(at.history,at.history+15)),history);
  }
});

test('actual ownership regions/call contracts verify and make no complete acquisition claim',async(t)=>{
  let backend;try{backend=await readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url));}
  catch(error){if(error.code==='ENOENT'){t.skip('Local reference not extracted');return;}throw error;}
  const report=inspectPossessionRecovery(backend);assert.equal(report.status,'reconstruction-only');
  assert.equal(report.routines.length,15);assert.equal(report.callPath.length,22);
  assert.deepEqual(report.nativeExports,['fifa98_possession_claim_unowned','fifa98_possession_release','fifa98_possession_release_solo']);
  assert.equal(report.tables.alternateBaseSpeed.values.length,20);
  assert.ok(report.limitations.some((line)=>line.includes('not a contact/acquisition decision')));
});

const releaseBase=[314572,314572,314572,321126,321126,327680,327680,334233,334233,340787,
  340787,347340,347340,347340,347340,347340,353894,353894,360448,360448];
function releaseOracle(actor,state,teams,notice,solo=false){
  const nextState=[...state],nextTeams=[...teams],nextNotice=[...notice];
  const unchanged=(result)=>({result,state:nextState,teams:nextTeams,notice:nextNotice});
  const id=actor[0];
  if(!id||state[0]!==id)return unchanged(0);
  const notify=!actor[1]&&teams[3]!==id;
  if(notify&&actor[2]&&teams[2]!==id&&!solo)return unchanged(0);
  if(notify&&!notice[0]&&actor[3]>=20)return unchanged(-1);
  nextState[0]=0;nextState[1]=id;nextState[2]=state[1];
  nextState[3]=u(BigInt(state[3])&~32n);nextState[4]=0;
  if(state[9]===id)nextState[9]=0;
  if(teams[3]!==id)nextTeams[3]=0;
  nextTeams[4]=1;nextTeams[7]=0;
  if(notify){nextNotice[0]=id;if(!notice[0])nextNotice[1]=releaseBase[actor[3]];}
  return unchanged(1);
}
function releaseCall(actor,state,teams,notice){
  memory.set(actor,64);memory.set(state,72);memory.set(teams,88);memory.set(notice,104);
  const result=core.fifa98_possession_release(ptr(64),ptr(72),ptr(88),ptr(104));
  return{result,state:Array.from(memory.slice(72,82)),teams:Array.from(memory.slice(88,96)),notice:Array.from(memory.slice(104,106))};
}

test('matching-owner release rotates source owner words, preserves five-row history and never clears unrelated team owners',()=>{
  const state=[7,17,19,0xffffffff,3,4,5,6,7,7],teams=[7,13,7,9,4,5,6,7],notice=[0,123];
  const history=Array.from({length:15},(_,i)=>100+i);memory.set(history,at.history);
  const actual=releaseCall([7,0,0,10],state,teams,notice);
  assert.deepEqual(actual,releaseOracle([7,0,0,10],state,teams,notice));
  assert.deepEqual(actual.state,[0,7,17,0xffffffdf,0,4,5,6,7,0]);
  assert.deepEqual(actual.teams,[7,13,7,0,1,5,6,0]);
  assert.deepEqual(actual.notice,[7,releaseBase[10]]);
  assert.deepEqual(Array.from(memory.slice(at.history,at.history+15)),history);
});

test('release notification skip guards, source controller callback guard and all attribute indices retain exact branch order',()=>{
  for(const field4 of[0,1])for(const controller of[0,11])for(const own252 of[0,7,13])for(const own292 of[0,7,19])for(const own296 of[0,23])for(const attachment of[0,7,31])for(let index58=0;index58<20;index58++){
    const actor=[7,field4,controller,index58],state=[7,17,19,0xaaffffff,11,12,13,14,15,attachment];
    const teams=[7,99,own292,own252,4,5,6,7],notice=[own296,0xabcdef01];
    assert.deepEqual(releaseCall(actor,state,teams,notice),releaseOracle(actor,state,teams,notice));
  }
});

test('release matches independent state oracle for random bounded callback-free and rejected cases',()=>{
  for(let index=0;index<18000;index++){
    const identity=random()||1,actor=[identity,index%3?0:random(),index%4?0:random(),random()%20];
    const state=Array.from({length:10},random);state[0]=index%9?identity:0;
    if(index%5===0)state[9]=identity;
    const teams=Array.from({length:8},random);
    if(index%3===0)teams[3]=identity;if(index%4===0)teams[2]=identity;
    const notice=[index%3?0:random(),random()];
    assert.deepEqual(releaseCall(actor,state,teams,notice),releaseOracle(actor,state,teams,notice));
  }
});

test('release rejects unsupported owner/callback/index domains atomically and ignores unused table indices',()=>{
  const state=[7,17,19,0xffffffff,11,12,13,14,15,7],teams=[7,1,19,23,4,5,6,7],notice=[0,99];
  for(const actor of[[0,0,0,0],[9,0,0,0],[7,0,1,0],[7,0,0,20],[7,0,0,0xffffffff]]){
    const expected=releaseOracle(actor,state,teams,notice);
    assert.notEqual(expected.result,1);assert.deepEqual(releaseCall(actor,state,teams,notice),expected);
  }
  for(const [actor,team,notification]of[[[7,1,1,0xffffffff],teams,notice],
    [[7,0,1,0xffffffff],[...teams.slice(0,3),7,...teams.slice(4)],notice],
    [[7,0,0,0xffffffff],teams,[31,99]]]){
    assert.equal(releaseCall(actor,state,team,notification).result,1);
    assert.deepEqual(releaseCall(actor,state,team,notification),releaseOracle(actor,state,team,notification));
  }
  memory.set([7,0,0,0],64);memory.set(state,72);memory.set(teams,88);memory.set(notice,104);
  for(const args of[[0,ptr(72),ptr(88),ptr(104)],[ptr(64),0,ptr(88),ptr(104)],
    [ptr(64),ptr(72),0,ptr(104)],[ptr(64),ptr(72),ptr(88),0]]){
    assert.equal(core.fifa98_possession_release(...args),-1);
    assert.deepEqual(Array.from(memory.slice(72,82)),state);assert.deepEqual(Array.from(memory.slice(88,96)),teams);assert.deepEqual(Array.from(memory.slice(104,106)),notice);
  }
});

function soloCall(actor,state,teams,notice,roster){
  memory.set(actor,64);memory.set(state,72);memory.set(teams,88);memory.set(notice,104);memory.set(roster,108);
  const result=core.fifa98_possession_release_solo(ptr(64),ptr(72),ptr(88),ptr(104),ptr(108));
  return{result,state:Array.from(memory.slice(72,82)),teams:Array.from(memory.slice(88,96)),notice:Array.from(memory.slice(104,106))};
}

test('single controlled actor release proves all candidate branches reject before controller transfer',()=>{
  // Independently express the candidate filters before their distance/side
  // code: none can admit raw4zero/raw48nonnull for the solo actor.
  const actor={raw4:0,raw48:1};
  for(const flags of[0,4,256,260,0xffffffff])for(const excluded of[false,true])for(const matchingController of[false,true]){
    const common=!(flags&0x104)&&!excluded;
    assert.equal(common&&!actor.raw48&&!!actor.raw4,false,'5F4F8 /5F714');
    assert.equal(common&&!actor.raw48,false,'5F830');
    assert.equal(common&&(!actor.raw48||matchingController)&&!!actor.raw4,false,'5F5FC requireRaw4=1');
    assert.equal(!!actor.raw4&&!actor.raw48,false,'A7878 direct roster scan');
  }
  const input=[7,0,1,10],state=[7,17,19,0xffffffff,11,12,13,14,15,7],teams=[7,99,0,0,4,5,6,7],notice=[0,123];
  assert.equal(releaseCall(input,state,teams,notice).result,0,'ordinary callback-free guard must remain strict');
  const actual=soloCall(input,state,teams,notice,[1,7]);
  assert.deepEqual(actual,releaseOracle(input,state,teams,notice,true));
  assert.equal(actual.teams[1],99,'no source own280 reset: A7878 returns before6004C');
  assert.deepEqual(actual.notice,[7,releaseBase[10]]);
  for(let index=0;index<12000;index++){
    const identity=random()||1,entry=[identity,0,random()||1,random()%20];
    const state=Array.from({length:10},random);state[0]=identity;if(index%3===0)state[9]=identity;
    const teams=Array.from({length:8},random);if(index%3===0)teams[3]=identity;if(index%5===0)teams[2]=identity;
    const notice=[index%3?0:random(),random()];
    assert.deepEqual(soloCall(entry,state,teams,notice,[1,identity]),releaseOracle(entry,state,teams,notice,true));
  }
});

test('solo release rejects mismatched roster/controller/owner domains and used index without changing state',()=>{
  const state=[7,17,19,0xffffffff,11,12,13,14,15,7],teams=[7,99,0,0,4,5,6,7],notice=[0,123];
  for(const [actor,roster]of[[[7,0,1,10],[0,7]],[[7,0,1,10],[2,7]],[[7,0,1,10],[1,8]],
    [[7,1,1,10],[1,7]],[[7,0,0,10],[1,7]],[[0,0,1,10],[1,0]],[[9,0,1,10],[1,9]]]){
    assert.deepEqual(soloCall(actor,state,teams,notice,roster),{result:0,state,teams,notice});
  }
  assert.deepEqual(soloCall([7,0,1,20],state,teams,notice,[1,7]),{result:-1,state,teams,notice});
  memory.set([7,0,1,10],64);memory.set(state,72);memory.set(teams,88);memory.set(notice,104);
  assert.equal(core.fifa98_possession_release_solo(ptr(64),ptr(72),ptr(88),ptr(104),0),-1);
  assert.deepEqual(Array.from(memory.slice(72,82)),state);assert.deepEqual(Array.from(memory.slice(88,96)),teams);assert.deepEqual(Array.from(memory.slice(104,106)),notice);
});
