import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectControlTargetRecovery } from '../scripts/control-target-recovery.mjs';

const buildDirectory = new URL('../.engine-build/', import.meta.url);
const bytes = await readFile(new URL('fifa98-core.wasm', buildDirectory));
const manifest = JSON.parse(await readFile(new URL('build.json', buildDirectory), 'utf8'));
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports;
if (!core.fifa98_control_workspace) throw new Error('Rebuild main native module with control-target.c before tests');
const words = new Uint32Array(core.memory.buffer), memoryBytes = new Uint8Array(core.memory.buffer);
const base = core.fifa98_control_workspace() / 4, atanPointer = base * 4, sineWord = base + 128;
const offsetsWord = base + 512, controlWord = base + 520, positionWord = base + 536;
const boundsWord = base + 544, targetWord = base + 552, deltaWord = base + 560;
const u = (value) => Number(BigInt.asUintN(32, BigInt(value)));
const s = (value) => BigInt.asIntN(32, BigInt(value >>> 0));
const multiply = (left, right) => u((s(left) * s(right) + 32768n) >> 16n);
const syntheticAtan = Array.from({ length: 257 }, (_, index) => Math.floor(index / 2));
const syntheticSine = Array.from({ length: 257 }, (_, index) => index * 256);

function headingOracle(dx, dz, table = syntheticAtan) {
  const x = s(dx), z = s(dz), ax = x < 0n ? -x : x, az = z < 0n ? -z : z;
  const lower = ax < az ? ax : az, upper = ax < az ? az : ax;
  let acute;
  if (lower === upper) acute = 128;
  else {
    const index = lower < 8388608n ? (lower * 256n + upper / 2n) / upper :
      (((lower * 4294967296n) / upper + 8388608n) >> 24n);
    acute = table[Number(index)];
    if (ax > az) acute = 256 - acute;
  }
  if (z < 0n) return (x < 0n ? acute - 512 : 512 - acute) | 0;
  return (x < 0n ? -acute : acute) | 0;
}
function sineOracle(angle, quarter = syntheticSine) {
  const value = angle & 1023, offset = value & 255, lo = quarter[offset], hi = quarter[256 - offset];
  return [value < 256 ? lo : value < 512 ? hi : value < 768 ? -lo : -hi,
    value < 256 ? hi : value < 512 ? -lo : value < 768 ? -hi : lo].map(u);
}
function decayOracle(input, previous, step) {
  const current = s(previous), command = s(input);
  if (command !== 0n) return current * command > 0n ? u(current + command) : u(command);
  if (current === 0n) return 0;
  const next = s(u(current + (current < 0n ? BigInt(step >>> 0) : -BigInt(step >>> 0))));
  return (current < 0n ? next > 0n : next < 0n) ? 0 : u(next);
}
function boundOracle(target, bounds, alternate) {
  const result = target.map((value) => value >>> 0);
  let xLimit = bounds[0] >>> 0, zLimit = bounds[1] >>> 0;
  if (alternate) {
    const absX = s(u(s(result[0]) < 0n ? -s(result[0]) : s(result[0])));
    if (absX <= s(u(BigInt(bounds[2] >>> 0) - 16n))) return result;
    xLimit = u(BigInt(xLimit) - 16n); zLimit = u(BigInt(zLimit) - 16n);
  }
  const clamp = (value, limit) => s(value) < s(u(-BigInt(limit))) ? u(-BigInt(limit)) : s(value) > s(limit) ? limit : value;
  result[0] = clamp(result[0], xLimit); result[2] = clamp(result[2], zLimit);
  return result;
}
function targetOracle(offsets, control, position, bounds, quarter = syntheticSine) {
  let [x, z] = offsets.map((value) => value >>> 0);
  if ((control[0] >>> 0) === 1) {
    if ((control[1] >>> 0) === 0) { x = 0; z = 0; }
    else [x, z] = sineOracle(control[2], quarter).map((value) => multiply(192, value));
  } else if ((control[3] >>> 0) || (control[4] >>> 0)) {
    const sign = (value) => s(value) < 0n ? u(-192) : s(value) > 0n ? 192 : 0;
    x = sign(control[3]); z = sign(control[4]);
  } else {
    const amount = u(BigInt(control[5] >>> 0) * 32n);
    x = decayOracle(0, x, amount); z = decayOracle(0, z, amount);
  }
  return { offsets: [x, z], target: boundOracle([u(BigInt(position[0] >>> 0) + BigInt(x)), 0,
    u(BigInt(position[2] >>> 0) + BigInt(z))], bounds, control[6]) };
}
function metricOracle(dx, dz) {
  const abs = (value) => s(u(s(value) < 0n ? -s(value) : s(value)));
  const x = abs(dx), z = abs(dz);
  return u(x + z - ((x < z ? x : z) >> 1n));
}
const installTables = (atan = syntheticAtan, sine = syntheticSine) => {
  memoryBytes.set(atan, atanPointer); words.set(sine, sineWord);
};
const randomGenerator = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);

