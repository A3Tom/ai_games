import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { parseAnimationActions, inspectLocomotionAnimation, prepareLocomotionTables, selectLocomotionAction, advanceLocomotionPhase, selectRunVariantIndex } from './locomotion-animation.mjs'
import { parseMopClip } from './animation.mjs'

function fixture() {
  const bytes = new Uint8Array(8 + 4 * 20 + 3 * 24)
  const view = new DataView(bytes.buffer), namesOffset = 88
  view.setUint32(0, 4, true); view.setUint32(4, namesOffset, true)
  for (let id = 0; id < 4; id++) {
    const at = 8 + id * 20
    view.setUint16(at, id, true); view.setUint16(at + 2, id, true); view.setUint16(at + 4, 0, true)
    view.setInt16(at + 6, -id, true); view.setUint32(at + 8, id * 4, true)
    view.setUint32(at + 12, namesOffset + id % 2 * 24, true)
    view.setUint16(at + 16, 8, true); view.setUint16(at + 18, 10, true)
  }
  for (const [index, name] of ['neutral', 'walk'].entries()) {
    bytes.set(new TextEncoder().encode(name), namesOffset + index * 24)
    view.setUint16(namesOffset + index * 24 + 10, index, true)
  }
  return { bytes, view }
}

function selectorFixture() {
  const categoryBytes = Array.from({ length: 252 }, (_, index) => index % 18 % 11)
  const actionHalfwords = Array.from({ length: 330 }, (_, index) => index < 110 ? index % 2 ? 4096 : 100 + index / 2 : 200 + index - 110)
  return { categoryBytes, actionHalfwords }
}

test('parses source action rows and shared descriptors without losing raw fields', () => {
  const { bytes } = fixture(), result = parseAnimationActions(bytes)
  assert.equal(result.actionCount, 4)
  assert.deepEqual(result.records.map((row) => row.clipName), ['neutral', 'walk', 'neutral', 'walk'])
  assert.equal(result.records[3].headingOffsetRaw, -3)
  assert.equal(result.records[2].flagsRaw, 8)
  assert.ok(Object.isFrozen(result.records[0]))
  const larger = new Uint8Array(bytes.length + 7); larger.set(bytes, 3)
  assert.deepEqual(parseAnimationActions(larger.subarray(3, 3 + bytes.length)), result)
})

test('rejects corrupt action boundaries, strings, IDs, references and trailing descriptors', () => {
  for (const mutate of [
    ({ view }) => view.setUint32(4, 89, true),
    ({ view }) => view.setUint16(8, 4, true),
    ({ view }) => view.setUint16(10, 4, true),
    ({ view }) => view.setUint32(20, 89, true),
    ({ bytes }) => bytes.fill(65, 88, 98),
    ({ bytes }) => { bytes[88] = 47 },
    ({ view }) => view.setUint16(122, 0, true),
    ({ bytes }) => { bytes[bytes.length - 1] = 1 },
  ]) {
    const source = fixture(); mutate(source)
    assert.throws(() => parseAnimationActions(source.bytes), /Invalid locomotion/)
  }
})

test('selector retains original thresholds, hysteresis, flag precedence and rate conventions', () => {
  const tables = selectorFixture(), state = [0, 777, 100], motion = [3 * 65536, 0, 0, 0, 0, 0, 100, 499, 10000]
  assert.deepEqual(selectLocomotionAction(state, motion, tables), { actionId: 103, state: [3, 81920, 100] })
  assert.deepEqual(state, [0, 777, 100])
  const forced = [...motion]; forced[5] = 64 | 128 | 4 | 1 | 2 | 8
  assert.deepEqual(selectLocomotionAction(state, forced, tables), { actionId: 225, state: [3, 777, 100] })
  for (const [turn, group] of [[-27, 0], [-26, 2], [-10, 2], [10, 3], [26, 3], [27, 1]]) {
    assert.equal(selectLocomotionAction(state, [...motion.slice(0, 2), turn, ...motion.slice(3)], tables).actionId, 200 + group * 55 + 3)
  }
  tables.categoryBytes[4 * 18 + 3] = 4
  assert.equal(selectLocomotionAction([4, 0, 100], motion, tables).state[0], 4)
  assert.equal(selectLocomotionAction([4, 0, 99], motion, tables).state[0], 3)
  const low = [...motion]; low[0] = 19660
  assert.equal(selectLocomotionAction(state, low, tables).state[0], 0)
  low[0] = 19661
  assert.equal(selectLocomotionAction(state, low, tables).state[0], 1)
  tables.actionHalfwords[6] = 499
  assert.equal(selectLocomotionAction(state, motion, tables).actionId, 499)
  const special = [...motion]; special[5] = 32
  assert.deepEqual(selectLocomotionAction(state, special, tables), { actionId: 453, state: [3, 65536, 100] })
  assert.throws(() => selectLocomotionAction(state, [18 * 65536, ...motion.slice(1)], tables), /rounded speed/)
})

