import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPossessionRecovery,possessionNativeExports } from './possession-recovery.mjs';

test('unknown backend never supplies possession, eligibility or callback claims',()=>{
  for(const input of[new Uint8Array(),new Uint8Array(939136)]){
    const result=inspectPossessionRecovery(input);
    assert.equal(result.status,'unsupported');assert.equal(result.reason,'unknown-possession-image');
    assert.deepEqual(result.routines,[]);assert.deepEqual(result.callPath,[]);assert.deepEqual(result.nativeExports,[]);
  }
});
test('possession inspection requires bytes and exposes only the bounded implementation',()=>{
  assert.throws(()=>inspectPossessionRecovery(new ArrayBuffer(4)),/Uint8Array/);
  assert.deepEqual(possessionNativeExports,['fifa98_possession_claim_unowned','fifa98_possession_release','fifa98_possession_release_solo']);assert.ok(Object.isFrozen(possessionNativeExports));
});
