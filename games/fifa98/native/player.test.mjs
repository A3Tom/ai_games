import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectPlayerRecovery } from '../scripts/player-recovery.mjs';

const directory = new URL('../.engine-build/', import.meta.url);
let bytes;
try { bytes = await readFile(new URL('fifa98-core.wasm', directory)); }
catch (error) { throw new Error('Build native module first: node games/fifa98/scripts/build-native.mjs', { cause: error }); }
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'));
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports;
if (!core.fifa98_player_motion_integrate) throw new Error('Rebuild native module with native/player.c before player tests');
const words = new Uint32Array(core.memory.buffer), workspace = core.fifa98_match_workspace() / 4;
const tableOffset = workspace, stateOffset = workspace + 300, paramsOffset = workspace + 320, outputOffset = workspace + 360;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const u = (value) => Number(BigInt.asUintN(32, BigInt(value)));
const s = (value) => BigInt.asIntN(32, BigInt(value >>> 0));
const multiply = (left, right) => u((s(left) * s(right) + 32768n) >> 16n);
const reciprocal = (value) => {
  const magnitude = BigInt(value);
  return Number(0xffffffffn / magnitude + (0xffffffffn % magnitude > magnitude / 2n ? 1n : 0n));
};
const syntheticQuarter = Array.from({ length: 257 }, (_, index) => index * 256);
function headingOracle(angle, quarter = syntheticQuarter) {
  const masked = angle & 1023, index = masked % 256;
  const components = [quarter[index], quarter[256 - index]];
  return [
    masked < 256 ? components[0] : masked < 512 ? components[1] : masked < 768 ? -components[0] : -components[1],
    masked < 256 ? components[1] : masked < 512 ? -components[0] : masked < 768 ? -components[1] : components[0],
  ].map(u);
}
function integrationOracle(state, params, quarter = syntheticQuarter) {
  let [x, z, current] = state.map((value) => value >>> 0);
  let [target, acceleration, deceleration, inverseAcceleration, inverseDeceleration, ticks, angle] = params.map((value) => value >>> 0);
  let time = u(BigInt(ticks) << 16n);
  const direction = headingOracle(angle, quarter);
  const travel = (distance) => { x = u(BigInt(x) + BigInt(multiply(distance, direction[0]))); z = u(BigInt(z) + BigInt(multiply(distance, direction[1]))); };
  const mean = (first, second) => u(s(u(BigInt(first) + BigInt(second))) >> 1n);
  const speed31 = (speed) => u(BigInt.asIntN(31, BigInt(speed)));
  if (current === target) {
    if (s(target) >= 19660n) travel(multiply(speed31(target), time));
  } else {
    const decelerating = s(target) < s(current);
    const difference = u(decelerating ? BigInt(current) - BigInt(target) : BigInt(target) - BigInt(current));
    const reachingTime = multiply(difference, decelerating ? inverseDeceleration : inverseAcceleration);
    if (s(reachingTime) >= s(time)) {
      const change = multiply(decelerating ? deceleration : acceleration, time);
      target = u(decelerating ? BigInt(current) - BigInt(change) : BigInt(current) + BigInt(change));
      if (s(current) >= 19660n || s(target) >= 19660n) travel(multiply(mean(current, target), time));
    } else {
      if (s(current) >= 19660n || s(target) >= 19660n) travel(multiply(mean(current, target), reachingTime));
      time = u(BigInt(time) - BigInt(reachingTime));
      if (s(target) >= 19660n) travel(multiply(speed31(target), time));
    }
  }
  return [x, z, target, multiply(target, direction[0]), multiply(target, direction[1]), angle];
}

test('native player recovery matches its source and Wasm hashes without runtime imports', async () => {
  assert.equal(manifest.sources.find((entry) => entry.path === 'player.c')?.sha256, hash(await readFile(new URL('./player.c', import.meta.url))), 'Rebuild after changing player.c');
  assert.equal(manifest.wasmSha256, hash(bytes));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
});