test('same-loop phase consumes explicit simulation deltas with source rounding and endpoint wrap', () => {
  assert.deepEqual(advanceLocomotionPhase([0, 0, 0], 65536, 65536, 1024), [256, 256, 256])
  assert.deepEqual(advanceLocomotionPhase([0, 0, 900], 65536, 65536, 1024), [256, 256, 132])
  assert.deepEqual(advanceLocomotionPhase([4000, 0, 0], 0, 65536, 10000), [4000, 4000, 3072])
  assert.deepEqual(advanceLocomotionPhase([0, 0, 0], 65536, 0, 1024), [256, 0, 0])
  assert.deepEqual(advanceLocomotionPhase([0, 0, 0], 1, 65536, 1024), [0, 0, 0])
  assert.throws(() => advanceLocomotionPhase([0, 0, 1024], 65536, 65536, 1024), /bounds/)
  assert.throws(() => advanceLocomotionPhase([0, 0, 0], 65536, 65536, 4193281), /bounds/)
  for (const [byte, halfword, expected] of [[0, 65535, 0], [100, 100, 0], [103, 100, 0], [104, 100, 1], [107, 100, 1], [108, 100, 2], [255, 0, 2]]) {
    assert.equal(selectRunVariantIndex(byte, halfword), expected)
  }
})

test('unknown images cannot initialize original selector tables', async () => {
  const result = await inspectLocomotionAnimation(new Uint8Array(8), fixture().bytes)
  assert.equal(result.status, 'unsupported')
  assert.deepEqual(result.regions, [])
  await assert.rejects(prepareLocomotionTables(new Uint8Array(8), fixture().bytes, new Map()), /fingerprint/)
})

test('local original database, selector initialization and source action names are verified when available', async (t) => {
  let backend, actions
  try {
    backend = await readFile(new URL('../.work/reference/disc/BECODE.BIN', import.meta.url))
    actions = await readFile(new URL('../.work/reference/members/ZMODAT.BIG/aiseqs.tbi', import.meta.url))
  } catch (error) { if (error.code === 'ENOENT') { t.skip('Local reference extraction is unavailable.'); return } throw error }
  const database = parseAnimationActions(actions), wanted = new Set(database.descriptors.map((row) => row.clipName)), clips = new Map()
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) { if (!entry.name.includes('130')) await visit(next) }
      else if (wanted.has(entry.name)) clips.set(entry.name, parseMopClip(await readFile(next)))
    }
  }
  await visit(new URL('../.work/reference/members/', import.meta.url))
  const prepared = await prepareLocomotionTables(backend, actions, clips)
  assert.equal(prepared.database.actionCount, 661)
  assert.equal(prepared.database.descriptors.length, 494)
  assert.equal(prepared.evidence.regions.length, 17)
  assert.equal(prepared.database.records[554].clipName, 'fstnda1')
  assert.equal(prepared.database.records[659].clipName, 'rlwlka2')
  assert.equal(prepared.database.records[499].clipName, 'rlruna2')
  assert.equal(prepared.actionHalfwords[3], 5449)
  assert.deepEqual(prepared.runVariants[0], { actionId: 499, referenceRaw: 14051 })
  const motion = [0, 0, 0, 0, 0, 0, 0, 499, prepared.runVariants[0].referenceRaw]
  assert.equal(selectLocomotionAction([0, 65536, 0], motion, prepared).actionId, 554)
  assert.equal(selectLocomotionAction([0, 65536, 0], [65536, ...motion.slice(1)], prepared).actionId, 659)
})
