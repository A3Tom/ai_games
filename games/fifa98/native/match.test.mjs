import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const directory = new URL('../.engine-build/', import.meta.url);
let bytes;
try { bytes = await readFile(new URL('fifa98-core.wasm', directory)); }
catch (error) { throw new Error('Build the native module first: node games/fifa98/scripts/build-native.mjs', { cause: error }); }
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'));
const module = await WebAssembly.compile(bytes);
const core = (await WebAssembly.instantiate(module)).exports;
if (!core.fifa98_match_workspace) throw new Error('Rebuild the native module with native/match.c before running match tests');
const words = new Uint32Array(core.memory.buffer);
const workspace = core.fifa98_match_workspace() / 4;

test('built match support matches the recovered C source and imports no runtime', async () => {
  const sha256 = (data) => createHash('sha256').update(data).digest('hex');
  const source = await readFile(new URL('./match.c', import.meta.url));
  assert.equal(manifest.sources.find((entry) => entry.path === 'match.c')?.sha256, sha256(source), 'Rebuild after changing match.c');
  assert.equal(manifest.wasmSha256, sha256(bytes));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
});

const unsigned = (value) => Number(BigInt.asUintN(32, BigInt(value)));
function distanceOracle(dx, dz) {
  const magnitude = (value) => {
    const signed = BigInt.asIntN(32, BigInt(value >>> 0));
    return signed < 0 ? BigInt.asIntN(32, -signed) : signed;
  };
  const x = magnitude(dx), z = magnitude(dz);
  return unsigned(x + z - ((x < z ? x : z) >> 1n));
}

test('recovered planar metric preserves the original approximation for ordinary coordinates', () => {
  for (let dx = -100; dx <= 100; dx += 1) {
    for (let dz = -100; dz <= 100; dz += 1) {
      const shorter = Math.min(Math.abs(dx), Math.abs(dz));
      const expected = Math.max(Math.abs(dx), Math.abs(dz)) + Math.ceil(shorter / 2);
      assert.equal(core.fifa98_planar_distance(dx, dz) >>> 0, expected);
    }
  }
  assert.equal(core.fifa98_planar_distance(3, 4), 6, 'This original metric is not Euclidean distance');
});

test('planar metric retains wrapping and signed absolute-value boundary behavior', () => {
  const values = [0, 1, -1, 2, -2, 0x7fffffff, 0x80000000, 0xffffffff, 0x80000001];
  for (const dx of values) for (const dz of values) {
    assert.equal(core.fifa98_planar_distance(dx, dz) >>> 0, distanceOracle(dx, dz));
  }
  let state = 0x98f100;
  for (let index = 0; index < 20000; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const dx = state;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    assert.equal(core.fifa98_planar_distance(dx, state) >>> 0, distanceOracle(dx, state));
  }
});

test('rolling row updates write symmetric distances and preserve every unvisited cell', () => {
  const matrix = workspace + 64;
  words.fill(0xabcdef01, workspace, workspace + 512);
  // Invented entity coordinates; no original squad/position data is embedded.
  words.set([0, 0, 3, 4, 10, 1], workspace);
  assert.equal(core.fifa98_distance_rows(workspace * 4, 3, 0, 1, matrix * 4), 2);
  const expected = new Uint32Array(121).fill(0xabcdef01);
  for (const [first, second, distance] of [[0, 1, 6], [0, 2, 11], [1, 2, 9]]) {
    expected[first * 11 + second] = distance;
    expected[second * 11 + first] = distance;
  }
  assert.deepEqual(words.subarray(matrix, matrix + 121), expected);
  assert.deepEqual([...words.subarray(workspace, workspace + 6)], [0, 0, 3, 4, 10, 1]);
  words.fill(0xdefaced, matrix, matrix + 121);
  assert.equal(core.fifa98_distance_rows(workspace * 4, 3, 1, 1, matrix * 4), 1);
  assert.equal(words[matrix + 1 * 11 + 2], 9);
  assert.equal(words[matrix + 0 * 11 + 2], 11);
});