test('original direction mapper retains every low-nibble mapping, including opposing inputs', () => {
  const expected = [[0,0,0],[1,1,0],[5,-1,0],[0,0,0],[3,0,-1],[2,1,-1],[4,-1,-1],[0,0,0],
    [7,0,1],[8,1,1],[6,-1,1],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
  for (let nibble = 0; nibble < 16; nibble += 1) for (const upper of [0, 0xffff0000]) {
    assert.equal(core.fifa98_player_digital_direction(upper | nibble, outputOffset * 4), expected[nibble][0]);
    assert.deepEqual([...words.subarray(outputOffset, outputOffset + 2)], expected[nibble].slice(1).map(u));
  }
  assert.equal(core.fifa98_player_digital_direction(1, 0) >>> 0, 0xffffffff);
});

test('resident heading lookup preserves all quadrants, wrapping and signed angles', () => {
  words.set(syntheticQuarter, tableOffset);
  for (let angle = -2048; angle <= 2048; angle += 1) {
    assert.equal(core.fifa98_player_heading_vector(angle, tableOffset * 4, outputOffset * 4), 1);
    assert.deepEqual([...words.subarray(outputOffset, outputOffset + 2)], headingOracle(angle));
  }
  const before = words.slice(outputOffset, outputOffset + 2);
  assert.equal(core.fifa98_player_heading_vector(0, 0, outputOffset * 4), 0);
  assert.deepEqual(words.subarray(outputOffset, outputOffset + 2), before);
  assert.equal(core.fifa98_player_heading_vector(0, tableOffset * 4, 0), 0);
});

test('source-index profile fixture computes normal/alternate rates and actual rounded reciprocals', () => {
  for (const alternate of [0, 1]) for (const flags of [0, 1]) {
    assert.equal(core.fifa98_player_motion_profile(10, 10, flags, alternate, outputOffset * 4), 1);
    const base = alternate ? 340787 : flags ? 0x30000 : 334233;
    assert.deepEqual([...words.subarray(outputOffset, outputOffset + 8)], [base, base + 137625, 16384, 68812, 16384, 262144, 62416, 262144]);
  }
  const before = words.slice(outputOffset, outputOffset + 8);
  for (const [first, second, alternate] of [[20, 0, 0], [0, 20, 0], [0, 0, 2], [-1, 0, 0]]) {
    assert.equal(core.fifa98_player_motion_profile(first, second, 0, alternate, outputOffset * 4), 0);
    assert.deepEqual(words.subarray(outputOffset, outputOffset + 8), before);
  }
  assert.equal(core.fifa98_player_motion_profile(0, 0, 0, 0, 0), 0);
});

test('target-speed routine keeps original analog thresholds, special action minimum and consumed flag', () => {
  for (const magnitude of [0, 1, 26213, 26214, 42597, 42598, 65536, 0x7fffffff, 0x80000000]) {
    for (const action of [0, 8]) {
      words.set([17, 0xabcdef01 | 0x100000], stateOffset);
      words.set([1, 1, magnitude, 334233, action], paramsOffset);
      let expected = magnitude === 0 ? 0 : s(magnitude) < 26214n ? 0x19999 : s(magnitude) > 0xa665n ? multiply(magnitude, 334233) : 0x48000;
      if (action === 8 && s(expected) <= 0x6bfffn) expected = 0x6c000;
      assert.equal(core.fifa98_player_target_speed(stateOffset * 4, paramsOffset * 4), 1);
      assert.deepEqual([...words.subarray(stateOffset, stateOffset + 2)], [expected, (0xabcdef01 & ~0x100000) >>> 0]);
    }
  }
  for (const [present, analog, flags] of [[0, 1, 0x100000], [1, 0, 0x100000], [1, 1, 0]]) {
    words.set([17, flags], stateOffset); words.set([present, analog, 0, 334233, 0], paramsOffset);
    assert.equal(core.fifa98_player_target_speed(stateOffset * 4, paramsOffset * 4), present);
    assert.deepEqual([...words.subarray(stateOffset, stateOffset + 2)], [present ? 334233 : 17, flags]);
  }
  assert.equal(core.fifa98_player_target_speed(0, paramsOffset * 4), 0);
  assert.equal(core.fifa98_player_target_speed(stateOffset * 4, 0), 0);
});

test('horizontal integration preserves original threshold and split-time acceleration/deceleration', () => {
  words.set(syntheticQuarter, tableOffset);
  const fixtures = [
    [[0,0,65536,0,0,0], [65536,65536,65536,65536,65536,1,256]],
    [[0,0,0,0,0,0], [2*65536,65536,65536,65536,65536,1,256]],
    [[0,0,0,0,0,0], [2*65536,65536,65536,65536,65536,3,256]],
    [[0,0,2*65536,0,0,0], [65536,65536,65536,65536,65536,2,256]],
    [[0,0,19659,0,0,0], [19659,65536,65536,65536,65536,1,0]],
    [[0,0,19660,0,0,0], [19660,65536,65536,65536,65536,1,0]],
    [[0x7fffffff,0x80000000,0x60000000,0,0,0], [0x60000000,65536,65536,65536,65536,1,256]],
  ];
  for (const [state, params] of fixtures) {
    words.set(state, stateOffset); words.set(params, paramsOffset);
    assert.equal(core.fifa98_player_motion_integrate(stateOffset * 4, paramsOffset * 4, tableOffset * 4), 1);
    assert.deepEqual([...words.subarray(stateOffset, stateOffset + 6)], integrationOracle(state, params));
  }
  words.set([0,0,0,0,0,0], stateOffset); words.set([2*65536,65536,65536,65536,65536,3,256], paramsOffset);
  core.fifa98_player_motion_integrate(stateOffset * 4, paramsOffset * 4, tableOffset * 4);
  assert.equal(words[stateOffset], 4 * 65536, 'Two accelerating ticks then one full-speed tick travel four units');
});

test('horizontal integration matches independent BigInt arithmetic across wrapped edge cases', () => {
  words.set(syntheticQuarter, tableOffset);
  let random = 0x9898;
  const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
  for (let iteration = 0; iteration < 20000; iteration += 1) {
    const state = Array.from({ length: 6 }, next), params = Array.from({ length: 7 }, next);
    params[5] &= 65535;
    words.set(state, stateOffset); words.set(params, paramsOffset);
    assert.equal(core.fifa98_player_motion_integrate(stateOffset * 4, paramsOffset * 4, tableOffset * 4), 1);
    assert.deepEqual([...words.subarray(stateOffset, stateOffset + 6)], integrationOracle(state, params));
  }
});

test('integration domain checks reject null buffers and invalid ticks before writes', () => {
  words.set([1,2,3,4,5,6], stateOffset); words.set([1,2,3,4,5,65536,7], paramsOffset);
  const before = words.slice(stateOffset, stateOffset + 6);
  for (const [state, params, table] of [[stateOffset*4,paramsOffset*4,tableOffset*4], [0,paramsOffset*4,tableOffset*4],
    [stateOffset*4,0,tableOffset*4], [stateOffset*4,paramsOffset*4,0]]) {
    assert.equal(core.fifa98_player_motion_integrate(state, params, table), 0);
    assert.deepEqual(words.subarray(stateOffset, stateOffset + 6), before);
  }
});

test('actual reviewed source tables reproduce every heading and all bounded profile index pairs', async (context) => {
  let backend, boot;
  try { [backend, boot] = await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)),
    readFile(new URL('../.work/reference/disc/SLES_009.14', import.meta.url))]); }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Local original reference files are not prepared'); return; } throw error; }
  const report = inspectPlayerRecovery(backend, boot);
  assert.equal(report.status, 'reconstruction-only');
  const source = report.tables, quarter = source.quarterSine.values;
  words.set(quarter, tableOffset);
  for (let angle = 0; angle < 1024; angle += 1) {
    core.fifa98_player_heading_vector(angle, tableOffset * 4, outputOffset * 4);
    assert.deepEqual([...words.subarray(outputOffset, outputOffset + 2)], headingOracle(angle, quarter));
  }
  for (let index48 = 0; index48 < 20; index48 += 1) for (let index58 = 0; index58 < 20; index58 += 1) {
    const rate = source.acceleration.values[index48], addend = source.speedAddend.values[index48];
    for (const alternate of [0, 1]) for (const flags of [0, 1]) {
      const base = alternate ? source.alternateBaseSpeed.values[index58] : flags ? 0x30000 : source.normalBaseSpeed.values[index58];
      assert.equal(core.fifa98_player_motion_profile(index48, index58, flags, alternate, outputOffset * 4), 1);
      assert.deepEqual([...words.subarray(outputOffset, outputOffset + 8)], [base, base + addend, rate, addend >> 1, rate,
        reciprocal(rate), reciprocal(addend >> 1), reciprocal(rate)]);
    }
  }
});
