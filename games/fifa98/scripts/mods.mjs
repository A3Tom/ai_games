/** Versioned JSON sidecars for reconstructed roster and palette data.
 * These edits do not patch the disc or provide a playable native game engine.
 */

export const MOD_LIMITS = Object.freeze({
  jsonBytes: 8 * 1024 * 1024, teams: 2048, players: 16384, textures: 1024,
  nameCharacters: 80, paletteEntries: 256, textureIndex: 65535,
})

function invalid(message) { throw new Error(`Invalid FIFA98 mod: ${message}`) }

function sha256(value, label) {
  if (typeof value !== 'string' || !/^[\da-f]{64}$/i.test(value)) invalid(`${label} must be a SHA-256 hex digest`)
  return value.toLowerCase()
}

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    invalid(`${label} must be a plain JSON object`)
  }
  for (const key of Reflect.ownKeys(value)) {
    if (!keys.includes(key)) invalid(`unknown ${label} field ${String(key)}`)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid(`${label} cannot contain accessors or hidden fields`)
  }
  return value
}

function array(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) {
    invalid(`${label} must be a bounded, dense JSON array`)
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid(`${label} cannot contain sparse entries or accessors`)
  }
  return value
}

function integer(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) invalid(`${label} is outside ${minimum}..${maximum}`)
  return value
}

function name(value) {
  if (typeof value !== 'string') invalid('name must be text')
  if (value.length > MOD_LIMITS.nameCharacters * 2 || /[\x00-\x1f\x7f-\x9f]/u.test(value)) invalid('name contains invalid characters or exceeds its length limit')
  const normalized = value.trim().normalize('NFC')
  if (!normalized || [...normalized].length > MOD_LIMITS.nameCharacters || /[\x00-\x1f\x7f-\x9f]/u.test(normalized)) {
    invalid(`name must contain 1..${MOD_LIMITS.nameCharacters} printable characters`)
  }
  for (const character of normalized) {
    const point = character.codePointAt(0)
    if (point >= 0xd800 && point <= 0xdfff) invalid('name contains an unpaired Unicode surrogate')
  }
  return normalized
}

// JSON.parse discards duplicate object keys. Check the source first, including
// escaped equivalents such as "id" and "\u0069d", so imports remain unambiguous.
function parseJson(source) {
  if (source.length > MOD_LIMITS.jsonBytes || new TextEncoder().encode(source).length > MOD_LIMITS.jsonBytes) invalid('JSON import exceeds 8 MiB')
  let cursor = 0
  const whitespace = () => { while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++ }
  const quoted = () => {
    const start = cursor++
    while (cursor < source.length) {
      if (source[cursor] === '\\') cursor += 2
      else if (source[cursor++] === '"') return JSON.parse(source.slice(start, cursor))
    }
    invalid('unterminated JSON string')
  }
  const value = (depth) => {
    if (depth > 16) invalid('JSON nesting exceeds the sidecar schema')
    whitespace()
    const start = source[cursor]
    if (start === '"') { quoted(); return }
    if (start === '{' || start === '[') {
      const closing = start === '{' ? '}' : ']'
      const keys = new Set()
      cursor++
      whitespace()
      if (source[cursor] === closing) { cursor++; return }
      for (;;) {
        if (start === '{') {
          whitespace()
          if (source[cursor] !== '"') invalid('JSON object key must be quoted')
          const key = quoted()
          if (keys.has(key)) invalid(`duplicate JSON object key ${key}`)
          keys.add(key)
          whitespace()
          if (source[cursor++] !== ':') invalid('missing JSON colon')
        }
        value(depth + 1)
        whitespace()
        if (source[cursor] === closing) { cursor++; return }
        if (source[cursor++] !== ',') invalid('missing JSON comma')
      }
    }
    const begin = cursor
    while (cursor < source.length && !/[\s,}\]]/.test(source[cursor])) cursor++
    if (cursor === begin) invalid('missing JSON value')
  }
  try {
    value(0)
    whitespace()
    if (cursor !== source.length) invalid('trailing JSON content')
    return JSON.parse(source)
  } catch (error) {
    if (error.message.startsWith('Invalid FIFA98 mod:')) throw error
    invalid('malformed JSON')
  }
}

function rosterIndex(roster) {
  if (!roster || !Array.isArray(roster.teams) || !Array.isArray(roster.players)) invalid('a parsed base roster is required')
  const teams = new Map()
  const players = new Map()
  for (const [label, rows, index] of [['team', roster.teams, teams], ['player', roster.players, players]]) {
    for (const row of rows) {
      const id = integer(row.id, 1, label === 'team' ? 2047 : 16383, `${label} ID`)
      if (index.has(id)) invalid(`duplicate base ${label} ID ${id}`)
      index.set(id, row)
    }
  }
  return { teams, players }
}

/** Create an editable blank sidecar bound to the exact base FCDB digest. */
export function createMod(baseSha256) {
  return { version: 1, baseSha256: sha256(baseSha256, 'baseSha256'), teams: [], players: [], textures: [] }
}

/**
 * Validate a JSON string or plain sidecar object and return a frozen copy.
 * Optional catalog rows are {sourceSha256,textureIndex,paletteLength}; supplying
 * the catalog also requires every palette edit to identify a known texture.
 */
