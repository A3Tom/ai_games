import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { recoverPcmdDirectPosition, recoverPcmdUv, recoverPcmdQuaternionMatrix } from '../scripts/models.mjs'

const buildDirectory = new URL('../.engine-build/', import.meta.url)
let bytes
try { bytes = await readFile(new URL('fifa98-core.wasm', buildDirectory)) }
catch (error) { throw new Error('Build the native module first: node games/fifa98/scripts/build-native.mjs', { cause: error }) }
const manifest = JSON.parse(await readFile(new URL('build.json', buildDirectory), 'utf8'))
const module = await WebAssembly.compile(bytes)
const core = (await WebAssembly.instantiate(module)).exports

test('native model conversion binary matches the reviewed C source', async () => {
  const source = await readFile(new URL('./model.c', import.meta.url))
  const sha256 = (data) => createHash('sha256').update(data).digest('hex')
  assert.equal(manifest.sources.find((entry) => entry.path === 'model.c')?.sha256, sha256(source), 'Rebuild after changing model.c')
  assert.equal(manifest.wasmSha256, sha256(bytes))
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('native recovered PCMD conversions match signed boundaries and independent integer oracles', () => {
  const signed16 = (value) => Number(BigInt.asIntN(16, BigInt(value)))
  const position = (value, axis) => signed16((axis === 0 ? -1 : 1) * Math.floor(value / 32768))
  const uv = (value, vertical) => {
    const converted = Math.floor(Math.max(0, Math.min(65536, value)) / 256)
    return vertical ? 256 - converted : converted
  }
  const cases = [-2147483648, -2147483647, -65537, -65536, -32769, -32768, -1, 0, 1, 255, 256, 32767, 32768, 65535, 65536, 2147483647]
  let state = 0x98a15
  for (let index = 0; index < 10000; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0
    cases.push(state)
  }
  for (const raw of cases) {
    for (let axis = 0; axis < 3; axis++) {
      assert.equal(core.fifa98_pcmd_position_component(raw, axis), position(raw, axis))
      assert.equal(core.fifa98_pcmd_position_component(raw, axis), recoverPcmdDirectPosition([raw, raw, raw])[axis])
    }
    for (let vertical = 0; vertical < 2; vertical++) {
      assert.equal(core.fifa98_pcmd_uv_component(raw, vertical), uv(raw, vertical))
      assert.equal(core.fifa98_pcmd_uv_component(raw, vertical), recoverPcmdUv(raw, raw)[vertical ? 'v256' : 'u256'])
    }
  }
})

test('native quaternion coefficients match the original low-word arithmetic and diagonal', () => {
  const input = new Int32Array(core.memory.buffer, core.fifa98_pcmd_quaternion(), 4)
  const output = new Int32Array(core.memory.buffer, core.fifa98_pcmd_matrix(), 9)
  const product = (left, right) => Number(BigInt.asIntN(32, BigInt(left) * BigInt(right) * 2n) >> 12n)
  const oracle = ([x, y, z, w]) => {
    const xx = product(x, x), yy = product(y, y), zz = product(z, z)
    const wx = product(w, x), wy = product(w, y), wz = product(w, z)
    const xy = product(x, y), xz = product(x, z), yz = product(y, z)
    return [4095 - yy - zz, xy + wz, xz - wy, xy - wz, 4095 - xx - zz,
      wx + yz, xz + wy, yz - wx, 4095 - xx - yy].map((value) => Number(BigInt.asIntN(16, BigInt(value))))
  }
  const cases = [[0, 0, 0, 4096], [4096, 0, 0, 0], [0, 0, 2896, 2896], [-524288, 524272, -524288, 524272]]
  let state = 0x98b12
  for (let sample = 0; sample < 10000; sample++) {
    const row = []
    for (let index = 0; index < 4; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) | 0
      row.push((state << 16 >> 16) * 16)
    }
    cases.push(row)
  }
  for (const quaternion of cases) {
    input.set(quaternion)
    assert.equal(core.fifa98_pcmd_quaternion_matrix(), 1)
    assert.deepEqual([...output], oracle(quaternion))
    assert.deepEqual([...output], recoverPcmdQuaternionMatrix(quaternion))
  }
  input[0] = 524288
  assert.equal(core.fifa98_pcmd_quaternion_matrix(), 0)
})
