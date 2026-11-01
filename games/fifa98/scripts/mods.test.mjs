import test from 'node:test'
import assert from 'node:assert/strict'
import { createMod, validateMod, applyRosterMod, MOD_LIMITS } from './mods.mjs'

const BASE = 'a'.repeat(64)
const TEXTURE = 'b'.repeat(64)
const options = { baseSha256: BASE, textureCatalog: [{ sourceSha256: TEXTURE, textureIndex: 2, paletteLength: 2 }] }

function roster() {
  return {
    counts: { teams: 2, players: 2 },
    teams: [
      { id: 2, name: 'Original', names: ['Ori', 'Original', 'Original'], squadSlots: [32, 33, ...Array(18).fill(0)], playerIds: [32, 33], homeKit: { shirtColors: [1, 2, 3] } },
      { id: 7, name: 'Other', names: ['Oth', 'Other', 'Other'], squadSlots: Array(20).fill(0), playerIds: [] },
    ],
    players: [{ id: 32, name: 'First', shirtNumber: 1 }, { id: 33, name: 'Second', shirtNumber: 2 }],
  }
}

function mod() {
  return {
    ...createMod(BASE),
    teams: [{ id: 2, name: '  Modern Team  ', squadSlots: [33, 32, 33, ...Array(17).fill(0)] }],
    players: [{ id: 32, name: 'Jose\u0301', shirtNumber: 255 }],
    textures: [{ sourceSha256: TEXTURE, textureIndex: 2, palette: [0, 65535] }],
  }
}

test('JSON export/import retains valid edits, source identity, zero slots and legitimate duplicates', () => {
  const input = mod()
  const original = structuredClone(input)
  const result = validateMod(JSON.stringify(input), roster(), options)
  assert.equal(result.version, 1)
  assert.equal(result.baseSha256, BASE)
  assert.equal(result.teams[0].name, 'Modern Team')
  assert.equal(result.players[0].name, 'Jos\xe9')
  assert.equal(result.players[0].shirtNumber, 255)
  assert.deepEqual(result.teams[0].squadSlots.slice(0, 4), [33, 32, 33, 0])
  assert.deepEqual(result.textures[0].palette, [0, 65535])
  assert.deepEqual(input, original)
  assert.throws(() => { result.textures[0].palette[0] = 1 }, TypeError)
  assert.deepEqual(validateMod(createMod(BASE.toUpperCase()), roster(), { baseSha256: BASE }), createMod(BASE))
})

test('roster application is independent, including untouched nested arrays', () => {
  const base = roster()
  const source = structuredClone(base)
  const result = applyRosterMod(base, mod(), options)
  assert.equal(result.teams[0].name, 'Modern Team')
  assert.deepEqual(result.teams[0].names, ['Ori', 'Original', 'Modern Team'])
  assert.deepEqual(result.teams[0].playerIds, [33, 32])
  assert.equal(result.players[0].name, 'Jos\xe9')
  assert.equal(result.players[0].shirtNumber, 255)
  result.teams[0].homeKit.shirtColors[0] = 99
  result.teams[1].squadSlots[0] = 32
  assert.deepEqual(base, source)
})

