import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

const segment = /^[a-z0-9][a-z0-9_-]*$/
const reservedRoutes = new Set(['api', 'health', 'metrics', 'relay', 'shared', 'telemetry'])

export function validateGames(games) {
  if (!Array.isArray(games) || games.length === 0) throw new Error('games.json must list at least one game')
  const ids = new Set()
  const routes = new Set()
  for (const game of games) {
    if (!game || typeof game !== 'object' ||
        typeof game.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(game.id) ||
        typeof game.path !== 'string' || !segment.test(game.path) || reservedRoutes.has(game.path) ||
        typeof game.source !== 'string' || !game.source.split('/').every((part) => segment.test(part)) ||
        typeof game.title !== 'string' || typeof game.description !== 'string' ||
        typeof game.icon !== 'string' || !Array.isArray(game.tags) ||
        !game.tags.every((tag) => typeof tag === 'string') || typeof game.build !== 'boolean') {
      throw new Error(`Invalid game entry: ${game?.id ?? '(missing id)'}`)
    }
    if (ids.has(game.id) || routes.has(game.path)) throw new Error(`Duplicate game ID or route: ${game.id}`)
    ids.add(game.id)
    routes.add(game.path)
  }
  return games
}

export async function readGames(root) {
  const games = validateGames(JSON.parse(await readFile(path.join(root, 'games.json'), 'utf8')))
  const canonicalRoot = await realpath(root)
  for (const game of games) {
    const source = await realpath(path.join(root, game.source))
    if (!source.startsWith(canonicalRoot + path.sep)) {
      throw new Error(`Game source must stay inside the repository: ${game.source}`)
    }
  }
  return games
}

// Resolve existing parents too: an output directory may not exist yet, or may
// reach a source directory through a symlink.
async function canonicalPath(directory) {
  try {
    return await realpath(directory)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return path.join(await canonicalPath(path.dirname(directory)), path.basename(directory))
  }
}

export async function assertCollectionOutput(root, output, games) {
  const protectedPaths = await Promise.all([
    root,
    ...games.map((game) => path.join(root, game.source)),
    ...['games', 'services', 'packages', 'scripts', 'shared', 'docker', 'observability', 'docs',
      '.git', '.github', '.agents', '.codex', '.aws', '.vscode'].map((directory) => path.join(root, directory)),
  ].map(canonicalPath))
  const destination = await canonicalPath(output)
  if (destination === path.parse(destination).root ||
      protectedPaths.some((source) => source === destination || source.startsWith(destination + path.sep)) ||
      protectedPaths.slice(1).some((source) => destination.startsWith(source + path.sep))) {
    throw new Error('Collection output must be separate from repository source directories')
  }
}
