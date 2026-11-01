import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectMatchRecovery, inspectRecoveredRegion } from './match-recovery.mjs';

test('static fingerprint inspection uses explicit ranges and little-endian words', () => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32LE(0x24820001, 4);
  bytes.writeUInt32LE(0x03e00008, 8);
  const sha256 = createHash('sha256').update(bytes.subarray(4)).digest('hex');
  const region = inspectRecoveredRegion(bytes, { base: 0x80010000, address: 0x80010004, size: 8, sha256 });
  assert.equal(region.fileOffset, 4);
  assert.equal(region.disassembly[0].instruction, 'addiu $v0, $a0, 1');
  assert.equal(region.disassembly[1].instruction, 'jr $ra');
  const wrapped = new Uint8Array(20);
  wrapped.set(bytes, 3);
  assert.deepEqual(inspectRecoveredRegion(wrapped.subarray(3, 15), { base: 0x80010000, address: 0x80010004, size: 8, sha256 }), region);
});

test('fingerprint mismatch, invalid ranges and unknown instructions fail explicitly', () => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32LE(0x24820001, 4);
  bytes.writeUInt32LE(0x03e00008, 8);
  const sha256 = createHash('sha256').update(bytes.subarray(4)).digest('hex');
  assert.throws(() => inspectRecoveredRegion(bytes, { base: 0x80010000, address: 0x80010002, size: 8, sha256 }), /unaligned/);
  assert.throws(() => inspectRecoveredRegion(bytes, { base: 0x80010000, address: 0x80010004, size: 12, sha256 }), /outside/);
  assert.throws(() => inspectRecoveredRegion(bytes, { base: 0x80010000, address: 0x80010004, size: 8, sha256: 'bad' }), /fingerprint/);
  assert.throws(() => inspectRecoveredRegion(new ArrayBuffer(16)), /Uint8Array/);
  const unknown = Buffer.from([255, 255, 255, 255]);
  assert.throws(() => inspectRecoveredRegion(unknown, { base: 0x80010000, address: 0x80010000, size: 4,
    sha256: createHash('sha256').update(unknown).digest('hex') }), /Unknown instruction/);
});

test('unknown game images never produce reviewed routine or call-path claims', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(12), Buffer.alloc(939136)]) {
    const unsupported = inspectMatchRecovery(bytes);
    assert.equal(unsupported.status, 'unsupported');
    assert.equal(unsupported.reason, 'unknown-backend-image');
    assert.deepEqual(unsupported.routines, []);
    assert.deepEqual(unsupported.callPath, []);
    assert.equal(unsupported.source.size, bytes.length);
  }
  assert.throws(() => inspectMatchRecovery(new ArrayBuffer(16)), /Uint8Array/);
});
