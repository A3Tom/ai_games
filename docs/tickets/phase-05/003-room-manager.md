# Phase 05 — Ticket 003: Room Manager

## Summary

Implement the `RoomManager` class in `relay/src/room-manager.ts` along with its unit tests. The room manager is the core of the relay — it handles room creation (implicit on first join), client join/leave tracking, max 2 clients per room enforcement, message broadcasting to peers, room timeout cleanup, and stats reporting for the health endpoint. When done, the agent should have a fully tested `RoomManager` class with all methods from the phase overview's interface contract.

## Prerequisites

- **Ticket 001** must be complete — `relay/package.json` exists with `ws` and `vitest` installed.
- **Ticket 002** must be complete — `relay/src/types.ts` exists with `PeerCountMessage`, `PeerLeftMessage`, `RelayErrorMessage`, `RELAY_ERROR_CODE`, and `isJoinMessage` exports.

## Scope

**In scope:**

- `Room` interface (private to this module)
- `RoomManager` class with constructor accepting config
- `join(roomId, client)` method — implicit room creation, max clients enforcement, peer count broadcasting
- `leave(client)` method — remove client, notify remaining peer, cleanup empty rooms
- `broadcast(sender, message)` method — forward message to all other clients in sender's room
- `getStats()` method — return current room and connection counts
- Internal room timeout management (create/reset/clear timers)
- Client-to-room mapping for efficient lookups
- Structured JSON logging to stdout
- Unit tests covering all public methods, edge cases, and timeout behavior

**Out of scope:**

- HTTP server or WebSocket upgrade — ticket 005 (`server.ts`)
- Health endpoint handler — ticket 004 (`health.ts`)
- Rate limiting — ticket 005 (per-client, managed in `server.ts`)
- Message size validation — ticket 005 (checked before reaching room manager)
- Docker configuration — ticket 006

## Files

| File | Action | Description |
|------|--------|-------------|
| `relay/src/room-manager.ts` | Create | RoomManager class with full room lifecycle |
| `relay/src/room-manager.test.ts` | Create | Unit tests for all RoomManager methods |

## Requirements

### Room Interface

```typescript
interface Room {
  id: string
  clients: Set<WebSocket>
  createdAt: number
  lastActivityAt: number
  timeoutHandle: ReturnType<typeof setTimeout>
}
```

This interface is internal to `room-manager.ts` — do not export it. It is used only by the `RoomManager` class.

### RoomManager Class

From `docs/phases/phase-05-relay-server.md` Section 6:

```typescript
export class RoomManager {
  constructor(config: {
    maxRooms: number
    maxClientsPerRoom: number
    roomTimeoutMs: number
  })

  join(roomId: string, client: WebSocket): { success: boolean; error?: string }
  leave(client: WebSocket): void
  broadcast(sender: WebSocket, message: string): void
  getStats(): { rooms: number; connections: number }
}
```

### Internal Data Structures

The class must maintain:

1. **`rooms: Map<string, Room>`** — maps room ID to Room object.
2. **`clientRoomMap: Map<WebSocket, string>`** — maps each connected client to its room ID for O(1) lookups when a client sends a message or disconnects. This avoids iterating all rooms to find which room a client belongs to.

### Method: `join(roomId: string, client: WebSocket)`

Behavior per `docs/05-PROTOCOL-SPEC.md` Section 3:

1. If the room does not exist, create it (implicit room creation per decision 2 in the phase overview). Initialize with empty client set, `createdAt: Date.now()`, `lastActivityAt: Date.now()`, and start the timeout timer.
2. If the room exists and is full (`clients.size >= maxClientsPerRoom`), return `{ success: false, error: 'ROOM_FULL' }`. Do NOT add the client. The caller (`server.ts`) is responsible for sending the error message and disconnecting the client.
3. Add the client to the room's client set.
4. Add the client → roomId mapping to `clientRoomMap`.
5. Reset the room timeout timer (activity occurred).
6. Send `{ type: "peer_count", count: <new count> }` to ALL clients in the room (including the one that just joined).
7. Log the join event as structured JSON: `{ event: "peer_joined", roomId, peerCount: <count> }`.
8. Return `{ success: true }`.

### Method: `leave(client: WebSocket)`

Behavior per `docs/05-PROTOCOL-SPEC.md` Section 3:

1. Look up the client's room from `clientRoomMap`. If not found, return silently (client was never in a room, or already removed).
2. Remove the client from the room's client set.
3. Remove the client from `clientRoomMap`.
4. If the room is now empty, delete the room from `rooms`, clear its timeout timer, and log: `{ event: "room_deleted", roomId }`.
5. If the room still has clients, send `{ type: "peer_left" }` to each remaining client, update `lastActivityAt`, reset the timeout timer, and log: `{ event: "peer_left", roomId, peerCount: <remaining> }`.

### Method: `broadcast(sender: WebSocket, message: string)`

Behavior per `docs/05-PROTOCOL-SPEC.md` Section 2.3 and phase overview decision 9:

1. Look up the sender's room from `clientRoomMap`. If not found, return silently.
2. Update the room's `lastActivityAt` to `Date.now()`.
3. Reset the room timeout timer (activity occurred).
4. For each client in the room that is NOT the sender, send the `message` string verbatim.
5. **Critical: never echo the message back to the sender.** Only forward to other clients.

