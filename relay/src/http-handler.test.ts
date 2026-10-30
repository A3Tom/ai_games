import http from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { WebSocket } from 'ws'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createServer } from './server.js'

describe('Collection HTTP server', () => {
  let fixture: string
  let staticDir: string
  let server: ReturnType<typeof createServer>
  let port: number
  let origin: string

  beforeAll(async () => {
    fixture = await mkdtemp(path.join(os.tmpdir(), 'ai-games-http-'))
    staticDir = path.join(fixture, 'collection')
    await mkdir(path.join(staticDir, 'playground', 'assets'), { recursive: true })
    await writeFile(path.join(staticDir, 'index.html'), '<html>Game collection</html>')
    await writeFile(path.join(staticDir, 'games.json'), '[{"id":"playground"}]')
    await writeFile(path.join(staticDir, 'playground', 'index.html'), '<html><script src="./assets/game.js"></script></html>')
    await writeFile(path.join(staticDir, 'playground', 'assets', 'game.js'), 'console.log("game")')
    await writeFile(path.join(staticDir, '.env'), 'PRIVATE_TOKEN=secret')
    await writeFile(path.join(fixture, 'outside.txt'), 'PRIVATE_FILE=secret')
  })

  beforeEach(async () => {
    server = createServer({ port: 0, maxRooms: 100, maxClientsPerRoom: 4, roomTimeoutMs: 3600000, logLevel: 'info' }, staticDir)
    await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve))
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Server did not bind a port')
    port = address.port
    origin = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    for (const client of server.wss.clients) client.terminate()
    await new Promise<void>((resolve) => server.wss.close(() => server.httpServer.close(() => resolve())))
  })

  afterAll(async () => {
    await rm(fixture, { recursive: true, force: true })
  })

  it('serves the dashboard and catalogue with the correct content types', async () => {
    const dashboard = await fetch(origin)
    expect(dashboard.status).toBe(200)
    expect(dashboard.headers.get('content-type')).toContain('text/html')
    expect(await dashboard.text()).toBe('<html>Game collection</html>')

    const catalogue = await fetch(`${origin}/games.json`)
    expect(catalogue.headers.get('content-type')).toContain('application/json')
    expect(await catalogue.json()).toEqual([{ id: 'playground' }])
  })

  it('redirects directory URLs before serving a game and its relative assets', async () => {
    const redirect = await fetch(`${origin}/playground?room=abc`, { redirect: 'manual' })
    expect(redirect.status).toBe(301)
    expect(redirect.headers.get('location')).toBe('/playground/?room=abc')

    const game = await fetch(`${origin}/playground/`)
    expect(game.status).toBe(200)
    expect(await game.text()).toContain('./assets/game.js')
    const script = await fetch(`${origin}/playground/assets/game.js`)
    expect(script.status).toBe(200)
    expect(script.headers.get('content-type')).toMatch(/(?:text|application)\/javascript/)
    expect(await script.text()).toBe('console.log("game")')
  })

  it('supports HEAD requests without sending the file body', async () => {
    const response = await fetch(`${origin}/playground/assets/game.js`, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength('console.log("game")')))
    expect(await response.text()).toBe('')
  })

  it('keeps both relay health URLs available alongside static files', async () => {
    for (const route of ['/health', '/relay/health']) {
      const response = await fetch(`${origin}${route}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok', rooms: 0, connections: 0 })
    }
  })

  it('returns a generic 404 for missing files without serving a dashboard fallback', async () => {
    const response = await fetch(`${origin}/missing.html`)
    expect(response.status).toBe(404)
    const body = await response.text()
    expect(body).not.toContain('Game collection')
    expect(body).not.toContain(staticDir)
  })

  it.each(['/.env', '/%2eenv', '/%2e%2e%2foutside.txt', '/%00'])('does not expose unsafe path %s', async (requestPath) => {
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: requestPath }, (incoming) => {
        let body = ''
        incoming.setEncoding('utf8')
        incoming.on('data', (chunk: string) => { body += chunk })
        incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, body }))
      }).on('error', reject)
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(response.body).not.toContain('secret')
    expect(response.body).not.toContain(fixture)
  })

  it('answers WebSocket messages on /relay while serving the collection', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/relay`)
    await new Promise<void>((resolve, reject) => {
      client.once('open', resolve)
      client.once('error', reject)
    })
    const message = new Promise<unknown>((resolve) => {
      client.once('message', (data) => resolve(JSON.parse(data.toString())))
    })
    client.send(JSON.stringify({ type: 'relay:ping', id: 'collection-test' }))
    const [pong, dashboard] = await Promise.all([message, fetch(origin)])
    expect(pong).toEqual({ type: 'relay:pong', id: 'collection-test' })
    expect(dashboard.status).toBe(200)
    await dashboard.text()
    await new Promise<void>((resolve) => {
      client.once('close', resolve)
      client.close()
    })
  })
})