test('native control source/Wasm hashes match and no runtime is imported', async () => {
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  assert.equal(manifest.sources.find((entry) => entry.path === 'control-target.c')?.sha256,
    hash(await readFile(new URL('./control-target.c', import.meta.url))), 'Rebuild after changing control-target.c');
  assert.equal(manifest.wasmSha256, hash(bytes)); assert.deepEqual(WebAssembly.Module.imports(module), []);
  assert.equal(core.fifa98_control_workspace_words(), 2048);
});

test('source heading retains cardinal/quadrant conventions and zero-vector result', () => {
  installTables();
  for (const [dx, dz, expected] of [[0,1,0],[1,0,256],[0,-1,512],[-1,0,-256],
    [1,1,128],[1,-1,384],[-1,1,-128],[-1,-1,-384],[0,0,128]]) {
    assert.equal(core.fifa98_control_heading(dx, dz, atanPointer), expected);
  }
  for (const dx of [0, 1, -1, 0x7fffffff, 8388607, 8388608]) for (const dz of [0, 1, -1, 0x7fffffff, 8388608, 8388609]) {
    assert.equal(core.fifa98_control_heading(dx, dz, atanPointer), headingOracle(dx, dz));
  }
  assert.equal(core.fifa98_control_heading(0x80000000, 1, atanPointer), -2147483648);
  assert.equal(core.fifa98_control_heading(1, 0x80000000, atanPointer), -2147483648);
  assert.equal(core.fifa98_control_heading(1, 1, 0), -2147483648);
});

test('heading fixed-ratio rounding matches BigInt division on small and wide paths', () => {
  installTables();
  const next = randomGenerator(0xa7a298);
  for (let index = 0; index < 30000; index += 1) {
    let dx = next(), dz = next();
    if (dx === 0x80000000) dx += 1; if (dz === 0x80000000) dz += 1;
    assert.equal(core.fifa98_control_heading(dx, dz, atanPointer), headingOracle(dx, dz));
  }
});

test('scalar decay preserves replacement, accumulation, neutral stop and wrapping', () => {
  const values = [0,1,-1,192,-192,32,-32,0x7fffffff,0x80000000,0xffffffff];
  for (const input of values) for (const previous of values) for (const step of [0,1,32,192,0xffffffff]) {
    assert.equal(core.fifa98_control_decay(input, previous, step) >>> 0, decayOracle(input, previous, step));
  }
  const next = randomGenerator(0xdec098);
  for (let index = 0; index < 20000; index += 1) {
    const input = index % 2 ? 0 : next(), previous = next(), step = next();
    assert.equal(core.fifa98_control_decay(input, previous, step) >>> 0, decayOracle(input, previous, step));
  }
});