test('rolling scheduler visits only two rows per tick until the original row recurs', () => {
  const matrix = workspace + 64;
  for (let index = 0; index < 11; index += 1) words.set([index * 3, index * 4], workspace + index * 2);
  words.fill(0xfefefefe, matrix, matrix + 121);
  assert.equal(core.fifa98_distance_rows(workspace * 4, 11, 0, 1, matrix * 4), 2);
  for (let first = 0; first < 11; first += 1) {
    for (let second = 0; second < 11; second += 1) {
      const visited = first !== second && Math.min(first, second) < 2;
      const expected = visited ? distanceOracle((second - first) * 3, (second - first) * 4) : 0xfefefefe;
      assert.equal(words[matrix + first * 11 + second], expected);
    }
  }
  const before = words.slice(matrix, matrix + 121);
  assert.equal(core.fifa98_distance_rows(workspace * 4, 11, 2, 0, matrix * 4), 2);
  assert.deepEqual(words.subarray(matrix, matrix + 121), before);
  // A one-entity side has no pairs, but its rolling index still becomes one.
  assert.equal(core.fifa98_distance_rows(workspace * 4, 1, 0, 1, matrix * 4), 1);
  assert.equal(core.fifa98_distance_rows(workspace * 4, 1, 1, 65535, matrix * 4), 1);
  assert.deepEqual(words.subarray(matrix, matrix + 121), before);
});

test('distance storage validation rejects invalid domains before any write', () => {
  const matrix = workspace + 64;
  words.fill(0xf0f0f0f0, workspace, workspace + 512);
  const before = words.slice(workspace, workspace + 512);
  for (const [count, row, ticks] of [[0, 0, 1], [12, 0, 1], [3, 4, 1], [3, 0, 65536], [3, 0, -1]]) {
    assert.equal(core.fifa98_distance_rows(workspace * 4, count, row, ticks, matrix * 4) >>> 0, 0xffffffff);
    assert.deepEqual(words.subarray(workspace, workspace + 512), before);
  }
  assert.equal(core.fifa98_distance_rows(0, 3, 0, 1, matrix * 4) >>> 0, 0xffffffff);
  assert.equal(core.fifa98_distance_rows(workspace * 4, 3, 0, 1, 0) >>> 0, 0xffffffff);
  assert.equal(core.fifa98_match_workspace_words(), 512);
});

test('original fractional clock handles exact ticks, sub-ticks, carry and full wrap', () => {
  const clock = workspace + 256;
  for (const [whole, fraction, delta] of [
    [0, 0, 0], [0, 0, 1], [0, 0xffff, 1], [7, 0x8000, 0x8000],
    [0xffffffff, 0xffff, 1], [5, 0xffffffff, 1], [0xffffffff, 0x12345678, 0x87654321],
  ]) {
    const sum = BigInt.asUintN(32, BigInt(fraction) + BigInt(delta));
    const expected = [unsigned(BigInt(whole) + sum / 65536n), Number(sum % 65536n)];
    words.set([whole, fraction], clock);
    core.fifa98_tick_accumulate(clock * 4, delta);
    assert.deepEqual([...words.subarray(clock, clock + 2)], expected);
  }
  words.set([0, 0], clock);
  for (let index = 0; index < 1000; index += 1) core.fifa98_tick_accumulate(clock * 4, 0x1999);
  assert.deepEqual([...words.subarray(clock, clock + 2)], [Math.floor(1000 * 0x1999 / 65536), 1000 * 0x1999 % 65536]);
});

const signed = (value) => BigInt.asIntN(32, BigInt(value >>> 0));
const fixedOracle = (left, right) => unsigned((signed(left) * signed(right) + 32768n) >> 16n);
function airOracle(velocity, gravity) {
  const result = velocity.map((value) => unsigned(BigInt(value >>> 0) - BigInt(fixedOracle(203, value))));
  result[1] = unsigned(BigInt(result[1]) + signed(gravity) / 3600n);
  return result;
}

