import type http from 'node:http'
import { WebSocket, type WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createServer } from './server.js'
import { RoomManager } from './room-manager.js'
import type { ModernJoinMessage, RoomSnapshot } from './types.js'

interface Message {
  type: string
  room?: RoomSnapshot | null
  stats?: Record<string, number>
  [key: string]: unknown
}

class TestClient {
  readonly messages: Message[] = []
  private listeners = new Set<() => void>()

  constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()) as Message)
      for (const listener of this.listeners) listener()
    })
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message))
  }

  join(roomId: string, playerId: string, appId = 'test-lab'): void {
    this.send({ type: 'relay:join', appId, roomId, playerId, name: playerId })
  }

  async next(type: string): Promise<Message> {
    const take = (): Message | undefined => {
      const index = this.messages.findIndex((message) => message.type === type)
      return index < 0 ? undefined : this.messages.splice(index, 1)[0]
    }
    const pending = take()
    if (pending) return pending
    return new Promise<Message>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener)
        reject(new Error(`Timed out waiting for ${type}`))
      }, 2000)
      const listener = (): void => {
        const message = take()
        if (!message) return
        clearTimeout(timeout)
        this.listeners.delete(listener)
        resolve(message)
      }
      this.listeners.add(listener)
    })
  }

  clear(): void {
    this.messages.length = 0
  }
}

