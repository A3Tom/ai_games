import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertCollectionOutput, readGames } from './game-registry.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const targets = args.filter((arg) => !arg.startsWith('--'))
if (targets.length > 1 || [...flags].some((flag) => !['--install', '--build'].includes(flag))) {
  throw new Error('Usage: node scripts/build-collection.mjs [--install] [--build] [output-directory]')
}
const output = path.resolve(root, targets[0] ?? 'deploy')
const games = await readGames(root)
await assertCollectionOutput(root, output, games)

function run(game, command) {
  console.log(`${game.title}: npm ${command.join(' ')}`)
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', command, {
    cwd: path.join(root, game.source), stdio: 'inherit', env: process.env,
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${game.title}: npm ${command.join(' ')} failed`)
}

for (const game of games.filter((game) => game.build)) {
  if (flags.has('--install')) run(game, ['ci', '--no-audit', '--no-fund'])
  if (flags.has('--build')) run(game, ['run', 'build'])
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
