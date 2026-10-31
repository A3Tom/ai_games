/** Messages consumed by the relay (not forwarded) */
export interface JoinMessage {
  type: 'join'
  roomId: string
}

/** Sent to all clients in a room when the peer count changes */
export interface PeerCountMessage {
  type: 'peer_count'
  count: number
}

/** Sent to remaining client when the other peer disconnects */
export interface PeerLeftMessage {
  type: 'peer_left'
}

/** Sent to a client when the relay rejects an action */
export interface RelayErrorMessage {
  type: 'error'
  code: RelayErrorCode
  message: string
}

export type RelayOutgoingMessage = PeerCountMessage | PeerLeftMessage | RelayErrorMessage

export const RELAY_ERROR_CODE = {
  ROOM_FULL: 'ROOM_FULL',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const

export type RelayErrorCode = (typeof RELAY_ERROR_CODE)[keyof typeof RELAY_ERROR_CODE]

export interface RelayConfig {
  port: number
  maxRooms: number
  maxClientsPerRoom: number
  roomTimeoutMs: number
  logLevel: string
}

export interface Player {
  id: string
  name: string
  ready: boolean
  joinedAt: number
}

export interface RoomSnapshot {
  appId: string
  roomId: string
  capacity: number
  players: Player[]
}

export interface ModernJoinMessage {
  type: 'relay:join'
  appId: string
  roomId: string
  playerId: string
  name: string
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

export function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
}

export function isModernJoinMessage(data: Record<string, unknown>): data is Record<string, unknown> & ModernJoinMessage {
  return data.type === 'relay:join' && isIdentifier(data.appId) &&
    isIdentifier(data.roomId) && isIdentifier(data.playerId) &&
    typeof data.name === 'string' && data.name.trim().length > 0 &&
    data.name.length <= 32 && !/[\u0000-\u001f\u007f]/.test(data.name)
}

export function isJoinMessage(data: unknown): data is JoinMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>).type === 'join' &&
    'roomId' in data &&
    typeof (data as Record<string, unknown>).roomId === 'string' &&
    ((data as Record<string, unknown>).roomId as string).length > 0 &&
    ((data as Record<string, unknown>).roomId as string).length <= 128
  )
}
