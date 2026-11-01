import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectPitchRecovery, pitchNativeExports } from './pitch-recovery.mjs'
import { createPitchGeometry, pitchProfiles } from './pitch.mjs'

test('unknown, modified and truncated backends receive no pitch source claims', () => {
  for (const data of [new Uint8Array(), new Uint8Array(128), new Uint8Array(939136)]) {
    const result = inspectPitchRecovery(data)
    assert.equal(result.status, 'unsupported')
    assert.deepEqual(result.routines, [])
    assert.deepEqual(result.profiles, [])
  }
  assert.throws(() => inspectPitchRecovery({}), /Uint8Array/)
  assert.ok(pitchNativeExports.includes('fifa98_pitch_generate'))
})

test('explicit default profile produces original grid arithmetic, halfwords and quad topology', () => {
  const grid = createPitchGeometry()
  assert.equal(grid.profile, 2); assert.equal(grid.margin, 192)
  assert.equal(grid.vertices.length, 192); assert.equal(grid.quads.length, 165)
  assert.deepEqual(grid.vertices[0], [3840, 0, 5280])
  assert.deepEqual(grid.vertices[1], [3142, 0, 5280])
  assert.deepEqual(grid.vertices[12], [3840, 0, 4576])
  assert.deepEqual(grid.vertices[191], [-3838, 0, -5280])
  assert.deepEqual(grid.quads[0], [0, 1, 12, 13])
  assert.deepEqual(grid.quads[164], [178, 179, 190, 191])
  assert.deepEqual(grid.uv, [[256, 0], [0, 0], [256, 256], [0, 256]])
  assert.equal(new Set(grid.quads.flat()).size, 192)
})

test('profiles remain explicit and unsupported stateful modes/margins are refused', () => {
  for (let profile = 0; profile < 5; profile++) {
    const grid = createPitchGeometry({ profile, margin: 0 })
    assert.deepEqual(grid.vertices[0], [pitchProfiles[profile][0], 0, pitchProfiles[profile][1]])
  }
  for (const profile of [-1, 5, 1.5, NaN]) assert.throws(() => createPitchGeometry({ profile }), /profile/)
  for (const margin of [-1, 30000, 0.5, Infinity]) assert.throws(() => createPitchGeometry({ margin }), /margin/)
  assert.throws(() => createPitchGeometry({ nativeCore: {} }), /export is missing/)
})