test('pitch bounds retain alternate inner strip, margins, strict comparison and Y', () => {
  words.set([1824,2544,228], boundsWord);
  for (const input of [[3000,99,-3000],[-3000,-99,3000],[212,99,5000],[213,99,5000],[-212,99,-5000],[-213,99,-5000],[0x80000000,99,5000]]) {
    for (const alternate of [0, 1]) {
      words.set(input, targetWord);
      assert.equal(core.fifa98_control_pitch_bound(targetWord * 4, boundsWord * 4, alternate), 1);
      assert.deepEqual([...words.subarray(targetWord, targetWord + 3)], boundOracle(input, [1824,2544,228], alternate));
    }
  }
  const next = randomGenerator(0xb0a298);
  for (let index = 0; index < 10000; index += 1) {
    const target = [next(),next(),next()], bounds = [next(),next(),next()], alternate = next() & 1;
    words.set(target, targetWord); words.set(bounds, boundsWord);
    core.fifa98_control_pitch_bound(targetWord * 4, boundsWord * 4, alternate);
    assert.deepEqual([...words.subarray(targetWord, targetWord + 3)], boundOracle(target, bounds, alternate));
  }
  const before = words.slice(targetWord, targetWord + 3);
  assert.equal(core.fifa98_control_pitch_bound(targetWord * 4, 0, 0), 0);
  assert.deepEqual(words.subarray(targetWord, targetWord + 3), before);
  assert.equal(core.fifa98_control_pitch_bound(0, boundsWord * 4, 0), 0);
});

test('controller target uses literal digital offsets and six-tick neutral decay', () => {
  installTables(); words.set([100,55,-100], positionWord); words.set([1824,2544,228], boundsWord);
  words.set([0,0], offsetsWord); words.set([0,0,0,1,-1,1,0], controlWord);
  assert.equal(core.fifa98_control_target(offsetsWord * 4, controlWord * 4, positionWord * 4, boundsWord * 4, sineWord * 4, targetWord * 4), 1);
  assert.deepEqual([...words.subarray(offsetsWord, offsetsWord + 2)], [192,u(-192)]);
  assert.deepEqual([...words.subarray(targetWord, targetWord + 3)], [292,0,u(-292)]);
  words.set([0,0,0,0,0,1,0], controlWord);
  for (let tick = 1; tick <= 6; tick += 1) {
    core.fifa98_control_target(offsetsWord * 4, controlWord * 4, positionWord * 4, boundsWord * 4, sineWord * 4, targetWord * 4);
    const remaining = 192 - tick * 32;
    assert.deepEqual([...words.subarray(offsetsWord, offsetsWord + 2)], [remaining,u(-remaining)]);
  }
  words.set([123,456], offsetsWord); words.set([1,0,256,1,1,1,0], controlWord);
  core.fifa98_control_target(offsetsWord * 4, controlWord * 4, positionWord * 4, boundsWord * 4, sineWord * 4, targetWord * 4);
  assert.deepEqual([...words.subarray(offsetsWord, offsetsWord + 2)], [0,0], 'Analog zero magnitude clears offsets immediately');
});

test('controller target agrees with source-field oracle across digital/analog modes', () => {
  installTables(); const next = randomGenerator(0xc07198);
  for (let index = 0; index < 12000; index += 1) {
    const offsets = [next(),next()], position = [next(),next(),next()], bounds = [1824,2544,228];
    const control = [index % 3, next(), next(), index % 5 ? next() : 0, index % 5 ? next() : 0, next() & 65535, next() & 1];
    if (index % 7 === 0) control[1] = 0;
    const expected = targetOracle(offsets, control, position, bounds);
    words.set(offsets, offsetsWord); words.set(control, controlWord); words.set(position, positionWord); words.set(bounds, boundsWord);
    assert.equal(core.fifa98_control_target(offsetsWord * 4, controlWord * 4, positionWord * 4, boundsWord * 4, sineWord * 4, targetWord * 4), 1);
    assert.deepEqual([...words.subarray(offsetsWord, offsetsWord + 2)], expected.offsets);
    assert.deepEqual([...words.subarray(targetWord, targetWord + 3)], expected.target);
  }
});

