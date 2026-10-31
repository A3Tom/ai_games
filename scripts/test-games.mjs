import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readGames } from './game-registry.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const games = await readGames(root)
for (const game of games.filter((game) => game.build)) {
  const directory = path.join(root, game.source)
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  if (!manifest.scripts?.test) continue
  console.log(`${game.title}: npm test`)
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
    cwd: directory, stdio: 'inherit', env: process.env, shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${game.title}: npm test failed`)
}
