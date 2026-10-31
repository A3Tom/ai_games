import WebSocket from 'ws'

import type { ModernJoinMessage, Player, RoomSnapshot } from './types.js'
import { consoleLogger } from './observability.js'
import type { Logger } from './observability.js'

interface Room {
  key: string
  id: string
  appId: string | null
  clients: Set<WebSocket>
  players: Map<WebSocket, Player>
  timeoutHandle: ReturnType<typeof setTimeout>
}

interface RoomConfig {
  maxRooms: number
  maxClientsPerRoom: number
  roomTimeoutMs: number
}

type JoinResult = { success: boolean; error?: string }

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly clientRoomMap = new Map<WebSocket, string>()

  constructor(
    private readonly config: RoomConfig,
    private readonly sendMessage: (client: WebSocket, message: string) => void = (client, message) => client.send(message),
    private readonly logger: Logger = consoleLogger,
  ) {}

  join(roomId: string, client: WebSocket): JoinResult {
    return this.joinRoom(JSON.stringify(['legacy', roomId]), roomId, null, client)
  }

  joinModern(message: ModernJoinMessage, client: WebSocket): JoinResult {
    return this.joinRoom(JSON.stringify(['modern', message.appId, message.roomId]), message.roomId, message.appId, client, {
      id: message.playerId,
      name: message.name.trim(),
      ready: false,
      joinedAt: Date.now(),
    })
  }

  private joinRoom(key: string, roomId: string, appId: string | null, client: WebSocket, player?: Player): JoinResult {
    let room = this.rooms.get(key)
    const current = this.getClientRoom(client)

    if (room?.clients.has(client)) {
      if (player && room.players.get(client)?.id !== player.id) {
        return { success: false, error: 'PLAYER_ID_MISMATCH' }
      }
      const existingPlayer = room.players.get(client)
      if (player && existingPlayer) existingPlayer.name = player.name
      this.touch(room)
      this.notifyRoom(room)
      return { success: true }
    }
    // Legacy Sea Strike assumes exactly two roles even when modern rooms allow
    // a larger party. Keep that constraint while honoring a lower configured cap.
    const capacity = appId === null ? Math.min(this.config.maxClientsPerRoom, 2) : this.config.maxClientsPerRoom
    if (room && room.clients.size >= capacity) {
      return { success: false, error: 'ROOM_FULL' }
    }
    if (room && player && [...room.players.values()].some((member) => member.id === player.id)) {
      return { success: false, error: 'PLAYER_EXISTS' }
    }
    // Moving the last player out of a room frees a slot for the target.
    const freedRoom = current?.clients.size === 1 ? 1 : 0
    if (!room && this.rooms.size - freedRoom >= this.config.maxRooms) {
      return { success: false, error: 'ROOM_LIMIT' }
    }

    // Validate the target before changing membership so failed switches are safe.
    if (current) this.leave(client, false)

    if (!room) {
      room = {
        key,
        id: roomId,
        appId,
        clients: new Set(),
        players: new Map(),
        timeoutHandle: this.startTimeout(key),
      }
      this.rooms.set(key, room)
      this.log('room_created', room)
    }
    room.clients.add(client)
    if (player) room.players.set(client, player)
    this.clientRoomMap.set(client, key)
    this.touch(room)
    this.notifyRoom(room)
    this.log('peer_joined', room)
    return { success: true }
  }

  leave(client: WebSocket, notifySelf = true): void {
    const room = this.getClientRoom(client)
    this.clientRoomMap.delete(client)
    if (!room) {
      if (notifySelf) this.send(client, { type: 'relay:room', room: null })
      return
    }

    room.clients.delete(client)
    room.players.delete(client)
    if (notifySelf && room.appId !== null) this.send(client, { type: 'relay:room', room: null })

    if (room.clients.size === 0) {
      clearTimeout(room.timeoutHandle)
      this.rooms.delete(room.key)
      this.log('room_deleted', room)
    } else {
      if (room.appId === null) {
        for (const peer of room.clients) this.send(peer, { type: 'peer_left' })
      } else {
        this.notifyRoom(room)
      }
      this.touch(room)
      this.log('peer_left', room)
    }
  }

  isModernClient(client: WebSocket): boolean {
    return this.getClientRoom(client)?.appId != null
  }

  setReady(client: WebSocket, ready: boolean): boolean {
    const room = this.getClientRoom(client)
    const player = room?.players.get(client)
    if (!room || !player) return false
    player.ready = ready
    this.touch(room)
    this.notifyRoom(room)
    return true
  }

  broadcastModern(sender: WebSocket, messageId: string, payload: unknown): number | null {
    const room = this.getClientRoom(sender)
    const player = room?.players.get(sender)
    if (!room || !player) return null
    return this.broadcast(sender, JSON.stringify({
      type: 'relay:message',
      appId: room.appId,
      roomId: room.id,
      senderId: player.id,
      messageId,
      payload,
    }))
  }

  broadcast(sender: WebSocket, message: string): number {
    const room = this.getClientRoom(sender)
    if (!room) return 0
    this.touch(room)
    let recipients = 0
    for (const client of room.clients) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message)
        recipients++
      }
    }
    return recipients
  }

  getStats(): { rooms: number; connections: number } {
    return { rooms: this.rooms.size, connections: this.clientRoomMap.size }
  }

  dispose(): void {
    for (const room of this.rooms.values()) clearTimeout(room.timeoutHandle)
    this.rooms.clear()
    this.clientRoomMap.clear()
  }

  private getClientRoom(client: WebSocket): Room | undefined {
    const key = this.clientRoomMap.get(client)
    return key === undefined ? undefined : this.rooms.get(key)
  }

  private notifyRoom(room: Room): void {
    const snapshot: RoomSnapshot | null = room.appId === null ? null : {
      appId: room.appId,
      roomId: room.id,
      capacity: this.config.maxClientsPerRoom,
      players: [...room.players.values()],
    }
    const message = snapshot === null
      ? { type: 'peer_count', count: room.clients.size }
      : { type: 'relay:room', room: snapshot }
    for (const client of room.clients) this.send(client, message)
  }

  private send(client: WebSocket, message: unknown): void {
    if (client.readyState === WebSocket.OPEN) this.sendMessage(client, JSON.stringify(message))
  }

  private touch(room: Room): void {
    clearTimeout(room.timeoutHandle)
    room.timeoutHandle = this.startTimeout(room.key)
  }

  private startTimeout(key: string): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      const room = this.rooms.get(key)
      if (!room) return
      this.log('room_timeout', room)
      for (const client of room.clients) {
        this.clientRoomMap.delete(client)
        if (client.readyState === WebSocket.OPEN) client.close(1000, 'Room expired')
      }
      this.rooms.delete(key)
    }, this.config.roomTimeoutMs)
    timer.unref?.()
    return timer
  }

  private log(event: string, room: Room): void {
    // The lab's existing wire namespace predates its catalogue ID.
    const appId = room.appId === 'multiplayer-lab' ? 'playground' : room.appId ?? 'sea-strike'
    this.logger('info', event, { appId, context: { peerCount: room.clients.size } })
  }
}
