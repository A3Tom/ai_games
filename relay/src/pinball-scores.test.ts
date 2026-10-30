import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createServer } from './server.js'

describe('Pinball leaderboard', () => {
  let directory: string
  let filename: string
  let server: ReturnType<typeof createServer> | undefined
  let origin: string

  async function start(): Promise<void> {
    server = createServer({ port: 0, maxRooms: 10, maxClientsPerRoom: 4, roomTimeoutMs: 60_000, logLevel: 'error' })
    await new Promise<void>((resolve) => server!.httpServer.listen(0, '127.0.0.1', resolve))
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind')
    origin = `http://127.0.0.1:${address.port}`
  }

  async function stop(): Promise<void> {
    const current = server
    if (!current) return
    server = undefined
    await new Promise<void>((resolve) => current.wss.close(() => current.httpServer.close(() => resolve())))
  }

  function post(route: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${origin}/api/pinball/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    })
  }

  async function run(): Promise<string> {
    const response = await post('runs', {})
    expect(response.status).toBe(201)
    const body = await response.json() as { runId: string }
    expect(body.runId).toMatch(/^[a-f0-9-]{36}$/)
    return body.runId
  }

  async function list(): Promise<{ scores: { id: string; name: string; score: number; createdAt: string }[] }> {
    const response = await fetch(`${origin}/api/pinball/scores`)
    expect(response.status).toBe(200)
    return response.json() as ReturnType<typeof list>
  }

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'ai-games-pinball-'))
    filename = path.join(directory, 'scores.json')
    vi.stubEnv('PINBALL_SCORES_FILE', filename)
    vi.stubEnv('PINBALL_ALLOWED_ORIGINS', '')
    await start()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await stop()
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  })

  it('starts with an empty leaderboard without creating files', async () => {
    expect(await list()).toEqual({ scores: [] })
    expect(await readdir(directory)).toEqual([])
    const head = await fetch(`${origin}/api/pinball/scores`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('cache-control')).toBe('no-store')
    expect(await head.text()).toBe('')
  })

  it('persists scores atomically and restores them after a server restart', async () => {
    const runId = await run()
    const saved = await post('scores', { runId, name: '  Cadet  ', score: 123_450 })
    expect(saved.status).toBe(201)
    const body = await saved.json() as { scores: unknown[]; entry: unknown }
    expect(body.entry).toMatchObject({ id: runId, name: 'Cadet', score: 123_450 })
    expect(body.scores).toEqual([body.entry])
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual({ version: 1, scores: body.scores })
    expect(await readdir(directory)).toEqual(['scores.json'])
    await stop()
    await start()
    expect((await list()).scores).toEqual(body.scores)
  })

  it('keeps the ten best scores in descending order, preserving earlier ties', async () => {
    for (let index = 0; index < 12; index++) {
      const saved = await post('scores', { runId: await run(), name: `Cadet ${index}`, score: index < 2 ? 1000 : index * 1000 })
      expect(saved.status).toBe(201)
      await saved.text()
    }
    const scores = (await list()).scores
    expect(scores).toHaveLength(10)
    expect(scores.map((entry) => entry.score)).toEqual([11000, 10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000])
    expect(JSON.parse(await readFile(filename, 'utf8')).scores).toHaveLength(10)
  })

  it('keeps an earlier entry before a new entry with the same score', async () => {
    await post('scores', { runId: await run(), name: 'First', score: 100 })
    await post('scores', { runId: await run(), name: 'Second', score: 100 })
    expect((await list()).scores.map((entry) => entry.name)).toEqual(['First', 'Second'])
  })

  it('serializes concurrent writes without losing scores', async () => {
    const ids = await Promise.all([run(), run(), run(), run()])
    const results = await Promise.all(ids.map((runId, index) => post('scores', { runId, name: `Cadet ${index}`, score: index * 100 })))
    expect(results.map((response) => response.status)).toEqual([201, 201, 201, 201])
    expect((await list()).scores.map((entry) => entry.score)).toEqual([300, 200, 100, 0])
  })

  it.each([
    { name: '', score: 100 }, { name: '   ', score: 100 }, { name: 'abcdefghijklmnopq', score: 100 },
    { name: 'Bad\u0000name', score: 100 }, { name: 'Cadet', score: -1 }, { name: 'Cadet', score: 1.5 },
    { name: 'Cadet', score: 1_000_000_001 }, { name: 'Cadet', score: '1000' }, { name: 'Cadet', score: null },
  ])('rejects invalid name/score input %j without consuming the run', async (input) => {
    const runId = await run()
    expect((await post('scores', { runId, ...input })).status).toBe(400)
    expect((await post('scores', { runId, name: 'Cadet', score: 100 })).status).toBe(201)
  })

  it('rejects unknown, expired, and reused game tokens', async () => {
    expect((await post('scores', { runId: 'missing', name: 'Cadet', score: 1 })).status).toBe(409)
    const runId = await run()
    const requests = await Promise.all([
      post('scores', { runId, name: 'Cadet', score: 1 }),
      post('scores', { runId, name: 'Cadet', score: 2 }),
    ])
    expect(requests.map((response) => response.status).sort()).toEqual([201, 409])
    expect((await post('scores', { runId, name: 'Cadet', score: 3 })).status).toBe(409)
    const expiring = await run()
    const future = Date.now() + 2 * 60 * 60 * 1000 + 1
    vi.spyOn(Date, 'now').mockReturnValue(future)
    expect((await post('scores', { runId: expiring, name: 'Cadet', score: 1 })).status).toBe(409)
  })

  it('does not report a failed write as saved, and allows retry with the same run', async () => {
    await list()
    await mkdir(filename)
    const runId = await run()
    const failed = await post('scores', { runId, name: 'Cadet', score: 100 })
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'Score could not be saved; please try again' })
    expect((await list()).scores).toEqual([])
    expect(await readdir(directory)).toEqual(['scores.json'])
    await rm(filename, { recursive: true })
    expect((await post('scores', { runId, name: 'Cadet', score: 100 })).status).toBe(201)
    expect((await list()).scores).toHaveLength(1)
  })

  it('returns a storage error for corrupt data and preserves the original file', async () => {
    await writeFile(filename, 'not valid JSON')
    const failed = await fetch(`${origin}/api/pinball/scores`)
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain(filename)
    expect((await post('scores', { runId: await run(), name: 'Cadet', score: 100 })).status).toBe(503)
    expect(await readFile(filename, 'utf8')).toBe('not valid JSON')
  })

  it('recovers when an unreadable score path is repaired', async () => {
    await mkdir(filename)
    expect((await fetch(`${origin}/api/pinball/scores`)).status).toBe(503)
    await rm(filename, { recursive: true })
    expect((await list()).scores).toEqual([])
  })

  it('rejects unsupported content types, invalid JSON, oversized bodies and invalid methods', async () => {
    expect((await post('scores', {}, { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await fetch(`${origin}/api/pinball/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400)
    expect((await post('scores', { padding: 'a'.repeat(3000) })).status).toBe(413)
    expect((await post('scores', [])).status).toBe(400)
    const wrongMethod = await fetch(`${origin}/api/pinball/scores`, { method: 'DELETE' })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('GET, HEAD, POST, OPTIONS')
    expect((await fetch(`${origin}/api/pinball/runs`)).status).toBe(405)
    expect((await fetch(`${origin}/api/pinball/unknown`)).status).toBe(404)
  })

  it('supports same-origin requests and refuses unapproved cross-origin reads and writes', async () => {
    const sameOrigin = await post('runs', {}, { Origin: origin })
    expect(sameOrigin.status).toBe(201)
    expect(sameOrigin.headers.get('access-control-allow-origin')).toBe(origin)
    expect((await post('runs', {}, { Origin: 'https://other.example' })).status).toBe(403)
    expect((await fetch(`${origin}/api/pinball/scores`, { headers: { Origin: 'null' } })).status).toBe(403)
    expect((await fetch(`${origin}/api/pinball/scores`, { headers: { Origin: `${origin}/unexpected` } })).status).toBe(403)
  })

  it('allows configured Pages origins and CORS preflight', async () => {
    await stop()
    vi.stubEnv('PINBALL_ALLOWED_ORIGINS', 'https://a3tom.github.io, https://games.example')
    await start()
    const headers = { Origin: 'https://a3tom.github.io' }
    const preflight = await fetch(`${origin}/api/pinball/scores`, {
      method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(headers.Origin)
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type')
    expect(preflight.headers.get('vary')).toBe('Origin')
    expect((await post('runs', {}, headers)).status).toBe(201)
    const scores = await fetch(`${origin}/api/pinball/scores`, { headers })
    expect(scores.status).toBe(200)
    expect(scores.headers.get('access-control-allow-origin')).toBe(headers.Origin)
  })

  it('bounds the number of game requests per address', async () => {
    for (let index = 0; index < 60; index++) await run()
    const response = await post('runs', {})
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
  })
})
