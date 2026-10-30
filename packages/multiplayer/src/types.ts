export interface RoomPlayer {
  id: string
  name: string
  ready: boolean
  joinedAt: number
}

export interface RoomSnapshot {
  appId: string
  roomId: string
  capacity: number
  players: RoomPlayer[]
}

export interface RelayStats {
  uptimeSeconds: number
  rooms: number
  players: number
  connections: number
  messagesReceived: number
  messagesForwarded: number
  bytesReceived: number
  bytesSent: number
  rejectedMessages: number
}

export interface LogEntry {
  id: string
  at: number
  direction: 'in' | 'out' | 'system'
  type: string
  detail: string
  /** Complete protocol envelope, including the nested payload for relay:message. */
  payload?: unknown
}

export interface ClientState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  playerId: string
  room: RoomSnapshot | null
  server: RelayStats | null
  latency: {
    last: number | null
    min: number | null
    max: number | null
    average: number | null
    samples: number[]
    lost: number
  }
  messagesSent: number
  messagesReceived: number
  bytesSent: number
  bytesReceived: number
  reconnectAttempts: number
  lastError: string | null
  events: LogEntry[]
}

export interface MultiplayerOptions {
  url: string
  appId: string
  playerId?: string
  name?: string
}

export interface MultiplayerClient {
  getState(): ClientState
  subscribe(listener: (state: ClientState) => void): () => void
  connect(): void
  disconnect(): void
  reconnect(): void
  join(roomId: string, name?: string): void
  leave(): void
  setReady(ready: boolean): void
  send(payload: unknown): void
  ping(): void
  requestStats(): void
  resetMetrics(): void
  destroy(): void
}

export type ServerMessage =
  | { type: 'relay:room'; room: RoomSnapshot | null }
  | { type: 'relay:pong'; id: string }
  | { type: 'relay:stats'; stats: RelayStats }
  | { type: 'relay:error'; code: string; message: string }
  | { type: 'relay:ack'; messageId: string; recipients: number }
  | {
      type: 'relay:message'
      appId: string
      roomId: string
      senderId: string
      messageId: string
      payload: unknown
    }
