# Phase 03 — Ticket 001: Board Utility Functions

## Summary

Implement all pure board manipulation functions in `app/src/utils/board.ts`: creating an empty board, computing ship cell coordinates, checking placement validity against the grid, placing ships immutably, and detecting when all ships are sunk. These are the foundational stateless utilities that the game store (Phase 4), ship setup UI (Phase 10), and post-game verification (Phase 12) depend on. When done, the agent should have a fully tested board utility module with five exported functions.

## Prerequisites

- **Phase 2 complete.** All types and constants must exist:
  - `app/src/types/game.ts` — exports `CellState`, `CELL_STATES`, `PlacedShip`, `ShipType`, `Orientation` (Phase 2, Ticket 001)
  - `app/src/constants/grid.ts` — exports `GRID_SIZE` (Phase 2, Ticket 002)
  - `app/src/constants/ships.ts` — exports `FLEET_CONFIG`, `ShipConfig` (Phase 2, Ticket 003)

## Scope

**In scope:**

- `createEmptyBoard()` — returns a 10×10 `CellState[][]` filled with `CELL_STATES.EMPTY`
- `getShipCells()` — returns all `{ x, y }` coordinates a ship occupies
- `canPlaceShip()` — checks bounds and overlap against an existing board
- `placeShip()` — returns a new board with ship cells marked, without mutating input
- `isAllSunk()` — checks if every cell of every ship has been hit or sunk
- Unit tests for all five functions

**Out of scope:**

- Placement validation across a full fleet (`isValidPlacement`) — handled in ticket 003
- Shot validation (`isValidShot`) — handled in ticket 003
- Protocol message type guards — handled in ticket 002
- Store logic that calls these utilities — Phase 4
- Crypto/hashing functions — Phase 7
- UI rendering of the board — Phases 10–11

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/utils/board.ts` | Create | Board creation, ship cell computation, placement checks, immutable placement, sunk detection |
| `app/src/utils/board.test.ts` | Create | Unit tests for all five board utility functions |

## Requirements

All functions must be **pure** — no side effects, no imports from stores or composables, no reactivity. Follow `docs/03-CODING-STANDARDS.md` Section 2 (TypeScript rules) and `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.1 (no `any`, explicit types).

### Imports

```typescript
import { CELL_STATES } from '../constants/grid'  // or from types — see note below
import { GRID_SIZE } from '../constants/grid'
import type { CellState, PlacedShip } from '../types/game'
```

Note: `CELL_STATES` is exported from `app/src/types/game.ts` (Phase 2, Ticket 001). `GRID_SIZE` is exported from `app/src/constants/grid.ts` (Phase 2, Ticket 002). Use the correct import paths based on where these are defined.

### `createEmptyBoard()`

```typescript
export function createEmptyBoard(): CellState[][]
```

- Returns a 10×10 two-dimensional array.
- Every cell is initialized to `CELL_STATES.EMPTY` (`'empty'`).
- The outer array represents rows (index = y, 0–9). The inner arrays represent columns (index = x, 0–9). Access pattern: `board[y][x]`.
- Must create independent inner arrays — not references to the same array object. Mutating `board[0]` must not affect `board[1]`.

### `getShipCells()`

```typescript
export function getShipCells(ship: PlacedShip): Array<{ x: number; y: number }>
```

- Computes all grid coordinates occupied by the given ship.
- The ship's origin is `(ship.x, ship.y)`. It extends **right** for horizontal (`'h'`) or **down** for vertical (`'v'`).
- The ship size must be looked up from `FLEET_CONFIG` using `ship.type`.
- Returns an array of `{ x, y }` objects with length equal to the ship's size.
- Example: A destroyer (`size: 2`) at `(3, 4)` horizontal returns `[{ x: 3, y: 4 }, { x: 4, y: 4 }]`.
- Example: A cruiser (`size: 3`) at `(1, 7)` vertical returns `[{ x: 1, y: 7 }, { x: 1, y: 8 }, { x: 1, y: 9 }]`.
- This function does **not** validate bounds — that is `canPlaceShip()`'s responsibility.

### `canPlaceShip()`

```typescript
export function canPlaceShip(
  board: CellState[][],
  ship: PlacedShip
): boolean
```

