import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

interface ScoreEntry {
  id: string
  name: string
  score: number
  createdAt: string
}

const MAX_SCORE = 1_000_000_000
const BODY_LIMIT = 2048
const RUN_LIFETIME = 2 * 60 * 60 * 1000
const RATE_WINDOW = 60_000
const LEADERBOARD_SIZE = 10

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 16 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value)
}

function validScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SCORE
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validEntry(value: unknown): value is ScoreEntry {
  return record(value) && typeof value.id === 'string' && value.id.length <= 64 &&
    validName(value.name) && validScore(value.score) && typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt))
}

/** One process owns the file. Atomic replacement keeps an interrupted write from corrupting it. */
class ScoreStore {
  private loaded: Promise<ScoreEntry[]> | undefined
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly filename: string) {}

  private async load(): Promise<ScoreEntry[]> {
    if (!this.loaded) {
      this.loaded = (async () => {
        let raw: string
        try {
          raw = await readFile(this.filename, 'utf8')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
          throw error
        }
        const data: unknown = JSON.parse(raw)
        if (!record(data) || data.version !== 1 || !Array.isArray(data.scores) ||
            data.scores.length > LEADERBOARD_SIZE || !data.scores.every(validEntry)) {
          throw new Error('Invalid pinball score file')
        }
        return data.scores.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
      })()
      // Permit recovery if the operator repairs a damaged/unreadable file.
      void this.loaded.catch(() => { this.loaded = undefined })
    }
    return this.loaded
  }

  async list(): Promise<ScoreEntry[]> {
    await this.writes
    return [...await this.load()]
  }

  add(entry: ScoreEntry): Promise<ScoreEntry[]> {
    const operation = this.writes.then(async () => {
      const scores = [...await this.load(), entry]
        .sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt))
        .slice(0, LEADERBOARD_SIZE)
      await mkdir(path.dirname(this.filename), { recursive: true })
      const temporary = `${this.filename}.${randomUUID()}.tmp`
      try {
        const file = await open(temporary, 'wx', 0o600)
        try {
          await file.writeFile(JSON.stringify({ version: 1, scores }) + '\n', 'utf8')
          await file.sync()
        } finally {
          await file.close()
        }
        await rename(temporary, this.filename)
      } catch (error) {
        await unlink(temporary).catch(() => undefined)
        throw error
      }
      this.loaded = Promise.resolve(scores)
      return [...scores]
    })
    this.writes = operation.then(() => undefined, () => undefined)
    return operation
  }
}

interface Run { expiresAt: number; saving: boolean }
interface Rate { window: number; count: number }

export function createPinballHandler(
  filename = process.env.PINBALL_SCORES_FILE || path.resolve('data/pinball-scores.json'),
  origins = (process.env.PINBALL_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
): (req: IncomingMessage, res: ServerResponse) => void {
  const store = new ScoreStore(filename)
  const allowedOrigins = new Set(origins)
  const runs = new Map<string, Run>()
  const rates = new Map<string, Rate>()
  let globalRate: Rate = { window: Date.now(), count: 0 }

  return (req, res) => {
    const route = req.url?.split('?')[0]
    const reply = (status: number, body?: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' || body === undefined ? undefined : JSON.stringify(body))
    }
    const deny = (status: number, error: string): void => { reply(status, { error }); req.resume() }
    const origin = req.headers.origin
    if (origin) {
      let sameHost = false
      try {
        const parsed = new URL(origin)
        sameHost = ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && parsed.host === req.headers.host
      } catch { /* Opaque or malformed origins are denied. */ }
      res.setHeader('Vary', 'Origin')
      if (!sameHost && !allowedOrigins.has(origin)) { deny(403, 'Origin is not allowed'); return }
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    if (route !== '/api/pinball/scores' && route !== '/api/pinball/runs') {
      deny(404, 'Not found')
      return
    }
    const methods = route.endsWith('/scores') ? 'GET, HEAD, POST, OPTIONS' : 'POST, OPTIONS'
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', methods)
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Max-Age', '600')
      reply(204)
      return
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && route.endsWith('/scores')) {
      void store.list().then((scores) => reply(200, { scores }), () => reply(503, { error: 'Leaderboard storage is unavailable' }))
      return
    }
    if (req.method !== 'POST') { res.setHeader('Allow', methods); deny(405, 'Method not allowed'); return }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
      deny(415, 'Use application/json')
      return
    }
    const now = Date.now()
    for (const [key, run] of runs) if (!run.saving && run.expiresAt <= now) runs.delete(key)
    for (const [key, rate] of rates) if (now - rate.window >= RATE_WINDOW) rates.delete(key)
    if (now - globalRate.window >= RATE_WINDOW) globalRate = { window: now, count: 0 }
    const address = req.socket.remoteAddress ?? 'unknown'
    const rate = rates.get(address) ?? { window: now, count: 0 }
    if (rate.count >= 60 || globalRate.count >= 1000 || (!rates.has(address) && rates.size >= 2048)) {
      res.setHeader('Retry-After', '60')
      deny(429, 'Too many requests; try again in a minute')
      return
    }
    rate.count++
    globalRate.count++
    rates.set(address, rate)
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > BODY_LIMIT) { if (!res.writableEnded) reply(413, { error: 'Request body is too large' }); return }
      chunks.push(chunk)
    })
    req.on('error', () => { if (!res.writableEnded) reply(400, { error: 'Could not read request' }) })
    req.on('end', () => {
      if (res.writableEnded) return
      let body: unknown
      try { body = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch {
        reply(400, { error: 'Invalid JSON' })
        return
      }
      if (!record(body)) { reply(400, { error: 'Expected a JSON object' }); return }
      if (route.endsWith('/runs')) {
        if (runs.size >= 10_000) { reply(429, { error: 'Too many active games; try again later' }); return }
        const runId = randomUUID()
        runs.set(runId, { expiresAt: Date.now() + RUN_LIFETIME, saving: false })
        reply(201, { runId })
        return
      }
      if (!validName(body.name) || !validScore(body.score) || typeof body.runId !== 'string') {
        reply(400, { error: 'Use a name of 1–16 characters and a whole score from 0 to 1000000000' })
        return
      }
      const run = runs.get(body.runId)
      if (!run || run.saving || run.expiresAt <= Date.now()) {
        reply(409, { error: 'This game has expired or its score was already submitted' })
        return
      }
      const runId = body.runId
      run.saving = true
      const entry: ScoreEntry = { id: runId, name: body.name.trim(), score: body.score, createdAt: new Date().toISOString() }
      void store.add(entry).then((scores) => {
        runs.delete(runId)
        reply(201, { scores, entry })
      }, () => {
        run.saving = false
        reply(503, { error: 'Score could not be saved; please try again' })
      })
    })
  }
}
