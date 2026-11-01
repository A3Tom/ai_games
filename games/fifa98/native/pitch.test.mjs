import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createPitchGeometry, pitchProfiles } from '../scripts/pitch.mjs'
import { pitchNativeExports } from '../scripts/pitch-recovery.mjs'

const directory = new URL('../.engine-build/', import.meta.url)
const bytes = await readFile(new URL('fifa98-core.wasm', directory))
const manifest = JSON.parse(await readFile(new URL('build.json', directory), 'utf8'))
const module = await WebAssembly.compile(bytes)
const core = (await WebAssembly.instantiate(module)).exports
for (const name of pitchNativeExports) assert.equal(typeof core[name], 'function', `Rebuild with pitch.c: missing ${name}`)

test('pitch module source and WASM match build integrity records without runtime imports', async () => {
  const hash = (value) => createHash('sha256').update(value).digest('hex')
  assert.equal(manifest.sources.find((entry) => entry.path === 'pitch.c')?.sha256, hash(await readFile(new URL('./pitch.c', import.meta.url))))
  assert.equal(manifest.wasmSha256, hash(bytes))
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('all five explicit original profiles match independent JS geometry for both margin choices', () => {
  for (let profile = 0; profile < 5; profile++) for (const margin of [0, 192]) {
    for (let axis = 0; axis < 2; axis++) assert.equal(core.fifa98_pitch_profile_extent(profile, axis), pitchProfiles[profile][axis])
    assert.deepEqual(createPitchGeometry({ profile, margin, nativeCore: core }), createPitchGeometry({ profile, margin }))
  }
  assert.equal(core.fifa98_pitch_profile_extent(5, 0), -1)
  assert.equal(core.fifa98_pitch_profile_extent(2, 2), -1)
  assert.equal(core.fifa98_pitch_vertex_capacity(), 192)
  assert.equal(core.fifa98_pitch_quad_capacity(), 165)
})

test('native grid preserves signed sorting, truncating steps and halfword wrap for arbitrary 32-bit bounds', () => {
  const cases = [[0, 0, 0, 0], [1, -1, -1, 1], [100, 200, -100, -200], [-32768, -32768, 32767, 32767],
    [-2147483648, -2147483648, 2147483647, 2147483647], [2147483647, 1, 0, -2147483648]]
  let state = 0x98fa12
  for (let index = 0; index < 200; index++) cases.push(Array.from({ length: 4 }, () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return state }))
  for (const [x0, z0, x1, z1] of cases) {
    assert.equal(core.fifa98_pitch_generate(x0, z0, x1, z1), 192)
    const actual = new Int16Array(core.memory.buffer, core.fifa98_pitch_vertices(), 192 * 3)
    const maxX = BigInt(Math.max(x0, x1)), maxZ = BigInt(Math.max(z0, z1))
    const stepX = BigInt.asIntN(32, maxX - BigInt(Math.min(x0, x1))) / 11n
    const stepZ = BigInt.asIntN(32, maxZ - BigInt(Math.min(z0, z1))) / 15n
    for (let index = 0; index < 192; index++) {
      const column = BigInt(index % 12), row = BigInt(Math.floor(index / 12))
      assert.deepEqual([...actual.subarray(index * 3, index * 3 + 3)], [Number(BigInt.asIntN(16, maxX - column * stepX)), 0, Number(BigInt.asIntN(16, maxZ - row * stepZ))])
    }
  }
})
