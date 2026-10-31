import http from 'node:http'

import { WebSocket } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createServer } from './server.js'

describe('Shared observability HTTP integration', () => {
  let server: ReturnType<typeof createServer> | undefined
  let sink: http.Server | undefined
  let origin: string
  const output: Record<string, unknown>[] = []

  async function listen(listener: http.Server): Promise<string> {
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
    const address = listener.address()
    if (!address || typeof address === 'string') throw new Error('No listening port')
    return `http://127.0.0.1:${address.port}`
  }

  async function start(): Promise<void> {
    server = createServer({ port: 0, maxRooms: 100, maxClientsPerRoom: 4, roomTimeoutMs: 3600000, logLevel: 'info' })
    origin = await listen(server.httpServer)
  }

  function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${origin}/telemetry`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers }, body: JSON.stringify(body),
    })
  }

  const batch = {
    appId: 'minesweeper',
    logs: [
      { level: 'info', event: 'page_loaded', message: 'Game page loaded', durationMs: 125 },
      { level: 'error', event: 'javascript_error', message: 'Example failure', stack: 'Error: Example failure' },
    ],
  }

  beforeEach(() => {
    output.length = 0
    vi.stubEnv('VICTORIALOGS_URL', '')
    vi.stubEnv('VICTORIALOGS_TOKEN', '')
    vi.stubEnv('TELEMETRY_ALLOWED_ORIGINS', '')
    vi.spyOn(console, 'log').mockImplementation((line: string) => { output.push(JSON.parse(line) as Record<string, unknown>) })
  })

  afterEach(async () => {
    if (server) {
      for (const ws of server.wss.clients) ws.terminate()
      await new Promise<void>((resolve) => server!.wss.close(() => server!.httpServer.close(() => resolve())))
      await server.observability.close()
    }
    if (sink) await new Promise<void>((resolve) => sink!.close(() => resolve()))
    server = undefined
    sink = undefined
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('collects browser and relay logs together and exposes scrapeable game and traffic metrics', async () => {
    await start()
    expect((await post(batch)).status).toBe(204)
    expect(output).toContainEqual(expect.objectContaining({
      service: 'ai-games', source: 'browser', appId: 'minesweeper', level: 'error',
      event: 'javascript_error', message: 'Example failure', timestamp: expect.any(String), instance: expect.any(String),
    }))
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/relay')
    await new Promise<void>((resolve) => ws.once('open', resolve))
    const reply = new Promise<unknown>((resolve) => ws.once('message', (data) => resolve(JSON.parse(data.toString()))))
    ws.send(JSON.stringify({ type: 'relay:ping', id: 'observability' }))
    expect(await reply).toEqual({ type: 'relay:pong', id: 'observability' })
    expect(output).toContainEqual(expect.objectContaining({ source: 'relay', appId: 'relay', event: 'client_connected' }))
    const response = await fetch(`${origin}/metrics`)
    expect(response.headers.get('content-type')).toContain('text/plain; version=0.0.4')
    const metrics = await response.text()
    expect(metrics).toContain('ai_games_browser_logs_total{app_id="minesweeper",level="error"} 1')
    expect(metrics).toContain('ai_games_page_loads_total{app_id="minesweeper"} 1')
    expect(metrics).toContain('ai_games_page_load_duration_seconds_sum{app_id="minesweeper"} 0.125')
    expect(metrics).toContain('ai_games_connections 1')
    expect(metrics).toContain('ai_games_messages_received_total 1')
    expect((await fetch(`${origin}/relay/metrics`)).status).toBe(200)
    expect(await (await fetch(`${origin}/health`)).json()).toEqual({ status: 'ok', rooms: 0, connections: 0 })
    // Page-load counts and timing sample counts differ when timing is absent.
    await post({ appId: 'minesweeper', logs: [{ level: 'info', event: 'page_loaded', message: 'No timing available' }] })
    const updated = await (await fetch(`${origin}/metrics`)).text()
    expect(updated).toContain('ai_games_page_loads_total{app_id="minesweeper"} 2')
    expect(updated).toContain('ai_games_page_load_duration_seconds_count{app_id="minesweeper"} 1')
    const joined = new Promise<void>((resolve) => ws.once('message', () => resolve()))
    ws.send(JSON.stringify({ type: 'relay:join', appId: 'multiplayer-lab', roomId: 'test-room', playerId: 'test-player', name: 'Player' }))
    await joined
    expect(output).toContainEqual(expect.objectContaining({ source: 'relay', appId: 'playground', event: 'peer_joined' }))
  })

  it('rejects invalid and oversized batches and only allows opted-in browser origins', async () => {
    vi.stubEnv('TELEMETRY_ALLOWED_ORIGINS', 'https://games.example.com')
    await start()
    expect((await post({ ...batch, logs: [{ level: 'error', event: 'broken', message: {} }] })).status).toBe(400)
    expect((await post({ ...batch, logs: [] })).status).toBe(400)
    expect((await post({ ...batch, appId: 'invalid"label' })).status).toBe(400)
    expect((await post({ ...batch, logs: [{ ...batch.logs[0], message: 'x'.repeat(70_000) }] })).status).toBe(413)
    expect((await post(batch, { Origin: 'https://unexpected.example.com' })).status).toBe(403)
    const allowed = await post(batch, { Origin: 'https://games.example.com' })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://games.example.com')
    expect(output.filter((entry) => entry.source === 'browser')).toHaveLength(2)
  })

  it('forwards NDJSON with VictoriaLogs field mappings and server-side authorization', async () => {
    const batches: { headers: http.IncomingHttpHeaders; path: string | undefined; body: string }[] = []
    sink = http.createServer((req, res) => {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => { body += chunk })
      req.on('end', () => { batches.push({ headers: req.headers, path: req.url, body }); res.writeHead(200); res.end() })
    })
    vi.stubEnv('VICTORIALOGS_URL', await listen(sink))
    vi.stubEnv('VICTORIALOGS_TOKEN', 'test-token')
    await start()
    expect((await post(batch)).status).toBe(204)
    await server!.observability.close()
    expect(batches).toHaveLength(1)
    expect(batches[0]!.path).toBe('/insert/jsonline')
    expect(batches[0]!.headers).toMatchObject({
      'content-type': 'application/stream+json', 'vl-time-field': 'timestamp',
      'vl-msg-field': 'message', 'vl-stream-fields': 'service,instance,environment,source,appId', authorization: 'Bearer test-token',
    })
    expect(batches[0]!.body.trim().split('\n').map((line) => JSON.parse(line))).toHaveLength(2)
    expect(JSON.stringify(output)).not.toContain('test-token')
  })

  it('keeps the collector and games healthy when log storage rejects a batch', async () => {
    sink = http.createServer((req, res) => { req.resume(); res.writeHead(503); res.end() })
    vi.stubEnv('VICTORIALOGS_URL', await listen(sink))
    await start()
    expect((await post(batch)).status).toBe(204)
    await server!.observability.close()
    expect((await fetch(`${origin}/health`)).status).toBe(200)
    const metrics = await (await fetch(`${origin}/metrics`)).text()
    expect(metrics).toContain('ai_games_log_forward_failures_total 1')
    expect(metrics).toContain('ai_games_log_forward_dropped_total 2')
    expect(metrics).toContain('ai_games_log_forward_queue 0')
    expect(output).toContainEqual(expect.objectContaining({ event: 'log_forward_failed', level: 'warn' }))
  })
})
