import WebSocket from 'ws'

import type { PeerCountMessage, PeerLeftMessage } from './types.js'

interface Room {
  id: string
  clients: Set<WebSocket>
  createdAt: number
  lastActivityAt: number
  timeoutHandle: ReturnType<typeof setTimeout>
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map()
  private clientRoomMap: Map<WebSocket, string> = new Map()
  private readonly maxRooms: number
  private readonly maxClientsPerRoom: number
  private readonly roomTimeoutMs: number

  constructor(config: {
    maxRooms: number
    maxClientsPerRoom: number
    roomTimeoutMs: number
  }) {
    this.maxRooms = config.maxRooms
    this.maxClientsPerRoom = config.maxClientsPerRoom
    this.roomTimeoutMs = config.roomTimeoutMs
  }

  join(roomId: string, client: WebSocket): { success: boolean; error?: string } {
    let room = this.rooms.get(roomId)

    if (room && room.clients.size >= this.maxClientsPerRoom) {
      return { success: false, error: 'ROOM_FULL' }
    }

    if (!room) {
      if (this.rooms.size >= this.maxRooms) {
        return { success: false, error: 'ROOM_FULL' }
      }

      const now = Date.now()
      room = {
        id: roomId,
        clients: new Set(),
        createdAt: now,
        lastActivityAt: now,
        timeoutHandle: this.startTimeout(roomId),
      }
      this.rooms.set(roomId, room)

      console.log(
        JSON.stringify({
          event: 'room_created',
          roomId,
          timestamp: new Date().toISOString(),
        })
      )
    }

    room.clients.add(client)
    this.clientRoomMap.set(client, roomId)
    this.resetTimeout(room)

    const peerCountMsg: PeerCountMessage = {
      type: 'peer_count',
      count: room.clients.size,
    }
    const msgStr = JSON.stringify(peerCountMsg)

    for (const c of room.clients) {
      if (c.readyState === WebSocket.OPEN) {
        c.send(msgStr)
      }
    }

    console.log(
      JSON.stringify({
        event: 'peer_joined',
        roomId,
        peerCount: room.clients.size,
        timestamp: new Date().toISOString(),
      })
    )

    return { success: true }
  }

  leave(client: WebSocket): void {
    const roomId = this.clientRoomMap.get(client)
    if (!roomId) return

    const room = this.rooms.get(roomId)
    if (!room) {
      this.clientRoomMap.delete(client)
      return
    }

    room.clients.delete(client)
    this.clientRoomMap.delete(client)

    if (room.clients.size === 0) {
      clearTimeout(room.timeoutHandle)
      this.rooms.delete(roomId)

      console.log(
        JSON.stringify({
          event: 'room_deleted',
          roomId,
          timestamp: new Date().toISOString(),
        })
      )
    } else {
      const peerLeftMsg: PeerLeftMessage = { type: 'peer_left' }
      const msgStr = JSON.stringify(peerLeftMsg)

      for (const c of room.clients) {
        if (c.readyState === WebSocket.OPEN) {
          c.send(msgStr)
        }
      }

      room.lastActivityAt = Date.now()
      this.resetTimeout(room)

      console.log(
        JSON.stringify({
          event: 'peer_left',
          roomId,
          peerCount: room.clients.size,
          timestamp: new Date().toISOString(),
        })
      )
    }
  }

  broadcast(sender: WebSocket, message: string): void {
    const roomId = this.clientRoomMap.get(sender)
    if (!roomId) return

    const room = this.rooms.get(roomId)
    if (!room) return

    room.lastActivityAt = Date.now()
    this.resetTimeout(room)

    for (const c of room.clients) {
      if (c !== sender && c.readyState === WebSocket.OPEN) {
        c.send(message)
      }
    }
  }

  getStats(): { rooms: number; connections: number } {
    let connections = 0
    for (const room of this.rooms.values()) {
      connections += room.clients.size
    }
    return { rooms: this.rooms.size, connections }
  }

  private startTimeout(roomId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      this.handleRoomTimeout(roomId)
    }, this.roomTimeoutMs)
  }

  private resetTimeout(room: Room): void {
    clearTimeout(room.timeoutHandle)
    room.timeoutHandle = this.startTimeout(room.id)
  }

  private handleRoomTimeout(roomId: string): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    console.log(
      JSON.stringify({
        event: 'room_timeout',
        roomId,
        timestamp: new Date().toISOString(),
      })
    )

    for (const client of room.clients) {
      this.clientRoomMap.delete(client)
      if (client.readyState === WebSocket.OPEN) {
        client.close()
      }
    }

    this.rooms.delete(roomId)
  }
}
