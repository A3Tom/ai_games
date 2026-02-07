import { describe, it, expect } from 'vitest'
import {
  isShotMessage,
  isResultMessage,
  isCommitMessage,
  isReadyMessage,
  isRevealMessage,
  isRematchMessage,
  isPingMessage,
  isPongMessage,
  isSyncRequestMessage,
  isSyncResponseMessage,
  isPeerCountMessage,
  isPeerLeftMessage,
  isRelayErrorMessage,
  parseIncomingMessage,
  isValidPlacement,
  isValidShot,
} from './validation'
import type { PlacedShip } from '../types/game'

describe('isShotMessage', () => {
  it('accepts a valid shot message', () => {
    expect(isShotMessage({ type: 'shot', x: 5, y: 3 })).toBe(true)
  })

  it('accepts boundary coordinates (0, 0) and (9, 9)', () => {
    expect(isShotMessage({ type: 'shot', x: 0, y: 0 })).toBe(true)
    expect(isShotMessage({ type: 'shot', x: 9, y: 9 })).toBe(true)
  })

  it('rejects out-of-range coordinates', () => {
    expect(isShotMessage({ type: 'shot', x: 10, y: 3 })).toBe(false)
    expect(isShotMessage({ type: 'shot', x: -1, y: 3 })).toBe(false)
    expect(isShotMessage({ type: 'shot', x: 5, y: 10 })).toBe(false)
  })

  it('rejects non-integer coordinates', () => {
    expect(isShotMessage({ type: 'shot', x: 1.5, y: 3 })).toBe(false)
  })

  it('rejects null, undefined, and strings', () => {
    expect(isShotMessage(null)).toBe(false)
    expect(isShotMessage(undefined)).toBe(false)
    expect(isShotMessage('string')).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(isShotMessage({ type: 'shot', x: 5 })).toBe(false)
    expect(isShotMessage({ type: 'shot' })).toBe(false)
  })
})

describe('isResultMessage', () => {
  it('accepts a valid result with sunk: null', () => {
    expect(
      isResultMessage({ type: 'result', x: 3, y: 7, hit: true, sunk: null }),
    ).toBe(true)
  })

  it('accepts a valid result with a valid sunk ship type', () => {
    expect(
      isResultMessage({
        type: 'result',
        x: 3,
        y: 7,
        hit: true,
        sunk: 'carrier',
      }),
    ).toBe(true)
  })

  it('rejects an invalid ship type for sunk', () => {
    expect(
      isResultMessage({
        type: 'result',
        x: 3,
        y: 7,
        hit: true,
        sunk: 'battlecruiser',
      }),
    ).toBe(false)
  })

  it('rejects non-boolean hit', () => {
    expect(
      isResultMessage({ type: 'result', x: 3, y: 7, hit: 'yes', sunk: null }),
    ).toBe(false)
  })

  it('rejects out-of-range coordinates', () => {
    expect(
      isResultMessage({ type: 'result', x: 10, y: 3, hit: true, sunk: null }),
    ).toBe(false)
  })
})

describe('isCommitMessage', () => {
  it('accepts a 64-char lowercase hex hash', () => {
    const hash =
      'a'.repeat(64)
    expect(isCommitMessage({ type: 'commit', hash })).toBe(true)
  })

  it('rejects a 63-char hash', () => {
    const hash = 'a'.repeat(63)
    expect(isCommitMessage({ type: 'commit', hash })).toBe(false)
  })

  it('rejects uppercase hex', () => {
    const hash = 'A'.repeat(64)
    expect(isCommitMessage({ type: 'commit', hash })).toBe(false)
  })

  it('rejects non-hex characters', () => {
    const hash = 'g'.repeat(64)
    expect(isCommitMessage({ type: 'commit', hash })).toBe(false)
  })

  it('rejects missing hash', () => {
    expect(isCommitMessage({ type: 'commit' })).toBe(false)
  })
})

