# Phase 03 — Ticket 003: Game Validation Functions

## Summary

Add fleet placement validation (`isValidPlacement`) and shot validation (`isValidShot`) to the existing `app/src/utils/validation.ts` module. These functions enforce game rules — correct fleet composition, no overlapping ships, in-bounds coordinates, and no duplicate shots. They are used by the game store (Phase 4) to validate local actions and by the game protocol composable (Phase 8) to validate opponent claims. When done, the agent should have a complete validation module covering both protocol messages and game rules.

## Prerequisites

- **Ticket 001** (`app/src/utils/board.ts`) must be completed. This ticket imports `getShipCells()` to compute ship coordinates for overlap detection.
- **Ticket 002** (`app/src/utils/validation.ts`) must be completed. This ticket adds functions to the file created in ticket 002.
- **Phase 2 complete:** `app/src/types/game.ts` (exports `PlacedShip`, `ShipType`, `SHIP_TYPES`), `app/src/constants/ships.ts` (exports `FLEET_CONFIG`, `FLEET_SIZE`), `app/src/constants/grid.ts` (exports `GRID_SIZE`).

## Scope

**In scope:**

- `isValidPlacement()` — validates a complete fleet placement (5 ships, correct types, in bounds, no overlaps)
- `isValidShot()` — validates a single shot (in bounds, not a duplicate)
- Unit tests for both functions (added to existing test file)

**Out of scope:**

- Protocol message type guards — already implemented in ticket 002
- Board manipulation functions (`createEmptyBoard`, `placeShip`, etc.) — already implemented in ticket 001
- Store logic that calls these validators — Phase 4
- UI feedback for invalid placements/shots — Phase 10/11

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/utils/validation.ts` | Modify | Add `isValidPlacement()` and `isValidShot()` |
| `app/src/utils/validation.test.ts` | Modify | Add test suites for both new functions |

## Requirements

Both functions must be **pure** — no side effects, no store access. Follow `docs/03-CODING-STANDARDS.md` Section 2 (no `any`, explicit types).

### New Imports (added to validation.ts)

```typescript
import { getShipCells } from './board'
import { FLEET_CONFIG, FLEET_SIZE } from '../constants/ships'
import { GRID_SIZE } from '../constants/grid'
import type { PlacedShip } from '../types/game'
```

### `isValidPlacement()`

```typescript
export function isValidPlacement(ships: PlacedShip[]): boolean
```

Validates that a complete fleet placement is legal. Returns `true` if all checks pass, `false` otherwise.

**Checks (in order):**

1. **Ship count:** `ships.length` must equal `FLEET_SIZE` (5). If not, return `false`.
2. **Ship types:** The set of `ship.type` values must exactly match the set of types in `FLEET_CONFIG`. There must be exactly one of each ship type (carrier, battleship, cruiser, submarine, destroyer). If there are duplicates or missing types, return `false`.
3. **Bounds check:** For each ship, every cell from `getShipCells(ship)` must have `x` in `[0, GRID_SIZE - 1]` and `y` in `[0, GRID_SIZE - 1]`. If any cell is out of bounds, return `false`.
4. **Overlap check:** No two ships may occupy the same cell. Collect all cells from all ships (via `getShipCells()`). If any `(x, y)` coordinate appears more than once, return `false`. An efficient approach: use a `Set<string>` of `"${x},${y}"` keys and check for duplicate insertions.

**Note on ship size validation:** The ship sizes are implicitly validated because `getShipCells()` looks up the size from `FLEET_CONFIG` by `ship.type`. If the `ship.type` passes the type check in step 2, the size is guaranteed correct.

### `isValidShot()`

```typescript
export function isValidShot(
  x: number,
  y: number,
  previousShots: Array<{ x: number; y: number }>
): boolean
```

Validates that a shot is legal. Returns `true` if valid, `false` otherwise.

**Checks:**

1. **Type check:** `x` and `y` must be integers (use `Number.isInteger()`).
2. **Bounds check:** `x` must be in `[0, GRID_SIZE - 1]` and `y` must be in `[0, GRID_SIZE - 1]`.
3. **Duplicate check:** The coordinate `(x, y)` must not appear in `previousShots`. Compare using strict equality on both `x` and `y`.

### Test Requirements

Tests must use Vitest. Add new `describe` blocks to the existing `app/src/utils/validation.test.ts` file.

Required test cases (minimum):

1. **`isValidPlacement` — valid fleet:** A correctly placed fleet of 5 ships with no overlaps returns `true`.
2. **`isValidPlacement` — wrong count:** 4 ships returns `false`. 6 ships returns `false`.
3. **`isValidPlacement` — duplicate types:** Two carriers and no destroyer returns `false`.
4. **`isValidPlacement` — out of bounds:** A horizontal carrier at `(8, 0)` (extends to x=12) returns `false`.
5. **`isValidPlacement` — overlap:** Two ships sharing a cell returns `false`.
6. **`isValidShot` — valid:** `(5, 3)` with no previous shots returns `true`.
7. **`isValidShot` — out of bounds:** `(-1, 5)` returns `false`. `(10, 0)` returns `false`. `(3, 1.5)` returns `false`.
8. **`isValidShot` — duplicate:** `(5, 3)` with `[{ x: 5, y: 3 }]` as previous shots returns `false`.

## Acceptance Criteria

- [ ] `isValidPlacement` and `isValidShot` are exported from `app/src/utils/validation.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `isValidPlacement()` returns `false` when fewer or more than 5 ships are provided
- [ ] `isValidPlacement()` returns `false` when any two ships overlap
- [ ] `isValidPlacement()` returns `false` when any ship extends beyond the grid boundary
- [ ] `isValidShot()` returns `false` for coordinates outside [0, 9] and for previously fired coordinates
- [ ] All tests pass via `npm run test` (both existing type guard tests and new validation tests)

## Notes for the Agent

- **This ticket modifies files created in ticket 002.** Add the new functions and imports to the existing `validation.ts` — do not create a separate file. Similarly, add new `describe` blocks to the existing `validation.test.ts`.
- **Import `getShipCells` from `./board`.** This is the only cross-file dependency within Phase 3. Do not reimplement ship cell calculation — use the function from ticket 001.
- **The overlap check in `isValidPlacement` uses string keys in a Set** because JavaScript `Set` uses reference equality for objects. `"${x},${y}"` is a simple, efficient way to detect coordinate collisions.
- **`isValidShot` does not need board state.** It only checks coordinates and duplicates. The board's state (whether a cell contains a ship) is handled by the store when processing shot results. The purpose of `isValidShot` is to prevent illegal or duplicate shots.
- **Do not modify the type guard functions** from ticket 002 — just add the new functions alongside them.
- **`isValidPlacement` should validate the `orientation` field** of each ship is `'h'` or `'v'`. If an invalid orientation is passed, `getShipCells` may produce unexpected results.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: "Putting business logic in components." These validation functions exist precisely so that business logic stays out of components. Components will call store actions, which call these validators.
