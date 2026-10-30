import { telemetry } from '../../../shared/telemetry.js'
import { isIdentifier, MAX_FRAME_BYTES, parseServerMessage } from './protocol'
import type {
  ClientState, LogEntry, MultiplayerClient, MultiplayerOptions, ServerMessage,
} from './types'

export type {
  ClientState, LogEntry, MultiplayerClient, MultiplayerOptions, RelayStats,
  RoomPlayer, RoomSnapshot,
} from './types'

const SAMPLE_LIMIT = 60
const EVENT_LIMIT = 100
const DIAGNOSTICS_INTERVAL_MS = 5_000
const PING_TIMEOUT_MS = 8_000
const MAX_RECONNECT_ATTEMPTS = 10

interface RoomTarget {
  roomId: string
  name: string
}

function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

function emptyLatency(lost = 0): ClientState['latency'] {
  return { last: null, min: null, max: null, average: null, samples: [], lost }
}

function describe(message: ServerMessage): string {
  switch (message.type) {
    case 'relay:room':
      return message.room
        ? `${message.room.roomId}: ${message.room.players.length}/${message.room.capacity} players`
        : 'Left room'
    case 'relay:pong': return 'Server ping response'
    case 'relay:stats': return `${message.stats.rooms} rooms, ${message.stats.players} players`
    case 'relay:error': return `${message.code}: ${message.message}`
    case 'relay:ack': return `Accepted for ${message.recipients} recipient(s)`
    case 'relay:message': return `From ${message.senderId}: ${JSON.stringify(message.payload).slice(0, 300)}`
  }
}

/**
 * Small, framework-independent relay client. State is a new snapshot on each
 * notification. Room state is live presence, not durable game state or identity.
 */
