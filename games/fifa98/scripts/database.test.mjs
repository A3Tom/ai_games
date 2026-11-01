import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStringDatabase, parseRosterDatabase } from './database.mjs'

function header(magic, size, teamOffset, playerOffset, count) {
  const bytes = Buffer.alloc(size)
  bytes.write(magic)
  bytes.writeUInt32LE(400, 4)
  bytes.writeUInt32LE(20, 8)
  bytes.writeUInt32LE(teamOffset, 12)
  bytes.writeUInt32LE(playerOffset, 16)
  bytes.writeUInt32LE(count, 20)
  return bytes
}

function teamName(short, menu, full) {
  const bytes = Buffer.alloc(18 + full.length)
  bytes.write(short, 0, 'latin1')
  bytes.write(menu, 6, 'latin1')
  bytes.write(full, 17, 'latin1')
  return bytes
}

function fixture() {
  const league = Buffer.from('Test League\0', 'latin1')
  const variants = [teamName('One', 'Team One', 'Team One'), teamName('Two', 'Team Two', 'Team Two')]
  const teamSection = 32 + league.length
  const teamNames = header('STR0', teamSection + 16 + variants[0].length + variants[1].length + 2, teamSection, 0, 1)
  teamNames.writeUInt32LE(12, 28)
  league.copy(teamNames, 32)
  teamNames.writeUInt32LE(2, teamSection)
  teamNames.writeUInt32LE(16, teamSection + 8)
  teamNames.writeUInt32LE(16 + variants[0].length, teamSection + 12)
  variants[0].copy(teamNames, teamSection + 16)
  variants[1].copy(teamNames, teamSection + 16 + variants[0].length)
  teamNames.fill(0x6b, teamNames.length - 2)
  const first = Buffer.from('Jos\xe9\0', 'latin1')
  const second = Buffer.from('Other Player\0', 'latin1')
  const playerNames = header('STR1', 36 + first.length + second.length, 20, 20, 2)
  playerNames.writeUInt32LE(16, 28)
  playerNames.writeUInt32LE(16 + first.length, 32)
  first.copy(playerNames, 36)
  second.copy(playerNames, 36 + first.length)
  const fcdb = header('FCDB', 224, 40, 176, 1)
  fcdb.writeUInt32LE(12, 28)
  fcdb.writeUInt16LE(37, 32)
  fcdb.writeUInt16LE(2 << 10, 34)
  fcdb.writeUInt16LE(2, 36)
  fcdb.writeUInt16LE(7, 38)
  fcdb.writeUInt32LE(2, 40)
  fcdb.writeUInt32LE(64, 44)
  fcdb.writeUInt16LE(2, 48)
  fcdb.writeUInt16LE(7, 112)
  Buffer.from([0xad, 0x56, 0x93, 0xc1, 0x6e, 0x02, 0x1a, 0xc0]).copy(fcdb, 52)
  Buffer.from([0x24, 0x09, 0x4f, 0x82, 0x65, 0x03, 0x1c, 0x20]).copy(fcdb, 60)
  fcdb[70] = 0x71
  fcdb[71] = 0x05
  fcdb.writeUInt16LE(33, 72)
  fcdb.writeUInt16LE(32, 74)
  fcdb.writeUInt16LE(33, 76)
  fcdb.writeUInt16LE(32, 136)
  fcdb.writeUInt32LE(2, 176)
  fcdb.writeUInt32LE(20, 180)
  fcdb.writeUInt16LE(0xc020, 184)
  fcdb[186] = 12
  fcdb[200] = 0xa5
  fcdb[201] = 0x32
  fcdb.writeUInt16LE(33, 204)
  return { fcdb, teamNames, playerNames }
}

