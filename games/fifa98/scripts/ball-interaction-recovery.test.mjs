import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBallInteractionRecovery, ballInteractionNativeExports } from './ball-interaction-recovery.mjs';

test('unknown launch images never claim recovered numerics, tables or call edges', () => {
  for (const [backend, boot] of [[new Uint8Array(), new Uint8Array()], [new Uint8Array(939136), new Uint8Array(251904)]]) {
    const report = inspectBallInteractionRecovery(backend, boot);
    assert.equal(report.status, 'unsupported');
    assert.equal(report.reason, 'unknown-ball-interaction-images');
    assert.deepEqual(report.routines, []); assert.deepEqual(report.tables, {});
    assert.deepEqual(report.nativeExports, []); assert.deepEqual(report.callPath, []);
  }
});

test('both exact byte images are required and exported APIs are explicit', () => {
  for (const args of [[new Uint8Array()], [new Uint8Array(), new ArrayBuffer(4)], [[], new Uint8Array()]]) {
    assert.throws(() => inspectBallInteractionRecovery(...args), /Uint8Array/);
  }
  assert.deepEqual(ballInteractionNativeExports, ['fifa98_ball_heading16', 'fifa98_ball_heading_vector16',
    'fifa98_ball_ground_launch_speed', 'fifa98_ball_ground_launch', 'fifa98_ball_action_target']);
  assert.ok(Object.isFrozen(ballInteractionNativeExports));
});
