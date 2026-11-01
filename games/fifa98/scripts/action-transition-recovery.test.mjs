import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inspectActionTransitionRecovery } from './action-transition-recovery.mjs'

test('unknown and truncated sources cannot acquire action-transition labels',()=>{
  for(const bytes of [new Uint8Array(),new Uint8Array(939135),new Uint8Array(939136)]){
    const result=inspectActionTransitionRecovery(bytes)
    assert.equal(result.status,'unsupported');assert.deepEqual(result.regions,[]);assert.deepEqual(result.tables,{});assert.deepEqual(result.actions,[])
  }
  assert.throws(()=>inspectActionTransitionRecovery({}),/Uint8Array/)
})

test('actual gated source proves flag conversion and mirror map, without claiming full transitions',async(context)=>{
  let backend,actions
  try{[backend,actions]=await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/members/ZMODAT.BIG/aiseqs.tbi',import.meta.url))])}
  catch(error){if(error.code==='ENOENT'){context.skip('Original reference files are not prepared');return}throw error}
  const report=inspectActionTransitionRecovery(backend,actions)
  assert.equal(report.status,'reconstruction-only');assert.equal(report.regions.length,10)
  assert.deepEqual(report.tables.mirrorMap.values,[0,1,2,3,7,8,9,4,5,6,13,14,15,10,11,12])
  const mirrored=report.actions.find((entry)=>entry.actionId===504)
  assert.equal(mirrored.actionFlags,0x60507);assert.equal(mirrored.runtimeFlags,0x605);assert.equal(mirrored.mirrored,true);assert.equal(mirrored.plainLoopPhase,true)
  assert.match(report.transitionScope.phaseSearch,/not a simple/)
  assert.ok(report.transitionScope.notRecovered.includes('Cross-action phase alignment/search'))
  const changed=new Uint8Array(actions);changed[16]^=1
  assert.equal(inspectActionTransitionRecovery(backend,changed).status,'unsupported')
})
