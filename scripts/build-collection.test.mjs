import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertCollectionOutput, readGames, validateGames } from './game-registry.mjs'

const scripts = fileURLToPath(new URL('./', import.meta.url))
const temporaryDirectories = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function entry(overrides = {}) {
  return { id: 'example', path: 'example', source: 'games/example', title: 'Example',
    description: 'A game', icon: '🎮', tags: ['Solo'], build: true, ...overrides }
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ai-games-collection-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, 'games/example/dist'), { recursive: true })
  return root
}

test('accepts nested sources independently of public routes', () => {
  const games = [entry({ path: 'old_game', source: 'games/new-game' })]
  assert.equal(validateGames(games), games)
})

test('rejects traversal, absolute and ambiguous source paths', () => {
  for (const source of ['../example', '/games/example', 'games/../example', 'games//example',
    'games/example/', 'games\\example', '.', '', 'C:/example']) {
    assert.throws(() => validateGames([entry({ source })]), /Invalid game entry/, source)
  }
})

test('rejects invalid identities, duplicate routes and service route collisions', () => {
  for (const id of [null, undefined, 42, '', '../example']) {
    assert.throws(() => validateGames([entry({ id })]), /Invalid game entry/)
  }
  for (const route of ['shared', 'api', 'relay', 'health', 'metrics', 'telemetry', '../example']) {
    assert.throws(() => validateGames([entry({ path: route })]), /Invalid game entry/)
  }
  assert.throws(() => validateGames([entry(), entry({ id: 'another' })]), /Duplicate/)
  assert.throws(() => validateGames([entry(), entry({ path: 'another' })]), /Duplicate/)
})

test('rejects source symlinks outside the repository', async () => {
  const root = await fixture()
  await symlink(tmpdir(), path.join(root, 'games/external'), 'dir')
  await writeFile(path.join(root, 'games.json'), JSON.stringify([entry({ source: 'games/external' })]))
  await assert.rejects(readGames(root), /source must stay inside/)
})

test('protects source roots, their parents and descendants from collection output', async () => {
  const root = await fixture()
  for (const output of [root, path.dirname(root), path.join(root, 'games'),
    path.join(root, 'games/example'), path.join(root, 'games/another'),
    path.join(root, 'services/game-server'), path.join(root, 'shared/assets')]) {
    await assert.rejects(assertCollectionOutput(root, output, [entry()]), /must be separate/)
  }
  await assertCollectionOutput(root, path.join(root, 'deploy'), [entry()])
})

test('protects sources when an output parent is a symlink', async () => {
  const root = await fixture()
  await symlink(path.join(root, 'games'), path.join(root, 'alias'), 'dir')
  await assert.rejects(assertCollectionOutput(root, path.join(root, 'alias/new-output'), [entry()]), /must be separate/)
})

async function collectionFixture() {
  const root = await fixture()
  await mkdir(path.join(root, 'scripts'))
  for (const script of ['build-collection.mjs', 'game-registry.mjs']) {
    await cp(path.join(scripts, script), path.join(root, 'scripts', script))
  }
  await mkdir(path.join(root, 'shared'))
  await mkdir(path.join(root, 'games/snow-drift'))
  await writeFile(path.join(root, 'index.html'), 'Dashboard')
  await writeFile(path.join(root, 'shared/game-shell.js'), '// shared shell')
  await writeFile(path.join(root, 'games/example/dist/index.html'), 'Built game')
  await writeFile(path.join(root, 'games/snow-drift/index.html'), '<script src="../shared/game-shell.js"></script>')
  const games = [entry(), entry({ id: 'snow-drift', source: 'games/snow-drift', path: 'snow_drift', build: false })]
  await writeFile(path.join(root, 'games.json'), JSON.stringify(games))
  return root
}

test('packages nested built and plain games at their existing public routes', async () => {
  const root = await collectionFixture()
  execFileSync(process.execPath, [path.join(root, 'scripts/build-collection.mjs')])
  assert.equal(await readFile(path.join(root, 'deploy/example/index.html'), 'utf8'), 'Built game')
  assert.match(await readFile(path.join(root, 'deploy/snow_drift/index.html'), 'utf8'), /\.\.\/shared/)
  assert.equal(await readFile(path.join(root, 'deploy/shared/game-shell.js'), 'utf8'), '// shared shell')
  assert.equal(await readFile(path.join(root, 'deploy/index.html'), 'utf8'), 'Dashboard')
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'deploy/games.json'), 'utf8')),
    JSON.parse(await readFile(path.join(root, 'games.json'), 'utf8')))
})

test('leaves the previous output intact if a game build is missing', async () => {
  const root = await collectionFixture()
  await mkdir(path.join(root, 'deploy/example'), { recursive: true })
  await writeFile(path.join(root, 'deploy/example/index.html'), 'Previous build')
  await rm(path.join(root, 'games/example/dist/index.html'))
  assert.throws(() => execFileSync(process.execPath, [path.join(root, 'scripts/build-collection.mjs')], { stdio: 'pipe' }))
  assert.equal(await readFile(path.join(root, 'deploy/example/index.html'), 'utf8'), 'Previous build')
})

test('builds source games while packaging an explicitly prebuilt game', async () => {
  const root = await collectionFixture()
  await writeFile(path.join(root, 'games/example/package.json'), JSON.stringify({
    scripts: { build: 'node -e "process.exit(42)"' },
  }))
  await mkdir(path.join(root, 'games/other/dist'), { recursive: true })
  await writeFile(path.join(root, 'games/other/package.json'), JSON.stringify({
    scripts: { build: 'node build.mjs' },
  }))
  await writeFile(path.join(root, 'games/other/build.mjs'),
    "import { writeFileSync } from 'node:fs'; writeFileSync('dist/index.html', 'Fresh build')")
  const games = JSON.parse(await readFile(path.join(root, 'games.json'), 'utf8'))
  games.push(entry({ id: 'other', path: 'other', source: 'games/other' }))
  await writeFile(path.join(root, 'games.json'), JSON.stringify(games))

  execFileSync(process.execPath, [path.join(root, 'scripts/build-collection.mjs'), '--build', '--skip-build=example'])

  assert.equal(await readFile(path.join(root, 'deploy/example/index.html'), 'utf8'), 'Built game')
  assert.equal(await readFile(path.join(root, 'deploy/other/index.html'), 'utf8'), 'Fresh build')
})

test('rejects unknown and plain game build exclusions', async () => {
  const root = await collectionFixture()
  for (const id of ['typo', 'snow-drift', '']) {
    assert.throws(() => execFileSync(process.execPath,
      [path.join(root, 'scripts/build-collection.mjs'), `--skip-build=${id}`], { stdio: 'pipe' }),
    /Cannot skip build/)
  }
})

test('a skipped game still needs valid prebuilt output before replacing the collection', async () => {
  const root = await collectionFixture()
  await mkdir(path.join(root, 'deploy/example'), { recursive: true })
  await writeFile(path.join(root, 'deploy/example/index.html'), 'Previous build')
  await rm(path.join(root, 'games/example/dist/index.html'))
  assert.throws(() => execFileSync(process.execPath,
    [path.join(root, 'scripts/build-collection.mjs'), '--build', '--skip-build=example'], { stdio: 'pipe' }))
  assert.equal(await readFile(path.join(root, 'deploy/example/index.html'), 'utf8'), 'Previous build')
})
