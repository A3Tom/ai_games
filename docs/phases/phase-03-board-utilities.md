# Phase 3: Board Utilities

## 1. Objective

Implement all pure utility functions for board manipulation, placement validation, shot validation, room ID generation, and protocol message validation. Before this phase, types and constants exist but there is no runtime logic. After this phase, a fully tested library of stateless utility functions is available for stores, composables, and components to use.

## 2. Prerequisites

- **Phase 1** must be complete: project tooling and test runner configured.
- **Phase 2** must be complete: all types (`CellState`, `ShipType`, `PlacedShip`, `Shot`, `Orientation`) and constants (`FLEET_CONFIG`, `GRID_SIZE`) are defined.

Specific dependencies:
- `app/src/types/game.ts` — `CellState`, `PlacedShip`, `ShipType`, `Orientation`
- `app/src/types/protocol.ts` — `GameMessage`, `RelayMessage`, and all message interfaces
- `app/src/constants/ships.ts` — `FLEET_CONFIG`
- `app/src/constants/grid.ts` — `GRID_SIZE`

## 3. Scope

### In Scope

- `app/src/utils/board.ts`: Board creation, ship placement, ship overlap detection, all-sunk detection.
- `app/src/utils/validation.ts`: Placement validation, shot validation, type guard functions for every protocol message type.
- `app/src/utils/room-id.ts`: Room ID generation using `nanoid`.
- Unit tests for all three utility files.

### Out of Scope

- Store logic that uses these utilities — Phase 4.
- Crypto functions (hashing, verification) — Phase 7.
- UI rendering of the board — Phases 9–11.
- Relay-side validation — Phase 5.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/utils/board.ts` | Create | `createEmptyBoard()`, `canPlaceShip()`, `placeShip()`, `isAllSunk()`, `getShipCells()` |
| `app/src/utils/validation.ts` | Create | `isValidPlacement()`, `isValidShot()`, type guard functions for all message types |
| `app/src/utils/room-id.ts` | Create | `generateRoomId()` using nanoid with custom alphabet |
| `app/src/utils/board.test.ts` | Create | Unit tests for all board utility functions |
| `app/src/utils/validation.test.ts` | Create | Unit tests for all validation and type guard functions |
| `app/src/utils/room-id.test.ts` | Create | Unit tests for room ID generation |

## 5. Key Design Decisions

1. **Pure functions only:** All utilities must be stateless pure functions with no side effects. They take inputs and return outputs. No store imports, no reactivity, no WebSocket access (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: "Logic in stores and composables; components only dispatch actions and render").

2. **Board representation:** The board is a `CellState[][]` (10×10 2D array). Use typed `CellState` values, not raw strings (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 4, common mistakes table).

3. **Type guards for every message type:** Every protocol message type must have a corresponding type guard function (e.g., `isShotMessage`, `isResultMessage`, `isCommitMessage`). These validate both structure and value ranges (see `docs/05-PROTOCOL-SPEC.md` Section 8).

4. **Room ID format:** Generated with `nanoid` using custom alphabet `0123456789abcdefghijklmnopqrstuvwxyz`, length 8 (see `docs/05-PROTOCOL-SPEC.md` Section 3.1).

5. **Ship cell calculation:** `getShipCells()` must return all grid coordinates occupied by a ship given its origin, orientation, and size. This is used by both `canPlaceShip()` and the post-game result verification logic.

6. **Coordinate validation:** Shot coordinates must be integers in range [0, 9] inclusive (see `docs/05-PROTOCOL-SPEC.md` Section 8 type guard example).

## 6. Interfaces & Contracts

### `app/src/utils/board.ts`

```typescript
import type { CellState, PlacedShip, ShipType, Orientation } from '../types/game'

/** Creates a 10×10 board filled with CELL_STATES.EMPTY */
export function createEmptyBoard(): CellState[][]

/** Returns all (x, y) coordinates occupied by a ship */
export function getShipCells(ship: PlacedShip): Array<{ x: number; y: number }>

/** Checks if a ship can be placed on the board without overlapping or going out of bounds */
export function canPlaceShip(
  board: CellState[][],
  ship: PlacedShip
): boolean

/** Places a ship on the board. Returns a new board (does not mutate input). */
export function placeShip(
  board: CellState[][],
  ship: PlacedShip
): CellState[][]

