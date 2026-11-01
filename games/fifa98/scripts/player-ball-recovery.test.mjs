import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPlayerBallRecovery, playerBallNativeExports } from './player-ball-recovery.mjs';

test('unknown source images cannot claim owned-ball behavior or original tables', () => {
  for (const [backend,boot] of [[new Uint8Array(),new Uint8Array()],[new Uint8Array(939136),new Uint8Array(251904)]]) {
    const result = inspectPlayerBallRecovery(backend,boot);
    assert.equal(result.status,'unsupported'); assert.equal(result.reason,'unknown-player-ball-images');
    assert.deepEqual(result.routines,[]); assert.deepEqual(result.callPath,[]);
    assert.deepEqual(result.tables,{}); assert.deepEqual(result.nativeExports,[]);
  }
});

test('owned-ball evidence requires both byte images and lists only implemented APIs', () => {
  for (const args of [[new Uint8Array()],[new ArrayBuffer(4),new Uint8Array()],[new Uint8Array(),{}]]) {
    assert.throws(() => inspectPlayerBallRecovery(...args),/Uint8Array/);
  }
  assert.deepEqual(playerBallNativeExports,['fifa98_player_ball_marker','fifa98_player_ball_attach','fifa98_player_ball_follow']);
  assert.ok(Object.isFrozen(playerBallNativeExports));
});
