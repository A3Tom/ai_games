import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inspectBallInteractionRecovery } from '../scripts/ball-interaction-recovery.mjs';

const directory = new URL('../.engine-build/', import.meta.url);
const bytes = await readFile(new URL('fifa98-core.wasm', directory));
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'));
const module = await WebAssembly.compile(bytes), core = (await WebAssembly.instantiate(module)).exports;
if (!core.fifa98_ball_ground_launch) throw new Error('Rebuild main Wasm with native/ball-interaction.c before these tests');
const base = core.fifa98_control_workspace();
const memory = new Uint32Array(core.memory.buffer, base, core.fifa98_control_workspace_words());
const ptr = (offset) => base + offset * 4;
const at = { atan8: 0, atan16: 72, sine: 336, exp: 600, position: 752, target: 756, output: 780 };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const u = (value) => Number(BigInt.asUintN(32, BigInt(value)));
const s = (value) => BigInt.asIntN(32, BigInt(value >>> 0));
const multiply = (left, right) => u((s(left) * s(right) + 32768n) >> 16n);
const reciprocal = (value) => {
  const positive = BigInt(value);
  return Number(0xffffffffn / positive + (0xffffffffn % positive > positive / 2n ? 1n : 0n));
};
const synthetic = {
  atan8: Array.from({ length: 257 }, (_, index) => Math.floor(index / 2)),
  atan16: Array.from({ length: 257 }, (_, index) => index * 32),
  sine: Array.from({ length: 257 }, (_, index) => index * 256),
  exponential: Array.from({ length: 113 }, (_, index) => 65536 + (index + 1) * 700),
};
function load(tables = synthetic) {
  new Uint8Array(core.memory.buffer, base, 257).set(tables.atan8);
  memory.set(tables.atan16, at.atan16); memory.set(tables.sine, at.sine);
  memory.set(tables.exponential, at.exp);
}
function headingOracle(dx, dz, table) {
  const x = s(dx), z = s(dz), ax = x < 0n ? -x : x, az = z < 0n ? -z : z;
  if (ax === az) {
    const a = 8192;
    return x < 0n ? z < 0n ? -32768 + a : -a : z < 0n ? 32768 - a : a;
  }
  const minor = ax < az ? ax : az, major = ax < az ? az : ax;
  const ratio = (minor << 32n) / major;
  const index = Number(ratio >> 24n), fraction = (ratio >> 8n) & 65535n;
  const small = table[index] + Number(BigInt.asUintN(32, BigInt(table[index + 1] - table[index]) * fraction) >> 16n);
  const quadrant = ax > az ? 16384 - small : small;
  return x < 0n ? z < 0n ? quadrant - 32768 : -quadrant : z < 0n ? 32768 - quadrant : quadrant;
}
function coarseOracle(angle, quarter) {
  const normalized = Number(BigInt.asUintN(10, BigInt(angle)));
  const remainder = normalized % 256;
  return normalized < 256 ? [quarter[remainder], quarter[256 - remainder]] :
    normalized < 512 ? [quarter[256 - remainder], -quarter[remainder]] :
      normalized < 768 ? [-quarter[remainder], -quarter[256 - remainder]] :
        [-quarter[256 - remainder], quarter[remainder]];
}
function vectorOracle(angle, quarter) {
  const [sin, cos] = coarseOracle(s(angle) >> 6n, quarter);
  const low = BigInt(angle & 63);
  // Independent expansion of the original shift/add coefficient sequence.
  const first = (low * 3n * 65n * 32n - low) * 33n * 2n >> 9n;
  return [u(BigInt(sin) + (s(u((BigInt(cos) >> 2n) * first)) >> 21n)),
    u(BigInt(cos) + (s(u((-BigInt(sin) >> 2n) * first)) >> 21n))];
}
function exponentialOracle(input, table) {
  if (input === 0n) return 65536;
  if (input < -681391n) return 0;
  let magnitude = -input, result = 0, row = 0;
  do {
    const digit = Number(magnitude % 32n);
    if (digit) result = result ? multiply(result, table[row * 31 + digit - 1]) : table[row * 31 + digit - 1];
    row++; magnitude /= 32n;
  } while (magnitude);
  return reciprocal(result);
}
function speedOracle(distance, parameter, table) {
  if (parameter === 0) return 15 * 65536;
  const numerator = multiply(distance * 65536, 5242);
  const exponent = s(multiply(u(-677890), parameter * 65536)) >> 9n;
  const denominator = 65536n - BigInt(exponentialOracle(exponent, table));
  return u(s(u((BigInt(numerator) << 16n) / denominator)) >> 2n);
}
function lengthOracle(dx, dz, tables) {
  const ax = BigInt(Math.abs(dx)), az = BigInt(Math.abs(dz));
  const smaller = ax < az ? ax : az, larger = ax < az ? az : ax;
  const smallAngle = ax === az ? 128 : tables.atan8[Number((smaller * 256n + larger / 2n) / larger)];
  const angle = ax >= az ? smallAngle : 256 - smallAngle;
  // Quantization can place unequal axes exactly at angle128; the source then
  // chooses X, even when Z was the slightly larger axis.
  const axis = angle <= 128 ? ax : az;
  const trig = angle <= 128 ? tables.sine[256-angle] : tables.sine[angle];
  return Number((axis << 15n) / (BigInt(trig) >> 1n));
}
function launchOracle(position, target, parameter, tables) {
  const dx = u(BigInt(target[0]) * 65536n - BigInt(position[0]));
  const dz = u(BigInt(target[2]) * 65536n - BigInt(position[2]));
  const distance = lengthOracle(Number(s(dx) >> 16n), Number(s(dz) >> 16n), tables);
  let speed = speedOracle(distance, parameter, tables.exponential);
  const flag = s(speed) > 25n * 65536n ? 1 : 0;
  if (flag) speed = 35 * 65536;
  const angle = headingOracle(dx, dz, tables.atan16), vector = vectorOracle(u(angle), tables.sine);
  return { flag, output: [multiply(speed, vector[0]), 0, multiply(speed, vector[1]), speed, distance, u(angle)] };
}
function callLaunch(position, target, parameter) {
  memory.set(position.map(u), at.position); memory.set(target.map(u), at.target);
  const flag = core.fifa98_ball_ground_launch(ptr(at.position), ptr(at.target), parameter,
    ptr(at.atan8), ptr(at.atan16), ptr(at.sine), ptr(at.exp), ptr(at.output));
  return { flag, output: Array.from(memory.slice(at.output, at.output + 6)) };
}
let random = 0x98abc123;
const next = () => { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return random >>> 0; };

