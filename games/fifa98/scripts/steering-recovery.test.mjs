import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inspectSteeringRecovery, steeringNativeExports } from './steering-recovery.mjs'

test('unknown, truncated and malformed images cannot acquire a steering profile', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array(939135), new Uint8Array(939136)]) {
    const result = inspectSteeringRecovery(bytes)
    assert.equal(result.status, 'unsupported')
    assert.equal(result.profile, undefined)
    assert.deepEqual(result.regions, []); assert.deepEqual(result.tables, {}); assert.deepEqual(result.callPath, [])
  }
  assert.throws(() => inspectSteeringRecovery({ length: 939136 }), /Uint8Array/)
})

test('declared native ABI exposes only reviewed steering and speed-prefix operations', () => {
  assert.deepEqual(steeringNativeExports, ['fifa98_player_steer', 'fifa98_player_speed_clamp'])
  assert.ok(Object.isFrozen(steeringNativeExports))
})

test('local original source validates regions, lookup tables and honest inspection configuration', async (context) => {
  let original
  try { original = await readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)) }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Local original reference files are not prepared'); return } throw error }
  const report = inspectSteeringRecovery(original)
  assert.equal(report.status, 'reconstruction-only')
  assert.equal(report.regions.length, 11); assert.equal(report.callPath.length, 8)
  assert.deepEqual(report.tables.turnThresholds.values, [228,469,171,455,114,398])
  assert.deepEqual(report.tables.classSpeedCaps.values, [786432,327680,327680])
  const coefficient = report.regions.find((region) => region.id === 'attribute-turn-coefficient')
  assert.equal(coefficient.disassembly[0].instruction, 'lbu $v0, 43($a0)')
  assert.equal(coefficient.disassembly[2].instruction, 'srl $v0, $v0, 2')
  const prefix = report.regions.find((region) => region.id === 'motion-speed-selection-prefix')
  const branch = prefix.disassembly.findIndex((instruction) => instruction.address === '0x8008d52c')
  assert.match(prefix.disassembly[branch].instruction, /^bne /)
  assert.equal(prefix.disassembly[branch + 1].address, '0x8008d530')
  assert.equal(prefix.disassembly[branch + 1].instruction, 'addu $s1, $t0, $zero', 'The class-cap assignment is unconditional branch-delay-slot evidence')
  assert.equal(report.initialization.turnCoefficient.expression, 'min(attributeByte43>>2,12)')
  assert.equal(report.initialization.flags.constructor, 0)
  assert.match(report.inspectionRecipe.label, /not recovered full match initialization/)
  assert.equal(report.inspectionRecipe.ownerFlags36, 0x900)
  assert.equal(report.inspectionRecipe.motionFlags216, 16)
  assert.equal(report.abi.state.length,14); assert.equal(report.abi.clampOutput.length,7)
  const changed = new Uint8Array(original)
  changed[0x8008cd44-0x8005ae28] ^= 1
  assert.equal(inspectSteeringRecovery(changed).status, 'unsupported')
})
