import { describe, it, expect } from 'vitest'

import {
  toHex,
  sha256,
  isCryptoAvailable,
  commitBoard,
  verifyBoard,
  useCrypto,
} from './useCrypto'
import type { PlacedShip } from '../types/game'

describe('toHex', () => {
  it('converts bytes to hex', () => {
    expect(toHex(new Uint8Array([0x0a, 0xff, 0x00]))).toBe('0aff00')
  })

  it('handles empty input', () => {
    expect(toHex(new Uint8Array([]))).toBe('')
  })

  it('handles 32-byte input', () => {
    const result = toHex(new Uint8Array(32))
    expect(result).toHaveLength(64)
    expect(result).toBe('0'.repeat(64))
  })
})

describe('sha256', () => {
  it('produces known hash for "hello"', async () => {
    const hash = await sha256('hello')
    expect(hash).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('output is 64-char lowercase hex', async () => {
    const hash = await sha256('test input')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', async () => {
    const hash1 = await sha256('deterministic')
    const hash2 = await sha256('deterministic')
    expect(hash1).toBe(hash2)
  })
})

describe('isCryptoAvailable', () => {
  it('returns a boolean', () => {
    const result = isCryptoAvailable()
    expect(typeof result).toBe('boolean')
  })

  it('returns true in test environment', () => {
    expect(isCryptoAvailable()).toBe(true)
  })
})

const TEST_SHIPS: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]

describe('commitBoard', () => {
  it('returns valid CommitResult structure', async () => {
    const result = await commitBoard(TEST_SHIPS)
    expect(result.hash).toHaveLength(64)
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.salt).toBeInstanceOf(Uint8Array)
    expect(result.salt).toHaveLength(32)
    expect(result.saltHex).toHaveLength(64)
    expect(result.saltHex).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different calls produce different hashes (random salt)', async () => {
    const result1 = await commitBoard(TEST_SHIPS)
    const result2 = await commitBoard(TEST_SHIPS)
    expect(result1.hash).not.toBe(result2.hash)
  })

  it('different calls produce different salts', async () => {
    const result1 = await commitBoard(TEST_SHIPS)
    const result2 = await commitBoard(TEST_SHIPS)
    expect(result1.saltHex).not.toBe(result2.saltHex)
  })

  it('deterministic sort — shuffled ships produce verifiable hash', async () => {
    const shuffled: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'battleship', x: 0, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
    ]
    const result = await commitBoard(shuffled)

    const sortedShips = [...shuffled].sort((a, b) =>
      a.type.localeCompare(b.type),
    )
    const expectedPayload = JSON.stringify(sortedShips) + ':' + result.saltHex
    const expectedHash = await sha256(expectedPayload)
    expect(result.hash).toBe(expectedHash)
  })

  it('does not mutate input array', async () => {
    const shuffled: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'battleship', x: 0, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
    ]
    const originalOrder = shuffled.map((s) => s.type)
    await commitBoard(shuffled)
    expect(shuffled.map((s) => s.type)).toEqual(originalOrder)
  })
})

const SORTED_SHIPS: PlacedShip[] = [
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
]

describe('verifyBoard', () => {
  it('honest board verifies successfully', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const isValid = await verifyBoard(SORTED_SHIPS, result.saltHex, result.hash)
    expect(isValid).toBe(true)
  })

  it('modified ship position fails', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const tampered = SORTED_SHIPS.map((s, i) =>
      i === 0 ? { ...s, x: 5 } : { ...s },
    )
    const isValid = await verifyBoard(tampered, result.saltHex, result.hash)
    expect(isValid).toBe(false)
  })

  it('modified salt fails', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const isValid = await verifyBoard(
      SORTED_SHIPS,
      'ff'.repeat(32),
      result.hash,
    )
    expect(isValid).toBe(false)
  })

  it('added ship fails', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const extraShips: PlacedShip[] = [
      ...SORTED_SHIPS,
      { type: 'destroyer', x: 5, y: 5, orientation: 'v' },
    ]
    const isValid = await verifyBoard(extraShips, result.saltHex, result.hash)
    expect(isValid).toBe(false)
  })

  it('removed ship fails', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const fewerShips = SORTED_SHIPS.slice(1)
    const isValid = await verifyBoard(fewerShips, result.saltHex, result.hash)
    expect(isValid).toBe(false)
  })

  it('unsorted ships fail', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const shuffled: PlacedShip[] = [
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
      { type: 'battleship', x: 0, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
    ]
    const isValid = await verifyBoard(shuffled, result.saltHex, result.hash)
    expect(isValid).toBe(false)
  })

  it('modified ship orientation fails', async () => {
    const result = await commitBoard(SORTED_SHIPS)
    const tampered = SORTED_SHIPS.map((s, i) =>
      i === 0 ? { ...s, orientation: 'v' as const } : { ...s },
    )
    const isValid = await verifyBoard(tampered, result.saltHex, result.hash)
    expect(isValid).toBe(false)
  })
})

describe('useCrypto', () => {
  it('returns correct shape', () => {
    const crypto = useCrypto()
    expect(typeof crypto.commitBoard).toBe('function')
    expect(typeof crypto.verifyBoard).toBe('function')
    expect(typeof crypto.isAvailable).toBe('boolean')
  })

  it('isAvailable is true in test environment', () => {
    const crypto = useCrypto()
    expect(crypto.isAvailable).toBe(true)
  })

  it('end-to-end commit-reveal (honest board)', async () => {
    const shuffledShips: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      { type: 'submarine', x: 0, y: 3, orientation: 'h' },
      { type: 'battleship', x: 0, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
    ]
    const { commitBoard, verifyBoard } = useCrypto()
    const result = await commitBoard(shuffledShips)
    const isValid = await verifyBoard(SORTED_SHIPS, result.saltHex, result.hash)
    expect(isValid).toBe(true)
  })

  it('end-to-end commit-reveal (tampered board)', async () => {
    const { commitBoard, verifyBoard } = useCrypto()
    const result = await commitBoard(SORTED_SHIPS)
    const tampered = SORTED_SHIPS.map((s, i) =>
      i === 2 ? { ...s, y: 9 } : { ...s },
    )
    const isValid = await verifyBoard(tampered, result.saltHex, result.hash)
    expect(isValid).toBe(false)
  })
})