test('target-delta store retains original distance metric, flags and word boundaries', () => {
  const next = randomGenerator(0xd37198);
  for (let index = 0; index < 12000; index += 1) {
    const position = [next(),next(),next()], target = [next(),next(),next()], flags = next();
    const dx = u(BigInt(target[0]) - BigInt(position[0])), dz = u(BigInt(target[2]) - BigInt(position[2]));
    words.set(position, positionWord); words.set(target, targetWord); words.fill(0x12345678, deltaWord, deltaWord + 8); words[deltaWord + 6] = flags;
    assert.equal(core.fifa98_control_target_delta(positionWord * 4, targetWord * 4, deltaWord * 4), 1);
    assert.deepEqual([...words.subarray(deltaWord, deltaWord + 8)], [target[0],0,target[2],metricOracle(dx,dz),dx,dz,(flags & ~0x10000) >>> 0,0x12345678]);
  }
});

test('target ABI guards reject invalid storage/ticks without changing either output', () => {
  installTables(); words.set([17,18], offsetsWord); words.set([1,1,256,1,0,65536,0], controlWord);
  words.set([1,2,3], targetWord);
  const offsets = words.slice(offsetsWord, offsetsWord + 2), target = words.slice(targetWord, targetWord + 3);
  const args = [offsetsWord*4,controlWord*4,positionWord*4,boundsWord*4,sineWord*4,targetWord*4];
  assert.equal(core.fifa98_control_target(...args), 0);
  words[controlWord + 5] = 1;
  for (let index = 0; index < args.length; index += 1) {
    const invalid = [...args]; invalid[index] = 0;
    assert.equal(core.fifa98_control_target(...invalid), 0);
    assert.deepEqual(words.subarray(offsetsWord, offsetsWord + 2), offsets);
    assert.deepEqual(words.subarray(targetWord, targetWord + 3), target);
  }
  const before = words.slice(deltaWord, deltaWord + 7);
  for (const values of [[0,targetWord*4,deltaWord*4],[positionWord*4,0,deltaWord*4],[positionWord*4,targetWord*4,0]]) {
    assert.equal(core.fifa98_control_target_delta(...values), 0);
    assert.deepEqual(words.subarray(deltaWord, deltaWord + 7), before);
  }
});

test('actual source angle/sine tables and controller bounds verify native lookup paths', async (context) => {
  let backend, boot;
  try { [backend, boot] = await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)),
    readFile(new URL('../.work/reference/disc/SLES_009.14', import.meta.url))]); }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Local original references are not prepared'); return; } throw error; }
  const report = inspectControlTargetRecovery(backend, boot);
  assert.equal(report.status, 'reconstruction-only');
  assert.deepEqual(report.boundsProfiles.map((entry) => entry.bounds), [[2040,2832,228],[1920,2688,228],[1824,2544,228],[1800,2400,228],[1080,1392,152]]);
  const atan = report.tables.quarterAtan.values, sine = report.tables.quarterSine.values;
  installTables(atan, sine);
  const next = randomGenerator(0xa97a98);
  for (let index = 0; index < 15000; index += 1) {
    let dx = next(), dz = next(); if (dx === 0x80000000) dx += 1; if (dz === 0x80000000) dz += 1;
    assert.equal(core.fifa98_control_heading(dx, dz, atanPointer), headingOracle(dx, dz, atan));
  }
  words.set([100,0,-100], positionWord); words.set([1824,2544,228], boundsWord);
  for (let angle = 0; angle < 1024; angle += 1) {
    const control = [1,65536,angle,0,0,1,0]; words.set([0,0], offsetsWord); words.set(control, controlWord);
    const expected = targetOracle([0,0], control, [100,0,-100], [1824,2544,228], sine);
    core.fifa98_control_target(offsetsWord*4,controlWord*4,positionWord*4,boundsWord*4,sineWord*4,targetWord*4);
    assert.deepEqual([...words.subarray(targetWord, targetWord + 3)], expected.target);
  }
});