export function validateMod(input, roster, { baseSha256, textureCatalog } = {}) {
  const expected = sha256(baseSha256, 'expected baseSha256')
  const mod = object(typeof input === 'string' ? parseJson(input) : input,
    ['version', 'baseSha256', 'teams', 'players', 'textures'], 'mod')
  if (mod.version !== 1) invalid('unsupported sidecar version')
  const source = sha256(mod.baseSha256, 'baseSha256')
  if (source !== expected) invalid('base database fingerprint does not match')
  const base = rosterIndex(roster)
  const seenTeams = new Set()
  const seenPlayers = new Set()
  const teams = array(mod.teams, MOD_LIMITS.teams, 'team edits').map((value) => {
    const edit = object(value, ['id', 'name', 'squadSlots'], 'team edit')
    const id = integer(edit.id, 1, 2047, 'team ID')
    if (!base.teams.has(id)) invalid(`unknown team ID ${id}`)
    if (seenTeams.has(id)) invalid(`duplicate team edit ${id}`)
    seenTeams.add(id)
    if (!Object.hasOwn(edit, 'name') && !Object.hasOwn(edit, 'squadSlots')) invalid('empty team edit')
    const result = { id }
    if (Object.hasOwn(edit, 'name')) result.name = name(edit.name)
    if (Object.hasOwn(edit, 'squadSlots')) {
      const slots = array(edit.squadSlots, 20, 'squadSlots')
      if (slots.length !== 20) invalid('squadSlots must contain exactly 20 slots')
      result.squadSlots = Object.freeze(slots.map((value) => {
        const playerId = integer(value, 0, 16383, 'squad player ID')
        if (playerId && !base.players.has(playerId)) invalid(`unknown squad player ID ${playerId}`)
        return playerId
      }))
    }
    return Object.freeze(result)
  })
  const players = array(mod.players, MOD_LIMITS.players, 'player edits').map((value) => {
    const edit = object(value, ['id', 'name', 'shirtNumber'], 'player edit')
    const id = integer(edit.id, 1, 16383, 'player ID')
    if (!base.players.has(id)) invalid(`unknown player ID ${id}`)
    if (seenPlayers.has(id)) invalid(`duplicate player edit ${id}`)
    seenPlayers.add(id)
    if (!Object.hasOwn(edit, 'name') && !Object.hasOwn(edit, 'shirtNumber')) invalid('empty player edit')
    const result = { id }
    if (Object.hasOwn(edit, 'name')) result.name = name(edit.name)
    if (Object.hasOwn(edit, 'shirtNumber')) result.shirtNumber = integer(edit.shirtNumber, 0, 255, 'shirtNumber')
    return Object.freeze(result)
  })
  let catalog
  if (textureCatalog !== undefined) {
    catalog = new Map()
    for (const entry of array(textureCatalog, 65536, 'texture catalog')) {
      const source = sha256(entry?.sourceSha256, 'texture catalog sourceSha256')
      const index = integer(entry.textureIndex, 0, MOD_LIMITS.textureIndex, 'catalog textureIndex')
      const length = integer(entry.paletteLength, 1, MOD_LIMITS.paletteEntries, 'catalog paletteLength')
      const key = `${source}:${index}`
      if (catalog.has(key) && catalog.get(key) !== length) invalid(`conflicting texture catalog key ${key}`)
      catalog.set(key, length)
    }
  }
  const seenTextures = new Set()
  const textures = array(mod.textures, MOD_LIMITS.textures, 'texture edits').map((value) => {
    const edit = object(value, ['sourceSha256', 'textureIndex', 'palette'], 'texture edit')
    const sourceSha256 = sha256(edit.sourceSha256, 'texture sourceSha256')
    const textureIndex = integer(edit.textureIndex, 0, MOD_LIMITS.textureIndex, 'textureIndex')
    const key = `${sourceSha256}:${textureIndex}`
    if (seenTextures.has(key)) invalid(`duplicate texture edit ${key}`)
    seenTextures.add(key)
    const palette = array(edit.palette, MOD_LIMITS.paletteEntries, 'palette')
    if (!palette.length) invalid('palette cannot be empty')
    if (catalog && (!catalog.has(key) || catalog.get(key) !== palette.length)) invalid('texture is unknown or palette length does not match the catalog')
    return Object.freeze({ sourceSha256, textureIndex,
      palette: Object.freeze(palette.map((value) => integer(value, 0, 65535, 'palette entry'))) })
  })
  return Object.freeze({ version: 1, baseSha256: source,
    teams: Object.freeze(teams), players: Object.freeze(players), textures: Object.freeze(textures) })
}

/** Apply logical roster edits to an independent copy; palette edits stay in mod.textures. */
export function applyRosterMod(roster, mod, options) {
  const validated = validateMod(mod, roster, options)
  const result = structuredClone(roster)
  const teams = new Map(result.teams.map((team) => [team.id, team]))
  const players = new Map(result.players.map((player) => [player.id, player]))
  for (const edit of validated.teams) {
    const team = teams.get(edit.id)
    if (Object.hasOwn(edit, 'name')) {
      team.name = edit.name
      if (Array.isArray(team.names) && team.names.length === 3) team.names[2] = edit.name
    }
    if (edit.squadSlots) {
      team.squadSlots = [...edit.squadSlots]
      team.playerIds = [...new Set(edit.squadSlots.filter(Boolean))]
    }
  }
  for (const edit of validated.players) {
    const player = players.get(edit.id)
    if (Object.hasOwn(edit, 'name')) player.name = edit.name
    if (Object.hasOwn(edit, 'shirtNumber')) player.shirtNumber = edit.shirtNumber
  }
  return result
}