test('ball-interaction native source/Wasm hashes match and module has no imports', async () => {
  assert.equal(manifest.sources.find((source) => source.path === 'ball-interaction.c')?.sha256, hash(await readFile(new URL('./ball-interaction.c', import.meta.url))), 'Rebuild after changing ball-interaction.c');
  assert.equal(manifest.wasmSha256, hash(bytes));
  assert.deepEqual(WebAssembly.Module.imports(module), []);
});

test('stored action target masks distance, wraps integer axes and preserves the existing Y', () => {
  load();
  for (let heading = -32768; heading <= 32767; heading++) {
    const distanceWord = next(), position = [next(), next(), next()];
    memory.set(position, at.position); memory.set([0,0x98abc123,0], at.output);
    const vector = coarseOracle(heading,synthetic.sine);
    assert.equal(core.fifa98_ball_action_target(ptr(at.position),distanceWord,heading,ptr(at.sine),ptr(at.output)),1);
    assert.deepEqual(Array.from(memory.slice(at.output,at.output+3)),[
      u(BigInt(position[0])+BigInt(multiply(distanceWord&0x7ffff,u(vector[0])))),
      0x98abc123,
      u(BigInt(position[2])+BigInt(multiply(distanceWord&0x7ffff,u(vector[1])))),
    ]);
  }
  const before=memory.slice(at.output,at.output+3);
  for(const [p,h,t,o] of [[0,0,ptr(at.sine),ptr(at.output)],[ptr(at.position),32768,ptr(at.sine),ptr(at.output)],
    [ptr(at.position),-32769,ptr(at.sine),ptr(at.output)],[ptr(at.position),0,0,ptr(at.output)],
    [ptr(at.position),0,ptr(at.sine),0]]) {
    assert.equal(core.fifa98_ball_action_target(p,123,h,t,o),0);
    assert.deepEqual(memory.slice(at.output,at.output+3),before);
  }
});

test('original heading16 preserves quadrants, ratio interpolation, zero pair and rejects INT_MIN', () => {
  load();
  const fixture = [0,1,256,65536,0x7fffffff,0xffffffff,0xffff0000,0x80000001];
  for (const x of fixture) for (const z of fixture) assert.equal(core.fifa98_ball_heading16(x,z,ptr(at.atan16)), headingOracle(x,z,synthetic.atan16) | 0);
  for (let index = 0; index < 6000; index++) {
    const x = next() || 1, z = next() || 1;
    if (x === 0x80000000 || z === 0x80000000) continue;
    assert.equal(core.fifa98_ball_heading16(x,z,ptr(at.atan16)), headingOracle(x,z,synthetic.atan16) | 0);
  }
  assert.equal(core.fifa98_ball_heading16(0,0,ptr(at.atan16)),8192);
  assert.equal(core.fifa98_ball_heading16(1,0,0),-2147483648);
  assert.equal(core.fifa98_ball_heading16(0x80000000,1,ptr(at.atan16)),-2147483648);
});