describe('isReadyMessage', () => {
  it('accepts a valid ready message', () => {
    expect(isReadyMessage({ type: 'ready' })).toBe(true)
  })

  it('rejects wrong type', () => {
    expect(isReadyMessage({ type: 'not_ready' })).toBe(false)
  })
})

describe('isRevealMessage', () => {
  const validShips = [
    { type: 'carrier', x: 0, y: 0, orientation: 'h' },
    { type: 'battleship', x: 0, y: 1, orientation: 'h' },
    { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
    { type: 'submarine', x: 0, y: 3, orientation: 'h' },
    { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
  ]
  const validSalt = 'a1b2c3d4'.repeat(8)

  it('accepts a valid reveal message', () => {
    expect(
      isRevealMessage({ type: 'reveal', ships: validShips, salt: validSalt }),
    ).toBe(true)
  })

  it('rejects reveal with 4 ships', () => {
    expect(
      isRevealMessage({
        type: 'reveal',
        ships: validShips.slice(0, 4),
        salt: validSalt,
      }),
    ).toBe(false)
  })

  it('rejects invalid ship orientation', () => {
    const badShips = validShips.map((s, i) =>
      i === 0 ? { ...s, orientation: 'diagonal' } : s,
    )
    expect(
      isRevealMessage({ type: 'reveal', ships: badShips, salt: validSalt }),
    ).toBe(false)
  })

  it('rejects invalid salt length', () => {
    expect(
      isRevealMessage({ type: 'reveal', ships: validShips, salt: 'abc' }),
    ).toBe(false)
  })

  it('rejects invalid ship coordinates', () => {
    const badShips = validShips.map((s, i) =>
      i === 0 ? { ...s, x: 10 } : s,
    )
    expect(
      isRevealMessage({ type: 'reveal', ships: badShips, salt: validSalt }),
    ).toBe(false)
  })
})

describe('isRematchMessage', () => {
  it('accepts a valid rematch message', () => {
    expect(isRematchMessage({ type: 'rematch' })).toBe(true)
  })

  it('rejects wrong type', () => {
    expect(isRematchMessage({ type: 'quit' })).toBe(false)
  })
})

describe('isPingMessage', () => {
  it('accepts a valid ping message', () => {
    expect(isPingMessage({ type: 'ping', timestamp: Date.now() })).toBe(true)
  })

  it('rejects negative timestamp', () => {
    expect(isPingMessage({ type: 'ping', timestamp: -1 })).toBe(false)
  })

  it('rejects non-number timestamp', () => {
    expect(isPingMessage({ type: 'ping', timestamp: 'now' })).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(isPingMessage({ type: 'ping', timestamp: Infinity })).toBe(false)
  })
})

describe('isPongMessage', () => {
  it('accepts a valid pong message', () => {
    expect(isPongMessage({ type: 'pong', timestamp: 12345 })).toBe(true)
  })

  it('rejects missing timestamp', () => {
    expect(isPongMessage({ type: 'pong' })).toBe(false)
  })
})

describe('isSyncRequestMessage', () => {
  it('accepts a valid sync_request', () => {
    expect(isSyncRequestMessage({ type: 'sync_request' })).toBe(true)
  })

  it('rejects wrong type', () => {
    expect(isSyncRequestMessage({ type: 'sync' })).toBe(false)
  })
})

describe('isSyncResponseMessage', () => {
  it('accepts a valid sync_response', () => {
    expect(
      isSyncResponseMessage({
        type: 'sync_response',
        phase: 'battle',
        turnNumber: 5,
        shotHistory: [
          { x: 3, y: 4, hit: true, sunk: null, player: 'a' },
        ],
      }),
    ).toBe(true)
  })

  it('accepts empty shot history', () => {
    expect(
      isSyncResponseMessage({
        type: 'sync_response',
        phase: 'setup',
        turnNumber: 0,
        shotHistory: [],
      }),
    ).toBe(true)
  })

  it('rejects invalid phase', () => {
    expect(
      isSyncResponseMessage({
        type: 'sync_response',
        phase: 'invalid_phase',
        turnNumber: 0,
        shotHistory: [],
      }),
    ).toBe(false)
  })

  it('rejects negative turn number', () => {
    expect(
      isSyncResponseMessage({
        type: 'sync_response',
        phase: 'battle',
        turnNumber: -1,
        shotHistory: [],
      }),
    ).toBe(false)
  })

  it('rejects invalid shot history entry', () => {
    expect(
      isSyncResponseMessage({
        type: 'sync_response',
        phase: 'battle',
        turnNumber: 1,
        shotHistory: [{ x: 10, y: 0, hit: true, sunk: null, player: 'a' }],
      }),
    ).toBe(false)
  })
})

describe('isPeerCountMessage', () => {
  it('accepts a valid peer_count message', () => {
    expect(isPeerCountMessage({ type: 'peer_count', count: 2 })).toBe(true)
  })

  it('rejects negative count', () => {
    expect(isPeerCountMessage({ type: 'peer_count', count: -1 })).toBe(false)
  })

  it('rejects zero count', () => {
    expect(isPeerCountMessage({ type: 'peer_count', count: 0 })).toBe(false)
  })

  it('rejects non-integer count', () => {
    expect(isPeerCountMessage({ type: 'peer_count', count: 1.5 })).toBe(false)
  })
})

describe('isPeerLeftMessage', () => {
  it('accepts a valid peer_left message', () => {
    expect(isPeerLeftMessage({ type: 'peer_left' })).toBe(true)
  })

  it('rejects wrong type', () => {
    expect(isPeerLeftMessage({ type: 'peer_gone' })).toBe(false)
  })
})

describe('isRelayErrorMessage', () => {
  it('accepts valid error codes', () => {
    expect(
      isRelayErrorMessage({
        type: 'error',
        code: 'ROOM_FULL',
        message: 'Room is full',
      }),
    ).toBe(true)
    expect(
      isRelayErrorMessage({
        type: 'error',
        code: 'INVALID_MESSAGE',
        message: 'Bad msg',
      }),
    ).toBe(true)
    expect(
      isRelayErrorMessage({
        type: 'error',
        code: 'RATE_LIMITED',
        message: 'Slow down',
      }),
    ).toBe(true)
  })

  it('rejects unknown error codes', () => {
    expect(
      isRelayErrorMessage({
        type: 'error',
        code: 'UNKNOWN_CODE',
        message: 'Something',
      }),
    ).toBe(false)
  })

  it('rejects missing message field', () => {
    expect(
      isRelayErrorMessage({ type: 'error', code: 'ROOM_FULL' }),
    ).toBe(false)
  })
})

describe('parseIncomingMessage', () => {
  it('parses a valid shot message from JSON', () => {
    const result = parseIncomingMessage('{"type":"shot","x":5,"y":3}')
    expect(result).toEqual({ type: 'shot', x: 5, y: 3 })
  })

  it('parses a valid peer_count message', () => {
    const result = parseIncomingMessage('{"type":"peer_count","count":2}')
    expect(result).toEqual({ type: 'peer_count', count: 2 })
  })

  it('returns null for malformed JSON', () => {
    expect(parseIncomingMessage('not json')).toBeNull()
    expect(parseIncomingMessage('{broken')).toBeNull()
    expect(parseIncomingMessage('')).toBeNull()
  })

  it('returns null for valid JSON with unknown type', () => {
    expect(parseIncomingMessage('{"type":"unknown_msg"}')).toBeNull()
  })

  it('returns null for valid JSON that is not an object', () => {
    expect(parseIncomingMessage('"just a string"')).toBeNull()
    expect(parseIncomingMessage('42')).toBeNull()
    expect(parseIncomingMessage('null')).toBeNull()
  })

  it('parses a ready message', () => {
    const result = parseIncomingMessage('{"type":"ready"}')
    expect(result).toEqual({ type: 'ready' })
  })

  it('parses a relay error message', () => {
    const result = parseIncomingMessage(
      '{"type":"error","code":"ROOM_FULL","message":"Room is full"}',
    )
    expect(result).toEqual({
      type: 'error',
      code: 'ROOM_FULL',
      message: 'Room is full',
    })
  })
})

describe('isValidPlacement', () => {
  const validFleet: PlacedShip[] = [
    { type: 'carrier', x: 0, y: 0, orientation: 'h' },
    { type: 'battleship', x: 0, y: 1, orientation: 'h' },
    { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
    { type: 'submarine', x: 0, y: 3, orientation: 'h' },
    { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
  ]

  it('returns true for a valid fleet of 5 ships with no overlaps', () => {
    expect(isValidPlacement(validFleet)).toBe(true)
  })

  it('returns false when fewer than 5 ships are provided', () => {
    expect(isValidPlacement(validFleet.slice(0, 4))).toBe(false)
  })

  it('returns false when more than 5 ships are provided', () => {
    expect(
      isValidPlacement([
        ...validFleet,
        { type: 'destroyer', x: 0, y: 5, orientation: 'h' },
      ]),
    ).toBe(false)
  })

  it('returns false when ship types are duplicated', () => {
    const duplicateFleet: PlacedShip[] = [
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      { type: 'carrier', x: 0, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
    ]
    expect(isValidPlacement(duplicateFleet)).toBe(false)
  })

  it('returns false when a ship extends beyond the grid boundary', () => {
    const outOfBounds: PlacedShip[] = [
      { type: 'carrier', x: 8, y: 0, orientation: 'h' },
      { type: 'battleship', x: 0, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
    ]
    expect(isValidPlacement(outOfBounds)).toBe(false)
  })

  it('returns false when two ships overlap', () => {
    const overlapping: PlacedShip[] = [
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      { type: 'battleship', x: 0, y: 0, orientation: 'v' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
    ]
    expect(isValidPlacement(overlapping)).toBe(false)
  })

  it('returns false for empty ships array', () => {
    expect(isValidPlacement([])).toBe(false)
  })

  it('returns true for vertical placements within bounds', () => {
    const verticalFleet: PlacedShip[] = [
      { type: 'carrier', x: 0, y: 0, orientation: 'v' },
      { type: 'battleship', x: 1, y: 0, orientation: 'v' },
      { type: 'cruiser', x: 2, y: 0, orientation: 'v' },
      { type: 'submarine', x: 3, y: 0, orientation: 'v' },
      { type: 'destroyer', x: 4, y: 0, orientation: 'v' },
    ]
    expect(isValidPlacement(verticalFleet)).toBe(true)
  })
})

describe('isValidShot', () => {
  it('returns true for a valid shot with no previous shots', () => {
    expect(isValidShot(5, 3, [])).toBe(true)
  })

  it('returns true for boundary coordinates', () => {
    expect(isValidShot(0, 0, [])).toBe(true)
    expect(isValidShot(9, 9, [])).toBe(true)
  })

  it('returns false for negative coordinates', () => {
    expect(isValidShot(-1, 5, [])).toBe(false)
    expect(isValidShot(5, -1, [])).toBe(false)
  })

  it('returns false for coordinates beyond 9', () => {
    expect(isValidShot(10, 0, [])).toBe(false)
    expect(isValidShot(0, 10, [])).toBe(false)
  })

  it('returns false for non-integer coordinates', () => {
    expect(isValidShot(3, 1.5, [])).toBe(false)
    expect(isValidShot(1.5, 3, [])).toBe(false)
  })

  it('returns false for a duplicate shot', () => {
    expect(isValidShot(5, 3, [{ x: 5, y: 3 }])).toBe(false)
  })

  it('returns true when previous shots exist but do not match', () => {
    expect(isValidShot(5, 3, [{ x: 1, y: 2 }, { x: 8, y: 7 }])).toBe(true)
  })
})
