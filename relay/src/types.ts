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

export function isJoinMessage(data: unknown): data is JoinMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as Record<string, unknown>).type === 'join' &&
    'roomId' in data &&
    typeof (data as Record<string, unknown>).roomId === 'string' &&
    ((data as Record<string, unknown>).roomId as string).length > 0
  )
}