test('resident rounded fixed multiply matches independent BigInt products, including negative ties', () => {
  const values = [0, 1, -1, 32768, -32768, 65536, -65536, 0x7fffffff, 0x80000000, 0xffffffff];
  for (const left of values) for (const right of values) {
    assert.equal(core.fifa98_fixed_multiply(left, right) >>> 0, fixedOracle(left, right));
  }
  assert.equal(core.fifa98_fixed_multiply(1, 32768), 1);
  assert.equal(core.fifa98_fixed_multiply(-1, 32768), 0, 'Negative half-way product rounds toward positive infinity');
  let value = 0xf198;
  for (let index = 0; index < 20000; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const left = value;
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    assert.equal(core.fifa98_fixed_multiply(left, value) >>> 0, fixedOracle(left, value));
  }
});

test('spin-free air branch uses original drag rounding and signed gravity division', () => {
  const velocity = workspace + 256;
  for (const gravity of [0, 1, -1, -33554432, 33554432, 0x7fffffff, 0x80000000]) {
    for (const vector of [[0, 0, 0], [65536, 131072, -65536], [0x7fffffff, 0x80000000, -1]]) {
      words.set(vector, velocity);
      const expected = airOracle(vector, gravity);
      core.fifa98_ball_air_drag(velocity * 4, gravity);
      assert.deepEqual([...words.subarray(velocity, velocity + 3)], expected);
    }
  }
  words.set([0, 0, 0], velocity);
  core.fifa98_ball_air_drag(velocity * 4, -33554432);
  assert.equal(words[velocity + 1], (-9320) >>> 0);
  let state = 0x1987;
  for (let index = 0; index < 20000; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    words.set([0, 0, 0], velocity);
    core.fifa98_ball_air_drag(velocity * 4, state);
    assert.equal(words[velocity + 1], unsigned(signed(state) / 3600n));
  }
});

test('bounded original air blocks advance a trajectory and stop before ground contact', () => {
  const state = workspace + 256;
  let expected = [65536, 50 * 65536, -3 * 65536, 2 * 65536, 3 * 65536, -65536, 0, 0, 0].map((value) => value >>> 0);
  words.set(expected, state);
  let contact = false;
  for (let tick = 0; tick < 360; tick += 1) {
    const next = expected.slice(0, 3).map((position, axis) => signed(position) + signed(expected[axis + 3]));
    if (next[1] <= 0) {
      assert.equal(core.fifa98_ball_free_tick(state * 4, -33554432), 0);
      assert.deepEqual([...words.subarray(state, state + 9)], expected);
      contact = true;
      break;
    }
    expected = [...next.map(unsigned), ...airOracle(expected.slice(3, 6), -33554432), ...expected.slice(0, 3)];
    assert.equal(core.fifa98_ball_free_tick(state * 4, -33554432), 1);
    assert.deepEqual([...words.subarray(state, state + 9)], expected);
    assert.ok(signed(words[state + 1]) > 0);
  }
  assert.equal(contact, true, 'The original gravity branch brings this invented test launch back to the ground');
});

test('free-flight wrapper leaves state intact at contact and overflow boundaries', () => {
  const state = workspace + 256;
  for (const [values, result] of [
    [[0, 65536, 0, 0, -65536, 0, 1, 2, 3], 0],
    [[0, 0, 0, 65536, 0, 0, 1, 2, 3], 0],
    [[0, -1, 0, 0, 65536, 0, 1, 2, 3], 0],
    [[0x7fffffff, 65536, 0, 1, 0, 0, 1, 2, 3], -1],
    [[0, 0x7fffffff, 0, 0, 1, 0, 1, 2, 3], -1],
  ]) {
    words.set(values, state);
    const before = words.slice(state, state + 9);
    assert.equal(core.fifa98_ball_free_tick(state * 4, -33554432), result);
    assert.deepEqual(words.subarray(state, state + 9), before);
  }
  assert.equal(core.fifa98_ball_free_tick(0, -33554432), -1);
  words.set([0, 0, 0, 0, 65536, 0, 1, 2, 3], state);
  assert.equal(core.fifa98_ball_free_tick(state * 4, -33554432), 1, 'An upward launch from zero can enter free flight');
  assert.equal(words[state + 1], 65536);
});

