import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inspectActionEventsRecovery, inspectActionEventClip } from './action-events-recovery.mjs'
import { parseAnimationActions } from './locomotion-animation.mjs'

test('unknown and truncated code images receive no recovered profile or addresses', () => {
  for (const bytes of [new Uint8Array(), new Uint8Array(939135), new Uint8Array(939136)]) {
    const report = inspectActionEventsRecovery(bytes)
    assert.equal(report.status, 'unsupported'); assert.equal(report.profile, undefined)
    assert.deepEqual(report.regions, [])
  }
  assert.throws(() => inspectActionEventsRecovery({}), /Uint8Array/)
  assert.throws(() => inspectActionEventClip({}), /Uint8Array/)
  assert.throws(() => inspectActionEventClip(new Uint8Array(35)), /MOP|header|short/i)
})

test('source gates prove exact phase/window regions and separate pending launch dependencies', async (context) => {
  let backend
  try { backend = await readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)) }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Original reference not prepared'); return } throw error }
  const report = inspectActionEventsRecovery(backend)
  assert.equal(report.status, 'reconstruction-only'); assert.equal(report.regions.length, 20)
  assert.deepEqual(report.nativeExports, ['fifa98_action_window', 'fifa98_action_nonloop_step','fifa98_action_calibration_keys','fifa98_action_calibration_vectors'])
  assert.deepEqual(report.nonloop.endpointSemantics, { skipsWindowTests: true, setsFlag: 16, removalRequired: true, clampsPhase: false, updatesTimestamp: false })
  assert.match(report.eventHandoff.launch, /distinct from direct/)
  assert.match(report.nextRecovery.warning, /cannot substitute/)
  assert.deepEqual(report.calibration.references.root,[3,4,5])
  assert.deepEqual(report.calibration.references.marker,[6,7,8])
  assert.match(report.calibration.discrete,/distinct from interpolated/)
  assert.match(report.queueParameters.duration,/not a duration clamp/)
  assert.equal(report.queueParameters.generalSolverParameter,20)
  assert.equal(report.queueParameters.directGroundParameter,54)
  assert.match(report.queueParameters.generalParameter,/not established by calibration/)
  assert.equal(report.nextRecovery.recoveredNumericDependencies.length,3)
  assert.match(report.nextRecovery.recoveredNumericDependencies[2],/7CA14 option0/)
  const changed = Uint8Array.from(backend); changed[0] ^= 1
  assert.equal(inspectActionEventsRecovery(changed).status, 'unsupported')
})

test('actual115 clips prove simultaneous windows, literal action associations and endpoints', async (context) => {
  let backend, actions
  try { [backend, actions] = await Promise.all([readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url)), readFile(new URL('../.work/reference/members/ZMODAT.BIG/aiseqs.tbi', import.meta.url))]) }
  catch (error) { if (error.code === 'ENOENT') { context.skip('Original reference not prepared'); return } throw error }
  const database = parseAnimationActions(actions)
  for (const recorded of inspectActionEventsRecovery(backend).recordedClipEvidence.clips) {
    const bytes = await readFile(new URL(`../.work/reference/members/ZMODAT.BIG/mopsx115.viv.members/${recorded.name}`, import.meta.url))
    const clip = inspectActionEventClip(bytes)
    for (const key of ['size', 'sha256', 'startHalf', 'endHalf', 'startPhase', 'endPhase', 'endpoint']) assert.equal(clip[key], recorded[key], `${recorded.name}.${key}`)
    assert.equal(clip.simultaneousWindows, true)
    for (const actionId of recorded.actionIds) assert.equal(database.records[actionId].clipName, recorded.name)
  }
})
