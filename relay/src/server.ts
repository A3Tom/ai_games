import http from 'node:http'

import { WebSocketServer, WebSocket } from 'ws'

import { RoomManager } from './room-manager.js'
import { createHealthHandler } from './health.js'
import { isIdentifier, isJoinMessage, isModernJoinMessage, isRecord } from './types.js'
import type { RelayConfig, RelayStats } from './types.js'

const MAX_MESSAGE_SIZE = 4096
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000

interface RateLimiter {
  count: number
  windowStart: number
}

function loadConfig(): RelayConfig {
  return {
    port: parseInt(process.env.PORT ?? '8080', 10),
    maxRooms: parseInt(process.env.MAX_ROOMS ?? '100', 10),
    maxClientsPerRoom: parseInt(process.env.MAX_CLIENTS_PER_ROOM ?? '2', 10),
    roomTimeoutMs: parseInt(process.env.ROOM_TIMEOUT_MS ?? '3600000', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  }
}

export function createServer(config: RelayConfig): {
  httpServer: http.Server
  wss: WebSocketServer
  roomManager: RoomManager
} {
  const startedAt = Date.now()
  const counters = { messagesReceived: 0, messagesForwarded: 0, bytesReceived: 0, bytesSent: 0, rejectedMessages: 0 }
  function sendRaw(ws: WebSocket, message: string): void {
    if (ws.readyState !== WebSocket.OPEN) return
    counters.bytesSent += Buffer.byteLength(message, 'utf8')
    ws.send(message)
  }
  function send(ws: WebSocket, message: unknown): void {
    sendRaw(ws, JSON.stringify(message))
  }

  const roomManager = new RoomManager(config, sendRaw)
  const httpServer = http.createServer(createHealthHandler(() => roomManager.getStats()))
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 })
  const rateLimiters = new Map<WebSocket, RateLimiter>()
  const modernClients = new WeakSet<WebSocket>()
  const alive = new Set<WebSocket>()

  function reject(ws: WebSocket, code: string, message: string): void {
    counters.rejectedMessages++
    send(ws, { type: modernClients.has(ws) ? 'relay:error' : 'error', code, message })
  }

  function stats(): RelayStats {
    const membership = roomManager.getStats()
    return {
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      rooms: membership.rooms,
      players: membership.connections,
      connections: wss.clients.size,
      ...counters,
    }
  }

  function modernMessage(ws: WebSocket, message: Record<string, unknown>): void {
    switch (message.type) {
      case 'relay:join': {
        if (!isModernJoinMessage(message)) {
          reject(ws, 'INVALID_MESSAGE', 'Join requires valid app, room, player IDs and a name (1–32 characters)')
          return
        }
        const result = roomManager.joinModern(message, ws)
        if (!result.success) reject(ws, result.error ?? 'ROOM_FULL', 'Could not join that room; your current room is unchanged')
        return
      }
      case 'relay:leave':
        roomManager.leave(ws)
        return
      case 'relay:ping':
        if (!isIdentifier(message.id)) {
          reject(ws, 'INVALID_MESSAGE', 'Ping requires an ID (1–64 letters, numbers, underscores or hyphens)')
          return
        }
        send(ws, { type: 'relay:pong', id: message.id })
        return
      case 'relay:stats':
        send(ws, { type: 'relay:stats', stats: stats() })
        return
      case 'relay:ready':
        if (typeof message.ready !== 'boolean') reject(ws, 'INVALID_MESSAGE', 'Ready must be true or false')
        else if (!roomManager.setReady(ws, message.ready)) reject(ws, 'NOT_IN_ROOM', 'Join a room first')
        return
      case 'relay:message': {
        if (!isIdentifier(message.messageId) || !('payload' in message)) {
          reject(ws, 'INVALID_MESSAGE', 'Message requires a valid ID and payload')
          return
        }
        const recipients = roomManager.broadcastModern(ws, message.messageId, message.payload)
        if (recipients === null) reject(ws, 'NOT_IN_ROOM', 'Join a room first')
        else {
          counters.messagesForwarded += recipients
          send(ws, { type: 'relay:ack', messageId: message.messageId, recipients })
        }
        return
      }
      default:
        reject(ws, 'INVALID_MESSAGE', 'Unknown or server-only relay message type')
    }
  }

  // Browser sockets answer these control pings automatically. Dead clients are
  // removed when a laptop loses its network without a clean close frame.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        roomManager.leave(ws, false)
        ws.terminate()
      } else {
        alive.delete(ws)
        ws.ping()
      }
    }
  }, 30_000)
  heartbeat.unref()
  wss.on('close', () => {
    clearInterval(heartbeat)
    roomManager.dispose()
  })

  wss.on('connection', (ws: WebSocket) => {
    rateLimiters.set(ws, { count: 0, windowStart: Date.now() })
    alive.add(ws)
    ws.on('pong', () => alive.add(ws))
    console.log(JSON.stringify({ event: 'client_connected', timestamp: new Date().toISOString() }))

    ws.on('message', (data, isBinary) => {
      const rawMessage = data.toString()
      const byteLength = Buffer.byteLength(rawMessage, 'utf8')
      counters.messagesReceived++
      counters.bytesReceived += byteLength
      if (byteLength > MAX_MESSAGE_SIZE) {
        reject(ws, 'INVALID_MESSAGE', 'Message too large')
        return
      }
      if (isBinary) {
        reject(ws, 'INVALID_MESSAGE', 'Send JSON text messages')
        return
      }

      const limiter = rateLimiters.get(ws)
      if (limiter) {
        const now = Date.now()
        if (now - limiter.windowStart >= RATE_LIMIT_WINDOW_MS) {
          limiter.count = 0
          limiter.windowStart = now
        }
        if (limiter.count >= RATE_LIMIT_MAX) {
          reject(ws, 'RATE_LIMITED', 'Rate limit exceeded')
          return
        }
        limiter.count++
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rawMessage)
      } catch {
        reject(ws, 'INVALID_MESSAGE', 'Invalid JSON')
        return
      }
      if (!isRecord(parsed) || typeof parsed.type !== 'string' || parsed.type.length === 0) {
        reject(ws, 'INVALID_MESSAGE', 'Message must be an object with a type')
        return
      }

      if (parsed.type.startsWith('relay:')) {
        modernClients.add(ws)
        modernMessage(ws, parsed)
      } else if (isJoinMessage(parsed)) {
        if (modernClients.has(ws)) {
          reject(ws, 'INVALID_MESSAGE', 'Use relay:join for namespaced rooms')
          return
        }
        const result = roomManager.join(parsed.roomId, ws)
        if (!result.success) {
          reject(ws, 'ROOM_FULL', 'Room is full')
          ws.close()
        }
      } else if (modernClients.has(ws) || roomManager.isModernClient(ws)) {
        reject(ws, 'INVALID_MESSAGE', 'Use relay:message for room messages')
      } else if (parsed.type === 'join') {
        reject(ws, 'INVALID_MESSAGE', 'Invalid room ID')
      } else {
        counters.messagesForwarded += roomManager.broadcast(ws, rawMessage)
      }
    })

    ws.on('close', () => {
      rateLimiters.delete(ws)
      alive.delete(ws)
      roomManager.leave(ws, false)
      console.log(JSON.stringify({ event: 'client_disconnected', timestamp: new Date().toISOString() }))
    })
    ws.on('error', (error: Error) => {
      console.log(JSON.stringify({ event: 'client_error', message: error.message, timestamp: new Date().toISOString() }))
      rateLimiters.delete(ws)
      alive.delete(ws)
      roomManager.leave(ws, false)
    })
  })

  return { httpServer, wss, roomManager }
}

const isMainModule = process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server.ts'))

if (isMainModule) {
  const config = loadConfig()
  const { httpServer, wss } = createServer(config)
  httpServer.listen(config.port, () => {
    console.log(JSON.stringify({ event: 'server_started', port: config.port, timestamp: new Date().toISOString() }))
  })
  function handleShutdown(): void {
    console.log(JSON.stringify({ event: 'server_stopped', timestamp: new Date().toISOString() }))
    wss.close()
    httpServer.close()
    process.exit(0)
  }
  process.on('SIGTERM', handleShutdown)
  process.on('SIGINT', handleShutdown)
}
