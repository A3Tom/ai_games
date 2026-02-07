import http from 'node:http'

import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createServer } from './server.js'
import type { RelayConfig } from './types.js'

const TEST_CONFIG: RelayConfig = {
  port: 0,
  maxRooms: 100,
  maxClientsPerRoom: 2,
  roomTimeoutMs: 3600000,
  logLevel: 'info',
}

function getPort(server: http.Server): number {
  const addr = server.address()
  if (addr && typeof addr === 'object') {
    return addr.port
  }
  throw new Error('Server not listening')
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(data.toString()))
  })
}

function joinRoom(ws: WebSocket, roomId: string): void {
  ws.send(JSON.stringify({ type: 'join', roomId }))
}

describe('Relay Server', () => {
  let httpServer: http.Server
  let wss: WebSocketServer
  let port: number
  const clients: WebSocket[] = []

  beforeEach(async () => {
    const server = createServer(TEST_CONFIG)
    httpServer = server.httpServer
    wss = server.wss

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve())
    })
    port = getPort(httpServer)
  })

  afterEach(async () => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close()
      }
    }
    clients.length = 0

    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve())
      })
    })
  })

  it('responds to GET /health', async () => {
    const response = await fetch(`http://localhost:${port}/health`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'ok', rooms: 0, connections: 0 })
  })

  it('returns 404 for non-health paths', async () => {
    const response = await fetch(`http://localhost:${port}/other`)
    expect(response.status).toBe(404)
  })

  it('handles client join flow', async () => {
    const ws = await connectClient(port)
    clients.push(ws)

    const msgPromise = waitForMessage(ws)
    joinRoom(ws, 'test1234')

    const msg = JSON.parse(await msgPromise)
    expect(msg).toEqual({ type: 'peer_count', count: 1 })
  })

  it('sends peer_count 2 when two clients join same room', async () => {
    const wsA = await connectClient(port)
    const wsB = await connectClient(port)
    clients.push(wsA, wsB)

    const msgPromiseA = waitForMessage(wsA)
    joinRoom(wsA, 'room1')
    await msgPromiseA // peer_count: 1

    const msgPromiseA2 = waitForMessage(wsA)
    const msgPromiseB = waitForMessage(wsB)
    joinRoom(wsB, 'room1')

    const [msgA, msgB] = await Promise.all([msgPromiseA2, msgPromiseB])
    expect(JSON.parse(msgA)).toEqual({ type: 'peer_count', count: 2 })
    expect(JSON.parse(msgB)).toEqual({ type: 'peer_count', count: 2 })
  })

  it('forwards messages between peers, not back to sender', async () => {
    const wsA = await connectClient(port)
    const wsB = await connectClient(port)
    clients.push(wsA, wsB)

    // Join room
    const joinA = waitForMessage(wsA)
    joinRoom(wsA, 'room1')
    await joinA

    const joinA2 = waitForMessage(wsA)
    const joinB = waitForMessage(wsB)
    joinRoom(wsB, 'room1')
    await Promise.all([joinA2, joinB])

    // Send game message from A
    const gameMsg = JSON.stringify({ type: 'shot', x: 3, y: 5 })
    const msgPromiseB = waitForMessage(wsB)

    // Set up a timeout to check A doesn't receive it
    let receivedByA = false
    wsA.once('message', () => {
      receivedByA = true
    })

    wsA.send(gameMsg)
    const received = await msgPromiseB

    expect(received).toBe(gameMsg)

    // Wait a bit and verify A didn't get the message back
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(receivedByA).toBe(false)
  })

  it('rejects third client from full room', async () => {
    const wsA = await connectClient(port)
    const wsB = await connectClient(port)
    const wsC = await connectClient(port)
    clients.push(wsA, wsB, wsC)

    // Fill the room
    const joinA = waitForMessage(wsA)
    joinRoom(wsA, 'room1')
    await joinA

    const joinA2 = waitForMessage(wsA)
    const joinB = waitForMessage(wsB)
    joinRoom(wsB, 'room1')
    await Promise.all([joinA2, joinB])

    // Third client tries to join
    const msgPromiseC = waitForMessage(wsC)
    joinRoom(wsC, 'room1')

    const msg = JSON.parse(await msgPromiseC)
    expect(msg).toEqual({
      type: 'error',
      code: 'ROOM_FULL',
      message: 'Room is full',
    })
  })

  it('notifies remaining peer when client disconnects', async () => {
    const wsA = await connectClient(port)
    const wsB = await connectClient(port)
    clients.push(wsA, wsB)

    // Join room
    const joinA = waitForMessage(wsA)
    joinRoom(wsA, 'room1')
    await joinA

    const joinA2 = waitForMessage(wsA)
    const joinB = waitForMessage(wsB)
    joinRoom(wsB, 'room1')
    await Promise.all([joinA2, joinB])

    // Client A disconnects
    const peerLeftPromise = waitForMessage(wsB)
    wsA.close()

    const msg = JSON.parse(await peerLeftPromise)
    expect(msg).toEqual({ type: 'peer_left' })
  })

  it('rejects oversized messages', async () => {
    const ws = await connectClient(port)
    clients.push(ws)

    const joinMsg = waitForMessage(ws)
    joinRoom(ws, 'room1')
    await joinMsg

    // Send a message larger than 4 KB
    const largePayload = JSON.stringify({ type: 'test', data: 'x'.repeat(5000) })
    const errorPromise = waitForMessage(ws)
    ws.send(largePayload)

    const msg = JSON.parse(await errorPromise)
    expect(msg).toEqual({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Message too large',
    })
  })
})
