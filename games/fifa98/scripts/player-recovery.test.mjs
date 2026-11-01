import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectPlayerRecovery, inspectPlayerTable, playerNativeExports } from './player-recovery.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('reviewed player data reads signed bytes and little-endian words within explicit bounds', () => {
  const bytes = Uint8Array.of(99, 0xff, 0x80, 0x7f, 1, 2, 3, 4, 99);
  const signed = inspectPlayerTable(bytes.subarray(1, 8), { base: 0x80010000, address: 0x80010000,
    count: 3, element: 'i8', sha256: sha256(bytes.subarray(1, 4)) });
  assert.deepEqual(signed.values, [-1, -128, 127]);
  assert.equal(signed.fileOffset, 0);
  const words = inspectPlayerTable(bytes, { base: 0x80010000, address: 0x80010004,
    count: 1, element: 'u32', sha256: sha256(bytes.subarray(4, 8)) });
  assert.deepEqual(words.values, [0x04030201]);
});

test('bad table ranges, types, alignment and fingerprints reject before decoding', () => {
  const bytes = new Uint8Array(12);
  const descriptor = { base: 0x80010000, address: 0x80010004, count: 1, element: 'u32', sha256: sha256(bytes.subarray(4, 8)) };
  for (const change of [{ count: 0 }, { count: 65537 }, { count: 1.5 }, { address: 0x80010002 },
    { address: 0x8001000c }, { address: 0x8000ffff }, { element: 'f32' }, { base: -1 }]) {
    assert.throws(() => inspectPlayerTable(bytes, { ...descriptor, ...change }), /format or range/);
  }
  assert.throws(() => inspectPlayerTable(bytes, { ...descriptor, sha256: 'wrong' }), /fingerprint/);
  assert.throws(() => inspectPlayerTable(new ArrayBuffer(12), descriptor), /Uint8Array/);
});

test('unknown source images never produce player routines, tables or control claims', () => {
  for (const [backend, boot] of [[new Uint8Array(), new Uint8Array()], [new Uint8Array(939136), new Uint8Array(251904)]]) {
    const report = inspectPlayerRecovery(backend, boot);
    assert.equal(report.status, 'unsupported');
    assert.deepEqual(report.routines, []); assert.deepEqual(report.tables, []); assert.deepEqual(report.callPath, []);
  }
  assert.throws(() => inspectPlayerRecovery(new Uint8Array()), /Uint8Array/);
  assert.equal(playerNativeExports.length, 5);
  assert.equal(new Set(playerNativeExports).size, 5);
});
