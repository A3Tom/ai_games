import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPlayerPlacement, recoverPlayerRenderPosition, playerPlacementNativeExports } from './player-placement.mjs';

test('placement keeps exact signed high-halfword quantization, source vertical offset and signed SH wrapping', () => {
  assert.deepEqual(recoverPlayerRenderPosition([0,0,0]), [0,-6,0]);
  assert.deepEqual(recoverPlayerRenderPosition([0x0001ffff,0x0004ffff,0xffff0001]), [2,2,-2]);
  assert.deepEqual(recoverPlayerRenderPosition([0x40000000,0x80000000,0x7fffffff]), [-32768,-6,-2]);
  assert.ok(Object.isFrozen(recoverPlayerRenderPosition([0,0,0])));
});

test('placement rejects malformed inputs and unknown source images', () => {
  for (const value of [[], [0,0], [0,0,NaN], [0,0,1.5], [0,0,0x100000000], [0,0,-2147483649], new Array(3)]) {
    assert.throws(() => recoverPlayerRenderPosition(value), /coordinate words/);
  }
  for (const [backend, boot] of [[new Uint8Array(), undefined], [new Uint8Array(939136), new Uint8Array(251904)]]) {
    const report = inspectPlayerPlacement(backend, boot);
    assert.equal(report.status, 'unsupported'); assert.deepEqual(report.regions, []); assert.deepEqual(report.callPath, []);
  }
  assert.throws(() => inspectPlayerPlacement(new ArrayBuffer(1)), /Uint8Array/);
  assert.deepEqual(playerPlacementNativeExports, ['fifa98_player_render_position']);
});