export function createMultiplayerClient(options: MultiplayerOptions): MultiplayerClient {
  const playerId = options.playerId ?? newId()
  let name = options.name?.trim() || 'Player'
  let state: ClientState = {
    status: 'disconnected', playerId, room: null, server: null,
    latency: emptyLatency(), messagesSent: 0, messagesReceived: 0,
    bytesSent: 0, bytesReceived: 0, reconnectAttempts: 0, lastError: null, events: [],
  }
  const listeners = new Set<(snapshot: ClientState) => void>()
  const encoder = new TextEncoder()
  const pendingPings = new Map<string, { startedAt: number; timeout: ReturnType<typeof setTimeout> }>()
  let socket: WebSocket | null = null
  let diagnosticsTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false
  let destroyed = false
  let attempt = 0
  let eventSequence = 0
  let desiredRoom: RoomTarget | null = null
  let confirmedRoom: RoomTarget | null = null
  let pendingJoin: RoomTarget | null = null
  let leavePending = false

  function notify(patch: Partial<ClientState> = {}): void {
    state = { ...state, ...patch }
    for (const listener of listeners) {
      try {
        listener(state)
      } catch (error: unknown) {
        telemetry.captureError('multiplayer_listener_error', error)
      }
    }
  }

  function log(
    direction: LogEntry['direction'], type: string, detail: string,
    payload?: unknown, patch: Partial<ClientState> = {},
  ): void {
    if (direction === 'system') {
      const level = type === 'client:error' || type === 'client:ping_timeout' ? 'warn' : 'info'
      telemetry[level](type.replace(':', '_'), detail)
    }
    const entry: LogEntry = {
      id: `event-${++eventSequence}`, at: Date.now(), direction, type, detail, payload,
    }
    notify({ ...patch, events: [...state.events, entry].slice(-EVENT_LIMIT) })
  }

  function error(detail: string): void {
    log('system', 'client:error', detail, undefined, { lastError: detail })
  }

  function clearNetworkTimers(): void {
    if (diagnosticsTimer !== null) clearInterval(diagnosticsTimer)
    diagnosticsTimer = null
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    reconnectTimer = null
    for (const ping of pendingPings.values()) clearTimeout(ping.timeout)
    pendingPings.clear()
  }

  function sendFrame(message: Record<string, unknown>): boolean {
    if (destroyed) return false
    if (socket?.readyState !== WebSocket.OPEN) {
      error('Connect to the relay before sending an action.')
      return false
    }
    let raw: string
    try {
      raw = JSON.stringify(message)
    } catch {
      error('The message must contain JSON-serializable data.')
      return false
    }
    const bytes = encoder.encode(raw).byteLength
    if (bytes > MAX_FRAME_BYTES) {
      error(`Message exceeds the ${MAX_FRAME_BYTES}-byte relay limit.`)
      return false
    }
    try {
      socket.send(raw)
    } catch {
      error('The connection closed before the action could be sent.')
      return false
    }
    log('out', String(message.type), raw.slice(0, 300), message, {
      messagesSent: state.messagesSent + 1, bytesSent: state.bytesSent + bytes,
    })
    return true
  }

  function ping(): void {
    if (destroyed) return
    if (socket?.readyState !== WebSocket.OPEN) {
      error('Connect to the relay before measuring latency.')
      return
    }
    if (pendingPings.size >= 8) return
    const id = newId()
    const timeout = setTimeout(() => {
      if (!pendingPings.delete(id)) return
      log('system', 'client:ping_timeout', 'No server ping response within 8 seconds', undefined, {
        latency: { ...state.latency, last: null, lost: state.latency.lost + 1 },
      })
    }, PING_TIMEOUT_MS)
    pendingPings.set(id, { startedAt: performance.now(), timeout })
    if (!sendFrame({ type: 'relay:ping', id })) {
      clearTimeout(timeout)
      pendingPings.delete(id)
    }
  }

  function requestStats(): void {
    sendFrame({ type: 'relay:stats' })
  }

  function sendJoin(target: RoomTarget): void {
    pendingJoin = target
    leavePending = false
    if (!sendFrame({
      type: 'relay:join', appId: options.appId, roomId: target.roomId,
      playerId, name: target.name,
    })) pendingJoin = null
  }

  function processMessage(message: ServerMessage): void {
    let patch: Partial<ClientState> = {}
    switch (message.type) {
      case 'relay:room': {
        const room = message.room
        if (room !== null) {
          if (room.appId !== options.appId || !room.players.some((player) => player.id === playerId)) {
            error('Ignored a room update with an unexpected app or player.')
            return
          }
          patch = { room, lastError: null }
          const ownPlayer = room.players.find((player) => player.id === playerId)!
          confirmedRoom = { roomId: room.roomId, name: ownPlayer.name }
          if (!leavePending && (pendingJoin === null || pendingJoin.roomId === room.roomId)) {
            desiredRoom = confirmedRoom
            pendingJoin = null
          }
        } else {
          patch = { room: null }
          confirmedRoom = null
          leavePending = false
          if (pendingJoin === null) desiredRoom = null
        }
        break
      }
      case 'relay:pong': {
        const pending = pendingPings.get(message.id)
        if (pending === undefined) return
        clearTimeout(pending.timeout)
        pendingPings.delete(message.id)
        const last = Math.max(0, performance.now() - pending.startedAt)
        const samples = [...state.latency.samples, last].slice(-SAMPLE_LIMIT)
        patch = {
          latency: {
            last, min: Math.min(...samples), max: Math.max(...samples),
            average: samples.reduce((total, sample) => total + sample, 0) / samples.length,
            samples, lost: state.latency.lost,
          },
        }
        break
      }
      case 'relay:stats': patch = { server: message.stats }; break
      case 'relay:error':
        telemetry.warn('relay_error', message.message, { code: message.code })
        patch = { lastError: `${message.code}: ${message.message}` }
        if (pendingJoin !== null || leavePending) {
          desiredRoom = confirmedRoom
          pendingJoin = null
          leavePending = false
        }
        break
      case 'relay:message':
        if (message.appId !== options.appId || message.roomId !== state.room?.roomId) {
          error('Ignored a message for a different room.')
          return
        }
        break
      case 'relay:ack': break
    }
    log('in', message.type, describe(message), message, patch)
  }

  function scheduleReconnect(): void {
    if (intentionalClose || destroyed) return
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      log('system', 'client:disconnected', 'Reconnect limit reached; reconnect manually.', undefined, {
        status: 'disconnected', lastError: 'Could not reconnect after 10 attempts.',
      })
      return
    }
    const delay = Math.min(1_000 * 2 ** attempt, 30_000)
    log('system', 'client:reconnecting', `Retrying in ${delay / 1_000} seconds`, undefined, {
      status: 'reconnecting',
    })
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      attempt += 1
      notify({ reconnectAttempts: attempt })
      openSocket('reconnecting')
    }, delay)
  }

  function openSocket(status: 'connecting' | 'reconnecting'): void {
    if (destroyed) return
    let url: URL
    try {
      url = new URL(options.url)
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('Unsupported protocol')
      if (!isIdentifier(options.appId) || !isIdentifier(playerId)) throw new Error('Invalid identifier')
    } catch {
      notify({ status: 'disconnected' })
      error('Enter a ws:// or wss:// relay URL and valid app/player IDs.')
      return
    }
    notify({ status, room: null, server: null, latency: emptyLatency(state.latency.lost) })
    let current: WebSocket
    try {
      current = new WebSocket(url.toString())
    } catch {
      notify({ status: 'disconnected' })
      error('Could not open the relay connection.')
      return
    }
    socket = current
    current.onopen = (): void => {
      if (socket !== current || destroyed) return
      attempt = 0
      log('system', 'client:connected', 'Connected to relay', undefined, {
        status: 'connected', reconnectAttempts: 0, lastError: null,
      })
      if (desiredRoom !== null) sendJoin(desiredRoom)
      ping()
      requestStats()
      diagnosticsTimer = setInterval(() => {
        ping()
        requestStats()
      }, DIAGNOSTICS_INTERVAL_MS)
    }
    current.onmessage = (event: MessageEvent): void => {
      if (socket !== current || destroyed) return
      if (typeof event.data !== 'string') {
        error('Ignored a non-text relay message.')
        return
      }
      const bytes = encoder.encode(event.data).byteLength
      notify({ messagesReceived: state.messagesReceived + 1, bytesReceived: state.bytesReceived + bytes })
      if (bytes > 65_536) {
        error('Ignored an oversized relay response.')
        return
      }
      const message = parseServerMessage(event.data)
      if (message === null) {
        error('Ignored an invalid relay response.')
        return
      }
      processMessage(message)
    }
    current.onerror = (): void => {
      if (socket !== current || destroyed) return
      error('Relay connection error. Check the address and server availability.')
    }
    current.onclose = (): void => {
      if (socket !== current || destroyed) return
      socket = null
      clearNetworkTimers()
      if (leavePending) {
        confirmedRoom = null
        desiredRoom = null
      } else if (confirmedRoom !== null) desiredRoom = confirmedRoom
      pendingJoin = null
      leavePending = false
      log('system', 'client:closed', 'Relay connection closed', undefined, {
        status: 'disconnected', room: null, server: null, latency: emptyLatency(state.latency.lost),
      })
      scheduleReconnect()
    }
  }

  function connect(): void {
    if (destroyed || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    intentionalClose = false
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    reconnectTimer = null
    attempt = 0
    notify({ reconnectAttempts: 0 })
    openSocket('connecting')
  }

  function closeSocket(): void {
    const previous = socket
    socket = null
    clearNetworkTimers()
    if (previous && (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING)) {
      previous.close(1000, 'Client disconnected')
    }
    if (leavePending) {
      confirmedRoom = null
      desiredRoom = null
    } else if (confirmedRoom !== null) desiredRoom = confirmedRoom
    pendingJoin = null
    leavePending = false
  }

  function disconnect(): void {
    if (destroyed) return
    intentionalClose = true
    closeSocket()
    log('system', 'client:disconnected', 'Disconnected manually', undefined, {
      status: 'disconnected', room: null, server: null, latency: emptyLatency(state.latency.lost),
    })
  }

  function reconnect(): void {
    if (destroyed) return
    closeSocket()
    intentionalClose = false
    attempt = 0
    notify({ reconnectAttempts: 0 })
    openSocket('reconnecting')
  }

  function join(roomId: string, newName?: string): void {
    if (destroyed) return
    const trimmed = roomId.trim()
    const nextName = (newName ?? name).trim()
    if (!isIdentifier(trimmed)) {
      error('Room IDs must contain 1–64 letters, numbers, hyphens, or underscores.')
      return
    }
    if (nextName.length === 0 || nextName.length > 32) {
      error('Player names must contain 1–32 characters.')
      return
    }
    name = nextName
    desiredRoom = { roomId: trimmed, name }
    leavePending = false
    if (socket?.readyState === WebSocket.OPEN) sendJoin(desiredRoom)
    else connect()
  }

  function leave(): void {
    if (destroyed) return
    desiredRoom = null
    pendingJoin = null
    if (socket?.readyState === WebSocket.OPEN) {
      leavePending = true
      if (!sendFrame({ type: 'relay:leave' })) {
        leavePending = false
        desiredRoom = confirmedRoom
      }
    } else {
      leavePending = false
      confirmedRoom = null
      notify({ room: null })
    }
  }

  function setReady(ready: boolean): void {
    if (destroyed) return
    if (state.room === null) {
      error('Join a room before changing ready status.')
      return
    }
    sendFrame({ type: 'relay:ready', ready })
  }

  function send(payload: unknown): void {
    if (destroyed) return
    if (state.room === null) {
      error('Join a room before sending a test action.')
      return
    }
    if (payload === undefined || typeof payload === 'function' || typeof payload === 'symbol') {
      error('The message payload must be JSON data.')
      return
    }
    sendFrame({ type: 'relay:message', messageId: newId(), payload })
  }

  function resetMetrics(): void {
    if (destroyed) return
    for (const ping of pendingPings.values()) clearTimeout(ping.timeout)
    pendingPings.clear()
    notify({
      latency: emptyLatency(), messagesSent: 0, messagesReceived: 0,
      bytesSent: 0, bytesReceived: 0, events: [], lastError: null,
    })
  }

  function destroy(): void {
    if (destroyed) return
    intentionalClose = true
    closeSocket()
    destroyed = true
    notify({ status: 'disconnected', room: null, server: null, latency: emptyLatency(state.latency.lost) })
    listeners.clear()
  }

  return {
    getState: (): ClientState => state,
    subscribe: (listener: (snapshot: ClientState) => void): (() => void) => {
      if (destroyed) return (): void => {}
      listeners.add(listener)
      listener(state)
      return (): void => { listeners.delete(listener) }
    },
    connect, disconnect, reconnect, join, leave, setReady, send, ping,
    requestStats, resetMetrics, destroy,
  }
}
