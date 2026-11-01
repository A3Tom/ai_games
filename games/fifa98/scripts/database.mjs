/**
 * Bounded reader for the FCDB/STR0/STR1 DBI layout observed on SLES_009.14.
 * Format research: ma-akad's fifa98edit load_database() (MIT), cross-checked
 * against this PS1 disc's section sizes, IDs, names and every squad reference:
 * https://github.com/ma-akad/fifa98edit/blob/master/__init__.py#L573-L865
 *
 * Numeric kit/role IDs are preserved; this does not establish their textures,
 * palettes or game behavior. Unknown player attributes remain uninterpreted.
 * No input mutation, filesystem access, dependency, or Node API is used.
 */

function invalid(message) { throw new Error(`Invalid FIFA98 database: ${message}`) }

function reader(input, expected) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Database input must be a Uint8Array')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const range = (offset, length, label) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
        offset > input.length || length > input.length - offset) invalid(`${label} exceeds the file`)
  }
  const u32 = (offset) => { range(offset, 4, '32-bit field'); return view.getUint32(offset, true) }
  const u16 = (offset) => { range(offset, 2, '16-bit field'); return view.getUint16(offset, true) }
  range(0, 28, 'header')
  const signature = String.fromCharCode(...input.subarray(0, 4))
  if (!expected.includes(signature)) invalid(`unsupported signature ${JSON.stringify(signature)}`)
  if (u32(4) !== 400 || u32(8) !== 20) invalid('unsupported DBI version or relative-offset base')
  return { bytes: input, signature, version: 400, range, u32, u16 }
}

function text(bytes, start, end) {
  let value = ''
  for (let offset = start; offset < end; offset++) {
    const byte = bytes[offset]
    if (byte < 32 || byte === 127) invalid('control character inside a database string')
    // These files store single-byte names, including accented Latin-1 letters.
    value += String.fromCharCode(byte)
  }
  return value
}

function cstring(r, offset, limit) {
  if (offset >= limit) invalid('string starts outside its section')
  let end = offset
  while (end < limit && r.bytes[end] !== 0) end++
  if (end === limit) invalid('unterminated database string')
  return { name: text(r.bytes, offset, end), next: end + 1 }
}

function offsets(r, start, count, base, minimum, limit, ordered) {
  r.range(start, count * 4, 'offset index')
  if (start + count * 4 > minimum || minimum > limit) invalid('offset index overlaps data')
  const result = []
  for (let index = 0; index < count; index++) {
    const offset = base + r.u32(start + index * 4)
    if (offset < minimum || offset >= limit) invalid('indexed offset is outside its section')
    if (ordered && index && offset <= result[index - 1]) invalid('record offsets must increase')
    result.push(offset)
  }
  return result
}

function readStringDatabase(input) {
  const r = reader(input, ['STR0', 'STR1'])
  if (r.signature === 'STR1') {
    if (r.u32(12) !== 20 || r.u32(16) !== 20) invalid('unsupported STR1 sections')
    const count = r.u32(20)
    const starts = offsets(r, 28, count, 20, 28 + count * 4, input.length, false)
    const playerNames = starts.map((offset, index) => ({ index, offset, name: cstring(r, offset, input.length).name }))
    return { format: 'STR1', version: r.version, playerNames }
  }
  const teamOffset = r.u32(12)
  const leagueCount = r.u32(20)
  if (r.u32(16) !== 0 || teamOffset < 28 || teamOffset > input.length - 8) invalid('invalid STR0 team-name section')
  const leagueOffsets = offsets(r, 28, leagueCount, 20, 28 + leagueCount * 4, teamOffset, true)
  const leagueNames = leagueOffsets.map((offset, index) => ({
    index, offset, name: cstring(r, offset, leagueOffsets[index + 1] ?? teamOffset).name,
  }))
  const teamCount = r.u32(teamOffset)
  if (r.u32(teamOffset + 4) !== 0) invalid('unsupported STR0 team-name record layout')
  const starts = offsets(r, teamOffset + 8, teamCount, teamOffset, teamOffset + 8 + teamCount * 4, input.length, true)
  const teamNames = starts.map((offset, index) => {
    const end = starts[index + 1] ?? input.length
    // Short and menu names occupy six and eleven bytes. The full name is
    // variable length. The supplied final record has two uninterpreted tail
    // bytes, which are not a fourth name and must not leak into display text.
    if (end - offset < 18) invalid('truncated team-name record')
    const short = cstring(r, offset, offset + 6)
    const menu = cstring(r, offset + 6, offset + 17)
    const full = cstring(r, offset + 17, end)
    for (let cursor = short.next; cursor < offset + 6; cursor++) if (r.bytes[cursor]) invalid('invalid short-name padding')
    for (let cursor = menu.next; cursor < offset + 17; cursor++) if (r.bytes[cursor]) invalid('invalid menu-name padding')
    return { index, offset, names: [short.name, menu.name, full.name], trailingByteLength: end - full.next }
  })
  return { format: 'STR0', version: r.version, leagueNames, teamNames }
}

function freezeStrings(result) {
  for (const key of ['leagueNames', 'teamNames', 'playerNames']) {
    if (!result[key]) continue
    for (const entry of result[key]) {
      if (entry.names) Object.freeze(entry.names)
      Object.freeze(entry)
    }
    Object.freeze(result[key])
  }
  return Object.freeze(result)
}

/** Read league/team variants (STR0) or indexed player names (STR1). */
export function parseStringDatabase(input) { return freezeStrings(readStringDatabase(input)) }