const surfaceTables = [
  [0x9eb8,0x9eb8,0x9eb8,0x9eb8,0x9eb8,0x9999,0xa666,0x8000,0x4000,0x8ccc],
  [0xbae1,0xbae1,0xbae1,0xbae1,0xbae1,0xb851,0xb851,0xb333,0xe666,0xc000],
  [0xfd70,0xfd70,0xfd70,0xfd70,0xfd70,0xfae1,0xfd70,0xf5c2,0xf333,0xf851],
];
function groundDragOracle(velocity, retention) {
  const result = [fixedOracle(velocity[0], retention), velocity[1] >>> 0, fixedOracle(velocity[2], retention)];
  const abs32 = (value) => BigInt.asIntN(32, signed(value) < 0n ? -signed(value) : signed(value));
  const sum = BigInt.asIntN(32, signed(result[0]) ** 2n + signed(result[2]) ** 2n);
  if (abs32(result[0]) < 6553n && abs32(result[2]) < 6553n && sum <= 0x028f3d70n) {
    result[0] = 0;
    result[2] = 0;
  }
  return result;
}
function groundContactOracle(state, material) {
  const result = state.map((word) => word >>> 0);
  if (signed(result[1]) >= 0n) return { state: result, contact: false };
  result[1] = 0;
  result[4] = unsigned(-BigInt(fixedOracle(result[4], material[0])));
  result[3] = fixedOracle(result[3], material[1]);
  result[5] = fixedOracle(result[5], material[1]);
  if (signed(result[4]) <= 0xbfffn) result[4] = 0;
  return { state: result, contact: true };
}

test('surface values retain original indexed tables without inferred setting names', () => {
  const material = workspace + 300;
  for (let row = 0; row < 2; row += 1) for (let column = 0; column < 5; column += 1) {
    words.fill(0xfeedcafe, material, material + 4);
    assert.equal(core.fifa98_ball_surface_material(row, column, material * 4), 1);
    assert.deepEqual([...words.subarray(material, material + 4)], [...surfaceTables.map((table) => table[row * 5 + column]), 0xfeedcafe]);
  }
  const before = words.slice(material, material + 4);
  for (const [row, column] of [[2, 0], [0, 5], [-1, 0], [0, -1]]) {
    assert.equal(core.fifa98_ball_surface_material(row, column, material * 4), 0);
    assert.deepEqual(words.subarray(material, material + 4), before);
  }
  assert.equal(core.fifa98_ball_surface_material(0, 0, 0), 0);
});

test('isolated ground branch clamps only negative height and preserves exact bounce cutoff', () => {
  const state = workspace + 256, material = workspace + 300;
  words.set([65536, 65536, 65536], material);
  for (const height of [-65536, -1, 0, 1]) for (const vertical of [-0xbfff, -0xc000, -65536, 0, 65536, 0x80000000]) {
    const initial = [100, height, -200, 131072, vertical, -65536, 17, 18, 19];
    const expected = groundContactOracle(initial, [65536, 65536, 65536]);
    words.set(initial, state);
    assert.equal(core.fifa98_ball_ground_contact(state * 4, material * 4), Number(expected.contact));
    assert.deepEqual([...words.subarray(state, state + 9)], expected.state);
  }
  const before = words.slice(state, state + 9);
  assert.equal(core.fifa98_ball_ground_contact(state * 4, 0), -1);
  assert.deepEqual(words.subarray(state, state + 9), before);
  assert.equal(core.fifa98_ball_ground_contact(0, material * 4), -1);
  let random = 0xb098;
  for (let iteration = 0; iteration < 10000; iteration += 1) {
    const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
    const initial = Array.from({ length: 9 }, next);
    const coefficients = Array.from({ length: 3 }, next);
    words.set(initial, state); words.set(coefficients, material);
    const expected = groundContactOracle(initial, coefficients);
    assert.equal(core.fifa98_ball_ground_contact(state * 4, material * 4), Number(expected.contact));
    assert.deepEqual([...words.subarray(state, state + 9)], expected.state);
  }
});

