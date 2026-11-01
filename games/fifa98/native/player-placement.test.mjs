import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { recoverPlayerRenderPosition, inspectPlayerPlacement } from '../scripts/player-placement.mjs';

const directory = new URL('../.engine-build/', import.meta.url), bytes = await readFile(new URL('fifa98-core.wasm', directory));
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'));
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports;
if (!core.fifa98_player_render_position) throw new Error('Rebuild main native module with player-placement.c before tests');
const words = new Uint32Array(core.memory.buffer), signed = new Int32Array(core.memory.buffer);
const base = core.fifa98_control_workspace() / 4, output = base + 8;
const hash = (value) => createHash('sha256').update(value).digest('hex');
function oracle(input) {
  return input.map((value, axis) => {
    const integer = BigInt.asIntN(32, BigInt(value >>> 0)) >> 16n;
    return Number(BigInt.asIntN(16, 2n * (integer - (axis === 1 ? 3n : 0n))));
  });
}

test('native placement source and Wasm hashes match without runtime imports', async () => {
  assert.equal(manifest.sources.find((entry) => entry.path === 'player-placement.c')?.sha256,
    hash(await readFile(new URL('./player-placement.c', import.meta.url))));
  assert.equal(manifest.wasmSha256, hash(bytes)); assert.deepEqual(WebAssembly.Module.imports(module), []);
});

test('all signed integer halfwords retain exact source doubling/vertical offset/final SH behavior', () => {
  for (let high = 0; high < 65536; high += 1) {
    const input = [(high << 16) >>> 0, ((high << 16) | 0xffff) >>> 0, (((65535 - high) << 16) | 12345) >>> 0];
    words.set(input, base);
    assert.equal(core.fifa98_player_render_position(base * 4, output * 4), 1);
    assert.deepEqual([...signed.subarray(output, output + 3)], oracle(input));
  }
});

test('native/JS placement matches independent BigInt oracle over fractional signed coordinates', () => {
  let random = 0x12398;
  const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 20000; sample += 1) {
    const input = [next(), next(), next()], expected = oracle(input);
    words.set(input, base);
    core.fifa98_player_render_position(base * 4, output * 4);
    assert.deepEqual([...signed.subarray(output, output + 3)], expected);
    assert.deepEqual(recoverPlayerRenderPosition(input), expected);
  }
});

test('null placement buffers leave output unchanged and staged conversion supports in-place use', () => {
  signed.set([17,18,19], output);
  assert.equal(core.fifa98_player_render_position(0, output * 4), 0);
  assert.deepEqual([...signed.subarray(output, output + 3)], [17,18,19]);
  assert.equal(core.fifa98_player_render_position(base * 4, 0), 0);
  const input = [0x0001ffff,0x0004ffff,0xffff0001]; words.set(input, base);
  assert.equal(core.fifa98_player_render_position(base * 4, base * 4), 1);
  assert.deepEqual([...signed.subarray(base, base + 3)], [2,2,-2]);
});

test('actual source placement chain, calls and packed consumer fingerprint verify when available', async (context) => {
  let backend, boot;
  try { [backend, boot] = await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)),
    readFile(new URL('../.work/reference/disc/SLES_009.14', import.meta.url))]); }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Local references are not prepared'); return; } throw error; }
  const report = inspectPlayerPlacement(backend, boot);
  assert.equal(report.status, 'reconstruction-only'); assert.equal(report.regions.length, 8); assert.equal(report.callPath.length, 5);
  assert.equal(report.conversion.horizontalMultiplier, 2); assert.equal(report.conversion.packedVerticalOffset, -6);
  assert.equal(report.platformBoundary.originalViewTransformIncluded, false);
});
