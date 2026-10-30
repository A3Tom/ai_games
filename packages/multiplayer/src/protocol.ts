import type { RelayStats, RoomPlayer, RoomSnapshot, ServerMessage } from './types'

export const MAX_FRAME_BYTES = 4096

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isCount(value: unknown): value is number {
  return isNonnegative(value) && Number.isInteger(value)
}

function isPlayer(value: unknown): value is RoomPlayer {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 32 &&
    typeof value.ready === 'boolean' && isNonnegative(value.joinedAt)
  )
}

function isRoom(value: unknown): value is RoomSnapshot {
  return (
    isRecord(value) && isIdentifier(value.appId) && isIdentifier(value.roomId) &&
    isCount(value.capacity) && value.capacity > 0 &&
    Array.isArray(value.players) && value.players.length <= value.capacity &&
    value.players.every(isPlayer) &&
    new Set(value.players.map((player: RoomPlayer) => player.id)).size === value.players.length
  )
}

function isStats(value: unknown): value is RelayStats {
  if (!isRecord(value) || !isNonnegative(value.uptimeSeconds)) return false
  return [
    'rooms', 'players', 'connections', 'messagesReceived', 'messagesForwarded',
    'bytesReceived', 'bytesSent', 'rejectedMessages',
  ].every((key: string): boolean => isCount(value[key]))
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  switch (value.type) {
    case 'relay:room':
      return value.room === null || isRoom(value.room) ? value as ServerMessage : null
    case 'relay:pong':
      return isIdentifier(value.id) ? value as ServerMessage : null
    case 'relay:stats':
      return isStats(value.stats) ? value as ServerMessage : null
    case 'relay:error':
      return typeof value.code === 'string' && value.code.length <= 64 &&
        typeof value.message === 'string' && value.message.length <= 512
        ? value as ServerMessage : null
    case 'relay:ack':
      return isIdentifier(value.messageId) && isCount(value.recipients)
        ? value as ServerMessage : null
    case 'relay:message':
      return isIdentifier(value.appId) && isIdentifier(value.roomId) &&
        isIdentifier(value.senderId) && isIdentifier(value.messageId) &&
        Object.hasOwn(value, 'payload')
        ? value as ServerMessage : null
    default:
      return null
  }
}