describe('Multiplayer playground protocol', () => {
  let httpServer: http.Server
  let wss: WebSocketServer
  let port: number
  const clients: TestClient[] = []

  beforeEach(async () => {
    const server = createServer({ port: 0, maxRooms: 100, maxClientsPerRoom: 4, roomTimeoutMs: 3600000, logLevel: 'info' })
    httpServer = server.httpServer
    wss = server.wss
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const address = httpServer.address()
    if (!address || typeof address === 'string') throw new Error('No listening port')
    port = address.port
  })

  afterEach(async () => {
    for (const client of clients) client.ws.terminate()
    clients.length = 0
    await new Promise<void>((resolve) => wss.close(() => httpServer.close(() => resolve())))
  })

  async function connect(): Promise<TestClient> {
    const ws = new WebSocket(`ws://localhost:${port}`)
    const client = new TestClient(ws)
    clients.push(client)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    return client
  }

  it('measures relay round trip without a room or another player', async () => {
    const client = await connect()
    client.send({ type: 'relay:ping', id: 'solo-ping' })
    expect(await client.next('relay:pong')).toEqual({ type: 'relay:pong', id: 'solo-ping' })
    client.send({ type: 'relay:stats' })
    const { stats } = await client.next('relay:stats')
    expect(stats).toMatchObject({ rooms: 0, players: 0, connections: 1, messagesReceived: 2, messagesForwarded: 0, rejectedMessages: 0 })
    expect(stats?.bytesReceived).toBeGreaterThan(0)
    expect(stats?.bytesSent).toBeGreaterThan(0)
  })

  it('caps legacy Sea Strike rooms at two while modern rooms use the configured four seats', async () => {
    const legacy = await Promise.all([connect(), connect(), connect()])
    legacy[0]!.send({ type: 'join', roomId: 'shared' })
    await legacy[0]!.next('peer_count')
    legacy[1]!.send({ type: 'join', roomId: 'shared' })
    await Promise.all([legacy[0]!.next('peer_count'), legacy[1]!.next('peer_count')])
    legacy[2]!.send({ type: 'join', roomId: 'shared' })
    expect(await legacy[2]!.next('error')).toEqual({ type: 'error', code: 'ROOM_FULL', message: 'Room is full' })

    const modern = await Promise.all([connect(), connect(), connect(), connect()])
    for (let index = 0; index < modern.length; index++) {
      modern[index]!.join('shared', `player-${index}`)
      for (let member = 0; member <= index; member++) {
        const snapshot = await modern[member]!.next('relay:room')
        expect(snapshot.room?.capacity).toBe(4)
        expect(snapshot.room?.players).toHaveLength(index + 1)
      }
    }
  })

  it('reports all players, readiness and leaves in a multi-player room', async () => {
    const a = await connect()
    const b = await connect()
    const c = await connect()
    a.join('room', 'alice')
    await a.next('relay:room')
    b.join('room', 'bob')
    await Promise.all([a.next('relay:room'), b.next('relay:room')])
    c.join('room', 'charlie')
    const snapshots = await Promise.all([a.next('relay:room'), b.next('relay:room'), c.next('relay:room')])
    for (const snapshot of snapshots) {
      expect(snapshot.room?.capacity).toBe(4)
      expect(snapshot.room?.players.map((player) => player.id)).toEqual(['alice', 'bob', 'charlie'])
    }
    b.send({ type: 'relay:ready', ready: true })
    const readySnapshots = await Promise.all([a.next('relay:room'), b.next('relay:room'), c.next('relay:room')])
    for (const snapshot of readySnapshots) expect(snapshot.room?.players[1]?.ready).toBe(true)
    const joinedAt = readySnapshots[0]?.room?.players[1]?.joinedAt
    b.send({ type: 'relay:join', appId: 'test-lab', roomId: 'room', playerId: 'bob', name: 'Robert' })
    const renamedSnapshots = await Promise.all([a.next('relay:room'), b.next('relay:room'), c.next('relay:room')])
    for (const snapshot of renamedSnapshots) {
      expect(snapshot.room?.players).toHaveLength(3)
      expect(snapshot.room?.players[1]).toEqual({ id: 'bob', name: 'Robert', ready: true, joinedAt })
    }
    b.send({ type: 'relay:leave' })
    expect(await b.next('relay:room')).toEqual({ type: 'relay:room', room: null })
    expect((await a.next('relay:room')).room?.players.map((player) => player.id)).toEqual(['alice', 'charlie'])
    await c.next('relay:room')
    b.send({ type: 'relay:stats' })
    expect((await b.next('relay:stats')).stats).toMatchObject({ rooms: 1, players: 2, connections: 3 })
  })

  it('switches rooms without leaving ghost members or routing old-room actions', async () => {
    const a = await connect()
    const b = await connect()
    const c = await connect()
    a.join('old', 'alice')
    await a.next('relay:room')
    b.join('old', 'bob')
    await Promise.all([a.next('relay:room'), b.next('relay:room')])
    c.join('new', 'charlie')
    await c.next('relay:room')
    a.join('new', 'alice')
    expect((await a.next('relay:room')).room?.players).toHaveLength(2)
    expect((await b.next('relay:room')).room?.players.map((player) => player.id)).toEqual(['bob'])
    await c.next('relay:room')
    b.send({ type: 'relay:message', messageId: 'old-action', payload: { kind: 'old' } })
    expect(await b.next('relay:ack')).toEqual({ type: 'relay:ack', messageId: 'old-action', recipients: 0 })
    c.send({ type: 'relay:message', messageId: 'new-action', payload: { kind: 'new' }, senderId: 'forged' })
    expect(await a.next('relay:message')).toEqual({ type: 'relay:message', appId: 'test-lab', roomId: 'new', senderId: 'charlie', messageId: 'new-action', payload: { kind: 'new' } })
    expect((await c.next('relay:ack')).recipients).toBe(1)
    expect(a.messages.some((message) => message.messageId === 'old-action')).toBe(false)
  })

  it('retains original membership when a target room is full and permits idempotent joins', async () => {
    const members = await Promise.all([connect(), connect(), connect(), connect()])
    for (let index = 0; index < members.length; index++) {
      const client = members[index]!
      client.join('full', `player-${index}`)
      for (let member = 0; member <= index; member++) await members[member]!.next('relay:room')
    }
    members[0]!.join('full', 'player-0')
    for (const member of members) expect((await member.next('relay:room')).room?.players).toHaveLength(4)
    const newcomer = await connect()
    newcomer.join('source', 'newcomer')
    await newcomer.next('relay:room')
    newcomer.join('full', 'newcomer')
    expect((await newcomer.next('relay:error')).code).toBe('ROOM_FULL')
    newcomer.send({ type: 'relay:ready', ready: true })
    const source = await newcomer.next('relay:room')
    expect(source.room?.roomId).toBe('source')
    expect(source.room?.players[0]?.ready).toBe(true)
    newcomer.send({ type: 'relay:stats' })
    expect((await newcomer.next('relay:stats')).stats).toMatchObject({ rooms: 2, players: 5 })
  })

  it('isolates application namespaces and legacy rooms using the same room ID', async () => {
    const a = await connect()
    const b = await connect()
    const legacy = await connect()
    a.join('shared', 'alice', 'app-a')
    b.join('shared', 'bob', 'app-b')
    legacy.send({ type: 'join', roomId: 'shared' })
    await Promise.all([a.next('relay:room'), b.next('relay:room'), legacy.next('peer_count')])
    a.send({ type: 'relay:message', messageId: 'isolated', payload: { kind: 'pulse' } })
    expect((await a.next('relay:ack')).recipients).toBe(0)
    a.send({ type: 'relay:stats' })
    expect((await a.next('relay:stats')).stats).toMatchObject({ rooms: 3, players: 3, messagesForwarded: 0 })
    expect(b.messages).toEqual([])
    expect(legacy.messages).toEqual([])
  })

  it('rejects malformed joins, forged server events and unknown actions with counters', async () => {
    const a = await connect()
    const b = await connect()
    a.join('room', 'alice')
    await a.next('relay:room')
    b.join('room', 'bob')
    await Promise.all([a.next('relay:room'), b.next('relay:room')])
    a.send({ type: 'relay:room', room: { players: [] } })
    expect((await a.next('relay:error')).code).toBe('INVALID_MESSAGE')
    a.send({ type: 'relay:join', appId: 'test-lab', roomId: '../bad', playerId: 'alice', name: 'Alice' })
    expect((await a.next('relay:error')).code).toBe('INVALID_MESSAGE')
    a.send({ type: 'relay:join', appId: 'test-lab', roomId: 'room', playerId: 'bob', name: 'Alice' })
    expect((await a.next('relay:error')).code).toBe('PLAYER_ID_MISMATCH')
    const c = await connect()
    c.join('room', 'bob')
    expect((await c.next('relay:error')).code).toBe('PLAYER_EXISTS')
    a.ws.send('null')
    expect((await a.next('relay:error')).code).toBe('INVALID_MESSAGE')
    a.send({ type: 'relay:stats' })
    expect((await a.next('relay:stats')).stats?.rejectedMessages).toBe(5)
    expect(b.messages).toEqual([])
  })

  it('updates room membership when a socket disconnects', async () => {
    const a = await connect()
    const b = await connect()
    a.join('room', 'alice')
    await a.next('relay:room')
    b.join('room', 'bob')
    await Promise.all([a.next('relay:room'), b.next('relay:room')])
    b.ws.close()
    expect((await a.next('relay:room')).room?.players.map((player) => player.id)).toEqual(['alice'])
  })
})

describe('Atomic room capacity at the room limit', () => {
  it('allows moving the only client into a new room without increasing the room count', () => {
    vi.useFakeTimers()
    const manager = new RoomManager({ maxRooms: 1, maxClientsPerRoom: 4, roomTimeoutMs: 1000 })
    const client = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() } as unknown as WebSocket
    const join = (roomId: string): ModernJoinMessage => ({ type: 'relay:join', appId: 'lab', roomId, playerId: 'alice', name: 'Alice' })
    try {
      expect(manager.joinModern(join('old'), client)).toEqual({ success: true })
      expect(manager.joinModern(join('new'), client)).toEqual({ success: true })
      expect(manager.getStats()).toEqual({ rooms: 1, connections: 1 })
      const message = JSON.parse(vi.mocked(client.send).mock.calls.at(-1)![0] as string) as Message
      expect(message.room?.roomId).toBe('new')
    } finally {
      manager.dispose()
      vi.useRealTimers()
    }
  })
})
