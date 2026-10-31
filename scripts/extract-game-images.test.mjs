import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

import { extractGameImages } from './extract-game-images.mjs'

const directories = []
const digest = 'a'.repeat(64)
const image = (id) => `ghcr.io/example/ai_games-${id}@sha256:${digest}`
const container = 'b'.repeat(64)

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ai-games-images-'))
  directories.push(root)
  const entries = [
    { id: 'first', source: 'games/first', build: true },
    { id: 'public-id', source: 'games/second-folder', build: true },
    { id: 'plain', source: 'games/plain', build: false },
  ].map((game) => ({ ...game, path: game.id, title: game.id, description: 'A game', icon: '🎮', tags: [] }))
  for (const game of entries) {
    await mkdir(path.join(root, game.source, 'dist'), { recursive: true })
    await writeFile(path.join(root, game.source, 'dist/old.js'), 'stale asset')
  }
  await writeFile(path.join(root, 'games.json'), JSON.stringify(entries))
  return root
}

function dockerFixture({ copyError = false, missingIndex = false } = {}) {
  const commands = []
  return {
    commands,
    run: async (args) => {
      commands.push(args)
      if (args[0] === 'create') return `${container}\n`
      if (args[0] === 'cp') {
        if (copyError) throw new Error('artifact copy failed')
        if (!missingIndex) await writeFile(path.join(args[2], 'index.html'), 'Built game')
      }
      return ''
    },
  }
}

test('extracts every registered artifact and returns catalogue IDs for source-build exclusions', async () => {
  const root = await fixture()
  const docker = dockerFixture()
  const skipped = await extractGameImages(root, {
    'second-folder': image('second-folder'), first: image('first'),
    unregistered: image('unregistered'), plain: image('plain'),
  }, docker)

  assert.deepEqual(skipped, ['first', 'public-id'])
  assert.equal(docker.commands.length, 8)
  assert.deepEqual(docker.commands[0], ['pull', '--platform', 'linux/amd64', image('first')])
  assert.deepEqual(docker.commands[1], ['create', '--platform', 'linux/amd64', image('first'), '/artifact-only'])
  assert.deepEqual(docker.commands[2], ['cp', `${container}:/dist/.`, path.join(root, 'games/first/dist')])
  assert.deepEqual(docker.commands[3], ['rm', '--force', container])
  assert.deepEqual(docker.commands[4], ['pull', '--platform', 'linux/amd64', image('second-folder')])
  for (const id of ['first', 'second-folder']) {
    assert.equal(await readFile(path.join(root, 'games', id, 'dist/index.html'), 'utf8'), 'Built game')
    await assert.rejects(readFile(path.join(root, 'games', id, 'dist/old.js')), { code: 'ENOENT' })
  }
  assert.equal(await readFile(path.join(root, 'games/plain/dist/old.js'), 'utf8'), 'stale asset')
})

test('removes temporary containers when artifact extraction fails or has no index', async () => {
  const root = await fixture()
  for (const options of [{ copyError: true }, { missingIndex: true }]) {
    const docker = dockerFixture(options)
    await assert.rejects(extractGameImages(root, { first: image('first') }, docker))
    assert.deepEqual(docker.commands.at(-1), ['rm', '--force', container])
  }
})

test('validates the entire image map before changing output or invoking Docker', async () => {
  const root = await fixture()
  for (const images of [null, [], { first: image('first'), invalid: 'ghcr.io/example/game:latest' },
    { '../first': image('first') }, { first: `${image('first')}\n` }]) {
    const docker = dockerFixture()
    await assert.rejects(extractGameImages(root, images, docker), /Invalid digest-pinned|GAME_IMAGES/)
    assert.deepEqual(docker.commands, [])
    assert.equal(await readFile(path.join(root, 'games/first/dist/old.js'), 'utf8'), 'stale asset')
  }
})

test('leaves games intact when no artifact images are supplied', async () => {
  const root = await fixture()
  const docker = dockerFixture()
  assert.deepEqual(await extractGameImages(root, {}, docker), [])
  assert.deepEqual(docker.commands, [])
  assert.equal(await readFile(path.join(root, 'games/first/dist/old.js'), 'utf8'), 'stale asset')
})
