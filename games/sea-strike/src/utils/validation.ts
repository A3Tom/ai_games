import type {
  ShotMessage,
  ResultMessage,
  CommitMessage,
  ReadyMessage,
  RevealMessage,
  RematchMessage,
  PingMessage,
  PongMessage,
  SyncRequestMessage,
  SyncResponseMessage,
  PeerCountMessage,
  PeerLeftMessage,
  RelayErrorMessage,
  IncomingMessage,
} from '../types/protocol'
import { SHIP_TYPES, GAME_PHASES } from '../types/game'
import type { PlacedShip } from '../types/game'

import { getShipCells } from './board'
import { FLEET_CONFIG, FLEET_SIZE } from '../constants/ships'
import { GRID_SIZE } from '../constants/grid'

const shipTypeValues = Object.values(SHIP_TYPES)
const gamePhaseValues = Object.values(GAME_PHASES)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidCoord(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 9
  )
}

function isShipType(value: unknown): boolean {
  return typeof value === 'string' && shipTypeValues.includes(value as never)
}

export function isShotMessage(msg: unknown): msg is ShotMessage {
  return (
    isObject(msg) &&
    msg.type === 'shot' &&
    isValidCoord(msg.x) &&
    isValidCoord(msg.y)
  )
}

export function isResultMessage(msg: unknown): msg is ResultMessage {
  if (!isObject(msg)) return false
  if (msg.type !== 'result') return false
  if (!isValidCoord(msg.x) || !isValidCoord(msg.y)) return false
  if (typeof msg.hit !== 'boolean') return false
  if (msg.sunk !== null && !isShipType(msg.sunk)) return false
  return true
}

export function isCommitMessage(msg: unknown): msg is CommitMessage {
  return (
    isObject(msg) &&
    msg.type === 'commit' &&
    typeof msg.hash === 'string' &&
    /^[0-9a-f]{64}$/.test(msg.hash)
  )
}

export function isReadyMessage(msg: unknown): msg is ReadyMessage {
  return isObject(msg) && msg.type === 'ready'
}

export function isRevealMessage(msg: unknown): msg is RevealMessage {
  if (!isObject(msg)) return false
  if (msg.type !== 'reveal') return false
  if (typeof msg.salt !== 'string' || !/^[0-9a-f]{64}$/.test(msg.salt))
    return false
  if (!Array.isArray(msg.ships) || msg.ships.length !== 5) return false

  return msg.ships.every(
    (ship: unknown) =>
      isObject(ship) &&
      isShipType(ship.type) &&
      isValidCoord(ship.x) &&
      isValidCoord(ship.y) &&
      (ship.orientation === 'h' || ship.orientation === 'v'),
  )
}

export function isRematchMessage(msg: unknown): msg is RematchMessage {
  return isObject(msg) && msg.type === 'rematch'
}

export function isPingMessage(msg: unknown): msg is PingMessage {
  return (
    isObject(msg) &&
    msg.type === 'ping' &&
    typeof msg.timestamp === 'number' &&
    msg.timestamp > 0 &&
    Number.isFinite(msg.timestamp)
  )
}

export function isPongMessage(msg: unknown): msg is PongMessage {
  return (
    isObject(msg) &&
    msg.type === 'pong' &&
    typeof msg.timestamp === 'number' &&
    msg.timestamp > 0 &&
    Number.isFinite(msg.timestamp)
  )
}

export function isSyncRequestMessage(
  msg: unknown,
): msg is SyncRequestMessage {
  return isObject(msg) && msg.type === 'sync_request'
}

export function isSyncResponseMessage(
  msg: unknown,
): msg is SyncResponseMessage {
  if (!isObject(msg)) return false
  if (msg.type !== 'sync_response') return false
  if (
    typeof msg.phase !== 'string' ||
    !gamePhaseValues.includes(msg.phase as never)
  )
    return false
  if (
    typeof msg.turnNumber !== 'number' ||
    !Number.isInteger(msg.turnNumber) ||
    msg.turnNumber < 0
  )
    return false
  if (!Array.isArray(msg.shotHistory)) return false

  return msg.shotHistory.every(
    (entry: unknown) =>
      isObject(entry) &&
      isValidCoord(entry.x) &&
      isValidCoord(entry.y) &&
      typeof entry.hit === 'boolean' &&
      (entry.sunk === null || isShipType(entry.sunk)) &&
      (entry.player === 'a' || entry.player === 'b'),
  )
}

export function isPeerCountMessage(msg: unknown): msg is PeerCountMessage {
  return (
    isObject(msg) &&
    msg.type === 'peer_count' &&
    typeof msg.count === 'number' &&
    Number.isInteger(msg.count) &&
    msg.count > 0
  )
}

export function isPeerLeftMessage(msg: unknown): msg is PeerLeftMessage {
  return isObject(msg) && msg.type === 'peer_left'
}

export function isRelayErrorMessage(msg: unknown): msg is RelayErrorMessage {
  return (
    isObject(msg) &&
    msg.type === 'error' &&
    typeof msg.code === 'string' &&
    ['ROOM_FULL', 'INVALID_MESSAGE', 'RATE_LIMITED'].includes(msg.code) &&
    typeof msg.message === 'string'
  )
}

/** Validates that all ships form a legal fleet placement */
export function isValidPlacement(ships: PlacedShip[]): boolean {
  if (ships.length !== FLEET_SIZE) return false

  // Check ship types — must have exactly one of each type in FLEET_CONFIG
  const expectedTypes = new Set(FLEET_CONFIG.map((c) => c.type))
  const actualTypes = new Set(ships.map((s) => s.type))
  if (actualTypes.size !== expectedTypes.size) return false
  for (const t of expectedTypes) {
    if (!actualTypes.has(t)) return false
  }

  // Validate orientation
  for (const ship of ships) {
    if (ship.orientation !== 'h' && ship.orientation !== 'v') return false
  }

  // Bounds check and overlap check
  const occupiedCells = new Set<string>()
  for (const ship of ships) {
    const cells = getShipCells(ship)
    for (const cell of cells) {
      if (
        cell.x < 0 ||
        cell.x >= GRID_SIZE ||
        cell.y < 0 ||
        cell.y >= GRID_SIZE
      ) {
        return false
      }
      const key = `${cell.x},${cell.y}`
      if (occupiedCells.has(key)) return false
      occupiedCells.add(key)
    }
  }

  return true
}

/** Validates that a shot coordinate is within bounds and hasn't been fired before */
export function isValidShot(
  x: number,
  y: number,
  previousShots: Array<{ x: number; y: number }>,
): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false
  if (previousShots.some((s) => s.x === x && s.y === y)) return false
  return true
}

/** Attempts to parse and identify an incoming message */
export function parseIncomingMessage(raw: string): IncomingMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  // Check most frequent message types first for efficiency
  if (isShotMessage(parsed)) return parsed
  if (isResultMessage(parsed)) return parsed
  if (isPeerCountMessage(parsed)) return parsed
  if (isCommitMessage(parsed)) return parsed
  if (isReadyMessage(parsed)) return parsed
  if (isRevealMessage(parsed)) return parsed
  if (isRematchMessage(parsed)) return parsed
  if (isPingMessage(parsed)) return parsed
  if (isPongMessage(parsed)) return parsed
  if (isSyncRequestMessage(parsed)) return parsed
  if (isSyncResponseMessage(parsed)) return parsed
  if (isPeerLeftMessage(parsed)) return parsed
  if (isRelayErrorMessage(parsed)) return parsed

  return null
}
