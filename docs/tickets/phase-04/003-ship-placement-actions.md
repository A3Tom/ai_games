# Phase 04 — Ticket 003: Ship Placement Actions

## Summary

Add the `placeShip()` and `removeShip()` actions to `useGameStore`. These actions manage placing and removing ships on the player's board during the SETUP phase. `placeShip()` validates placement via the `canPlaceShip` utility, updates `myBoard` immutably, and appends to `myShips`. `removeShip()` removes a ship by type and rebuilds the board. When done, the agent should have a game store that supports the full ship placement workflow with tests covering valid/invalid placements and removal.

## Prerequisites

- **Ticket 002 complete.** `useGameStore` exists with all state refs, getters, and `startSetup()`.
  - `app/src/stores/game.ts` — the game store to modify
  - `app/src/stores/game.test.ts` — the test file to extend

## Scope

**In scope:**

- `placeShip(ship: PlacedShip): boolean` action
- `removeShip(type: ShipType): void` action
- Adding both actions to the store's return object
- Unit tests for both actions

**Out of scope:**

- Fleet completeness validation (checking that all 5 ships are placed) — this is a UI concern or a check before commit (ticket 004 `commitBoard` may check this)
- Drag-and-drop ship placement UI — Phase 10
- Ship rotation logic in the UI — Phase 10
- Board serialization for commitment — Phase 7
- Commit phase transitions — ticket 004

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/game.ts` | Modify | Add `placeShip()` and `removeShip()` actions |
| `app/src/stores/game.test.ts` | Modify | Add tests for ship placement and removal |

## Requirements

### Imports

Ensure the following are imported in `game.ts` (some may already exist from ticket 002):

```typescript
import { canPlaceShip, placeShip as placeShipOnBoard, createEmptyBoard, getShipCells } from '../utils/board'
import type { ShipType, PlacedShip } from '../types/game'
```

Note: The board utility `placeShip` shares a name with the store action. Import it under an alias (e.g., `placeShipOnBoard`) to avoid collision.

### Actions

#### `placeShip(ship: PlacedShip): boolean`

Attempts to place a ship on `myBoard`. Returns `true` if the placement succeeded, `false` if it was rejected.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.SETUP`. If not in setup phase, return `false`.
- **Duplicate type check:** If `myShips` already contains a ship with the same `type` as the incoming ship, return `false`. Each ship type can only be placed once. The player must call `removeShip()` first to re-place a ship of the same type.
- **Validity check:** Call `canPlaceShip(myBoard.value, ship)`. If it returns `false`, return `false` without modifying state.
- **Placement:** Call `placeShipOnBoard(myBoard.value, ship)` (the board utility) to get a new board with the ship placed. Assign the new board to `myBoard.value`. This creates a new array reference, triggering Vue reactivity.
- **Track ship:** Push the ship to `myShips.value` — use spread or a new array: `myShips.value = [...myShips.value, ship]`.
- Return `true`.

#### `removeShip(type: ShipType): void`

Removes a previously placed ship by type and rebuilds the board.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.SETUP`. If not in setup phase, do nothing.
- **Find ship:** Look up the ship in `myShips.value` by `type`. If no ship with that type exists, do nothing (no-op).
- **Remove from list:** Remove the ship from `myShips`: `myShips.value = myShips.value.filter(s => s.type !== type)`.
- **Rebuild board:** The board must be rebuilt from scratch since we cannot "un-place" a ship from the cell state array. Start with `createEmptyBoard()`, then re-place all remaining ships using the board utility `placeShipOnBoard`:

  ```
  let board = createEmptyBoard()
  for (const s of myShips.value) {
    board = placeShipOnBoard(board, s)
  }
  myBoard.value = board
  ```

  This ensures the board is always consistent with `myShips`.

### Updated Return Object

Add both actions to the return object:

```typescript
return {
  // ... existing state, getters, actions from ticket 002 ...
  placeShip,
  removeShip,
}
```

### Test Requirements

Add the following test cases to `game.test.ts`:

```typescript
import { FLEET_CONFIG } from '../constants/ships'
```

Required test cases (minimum):

1. **`placeShip()` with valid ship returns `true`:** Call `startSetup()`, then `placeShip()` with a valid destroyer at (0, 0) horizontal. Verify it returns `true`, `myShips` has length 1, and the ship's cells on `myBoard` are `CELL_STATES.SHIP`.
2. **`placeShip()` updates `remainingShips.me`:** After placing 2 ships, verify `remainingShips.me === 2`.
3. **`placeShip()` with overlapping ship returns `false`:** Place a carrier at (0, 0) horizontal, then attempt to place a battleship at (2, 0) horizontal (overlaps at x=2,3). Verify the second call returns `false` and `myShips` still has length 1.
4. **`placeShip()` with out-of-bounds ship returns `false`:** Attempt to place a carrier at (8, 0) horizontal (extends to x=12). Verify returns `false`, `myShips` is empty.
5. **`placeShip()` with duplicate ship type returns `false`:** Place a destroyer at (0, 0), then attempt another destroyer at (5, 5). Verify returns `false`, only one destroyer in `myShips`.
6. **`placeShip()` is a no-op outside setup phase:** Verify returns `false` when `phase` is `'lobby'`.
7. **`removeShip()` removes ship and updates board:** Place a destroyer, call `removeShip('destroyer')`. Verify `myShips` is empty and the board cells that were `SHIP` are now `EMPTY`.
8. **`removeShip()` is a no-op for missing type:** Call `removeShip('carrier')` when no carrier is placed. Verify no error and state unchanged.
9. **`removeShip()` preserves other ships:** Place a destroyer and a cruiser, remove the destroyer. Verify cruiser is still in `myShips` and its cells are still `SHIP` on the board.

## Acceptance Criteria

- [ ] `placeShip()` and `removeShip()` are exported from `useGameStore`
- [ ] `npm run type-check` passes with no errors
- [ ] `placeShip()` with a valid ship adds it to `myShips`, updates `myBoard`, and returns `true`
- [ ] `placeShip()` with an overlapping ship returns `false` and does not modify state
- [ ] `placeShip()` with a duplicate ship type returns `false`
- [ ] `removeShip()` removes the ship and rebuilds the board correctly
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Import the board utility `placeShip` under an alias** to avoid name collision with the store action. For example: `import { placeShip as placeShipOnBoard } from '../utils/board'`.
- **Always create new array references** when modifying `myBoard` and `myShips`. Do not mutate in place. Use `myBoard.value = newBoard` and `myShips.value = [...myShips.value, ship]`. This is critical for Vue reactivity — Vue detects changes by reference comparison on refs. See `docs/03-CODING-STANDARDS.md` Section 4.1.
- **Board indexing is `board[y][x]`**, not `board[x][y]`. When verifying cells in tests, access as `myBoard[cell.y][cell.x]`.
- **`removeShip` rebuilds the entire board.** This is intentional. The alternative (clearing individual cells) is error-prone if cell states were modified by other operations. Rebuilding from `myShips` is the single source of truth.
- **Phase guards are critical.** Every action must check that the current phase allows the operation. Ship placement is only valid during SETUP.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not add drag-and-drop or UI logic. This is pure state management.
