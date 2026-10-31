import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readGames } from './game-registry.mjs'

function validateImages(images) {
  if (!images || typeof images !== 'object' || Array.isArray(images)) {
    throw new Error('GAME_IMAGES must be a JSON object of digest-pinned GHCR images')
  }
  for (const [id, image] of Object.entries(images)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) || typeof image !== 'string' ||
        !/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$/.test(image)) {
      throw new Error(`Invalid digest-pinned game image: ${id}`)
    }
  }
}

// Only registered, compiled games are extracted; Dockerfiles may also exist for
// games that have not yet joined the collection.
export async function extractGameImages(root, images, { run = (args) => execFileSync('docker', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 10 * 1024 * 1024,
}) } = {}) {
  validateImages(images)
  const games = await readGames(root)
  const skipped = []
  for (const [id, image] of Object.entries(images).sort(([a], [b]) => a.localeCompare(b))) {
    const registered = games.filter((game) => game.source === `games/${id}` && game.build)
    if (registered.length === 0) continue
    const output = path.join(root, 'games', id, 'dist')
    await run(['pull', '--platform', 'linux/amd64', image])
    const container = (await run(['create', '--platform', 'linux/amd64', image, '/artifact-only'])).trim()
    if (!/^[0-9a-f]{12,64}$/.test(container)) throw new Error(`Invalid artifact container ID for ${id}`)
    try {
      await rm(output, { recursive: true, force: true })
      await mkdir(output, { recursive: true })
      await run(['cp', `${container}:/dist/.`, output])
      await readFile(path.join(output, 'index.html'))
    } finally {
      await run(['rm', '--force', container])
    }
    skipped.push(...registered.map((game) => game.id))
  }
  return skipped
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const skipped = await extractGameImages(root, JSON.parse(process.env.GAME_IMAGES ?? '{}'))
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `skip_build=${skipped.join(',')}\n`)
  }
  console.log(`Reused artifact images for ${skipped.join(', ') || 'no registered games'}`)
}
