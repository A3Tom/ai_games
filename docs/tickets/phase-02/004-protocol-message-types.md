# Phase 02 — Ticket 004: Protocol Message Types

## Summary

Define all WebSocket protocol message types in `app/src/types/protocol.ts`, including game messages (peer-to-peer), relay system messages, and client control messages. This file establishes the discriminated union types that the connection composable (Phase 6), game protocol composable (Phase 8), and relay server (Phase 5) all depend on for type-safe message handling. When done, the agent should have a protocol type file with fully typed message unions that compile cleanly.

## Prerequisites

- **Ticket 001** (`app/src/types/game.ts`) must be completed. This ticket imports `ShipType`, `GamePhase`, and `PlacedShip` from that file.

## Scope

**In scope:**

- All 10 game message interfaces: `ReadyMessage`, `CommitMessage`, `ShotMessage`, `ResultMessage`, `RevealMessage`, `RematchMessage`, `PingMessage`, `PongMessage`, `SyncRequestMessage`, `SyncResponseMessage`
- `GameMessage` discriminated union type
- All 3 relay system message interfaces: `PeerCountMessage`, `PeerLeftMessage`, `RelayErrorMessage`
- `RelayMessage` discriminated union type
- `IncomingMessage` union type (game + relay)
- `JoinMessage` interface and `ClientControlMessage` type

**Out of scope:**

- `ShipType`, `GamePhase`, `PlacedShip` definitions — already in ticket 001 (`app/src/types/game.ts`)
- Message validation functions (type guards like `isGameMessage()`) — Phase 3 or Phase 6
- Message serialization/deserialization logic — Phase 6
- Relay server types (`relay/src/types.ts`) — Phase 5 (will mirror these types)

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/types/protocol.ts` | Create | All protocol message interfaces and discriminated union types |

## Requirements

Follow coding standards from `docs/03-CODING-STANDARDS.md` Section 2.1 (no `enum`), Section 2.4 (discriminated unions with `type` field), Section 2.5 (`interface` for objects, `type` for unions).

**Source of truth:** `docs/05-PROTOCOL-SPEC.md` Section 4 (message definitions) and `docs/phases/phase-02-type-foundation.md` (Interfaces & Contracts).

### Imports

```typescript
import type { ShipType, GamePhase, PlacedShip } from './game'
```

Use `import type` since all imports are used only in type positions.

### Game Messages

These messages are sent between peers, forwarded transparently by the relay. Each has a `type` literal field for discriminated union narrowing.

#### `ReadyMessage`

```typescript
export interface ReadyMessage {
  type: 'ready'
}
```

Sent when a player finishes placing ships. Both players must send `ready` to transition from SETUP to COMMIT.

#### `CommitMessage`

```typescript
export interface CommitMessage {
  type: 'commit'
  hash: string
}
```

Contains the SHA-256 hash (64-character lowercase hex string) of the player's board commitment. `hash` is the result of `SHA-256(JSON.stringify(sortedShips) + ':' + saltHex)`. See `docs/05-PROTOCOL-SPEC.md` Section 6.

#### `ShotMessage`

```typescript
export interface ShotMessage {
  type: 'shot'
  x: number
  y: number
}
```

A shot fired at the opponent's board. `x` (column, 0–9) and `y` (row, 0–9) are 0-indexed coordinates. Only valid during BATTLE phase on the sender's turn.

#### `ResultMessage`

```typescript
export interface ResultMessage {
  type: 'result'
  x: number
  y: number
  hit: boolean
  sunk: ShipType | null
}
```

The response to an incoming shot. `x` and `y` echo the shot coordinates. `hit` indicates whether a ship occupies that cell. `sunk` is the `ShipType` if this shot sank a ship, or `null` otherwise. **`sunk` is always present** (not optional) — use `null`, not `undefined`.

#### `RevealMessage`

```typescript
export interface RevealMessage {
  type: 'reveal'
  ships: PlacedShip[]
  salt: string
}
```

Sent after all ships are sunk. Contains the full ship placement (sorted alphabetically by `type`) and the 32-byte salt as a 64-character hex string. The opponent uses these to verify the commitment hash. See `docs/05-PROTOCOL-SPEC.md` Section 6.

#### `RematchMessage`

```typescript
export interface RematchMessage {
  type: 'rematch'
}
```

Sent to request a rematch. When both players send `rematch`, the game resets to SETUP.

#### `PingMessage`

```typescript
export interface PingMessage {
  type: 'ping'
  timestamp: number
}
```

Latency probe. `timestamp` is `Date.now()` at send time (milliseconds since epoch).

#### `PongMessage`

```typescript
export interface PongMessage {
  type: 'pong'
  timestamp: number
}
```

Response to a ping. Echoes the original `timestamp` so the sender can compute round-trip time.

#### `SyncRequestMessage`

```typescript
export interface SyncRequestMessage {
  type: 'sync_request'
}
```

Sent after reconnection to request the peer's current game state. See `docs/05-PROTOCOL-SPEC.md` Section 8 (Reconnection).

#### `SyncResponseMessage`

```typescript
export interface SyncResponseMessage {
  type: 'sync_response'
  phase: GamePhase
  turnNumber: number
  shotHistory: Array<{
    x: number
    y: number
    hit: boolean
    sunk: ShipType | null
    player: 'a' | 'b'
  }>
}
```

Contains the responder's view of the game state for reconciliation. `turnNumber` is the total number of shots fired. `shotHistory` contains all shots in order, with `player` indicating who fired each.

### `GameMessage` Union

```typescript
export type GameMessage =
  | ReadyMessage
  | CommitMessage
  | ShotMessage
  | ResultMessage
  | RevealMessage
  | RematchMessage
  | PingMessage
  | PongMessage
  | SyncRequestMessage
  | SyncResponseMessage
