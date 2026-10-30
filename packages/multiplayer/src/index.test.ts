import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMultiplayerClient } from './index'
import type { MultiplayerClient, RoomSnapshot } from './types'

class FakeSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: FakeSocket[] = []
  readyState = FakeSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  sent: string[] = []

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  open(): void {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.()
  }

  send(raw: string): void {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('Socket closed')
    this.sent.push(raw)
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }

  frames(type: string): Record<string, unknown>[] {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((message) => message.type === type)
  }
}

function room(roomId = 'alpha', count = 1): RoomSnapshot {
  return {
    appId: 'playground', roomId, capacity: 4,
    players: Array.from({ length: count }, (_, index) => ({
      id: index === 0 ? 'player1' : `peer${index}`, name: `Player ${index + 1}`,
      ready: false, joinedAt: 1,
    })),
  }
}

describe('multiplayer client lifecycle', () => {
  const clients: MultiplayerClient[] = []

  function client(url = 'ws://localhost:8080'): MultiplayerClient {
    const created = createMultiplayerClient({ url, appId: 'playground', playerId: 'player1', name: 'Tester' })
    clients.push(created)
    return created
  }

  function latestSocket(): FakeSocket {
    return FakeSocket.instances.at(-1)!
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    vi.stubGlobal('WebSocket', FakeSocket)
    FakeSocket.instances = []
  })

  afterEach(() => {
    clients.splice(0).forEach((created) => created.destroy())
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('can expose initial state with an empty URL and report a useful connection error', () => {
    const created = client('')
    const listener = vi.fn()
    created.subscribe(listener)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'disconnected' }))
    created.connect()
    expect(created.getState().lastError).toContain('ws:// or wss://')
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('queues joining until open and measures a server round trip without any peer', () => {
    const created = client()
    created.join('alpha', 'Tester')
    expect(created.getState().status).toBe('connecting')
    const socket = latestSocket()
    expect(socket.sent).toHaveLength(0)
    socket.open()
    expect(socket.frames('relay:join')).toEqual([{
      type: 'relay:join', appId: 'playground', roomId: 'alpha', playerId: 'player1', name: 'Tester',
    }])
    const ping = socket.frames('relay:ping')[0]!
    vi.advanceTimersByTime(42)
    socket.receive({ type: 'relay:pong', id: ping.id })
    expect(created.getState().latency).toMatchObject({ last: 42, min: 42, max: 42, average: 42, lost: 0 })
    expect(created.getState().room).toBeNull()
    socket.receive({ type: 'relay:room', room: room('alpha', 3) })
    expect(created.getState().room?.players).toHaveLength(3)
    expect(created.getState().messagesSent).toBe(3)
    expect(created.getState().bytesSent).toBeGreaterThan(0)
    expect(created.getState().bytesReceived).toBeGreaterThan(0)
  })

  it('retains confirmed membership after a rejected switch and rejoins it after reconnect', () => {
    const created = client()
    created.join('alpha')
    const first = latestSocket()
    first.open()
    first.receive({ type: 'relay:room', room: room() })
    created.join('full')
    first.receive({ type: 'relay:error', code: 'ROOM_FULL', message: 'Room is full' })
    expect(created.getState().room?.roomId).toBe('alpha')
    expect(created.getState().lastError).toContain('ROOM_FULL')
    first.close()
    expect(created.getState().room).toBeNull()
    expect(created.getState().status).toBe('reconnecting')
    vi.advanceTimersByTime(1_000)
    const second = latestSocket()
    expect(second).not.toBe(first)
    second.open()
    expect(second.frames('relay:join')[0]?.roomId).toBe('alpha')
    expect(created.getState().room).toBeNull()
    second.receive({ type: 'relay:room', room: room() })
    expect(created.getState().room?.roomId).toBe('alpha')
  })

  it('rejoins the last confirmed room if the connection closes during an unconfirmed switch', () => {
    const created = client()
    created.join('alpha')
    const first = latestSocket()
    first.open()
    first.receive({ type: 'relay:room', room: room() })
    created.join('beta')
    first.close()
    vi.advanceTimersByTime(1_000)
    latestSocket().open()
    expect(latestSocket().frames('relay:join')[0]?.roomId).toBe('alpha')
  })

  it('records an accepted intermediate room when rapid joins are followed by a rejection', () => {
    const created = client()
    created.connect()
    const socket = latestSocket()
    socket.open()
    created.join('alpha')
    created.join('full')
    socket.receive({ type: 'relay:room', room: room('alpha') })
    socket.receive({ type: 'relay:error', code: 'ROOM_FULL', message: 'Room is full' })
    created.reconnect()
    latestSocket().open()
    expect(latestSocket().frames('relay:join')[0]?.roomId).toBe('alpha')
  })

  it('retains membership after a rejected leave and accepts subsequent room updates', () => {
    const created = client()
    created.join('alpha')
    const socket = latestSocket()
    socket.open()
    socket.receive({ type: 'relay:room', room: room() })
    created.leave()
    socket.receive({ type: 'relay:error', code: 'RATE_LIMITED', message: 'Try again later' })
    socket.receive({ type: 'relay:room', room: room('alpha', 2) })
    expect(created.getState().room?.players).toHaveLength(2)
    created.reconnect()
    latestSocket().open()
    expect(latestSocket().frames('relay:join')[0]?.roomId).toBe('alpha')
  })

  it('never restores a room after the player leaves and reconnects', () => {
    const created = client()
    created.join('alpha')
    const socket = latestSocket()
    socket.open()
    socket.receive({ type: 'relay:room', room: room() })
    created.leave()
    socket.receive({ type: 'relay:room', room: null })
    expect(created.getState().room).toBeNull()
    created.reconnect()
    latestSocket().open()
    expect(latestSocket().frames('relay:join')).toHaveLength(0)
  })

  it.each(['connection loss', 'manual reconnect'])(
    'does not restore a room after %s while leave confirmation is pending', (reason) => {
      const created = client()
      created.join('alpha')
      const socket = latestSocket()
      socket.open()
      socket.receive({ type: 'relay:room', room: room() })
      created.leave()
      if (reason === 'connection loss') {
        socket.close()
        vi.advanceTimersByTime(1_000)
      } else created.reconnect()
      latestSocket().open()
      expect(latestSocket().frames('relay:join')).toHaveLength(0)
      expect(created.getState().room).toBeNull()
    },
  )

  it('ignores queued old-socket callbacks and stops timers after manual disconnect', () => {
    const created = client()
    created.join('alpha')
    const first = latestSocket()
    first.open()
    first.receive({ type: 'relay:room', room: room() })
    created.reconnect()
    const second = latestSocket()
    first.receive({ type: 'relay:room', room: room('stale') })
    first.onclose?.()
    expect(created.getState().status).toBe('reconnecting')
    expect(created.getState().room).toBeNull()
    second.open()
    created.disconnect()
    const count = FakeSocket.instances.length
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.instances).toHaveLength(count)
    expect(created.getState().status).toBe('disconnected')
    expect(created.getState().latency.last).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('expires lost pings, bounds samples and clears pending measurements on reset', () => {
    const created = client()
    created.connect()
    const socket = latestSocket()
    socket.open()
    vi.advanceTimersByTime(8_000)
    expect(created.getState().latency.lost).toBe(1)
    created.resetMetrics()
    expect(created.getState().latency.lost).toBe(0)
    expect(created.getState().messagesSent).toBe(0)
    for (let i = 0; i < 70; i += 1) {
      created.ping()
      const ping = socket.frames('relay:ping').at(-1)!
      vi.advanceTimersByTime(1)
      socket.receive({ type: 'relay:pong', id: ping.id })
    }
    expect(created.getState().latency.samples).toHaveLength(60)
    expect(created.getState().events).toHaveLength(100)
    expect(created.getState().latency.average).toBe(1)
  })

  it('rejects malformed and cross-room server envelopes without accepting their state', () => {
    const created = client()
    created.connect()
    const socket = latestSocket()
    socket.open()
    socket.receive({ type: 'relay:room', room: { ...room(), players: [{ id: 'bad' }] } })
    expect(created.getState().room).toBeNull()
    socket.receive({ type: 'relay:room', room: { ...room(), appId: 'other-game' } })
    expect(created.getState().room).toBeNull()
    socket.receive({ type: 'relay:room', room: room() })
    socket.receive({
      type: 'relay:message', appId: 'playground', roomId: 'elsewhere',
      senderId: 'peer', messageId: 'message1', payload: { kind: 'pulse' },
    })
    expect(created.getState().lastError).toContain('different room')
    expect(created.getState().events.some((event) => event.type === 'relay:message')).toBe(false)
  })

  it('sends JSON game payloads but rejects oversized and circular actions locally', () => {
    const created = client()
    created.join('alpha')
    const socket = latestSocket()
    socket.open()
    socket.receive({ type: 'relay:room', room: room() })
    created.send({ kind: 'pulse', color: '#123456' })
    expect(socket.frames('relay:message')[0]?.payload).toEqual({ kind: 'pulse', color: '#123456' })
    const before = socket.sent.length
    created.send({ text: 'x'.repeat(5_000) })
    expect(created.getState().lastError).toContain('4096-byte')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    created.send(circular)
    expect(created.getState().lastError).toContain('JSON-serializable')
    created.send(undefined)
    expect(socket.sent).toHaveLength(before)
  })

  it('notifies with distinct snapshots and unsubscribes cleanly', () => {
    const created = client()
    const listener = vi.fn()
    const unsubscribe = created.subscribe(listener)
    const initial = created.getState()
    created.connect()
    expect(created.getState()).not.toBe(initial)
    unsubscribe()
    const count = listener.mock.calls.length
    latestSocket().open()
    expect(listener).toHaveBeenCalledTimes(count)
    created.destroy()
    created.connect()
    created.requestStats()
    expect(vi.getTimerCount()).toBe(0)
  })
})