test('joins synthetic names and squads by stable IDs, preserving slot order and unknown fields', () => {
  const input = fixture()
  const original = Object.fromEntries(Object.entries(input).map(([key, bytes]) => [key, Buffer.from(bytes)]))
  const result = parseRosterDatabase(input)
  assert.deepEqual(result.counts, { leagues: 1, teams: 2, players: 2 })
  assert.equal(result.leagues[0].name, 'Test League')
  assert.deepEqual(result.leagues[0].teamIds, [2, 7])
  assert.deepEqual(result.teams[0].names, ['One', 'Team One', 'Team One'])
  assert.deepEqual(result.teams[0].playerIds, [33, 32])
  assert.deepEqual(result.teams[0].squadSlots.slice(0, 4), [33, 32, 33, 0])
  assert.equal(result.teams[0].nationId, 87)
  assert.equal(result.players[0].name, 'Jos\xe9')
  assert.equal(result.players[0].id, 32)
  assert.equal(result.players[0].nationId, 51)
  assert.equal(result.players[0].shirtNumber, 42)
  assert.equal(result.players[0].roleId, 3)
  assert.equal(result.warnings.length, 0)
  assert.deepEqual(result.teams[0].homeKit, {
    shirtPatternId: 21, shirtColors: [13, 21, 19],
    shortsPatternId: 3, shortsColors: [12, 14], socksPatternId: 3, socksColors: [19, 26],
  })
  assert.deepEqual(result.teams[0].awayKit, {
    shirtPatternId: 2, shirtColors: [4, 9, 15],
    shortsPatternId: 2, shortsColors: [18, 5], socksPatternId: 2, socksColors: [27, 28],
  })
  assert.deepEqual(input, original)
  assert.throws(() => { result.teams[0].playerIds.push(999) }, TypeError)
  assert.throws(() => { result.teams[0].homeKit.shirtColors[0] = 1 }, TypeError)
})

test('parses sliced browser Uint8Arrays and pointer aliases without Node buffer assumptions', () => {
  const input = fixture()
  input.playerNames.writeUInt32LE(input.playerNames.readUInt32LE(28), 32)
  for (const key of Object.keys(input)) {
    const outer = new Uint8Array(input[key].length + 9)
    outer.set(input[key], 5)
    input[key] = outer.subarray(5, outer.length - 4)
  }
  const result = parseRosterDatabase(input)
  assert.equal(result.players[0].name, 'Jos\xe9')
  assert.equal(result.players[1].name, 'Jos\xe9')
  const names = parseStringDatabase(input.teamNames)
  assert.equal(names.teamNames[1].names[2], 'Team Two')
  assert.equal(names.teamNames[1].trailingByteLength, 2)
})

test('league references without full team records remain explicit rather than invented', () => {
  const input = fixture()
  input.fcdb.writeUInt16LE(99, 38)
  const result = parseRosterDatabase(input)
  assert.deepEqual(result.leagues[0].unresolvedTeamIds, [99])
  assert.match(result.warnings[0], /99/)
  assert.equal(result.teams.some((team) => team.id === 99), false)
})

test('rejects broken headers, offsets, counts, dimensions and links', async (t) => {
  const cases = [
    ['version', (input) => input.fcdb.writeUInt32LE(401, 4), /version/],
    ['signature', (input) => input.fcdb.write('FAKE'), /signature/],
    ['team size', (input) => input.fcdb.writeUInt32LE(63, 44), /record size/],
    ['player size', (input) => input.fcdb.writeUInt32LE(18, 180), /record size/],
    ['sections overlap', (input) => input.fcdb.writeUInt32LE(175, 16), /record size|sections/],
    ['name count mismatch', (input) => input.playerNames.writeUInt32LE(1, 20), /counts disagree/],
    ['pointer into header', (input) => input.playerNames.writeUInt32LE(0, 28), /offset/],
    ['pointer outside file', (input) => input.teamNames.writeUInt32LE(0xffffffff, 28), /offset/],
    ['duplicate player ID', (input) => input.fcdb.writeUInt16LE(32, 204), /duplicate player/],
    ['duplicate team ID', (input) => input.fcdb.writeUInt16LE(2, 112), /duplicate team/],
    ['missing squad player', (input) => input.fcdb.writeUInt16LE(999, 72), /missing player/],
    ['oversized league', (input) => input.fcdb.writeUInt16LE(63 << 10, 34), /league team list/],
    ['unterminated player name', (input) => input.playerNames.fill(0x41, 36), /unterminated/],
    ['unordered team strings', (input) => input.teamNames.writeUInt32LE(16, input.teamNames.readUInt32LE(12) + 12), /increase/],
    ['nontext name', (input) => { input.playerNames[36] = 1 }, /control character/],
  ]
  for (const [name, mutate, pattern] of cases) await t.test(name, () => {
    const input = fixture()
    mutate(input)
    assert.throws(() => parseRosterDatabase(input), pattern)
  })
  assert.throws(() => parseStringDatabase(new Uint8Array(4)), /header/)
  assert.throws(() => parseStringDatabase('not bytes'), TypeError)
  assert.throws(() => parseRosterDatabase(), TypeError)
})
