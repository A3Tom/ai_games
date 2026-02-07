# Phase 2: Type Foundation

## 1. Objective

Define all TypeScript types, interfaces, and constants that form the shared vocabulary of the project. Before this phase, the app skeleton exists but has no domain-specific types. After this phase, every game entity, protocol message, ship configuration, and grid constant is precisely typed — providing a compile-time contract that all subsequent phases build upon.

## 2. Prerequisites

- **Phase 1** must be complete: the `app/` project compiles, TypeScript strict mode is configured, and the directory structure is in place.

## 3. Scope

### In Scope

- All game entity types in `app/src/types/game.ts`: `CellState`, `ShipType`, `PlacedShip`, `Shot`, `GamePhase`, `GameState`, `BoardCommitment`.
- All protocol message types in `app/src/types/protocol.ts`: discriminated union `GameMessage` and all constituent message interfaces, plus relay system message types.
- Ship type definitions in `app/src/types/ships.ts` (if separated from game.ts for clarity).
- Ship constants in `app/src/constants/ships.ts`: fleet configuration with names and sizes.
- Grid constants in `app/src/constants/grid.ts`: `GRID_SIZE`, axis labels, coordinate ranges.

### Out of Scope

- Utility function implementations — Phase 3.
- Store state and actions — Phase 4.
- Composable interfaces — Phases 6–8 (but those phases will import types defined here).
- Any runtime logic or function bodies.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/types/game.ts` | Create | Core game entity types: `CellState`, `ShipType`, `PlacedShip`, `Shot`, `GamePhase`, `GameState`, `BoardCommitment` |
| `app/src/types/protocol.ts` | Create | All protocol message interfaces and the `GameMessage` discriminated union, plus relay system messages |
| `app/src/types/ships.ts` | Create | Ship-specific type definitions if needed for separation of concerns |
| `app/src/constants/ships.ts` | Create | `SHIP_TYPES` const object, `FLEET_CONFIG` array with ship names and sizes |
| `app/src/constants/grid.ts` | Create | `GRID_SIZE`, `COLUMN_LABELS`, `ROW_LABELS`, coordinate bounds |

## 5. Key Design Decisions

1. **`as const` objects instead of enums:** All union-like types (`ShipType`, `CellState`, `GamePhase`) must use `as const` objects with derived types, not TypeScript `enum` (see `docs/03-CODING-STANDARDS.md` Section 2.2).

2. **Discriminated unions for protocol messages:** Every message type has a `type` literal discriminant field. This enables exhaustive `switch` checking and type narrowing (see `docs/03-CODING-STANDARDS.md` Section 2.2, `docs/05-PROTOCOL-SPEC.md` Section 4.1).

3. **`interface` for object shapes, `type` for unions:** Per `docs/03-CODING-STANDARDS.md` Section 2.2 — use `interface` for `ShotMessage`, `ResultMessage`, etc. Use `type` for `GameMessage` (union), `ShipType` (derived from const), `GamePhase` (union).

4. **Deterministic board serialization:** `BoardCommitment` / `ShipPlacement` types must match the exact structure used for hashing: ships sorted alphabetically by type, with `x`, `y`, `orientation` fields (see `docs/02-ARCHITECTURE.md` Section 5.3, `docs/05-PROTOCOL-SPEC.md` Section 7.1).

5. **Explicit `export type` / `export interface`:** All public types must be explicitly exported. Do not rely on inference for public APIs (see `docs/03-CODING-STANDARDS.md` Section 2.2).

6. **`sunk` field on `ResultMessage` is `ShipType | null`:** Not `undefined`, not optional — always present. `null` means no ship was sunk (see `docs/05-PROTOCOL-SPEC.md` Section 4.1).

7. **Relay system messages are typed separately from game messages:** `PeerCountMessage`, `PeerLeftMessage`, and `ErrorMessage` are relay-generated and should be in their own union (e.g., `RelayMessage`) distinct from `GameMessage` (see `docs/05-PROTOCOL-SPEC.md` Section 2.2).

## 6. Interfaces & Contracts

### `app/src/types/game.ts`

```typescript
export const CELL_STATES = {
  EMPTY: 'empty',
  SHIP: 'ship',
  HIT: 'hit',
  MISS: 'miss',
  SUNK: 'sunk',
} as const

export type CellState = (typeof CELL_STATES)[keyof typeof CELL_STATES]

export const GAME_PHASES = {
  LOBBY: 'lobby',
  SETUP: 'setup',
  COMMIT: 'commit',
  BATTLE: 'battle',
  REVEAL: 'reveal',
  GAMEOVER: 'gameover',
} as const

export type GamePhase = (typeof GAME_PHASES)[keyof typeof GAME_PHASES]

export const SHIP_TYPES = {
  CARRIER: 'carrier',
  BATTLESHIP: 'battleship',
  CRUISER: 'cruiser',
  SUBMARINE: 'submarine',
  DESTROYER: 'destroyer',
} as const

export type ShipType = (typeof SHIP_TYPES)[keyof typeof SHIP_TYPES]

export type Orientation = 'h' | 'v'

