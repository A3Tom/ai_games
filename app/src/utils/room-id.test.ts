import { describe, it, expect } from 'vitest'
import { generateRoomId } from './room-id'

describe('generateRoomId', () => {
  it('returns a string of exactly 8 characters', () => {
    const id = generateRoomId()
    expect(typeof id).toBe('string')
    expect(id).toHaveLength(8)
  })

  it('contains only lowercase alphanumeric characters', () => {
    const id = generateRoomId()
    expect(id).toMatch(/^[0-9a-z]+$/)
  })

  it('generates unique IDs on consecutive calls', () => {
    const id1 = generateRoomId()
    const id2 = generateRoomId()
    expect(id1).not.toBe(id2)
  })

  it('consistently produces valid IDs across multiple calls', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateRoomId()
      expect(id).toHaveLength(8)
      expect(id).toMatch(/^[0-9a-z]+$/)
    }
  })
})