test('rejects invalid identities, malformed edits, bounds and duplicate edit keys', async (t) => {
  const cases = [
    ['base mismatch', (input) => { input.baseSha256 = 'c'.repeat(64) }, /fingerprint/],
    ['version', (input) => { input.version = 2 }, /version/],
    ['unknown property', (input) => { input.engine = 'pretend' }, /unknown/],
    ['unknown team', (input) => { input.teams[0].id = 999 }, /unknown team/],
    ['unknown player', (input) => { input.players[0].id = 999 }, /unknown player/],
    ['duplicate team', (input) => { input.teams.push({ id: 2, name: 'Again' }) }, /duplicate team/],
    ['duplicate player', (input) => { input.players.push({ id: 32, name: 'Again' }) }, /duplicate player/],
    ['missing squad member', (input) => { input.teams[0].squadSlots[0] = 999 }, /unknown squad/],
    ['squad length', (input) => { input.teams[0].squadSlots.pop() }, /exactly 20/],
    ['fractional squad ID', (input) => { input.teams[0].squadSlots[0] = 32.5 }, /player ID/],
    ['negative shirt', (input) => { input.players[0].shirtNumber = -1 }, /shirtNumber/],
    ['large shirt', (input) => { input.players[0].shirtNumber = 256 }, /shirtNumber/],
    ['empty name', (input) => { input.players[0].name = '  ' }, /name/],
    ['long name', (input) => { input.players[0].name = 'x'.repeat(81) }, /name/],
    ['control name', (input) => { input.players[0].name = '\nHidden' }, /name/],
    ['surrogate name', (input) => { input.players[0].name = '\ud800' }, /surrogate/],
    ['no-op team edit', (input) => { input.teams[0] = { id: 2 } }, /empty team edit/],
    ['no-op player edit', (input) => { input.players[0] = { id: 32 } }, /empty player edit/],
    ['texture fingerprint', (input) => { input.textures[0].sourceSha256 = 'bad' }, /SHA-256/],
    ['unknown texture', (input) => { input.textures[0].textureIndex = 3 }, /unknown/],
    ['texture index range', (input) => { input.textures[0].textureIndex = -1 }, /textureIndex/],
    ['palette length', (input) => { input.textures[0].palette.push(1) }, /palette length/],
    ['palette value', (input) => { input.textures[0].palette[0] = 65536 }, /palette entry/],
    ['duplicate texture', (input) => { input.textures.push({ ...input.textures[0] }) }, /duplicate texture/],
    ['empty palette', (input) => { input.textures[0].palette = [] }, /empty/],
  ]
  for (const [label, mutate, pattern] of cases) await t.test(label, () => {
    const input = mod()
    mutate(input)
    assert.throws(() => validateMod(input, roster(), options), pattern)
  })
  assert.throws(() => validateMod(mod(), roster()), /expected baseSha256/)
  assert.throws(() => createMod('no hash'), /SHA-256/)
})

test('rejects duplicate JSON keys, escaped duplicates, prototype keys and excessive input', () => {
  const serialized = JSON.stringify(mod())
  assert.throws(() => validateMod(serialized.replace('"version":1', '"version":1,"version":1'), roster(), options), /duplicate JSON/)
  assert.throws(() => validateMod(serialized.replace('"version":1', '"version":1,"\\u0076ersion":1'), roster(), options), /duplicate JSON/)
  assert.throws(() => validateMod(serialized.replace('"id":2', '"id":2,"id":7'), roster(), options), /duplicate JSON/)
  assert.throws(() => validateMod(serialized.replace('"version":1', '"version":1,"__proto__":{}'), roster(), options), /unknown/)
  assert.throws(() => validateMod('['.repeat(18) + '0' + ']'.repeat(18), roster(), options), /nesting/)
  assert.throws(() => validateMod(' '.repeat(MOD_LIMITS.jsonBytes + 1), roster(), options), /8 MiB/)
  for (const value of ['null', '{} junk', '{"version":', '[1,]', '{"a":1,}', '{bad}']) {
    assert.throws(() => validateMod(value, roster(), options), /Invalid FIFA98 mod/)
  }
})

test('rejects sparse arrays, accessors, conflicting catalog keys and non-JSON object shapes', () => {
  const input = mod()
  delete input.teams[0].squadSlots[1]
  assert.throws(() => validateMod(input, roster(), options), /dense|sparse/)
  const accessor = mod()
  Object.defineProperty(accessor.players[0], 'name', { enumerable: true, get() { throw new Error('must never run') } })
  assert.throws(() => validateMod(accessor, roster(), options), /accessors/)
  const odd = Object.assign(Object.create({ hidden: true }), mod())
  assert.throws(() => validateMod(odd, roster(), options), /plain JSON/)
  assert.doesNotThrow(() => validateMod(mod(), roster(), { ...options, textureCatalog: [...options.textureCatalog, ...options.textureCatalog] }))
  assert.throws(() => validateMod(mod(), roster(), { ...options, textureCatalog: [...options.textureCatalog, { ...options.textureCatalog[0], paletteLength: 3 }] }), /conflicting texture catalog/)
})
