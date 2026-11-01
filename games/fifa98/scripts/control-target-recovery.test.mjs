import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectControlTargetRecovery, controlTargetNativeExports } from './control-target-recovery.mjs';

test('unknown images never produce controller, table or dimension claims', () => {
  for (const [backend, boot] of [[new Uint8Array(), new Uint8Array()], [new Uint8Array(939136), new Uint8Array(251904)]]) {
    const report = inspectControlTargetRecovery(backend, boot);
    assert.equal(report.status, 'unsupported');
    assert.equal(report.reason, 'unknown-control-target-images');
    assert.deepEqual(report.routines, []); assert.deepEqual(report.tables, {});
    assert.deepEqual(report.boundsProfiles, []); assert.deepEqual(report.callPath, []);
    assert.deepEqual(report.nativeExports, []);
  }
});

test('both exact byte images are required and native export descriptors are bounded', () => {
  for (const args of [[new Uint8Array()], [new ArrayBuffer(1), new Uint8Array()], [new Uint8Array(), {}]]) {
    assert.throws(() => inspectControlTargetRecovery(...args), /Uint8Array/);
  }
  assert.equal(controlTargetNativeExports.length, 7);
  assert.equal(new Set(controlTargetNativeExports).size, 7);
  assert.ok(Object.isFrozen(controlTargetNativeExports));
});
