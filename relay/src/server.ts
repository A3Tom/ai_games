import http from 'node:http'

import { WebSocketServer, WebSocket } from 'ws'

import { RoomManager } from './room-manager.js'
import { createHealthHandler } from './health.js'
import { isJoinMessage, RELAY_ERROR_CODE } from './types.js'
import type { RelayConfig, RelayErrorMessage } from './types.js'

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

function sendError(ws: WebSocket, code: RelayErrorMessage['code'], message: string): void {
  const errorMsg: RelayErrorMessage = { type: 'error', code, message }
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(errorMsg))
  }
}

export function createServer(config: RelayConfig): {
  httpServer: http.Server
  wss: WebSocketServer
  roomManager: RoomManager
} {
  const roomManager = new RoomManager({
    maxRooms: config.maxRooms,
    maxClientsPerRoom: config.maxClientsPerRoom,
    roomTimeoutMs: config.roomTimeoutMs,
  })

  const healthHandler = createHealthHandler(() => roomManager.getStats())
  const httpServer = http.createServer(healthHandler)
  const wss = new WebSocketServer({ server: httpServer })

  const rateLimiters = new Map<WebSocket, RateLimiter>()

  wss.on('connection', (ws: WebSocket) => {
    rateLimiters.set(ws, { count: 0, windowStart: Date.now() })

    console.log(
      JSON.stringify({
        event: 'client_connected',
        timestamp: new Date().toISOString(),
      })
    )

    ws.on('message', (data: Buffer | string) => {
      const rawMessage = typeof data === 'string' ? data : data.toString('utf8')

      // Check message size before parsing
      const byteLength = Buffer.byteLength(rawMessage, 'utf8')
      if (byteLength > MAX_MESSAGE_SIZE) {
        sendError(ws, RELAY_ERROR_CODE.INVALID_MESSAGE, 'Message too large')
        console.log(
          JSON.stringify({
            event: 'invalid_message',
            reason: 'too_large',
            size: byteLength,
            timestamp: new Date().toISOString(),
          })
        )
        return
      }

      // Check rate limit
      const limiter = rateLimiters.get(ws)
      if (limiter) {
        const now = Date.now()
        if (now - limiter.windowStart > RATE_LIMIT_WINDOW_MS) {
          limiter.count = 0
          limiter.windowStart = now
        }
        if (limiter.count >= RATE_LIMIT_MAX) {
          sendError(ws, RELAY_ERROR_CODE.RATE_LIMITED, 'Rate limit exceeded')
          console.log(
            JSON.stringify({
              event: 'rate_limited',
              timestamp: new Date().toISOString(),
            })
          )
          return
        }
        limiter.count++
      }

      // Parse JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(rawMessage)
      } catch {
        sendError(ws, RELAY_ERROR_CODE.INVALID_MESSAGE, 'Invalid JSON')
        console.log(
          JSON.stringify({
            event: 'invalid_message',
            reason: 'invalid_json',
            timestamp: new Date().toISOString(),
          })
        )
        return
      }

      // Handle join or forward
      if (isJoinMessage(parsed)) {
        const result = roomManager.join(parsed.roomId, ws)
        if (!result.success) {
          sendError(ws, RELAY_ERROR_CODE.ROOM_FULL, 'Room is full')
          ws.close()
        }
      } else {
        roomManager.broadcast(ws, rawMessage)
      }
    })

    ws.on('close', () => {
      rateLimiters.delete(ws)
      roomManager.leave(ws)

      console.log(
        JSON.stringify({
          event: 'client_disconnected',
          timestamp: new Date().toISOString(),
        })
      )
    })

    ws.on('error', (error: Error) => {
      console.log(
        JSON.stringify({
          event: 'client_error',
          message: error.message,
          timestamp: new Date().toISOString(),
        })
      )
      rateLimiters.delete(ws)
      roomManager.leave(ws)
    })
  })

  return { httpServer, wss, roomManager }
}

// Only start listening when run directly (not imported in tests)
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server.ts'))

if (isMainModule) {
  const config = loadConfig()
  const { httpServer, wss } = createServer(config)

  httpServer.listen(config.port, () => {
    console.log(
      JSON.stringify({
        event: 'server_started',
        port: config.port,
        timestamp: new Date().toISOString(),
      })
    )
  })

  function handleShutdown(): void {
    console.log(
      JSON.stringify({
        event: 'server_stopped',
        timestamp: new Date().toISOString(),
      })
    )
    wss.close()
    httpServer.close()
    process.exit(0)
  }

  process.on('SIGTERM', handleShutdown)
  process.on('SIGINT', handleShutdown)
}