export interface PlacedShip {
  type: ShipType
  x: number
  y: number
  orientation: Orientation
}

export interface Shot {
  x: number
  y: number
  hit: boolean
  sunk: ShipType | null
  player: 'a' | 'b'
}

export interface BoardCommitment {
  ships: PlacedShip[]  // sorted alphabetically by type
}

export interface GameState {
  phase: GamePhase
  myBoard: CellState[][]
  opponentBoard: CellState[][]
  myShips: PlacedShip[]
  opponentShips: PlacedShip[]
  isMyTurn: boolean
  myCommitHash: string | null
  opponentCommitHash: string | null
  mySalt: Uint8Array | null
  winner: 'me' | 'opponent' | null
  cheatDetected: boolean
  shotHistory: Shot[]
}
```

### `app/src/types/protocol.ts`

```typescript
import type { ShipType, GamePhase, PlacedShip } from './game'

// === Game Messages (forwarded by relay) ===

interface ReadyMessage {
  type: 'ready'
}

interface CommitMessage {
  type: 'commit'
  hash: string
}

interface ShotMessage {
  type: 'shot'
  x: number
  y: number
}

interface ResultMessage {
  type: 'result'
  x: number
  y: number
  hit: boolean
  sunk: ShipType | null
}

interface RevealMessage {
  type: 'reveal'
  ships: PlacedShip[]
  salt: string
}

interface RematchMessage {
  type: 'rematch'
}

interface PingMessage {
  type: 'ping'
  timestamp: number
}

interface PongMessage {
  type: 'pong'
  timestamp: number
}

interface SyncRequestMessage {
  type: 'sync_request'
}

interface SyncResponseMessage {
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

// === Relay System Messages (generated by relay, not forwarded) ===

interface PeerCountMessage {
  type: 'peer_count'
  count: number
}

interface PeerLeftMessage {
  type: 'peer_left'
}

interface RelayErrorMessage {
  type: 'error'
  code: 'ROOM_FULL' | 'INVALID_MESSAGE' | 'RATE_LIMITED'
  message: string
}

export type RelayMessage =
  | PeerCountMessage
  | PeerLeftMessage
  | RelayErrorMessage

export type IncomingMessage = GameMessage | RelayMessage

// === Client → Relay Control Messages ===

interface JoinMessage {
  type: 'join'
  roomId: string
}

export type ClientControlMessage = JoinMessage
```

### `app/src/constants/ships.ts`

```typescript
import type { ShipType } from '../types/game'

export interface ShipConfig {
  type: ShipType
  name: string
  size: number
}

export const FLEET_CONFIG: readonly ShipConfig[] = [
  { type: 'carrier', name: 'Carrier', size: 5 },
  { type: 'battleship', name: 'Battleship', size: 4 },
  { type: 'cruiser', name: 'Cruiser', size: 3 },
  { type: 'submarine', name: 'Submarine', size: 3 },
  { type: 'destroyer', name: 'Destroyer', size: 2 },
] as const

export const FLEET_SIZE = FLEET_CONFIG.length  // 5

export const TOTAL_SHIP_CELLS = FLEET_CONFIG.reduce((sum, ship) => sum + ship.size, 0)  // 17
```

### `app/src/constants/grid.ts`

```typescript
export const GRID_SIZE = 10

export const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const

export const ROW_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const
```

## 7. Acceptance Criteria

1. Running `npm run build` in `app/` produces no TypeScript errors.
2. `ShipType` is derived from a `SHIP_TYPES` const object — not an `enum`.
3. `CellState` is derived from a `CELL_STATES` const object — not an `enum`.
4. `GamePhase` is derived from a `GAME_PHASES` const object — not an `enum`.
5. `GameMessage` is a discriminated union with a `type` field on every variant.
6. `RelayMessage` is a separate discriminated union covering `peer_count`, `peer_left`, and `error` messages.
7. `FLEET_CONFIG` contains exactly 5 ships matching `docs/01-PRD.md` Section 4.1: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
8. `GRID_SIZE` equals `10` and `COLUMN_LABELS` contains A–J.
9. All types and constants are explicitly exported.
10. No runtime code exists in type files — only type definitions, interfaces, and const declarations.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **All game types** (`CellState`, `ShipType`, `PlacedShip`, `Shot`, `GamePhase`, `GameState`) used by Phases 3 (utilities), 4 (stores), 6–8 (composables), and 9–12 (UI).
- **All protocol message types** (`GameMessage`, `RelayMessage`, `IncomingMessage`) used by Phase 5 (relay types mirror these), Phase 6 (useRelay), Phase 7 (useCrypto), and Phase 8 (useGameProtocol).
- **Ship and grid constants** (`FLEET_CONFIG`, `GRID_SIZE`, `COLUMN_LABELS`) used by Phase 3 (board utilities), Phase 4 (store initialization), and Phases 9–11 (UI rendering).

### Boundaries

- Future phases must NOT redefine types that belong here. If a new type is needed, add it to the appropriate file in `types/` or `constants/`.
- The `BoardCommitment` shape must not be modified without also updating the crypto composable (Phase 7) and protocol spec — it is the canonical shape for deterministic serialization.
