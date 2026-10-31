import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { assertCollectionOutput, readGames } from './game-registry.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values: flags, positionals: targets } = parseArgs({
  options: {
    install: { type: 'boolean' },
    build: { type: 'boolean' },
    'skip-build': { type: 'string', multiple: true },
  },
  allowPositionals: true,
})
if (targets.length > 1) {
  throw new Error('Usage: node scripts/build-collection.mjs [--install] [--build] [--skip-build=id[,id]] [output-directory]')
}
const output = path.resolve(root, targets[0] ?? 'deploy')
const games = await readGames(root)
await assertCollectionOutput(root, output, games)
const skippedBuilds = new Set((flags['skip-build'] ?? []).flatMap((value) => value.split(',')))
for (const id of skippedBuilds) {
  if (!games.some((game) => game.id === id && game.build)) {
    throw new Error(`Cannot skip build for unregistered or plain game: ${id}`)
  }
}

function run(title, directory, command) {
  console.log(`${title}: pnpm ${command.join(' ')}`)
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', command, {
    cwd: directory, stdio: 'inherit', env: process.env,
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${title}: pnpm ${command.join(' ')} failed`)
}

// One workspace install also prepares shared packages, the server, and tests
// for games whose prebuilt output is being reused.
if (flags.install) run('Workspace', root, ['install', '--frozen-lockfile'])

for (const game of games.filter((game) => game.build)) {
  if (flags.build) {
    if (skippedBuilds.has(game.id)) console.log(`${game.title}: using prebuilt dist/`)
    else run(game.title, path.join(root, game.source), ['run', 'build'])
  }
}

// Validate every entry before replacing any previous collection output.
for (const game of games) {
  const source = path.join(root, game.source, game.build ? 'dist' : '')
  await readFile(path.join(source, 'index.html'))
}
await mkdir(output, { recursive: true })
for (const game of games) {
  const source = path.join(root, game.source, game.build ? 'dist' : '')
  const destination = path.join(output, game.path)
  await rm(destination, { recursive: true, force: true })
  await cp(source, destination, { recursive: true })
}
await cp(path.join(root, 'index.html'), path.join(output, 'index.html'))
await cp(path.join(root, 'games.json'), path.join(output, 'games.json'))
await cp(path.join(root, 'shared'), path.join(output, 'shared'), { recursive: true })
console.log(`Packaged ${games.length} games and dashboard in ${output}`)