test('complete ground drag preserves square-sum stop test, rounding and wrapped edge cases', () => {
  const velocity = workspace + 256;
  for (const initial of [[0, 17, 0], [6552, 17, 0], [6553, 17, 0], [6000, 17, 4000], [-6000, 17, -4000], [0x80000000, 17, 0x80000000]]) {
    words.set(initial, velocity);
    core.fifa98_ball_ground_drag(velocity * 4, 65536);
    assert.deepEqual([...words.subarray(velocity, velocity + 3)], groundDragOracle(initial, 65536));
  }
  let random = 0x98f1;
  for (let iteration = 0; iteration < 20000; iteration += 1) {
    const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
    const initial = Array.from({ length: 3 }, next), retention = next();
    words.set(initial, velocity);
    core.fifa98_ball_ground_drag(velocity * 4, retention);
    assert.deepEqual([...words.subarray(velocity, velocity + 3)], groundDragOracle(initial, retention));
  }
});

test('isolated no-spin surface composition continues original bounce and rolling paths to rest', () => {
  const state = workspace + 256, material = workspace + 300;
  const coefficients = surfaceTables.map((table) => table[0]);
  words.set(coefficients, material);
  let expected = [65536, 10 * 65536, -3 * 65536, 2 * 65536, 3 * 65536, -65536, 0, 0, 0].map((value) => value >>> 0);
  words.set(expected, state);
  let contacts = 0, stopped = false, rolling = false;
  for (let tick = 0; tick < 1000; tick += 1) {
    let next = [...expected.slice(0, 3).map((position, axis) => unsigned(signed(position) + signed(expected[axis + 3]))), ...expected.slice(3, 6), ...expected.slice(0, 3)];
    const contact = groundContactOracle(next, coefficients);
    next = contact.state;
    if (next[1] !== 0 || next[4] !== 0) next.splice(3, 3, ...airOracle(next.slice(3, 6), -33554432));
    else if (next[3] !== 0 || next[5] !== 0) { next.splice(3, 3, ...groundDragOracle(next.slice(3, 6), coefficients[2])); rolling = true; }
    expected = next;
    assert.equal(core.fifa98_ball_surface_tick(state * 4, -33554432, material * 4), contact.contact ? 2 : 1);
    assert.deepEqual([...words.subarray(state, state + 9)], expected);
    if (contact.contact) contacts += 1;
    assert.ok(signed(expected[1]) >= 0n);
    if (expected.slice(3, 6).every((word) => word === 0) && expected[1] === 0) { stopped = true; break; }
  }
  assert.ok(contacts >= 2, 'The invented test launch takes repeated original ground branches');
  assert.equal(rolling, true); assert.equal(stopped, true);
});

test('surface wrapper keeps strict negative contact guard and rejects invalid domains before writes', () => {
  const state = workspace + 256, material = workspace + 300;
  words.set([65536, 65536, 65536], material);
  words.set([0, 65536, 0, 0, -65536, 0, 1, 2, 3], state);
  assert.equal(core.fifa98_ball_surface_tick(state * 4, 0, material * 4), 1, 'An exact Y=0 landing does not enter original Y<0 branch');
  assert.equal(words[state + 1], 0); assert.ok(signed(words[state + 4]) < 0n);
  assert.equal(core.fifa98_ball_surface_tick(state * 4, 0, material * 4), 2);
  assert.equal(words[state + 1], 0); assert.ok(signed(words[state + 4]) > 0n);
  for (const [values, result] of [
    [[0, -1, 0, 0, 0, 0, 1, 2, 3], 0],
    [[0x7fffffff, 65536, 0, 1, 0, 0, 1, 2, 3], -1],
    [[0, 0, 0x80000000, 0, 0, -1, 1, 2, 3], -1],
  ]) {
    words.set(values, state);
    const before = words.slice(state, state + 9);
    assert.equal(core.fifa98_ball_surface_tick(state * 4, 0, material * 4), result);
    assert.deepEqual(words.subarray(state, state + 9), before);
  }
  const before = words.slice(state, state + 9);
  assert.equal(core.fifa98_ball_surface_tick(state * 4, 0, 0), -1);
  assert.deepEqual(words.subarray(state, state + 9), before);
  assert.equal(core.fifa98_ball_surface_tick(0, 0, material * 4), -1);
});