/** Checks if all ship cells on the board have been hit */
export function isAllSunk(
  board: CellState[][],
  ships: PlacedShip[]
): boolean
```

### `app/src/utils/validation.ts`

```typescript
import type { PlacedShip } from '../types/game'
import type {
  GameMessage,
  RelayMessage,
  IncomingMessage,
} from '../types/protocol'

/** Validates that all ships form a legal fleet placement */
export function isValidPlacement(ships: PlacedShip[]): boolean

/** Validates that a shot coordinate is within bounds and hasn't been fired before */
export function isValidShot(
  x: number,
  y: number,
  previousShots: Array<{ x: number; y: number }>
): boolean

// Type guards for every protocol message type
export function isShotMessage(msg: unknown): msg is ShotMessage
export function isResultMessage(msg: unknown): msg is ResultMessage
export function isCommitMessage(msg: unknown): msg is CommitMessage
export function isReadyMessage(msg: unknown): msg is ReadyMessage
export function isRevealMessage(msg: unknown): msg is RevealMessage
export function isRematchMessage(msg: unknown): msg is RematchMessage
export function isPingMessage(msg: unknown): msg is PingMessage
export function isPongMessage(msg: unknown): msg is PongMessage
export function isSyncRequestMessage(msg: unknown): msg is SyncRequestMessage
export function isSyncResponseMessage(msg: unknown): msg is SyncResponseMessage
export function isPeerCountMessage(msg: unknown): msg is PeerCountMessage
export function isPeerLeftMessage(msg: unknown): msg is PeerLeftMessage
export function isRelayErrorMessage(msg: unknown): msg is RelayErrorMessage

/** Attempts to parse and identify an incoming message */
export function parseIncomingMessage(raw: string): IncomingMessage | null
```

### `app/src/utils/room-id.ts`

```typescript
/** Generates an 8-character room ID using nanoid with lowercase alphanumeric alphabet */
export function generateRoomId(): string
```

## 7. Acceptance Criteria

1. Running `npm run test` passes all utility tests with zero failures.
2. `createEmptyBoard()` returns a 10×10 array where every cell is `'empty'`.
3. `canPlaceShip()` returns `false` when a ship would extend beyond the grid boundary (e.g., Carrier at x=8, orientation='h').
4. `canPlaceShip()` returns `false` when a ship would overlap an existing ship on the board.
5. `canPlaceShip()` returns `true` for a valid placement on an empty board.
6. `placeShip()` returns a new board with ship cells set to `'ship'` without mutating the input board.
7. `isAllSunk()` returns `true` only when every cell of every ship is in `'hit'` or `'sunk'` state.
8. `isValidPlacement()` returns `false` if fewer or more than 5 ships are provided.
9. `isValidPlacement()` returns `false` if any two ships overlap.
10. `isValidShot()` returns `false` for coordinates outside [0, 9] and for previously fired coordinates.
11. `isShotMessage()` returns `true` for `{ type: 'shot', x: 5, y: 3 }` and `false` for `{ type: 'shot', x: 10, y: 3 }` (out of range).
12. `generateRoomId()` returns an 8-character string containing only `[0-9a-z]`.
13. `parseIncomingMessage()` returns `null` for malformed JSON or unknown message types.
14. Running `npm run build` still produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **Board functions** (`createEmptyBoard`, `canPlaceShip`, `placeShip`, `isAllSunk`, `getShipCells`) used by Phase 4 (game store) and Phase 10 (ship setup UI).
- **Validation functions** (`isValidPlacement`, `isValidShot`) used by Phase 4 (store actions) and Phase 8 (game protocol composable).
- **Type guards** (`isShotMessage`, `isResultMessage`, etc.) used by Phase 8 (game protocol composable) for incoming message dispatch.
- **`parseIncomingMessage`** used by Phase 6 (useRelay) or Phase 8 (useGameProtocol) to parse raw WebSocket data.
- **`generateRoomId`** used by Phase 9 (lobby UI) to create new rooms.

### Boundaries

- Future phases must NOT duplicate validation logic. All message type guards and board validation live here.
- The board mutation functions return new arrays — the store (Phase 4) is responsible for assigning the result to reactive state.
