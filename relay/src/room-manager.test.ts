import WebSocket from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomManager } from './room-manager.js'

function createMockClient(): WebSocket {
  const client = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  }
  return client as unknown as WebSocket
}

describe('RoomManager', () => {
  let manager: RoomManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new RoomManager({
      maxRooms: 100,
      maxClientsPerRoom: 2,
      roomTimeoutMs: 3600000,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a room when first client joins', () => {
    const client = createMockClient()
    const result = manager.join('room1', client)

    expect(result).toEqual({ success: true })
    expect(manager.getStats()).toEqual({ rooms: 1, connections: 1 })
    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'peer_count', count: 1 })
    )
  })

  it('sends peer_count 2 to both clients when second joins', () => {
    const clientA = createMockClient()
    const clientB = createMockClient()

    manager.join('room1', clientA)
    vi.clearAllMocks()

    manager.join('room1', clientB)

    const expected = JSON.stringify({ type: 'peer_count', count: 2 })
    expect(clientA.send).toHaveBeenCalledWith(expected)
    expect(clientB.send).toHaveBeenCalledWith(expected)
  })

  it('rejects third client from full room', () => {
    const clientA = createMockClient()
    const clientB = createMockClient()
    const clientC = createMockClient()

    manager.join('room1', clientA)
    manager.join('room1', clientB)
    const result = manager.join('room1', clientC)

    expect(result).toEqual({ success: false, error: 'ROOM_FULL' })
    expect(manager.getStats()).toEqual({ rooms: 1, connections: 2 })
  })

  it('notifies remaining peer when client leaves', () => {
    const clientA = createMockClient()
    const clientB = createMockClient()

    manager.join('room1', clientA)
    manager.join('room1', clientB)
    vi.clearAllMocks()

    manager.leave(clientA)

    expect(clientB.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'peer_left' })
    )
  })

  it('deletes room when last client leaves', () => {
    const client = createMockClient()

    manager.join('room1', client)
    expect(manager.getStats()).toEqual({ rooms: 1, connections: 1 })

    manager.leave(client)
    expect(manager.getStats()).toEqual({ rooms: 0, connections: 0 })
  })

  it('broadcasts message to peer only, not sender', () => {
    const clientA = createMockClient()
    const clientB = createMockClient()

    manager.join('room1', clientA)
    manager.join('room1', clientB)
    vi.clearAllMocks()

    const message = JSON.stringify({ type: 'shot', x: 3, y: 5 })
    manager.broadcast(clientA, message)

    expect(clientB.send).toHaveBeenCalledWith(message)
    expect(clientA.send).not.toHaveBeenCalled()
  })

  it('handles broadcast for unregistered client silently', () => {
    const unknownClient = createMockClient()
    expect(() => manager.broadcast(unknownClient, 'test')).not.toThrow()
  })

  it('reports accurate stats across multiple rooms', () => {
    const client1 = createMockClient()
    const client2 = createMockClient()
    const client3 = createMockClient()
    const client4 = createMockClient()

    manager.join('room1', client1)
    manager.join('room1', client2)
    manager.join('room2', client3)
    manager.join('room2', client4)

    expect(manager.getStats()).toEqual({ rooms: 2, connections: 4 })
  })

  it('cleans up room on timeout', () => {
    const client = createMockClient()
    manager.join('room1', client)

    expect(manager.getStats()).toEqual({ rooms: 1, connections: 1 })

    vi.advanceTimersByTime(3600000)

    expect(manager.getStats()).toEqual({ rooms: 0, connections: 0 })
    expect(client.close).toHaveBeenCalled()
  })

  it('handles leave for unknown client silently', () => {
    const unknownClient = createMockClient()
    expect(() => manager.leave(unknownClient)).not.toThrow()
  })

  it('skips clients with non-OPEN readyState when sending', () => {
    const clientA = createMockClient()
    const clientB = createMockClient()
    ;(clientB as unknown as { readyState: number }).readyState = WebSocket.CLOSED

    manager.join('room1', clientA)
    manager.join('room1', clientB)
    vi.clearAllMocks()

    manager.broadcast(clientA, 'test')

    expect(clientB.send).not.toHaveBeenCalled()
  })
})