test('corrected sine/cosine match every source angle low16 and signed wrapping', () => {
  load();
  for (let angle = 0; angle < 65536; angle++) {
    assert.equal(core.fifa98_ball_heading_vector16(angle,ptr(at.sine),ptr(at.output)),1);
    assert.deepEqual(Array.from(memory.slice(at.output,at.output+2)),vectorOracle(angle,synthetic.sine));
  }
  for (const angle of [0xffffffff,0x80000000,0x7fffffff,0xfffffff0]) {
    core.fifa98_ball_heading_vector16(angle,ptr(at.sine),ptr(at.output));
    assert.deepEqual(Array.from(memory.slice(at.output,at.output+2)),vectorOracle(angle,synthetic.sine));
  }
  const before = memory.slice(at.output,at.output+2);
  assert.equal(core.fifa98_ball_heading_vector16(4,0,ptr(at.output)),0);
  assert.deepEqual(memory.slice(at.output,at.output+2),before);
  assert.equal(core.fifa98_ball_heading_vector16(4,ptr(at.sine),0),0);
});

test('bounded speed formula matches BigInt quotient, source exponent cutoff and word wrap', () => {
  load();
  for (let parameter = 0; parameter <= 3167; parameter++) {
    const distance = next() % 32768;
    assert.equal(core.fifa98_ball_ground_launch_speed(distance,parameter,ptr(at.exp),ptr(at.output)),1);
    assert.equal(memory[at.output],speedOracle(distance,parameter,synthetic.exponential));
  }
  for (const distance of [0,1,192,32767]) for (const parameter of [0,1,10,514,515,3167]) {
    core.fifa98_ball_ground_launch_speed(distance,parameter,ptr(at.exp),ptr(at.output));
    assert.equal(memory[at.output],speedOracle(distance,parameter,synthetic.exponential));
  }
  const before = memory[at.output];
  for (const [d,p,e,o] of [[32768,1,ptr(at.exp),ptr(at.output)],[1,3168,ptr(at.exp),ptr(at.output)],[1,1,0,ptr(at.output)],[1,1,ptr(at.exp),0]]) {
    assert.equal(core.fifa98_ball_ground_launch_speed(d,p,e,o),0); assert.equal(memory[at.output],before);
  }
});

test('ground launch exactly composes source length, speed fallback, heading and velocity with atomic guards', () => {
  load();
  for (let index = 0; index < 5000; index++) {
    const position = [u((next()%5000-2500)*65536 + (next()&65535)), next(), u((next()%5000-2500)*65536 + (next()&65535))];
    const target = [next()%5000-2500, next(), next()%5000-2500], parameter = next()%3168;
    assert.deepEqual(callLaunch(position,target,parameter),launchOracle(position,target,parameter,synthetic),JSON.stringify({position,target,parameter}));
  }
  const before = memory.slice(at.output,at.output+6);
  for (const [position,target,parameter] of [[[0,0,0],[32768,0,0],10], [[0,0,0],[-32768,0,0],10],
    [[u(-32767*65536),0,u(-32767*65536)],[0,0,0],10], [[0,0,0],[0,0,1],3168]]) {
    assert.equal(callLaunch(position,target,parameter).flag,-1);
    assert.deepEqual(memory.slice(at.output,at.output+6),before);
  }
  assert.equal(core.fifa98_ball_ground_launch(0,ptr(at.target),10,ptr(at.atan8),ptr(at.atan16),ptr(at.sine),ptr(at.exp),ptr(at.output)),-1);
  assert.deepEqual(memory.slice(at.output,at.output+6),before);
});

test('fingerprinted original launch tables validate real source inputs and retain25-to35 behavior', async (t) => {
  let backend, boot;
  try { [backend,boot] = await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN',import.meta.url)),readFile(new URL('../.work/reference/disc/SLES_009.14',import.meta.url))]); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('Local reference images not extracted'); return; } throw error; }
  const report = inspectBallInteractionRecovery(backend,boot);
  assert.equal(report.status,'reconstruction-only');
  const tables = Object.fromEntries(Object.entries(report.tables).map(([id,table]) => [id,table.values]));
  load(tables);
  for (const target of [[0,0,192],[192,99,0],[192,0,192],[-192,0,-192],[500,0,0],[0,0,0]]) {
    assert.deepEqual(callLaunch([0,0,0],target,10),launchOracle([0,0,0],target,10,tables));
  }
  assert.equal(callLaunch([0,0,0],[192,0,0],10).flag,0);
  const fallback = callLaunch([0,0,0],[500,0,0],10);
  assert.equal(fallback.flag,1); assert.equal(fallback.output[3],35*65536);
  for (let parameter = 1; parameter <= 3167; parameter++) {
    core.fifa98_ball_ground_launch_speed(192,parameter,ptr(at.exp),ptr(at.output));
    assert.equal(memory[at.output],speedOracle(192,parameter,tables.exponential));
  }
  assert.equal(report.constants.wrapperCapQ16,25*65536);
  assert.equal(report.inspectionFixture.parameter,10);
});