The message is a raw string — do not parse, inspect, or modify it. The relay forwards verbatim per the stateless design.

### Method: `getStats()`

```typescript
getStats(): { rooms: number; connections: number }
```

- `rooms`: the current size of the `rooms` Map.
- `connections`: the total number of clients across all rooms (sum of all `room.clients.size`).

### Room Timeout Management

Per phase overview decision 4 and `docs/02-ARCHITECTURE.md` Section 6.1:

- When a room is created, start a `setTimeout` with `roomTimeoutMs` duration.
- When activity occurs in a room (join, leave, message), clear the existing timeout and start a new one.
- When the timeout fires, remove all clients from the room (close their WebSocket connections with a normal close code), delete the room, and log: `{ event: "room_timeout", roomId }`.
- When a room is deleted (all clients left), clear its timeout to prevent firing on a deleted room.

### Structured Logging

Per phase overview decision 7 and `docs/02-ARCHITECTURE.md` Section 9.1:

Log events as JSON to stdout using `console.log(JSON.stringify({ ... }))`. Include a `timestamp` field with ISO 8601 format. Events to log:

- `room_created` — when a new room is created (first join)
- `peer_joined` — when a client joins a room
- `peer_left` — when a client leaves a room
- `room_deleted` — when a room is removed (empty or timeout)
- `room_timeout` — when a room expires due to inactivity

### Sending Messages to Clients

When sending messages to WebSocket clients, check that the client's `readyState` is `WebSocket.OPEN` before calling `send()`. Skip clients that are in a closing or closed state. Import `WebSocket` from the `ws` package for the `readyState` constants.

### Test Requirements

Tests must use Vitest per `docs/03-CODING-STANDARDS.md` Section 7. Mock WebSocket clients using simple objects that implement the minimal interface needed:

```typescript
function createMockClient(): WebSocket {
  const client = {
    readyState: 1, // WebSocket.OPEN
    send: vi.fn(),
    close: vi.fn(),
  }
  return client as unknown as WebSocket
}
```

Required test cases (minimum):

1. **First client joining creates room:** Join a room, verify `getStats()` returns `{ rooms: 1, connections: 1 }`, verify client received `peer_count` with count 1.
2. **Second client joining same room:** Both clients receive `peer_count` with count 2.
3. **Third client rejected from full room:** Returns `{ success: false, error: 'ROOM_FULL' }`, client count stays at 2.
4. **Client leaving notifies peer:** Remaining client receives `peer_left` message.
5. **Last client leaving deletes room:** `getStats()` returns `{ rooms: 0, connections: 0 }`.
6. **Broadcast forwards to peer only:** Client A sends message, Client B receives it, Client A does not.
7. **Broadcast with no room is silent:** Calling `broadcast()` for an unregistered client does not throw.
8. **getStats accuracy:** Create 2 rooms with 2 clients each, verify `{ rooms: 2, connections: 4 }`.
9. **Room timeout cleanup:** Use `vi.useFakeTimers()`, create a room, advance time past `roomTimeoutMs`, verify room is cleaned up.

## Acceptance Criteria

- [ ] File exists at `relay/src/room-manager.ts` with `RoomManager` class exported
- [ ] File exists at `relay/src/room-manager.test.ts`
- [ ] `npm run build` in `relay/` produces no TypeScript errors
- [ ] First join creates room and sends `peer_count` with count 1
- [ ] Second join sends `peer_count` with count 2 to both clients
- [ ] Third join returns `{ success: false, error: 'ROOM_FULL' }` without adding client
- [ ] `broadcast()` sends to peer only, never back to sender
- [ ] All tests pass via `npm run test` in `relay/`

## Notes for the Agent

- **The `Room` interface is NOT exported.** It's an implementation detail. Only the `RoomManager` class and its method signatures are public.
- **Use `Map`, not plain objects** for room storage and client lookups. Maps handle frequent add/delete better and don't have prototype pollution risks.
- **Check `readyState` before sending.** WebSocket clients may be in a closing state when you try to send. Always check `client.readyState === WebSocket.OPEN`. Import `WebSocket` from `ws` for the constant.
- **Do not parse forwarded messages.** `broadcast()` receives a raw string and sends it verbatim. The relay is stateless — per `docs/04-AI-ASSISTANT-GUIDE.md` Section 1 and phase overview decision 1, no game logic lives in the relay.
- **Timer cleanup is critical.** Failing to clear timeouts when rooms are deleted causes memory leaks and errors when the timeout callback fires on a non-existent room. Use `clearTimeout()` in `leave()` when deleting a room and before starting a new timeout.
- **Mock WebSocket pattern:** In tests, create mock clients as plain objects with `send: vi.fn()` and `close: vi.fn()`. Cast with `as unknown as WebSocket`. This is simpler and faster than spinning up real WebSocket connections (integration tests in ticket 005 will do that).
- **Use `vi.useFakeTimers()` for timeout tests.** Call `vi.advanceTimersByTime(roomTimeoutMs)` to trigger room cleanup. Remember to call `vi.useRealTimers()` in `afterEach` or use `vi.restoreAllMocks()`.
- Reference `docs/05-PROTOCOL-SPEC.md` Section 3 for room management rules and Section 2.3 for the no-echo-to-sender rule.