- Returns `true` if the ship can be legally placed on the board. Returns `false` otherwise.
- **Bounds check:** Every cell returned by `getShipCells(ship)` must have `x` in `[0, GRID_SIZE - 1]` and `y` in `[0, GRID_SIZE - 1]`. If any cell is out of bounds, return `false`.
- **Overlap check:** Every cell returned by `getShipCells(ship)` must be `CELL_STATES.EMPTY` on the board. If any cell is not empty (i.e., another ship is already there), return `false`.
- Does not mutate the board.

### `placeShip()`

```typescript
export function placeShip(
  board: CellState[][],
  ship: PlacedShip
): CellState[][]
```

- Returns a **new** `CellState[][]` with the ship's cells set to `CELL_STATES.SHIP`.
- **Must not mutate the input board.** Create a deep copy (or at minimum, copy all rows that are modified).
- Assumes `canPlaceShip(board, ship)` has already returned `true`. The caller is responsible for checking validity before calling `placeShip()`. Behavior when called with an invalid placement is undefined (no need to validate or throw).
- The returned board is identical to the input except that cells at the ship's coordinates are `CELL_STATES.SHIP` instead of `CELL_STATES.EMPTY`.

### `isAllSunk()`

```typescript
export function isAllSunk(
  board: CellState[][],
  ships: PlacedShip[]
): boolean
```

- Returns `true` if every cell of every ship in `ships` has a state of `CELL_STATES.HIT` or `CELL_STATES.SUNK` on the board. Returns `false` if any ship cell is still `CELL_STATES.SHIP` (unhit).
- Uses `getShipCells()` to compute the cells for each ship.
- Access pattern: `board[y][x]` for each cell.
- An empty `ships` array should return `true` (vacuously — no ships to sink). This edge case is unlikely in practice but the function should handle it gracefully.

### Test Requirements

Tests must use Vitest (`import { describe, it, expect } from 'vitest'`). Co-locate at `app/src/utils/board.test.ts` per `docs/03-CODING-STANDARDS.md` Section 7.1.

Required test cases (minimum):

1. **`createEmptyBoard`**: Returns 10×10 array, every cell is `'empty'`, inner arrays are independent objects.
2. **`getShipCells`**: Horizontal carrier at (0, 0) returns 5 cells. Vertical destroyer at (9, 8) returns 2 cells.
3. **`canPlaceShip`**: Returns `false` for carrier at (8, 0) horizontal (extends to x=12). Returns `false` when target cells are occupied. Returns `true` for valid placement on empty board.
4. **`placeShip`**: Ship cells become `'ship'`, other cells remain `'empty'`, original board is not mutated.
5. **`isAllSunk`**: Returns `false` when some ship cells are still `'ship'`. Returns `true` when all are `'hit'` or `'sunk'`.

## Acceptance Criteria

- [ ] File exists at `app/src/utils/board.ts` with all five functions exported
- [ ] File exists at `app/src/utils/board.test.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `createEmptyBoard()` returns a 10×10 array where every cell is `CELL_STATES.EMPTY`
- [ ] `canPlaceShip()` returns `false` for a carrier at position (8, 0) horizontal (extends beyond grid)
- [ ] `placeShip()` returns a new board without mutating the input board
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Board indexing is `board[y][x]`**, not `board[x][y]`. The outer array is rows (y), inner is columns (x). This matches the standard 2D array convention and is consistent with the game state definition in `docs/02-ARCHITECTURE.md` Section 4.
- **Look up ship sizes from `FLEET_CONFIG`** in `getShipCells()`. Do not hardcode sizes. Import `FLEET_CONFIG` from `app/src/constants/ships.ts` and find the matching entry by `ship.type`.
- **Do not mutate the input board in `placeShip()`.** The simplest approach is `board.map(row => [...row])` to shallow-copy all rows, then modify the copy. This is critical because the store (Phase 4) manages reactivity — returning a new array reference is how Vue detects changes.
- **Do not add board serialization or hashing logic.** That belongs in the crypto composable (Phase 7).
- **Do not add `getShipSize()` or other helper functions** beyond the five specified. Keep the file focused.
- **`CELL_STATES.SUNK` vs `CELL_STATES.HIT`:** In `isAllSunk()`, check for both. A cell is "destroyed" if it's either `HIT` or `SUNK`. The distinction between `HIT` (individual cell hit) and `SUNK` (all cells of the ship hit) is a display concern handled later.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not store the board as a string array. Use the typed `CellState[][]` with `CELL_STATES` constants.