```

Discriminated union of all peer-to-peer messages. Can be narrowed using `message.type`.

### Relay System Messages

These messages are generated by the relay server, never forwarded between peers.

#### `PeerCountMessage`

```typescript
export interface PeerCountMessage {
  type: 'peer_count'
  count: number
}
```

Sent by the relay when the number of peers in the room changes. `count` is 1 (alone) or 2 (opponent joined). Receiving `count: 2` triggers the transition from LOBBY to SETUP.

#### `PeerLeftMessage`

```typescript
export interface PeerLeftMessage {
  type: 'peer_left'
}
```

Sent by the relay when the other peer disconnects.

#### `RelayErrorMessage`

```typescript
export interface RelayErrorMessage {
  type: 'error'
  code: 'ROOM_FULL' | 'INVALID_MESSAGE' | 'RATE_LIMITED'
  message: string
}
```

Sent by the relay when an error occurs. `code` is one of three known error types. `message` is a human-readable description.

### `RelayMessage` Union

```typescript
export type RelayMessage =
  | PeerCountMessage
  | PeerLeftMessage
  | RelayErrorMessage
```

### `IncomingMessage` Union

```typescript
export type IncomingMessage = GameMessage | RelayMessage
```

The complete set of messages a client can receive over the WebSocket. The connection composable (Phase 6) will parse incoming JSON and narrow to this type.

### Client Control Messages

#### `JoinMessage`

```typescript
export interface JoinMessage {
  type: 'join'
  roomId: string
}
```

Sent by the client to the relay to join a room. `roomId` is an 8-character alphanumeric string generated by nanoid.

#### `ClientControlMessage` Type

```typescript
export type ClientControlMessage = JoinMessage
```

Currently only `join`, but structured as a union type for future extensibility.

### Export Requirements

All message interfaces must be individually exported (`export interface`). All union types must be exported (`export type`). This allows consumers to import specific message types when needed (e.g., `import type { ShotMessage } from '../types/protocol'`).

## Acceptance Criteria

- [ ] File exists at `app/src/types/protocol.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `GameMessage` is a discriminated union of exactly 10 message types, each with a unique `type` string literal
- [ ] `RelayMessage` is a separate discriminated union of exactly 3 message types (`peer_count`, `peer_left`, `error`)
- [ ] `IncomingMessage` is the union of `GameMessage | RelayMessage`
- [ ] `ResultMessage.sunk` is typed as `ShipType | null` (not optional)
- [ ] All message interfaces and union types are explicitly exported

## Notes for the Agent

- **Every message interface must have a `type` property with a string literal type** (e.g., `type: 'shot'`, not `type: string`). This is what makes the discriminated union work — TypeScript can narrow `GameMessage` to `ShotMessage` by checking `message.type === 'shot'`.
- **Use `import type`** for the import from `./game`. All three imports (`ShipType`, `GamePhase`, `PlacedShip`) are used only in type positions.
- **Do not add type guard functions** (like `isShotMessage()`) in this file. Type guards are runtime code and belong in a validation utility (Phase 3 or Phase 6). This file should contain only type definitions.
- **Do not add a `ConnectionState` interface here.** Connection state lives in the store (`docs/02-ARCHITECTURE.md` Section 4) and will be defined in Phase 4.
- **`RelayErrorMessage` uses `type: 'error'`**, not `type: 'relay_error'`. This matches the protocol spec exactly (`docs/05-PROTOCOL-SPEC.md` Section 3.2).
- **The `SyncResponseMessage.shotHistory` uses an inline type** for the array elements rather than referencing the `Shot` interface from `game.ts`. This is intentional — the protocol message shape is defined by the protocol spec, and while it looks similar to `Shot`, keeping it inline avoids coupling the protocol type to the game state type. If you prefer to reference `Shot`, that is also acceptable since the shapes match.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not send raw JSON without validation. The type definitions here enable validation in later phases — but do not add validation logic to this file.