function kit(bytes, offset, away) {
  const base = offset + (away ? 12 : 4)
  return Object.freeze({
    shirtPatternId: bytes[base + 1] >>> 2,
    shirtColors: Object.freeze([bytes[base] & 31, (bytes[base] >>> 5) | ((bytes[base + 1] & 3) << 3), bytes[base + 2] & 31]),
    shortsPatternId: bytes[base + 3] >>> 6,
    shortsColors: Object.freeze([(bytes[base + 2] >>> 5) | ((bytes[base + 3] & 3) << 3), bytes[base + 4] & 31]),
    socksPatternId: away ? (bytes[base + 7] >>> 4) & 3 : bytes[base + 7] >>> 6,
    socksColors: Object.freeze([(bytes[base + 4] >>> 5) | ((bytes[base + 5] & 3) << 3), bytes[base + 6] & 31]),
  })
}

/**
 * Join the three raw DBIs. Team/player names are linked by database position;
 * squads use explicit numeric player IDs, never an inferred player ordering.
 */
export function parseRosterDatabase({ fcdb, teamNames, playerNames } = {}) {
  const r = reader(fcdb, ['FCDB'])
  const names = parseStringDatabase(teamNames)
  const people = parseStringDatabase(playerNames)
  if (names.format !== 'STR0' || people.format !== 'STR1') invalid('expected STR0 team names and STR1 player names')
  const teamOffset = r.u32(12)
  const playerOffset = r.u32(16)
  const leagueCount = r.u32(20)
  r.range(teamOffset, 8, 'team section')
  r.range(playerOffset, 8, 'player section')
  const teamCount = r.u32(teamOffset)
  const playerCount = r.u32(playerOffset)
  const teamSize = r.u32(teamOffset + 4)
  const playerSize = r.u32(playerOffset + 4)
  if (teamSize !== 64 || playerSize !== 20) invalid('unsupported team/player record size')
  if (teamOffset < 28 + leagueCount * 4 || playerOffset !== teamOffset + 8 + teamCount * teamSize ||
      playerOffset + 8 + playerCount * playerSize !== fcdb.length) invalid('record sections overlap or exceed the file')
  if (leagueCount !== names.leagueNames.length || teamCount !== names.teamNames.length || playerCount !== people.playerNames.length) {
    invalid('FCDB and string database record counts disagree')
  }
  const playerIds = new Set()
  const players = []
  for (let index = 0; index < playerCount; index++) {
    const offset = playerOffset + 8 + index * playerSize
    const id = r.u16(offset) & 0x3fff
    if (!id || playerIds.has(id)) invalid('zero or duplicate player ID')
    playerIds.add(id)
    players.push(Object.freeze({
      index, offset, id, name: people.playerNames[index].name,
      nationId: (fcdb[offset + 1] >>> 6) | (fcdb[offset + 2] << 2),
      shirtNumber: (fcdb[offset + 16] >>> 4) | ((fcdb[offset + 17] & 15) << 4),
      roleId: fcdb[offset + 17] >>> 4,
    }))
  }
  const teamIds = new Set()
  const teams = []
  for (let index = 0; index < teamCount; index++) {
    const offset = teamOffset + 8 + index * teamSize
    const id = r.u16(offset) & 0x7ff
    if (!id || teamIds.has(id)) invalid('zero or duplicate team ID')
    teamIds.add(id)
    const squadSlots = Array.from({ length: 20 }, (_, slot) => r.u16(offset + 24 + slot * 2))
    for (const playerId of squadSlots) if (playerId && !playerIds.has(playerId)) invalid(`team ${id} references missing player ${playerId}`)
    const variants = names.teamNames[index].names
    teams.push(Object.freeze({
      index, offset, id, names: variants, name: variants[2],
      nationId: (fcdb[offset + 22] >>> 4) | ((fcdb[offset + 23] & 15) << 4),
      squadSlots: Object.freeze(squadSlots),
      playerIds: Object.freeze([...new Set(squadSlots.filter(Boolean))]),
      homeKit: kit(fcdb, offset, false), awayKit: kit(fcdb, offset, true),
    }))
  }
  const leagueOffsets = offsets(r, 28, leagueCount, 20, 28 + leagueCount * 4, teamOffset, true)
  const leagues = leagueOffsets.map((offset, index) => {
    const end = leagueOffsets[index + 1] ?? teamOffset
    if (end - offset < 4) invalid('truncated league record')
    const sizeFlags = r.u16(offset + 2)
    const count = sizeFlags >>> 10
    if (4 + Math.ceil(count / 2) * 4 > end - offset) invalid('league team list exceeds its record')
    const ids = Array.from({ length: count }, (_, slot) => r.u16(offset + 4 + slot * 2))
    return Object.freeze({
      index, offset, id: r.u16(offset), name: names.leagueNames[index].name,
      sizeFlags, teamIds: Object.freeze(ids), unresolvedTeamIds: Object.freeze(ids.filter((id) => id && !teamIds.has(id))),
    })
  })
  const unresolved = [...new Set(leagues.flatMap((league) => league.unresolvedTeamIds))]
  const warnings = unresolved.length ? [`League/group lists reference ${unresolved.length} team IDs without full team records: ${unresolved.join(', ')}.`] : []
  return Object.freeze({
    format: 'FCDB', version: r.version,
    counts: Object.freeze({ leagues: leagueCount, teams: teamCount, players: playerCount }),
    leagues: Object.freeze(leagues), teams: Object.freeze(teams), players: Object.freeze(players), warnings: Object.freeze(warnings),
  })
}
