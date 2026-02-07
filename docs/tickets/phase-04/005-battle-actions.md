# Phase 04 — Ticket 005: Battle Actions

## Summary

Add the `fireShot()`, `receiveShot()`, and `receiveResult()` actions to `useGameStore`. These are the core gameplay actions during the BATTLE phase: the local player fires at the opponent's board, receives incoming shots against their own board, and processes shot results that update the opponent's board state. Together they implement the turn-based shot exchange loop. When done, the agent should have the full battle mechanics tested, including hit/miss detection, ship sinking, turn toggling, and shot history tracking.

## Prerequisites

- **Ticket 003 complete.** `placeShip()` exists — needed to set up boards for testing.
- **Ticket 004 complete.** `commitBoard()`, `receiveOpponentCommit()`, and `startBattle()` exist — needed to reach BATTLE phase in tests.
  - `app/src/stores/game.ts` — the game store to modify
  - `app/src/stores/game.test.ts` — the test file to extend

## Scope

**In scope:**

- `fireShot(x: number, y: number): void` action
- `receiveShot(x: number, y: number): { hit: boolean; sunk: ShipType | null }` action
- `receiveResult(x: number, y: number, hit: boolean, sunk: ShipType | null): void` action
- Adding all 3 actions to the store's return object
- Unit tests for all 3 actions

**Out of scope:**

- Sending shot messages over WebSocket — Phase 8 (`useGameProtocol` composable reads the shot and sends it)
- Shot debouncing or rate limiting — Phase 8 or UI layer
- Shot validation beyond phase/turn checks — `isValidShot` from `validation.ts` can be used but is not required in the store (the store trusts the caller)
- Visual effects or animations for hits/misses — Phases 11, 13
- Reveal phase actions — ticket 006

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/game.ts` | Modify | Add `fireShot()`, `receiveShot()`, `receiveResult()` actions |
| `app/src/stores/game.test.ts` | Modify | Add tests for battle actions |

## Requirements

### Imports

Ensure the following are imported (add only what's new):

```typescript
import { CELL_STATES } from '../types/game'
import { FLEET_CONFIG } from '../constants/ships'
import { getShipCells } from '../utils/board'
```

### Actions

#### `fireShot(x: number, y: number): void`

Records that the local player is firing a shot at coordinates (x, y) on the opponent's board.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.BATTLE`. If not in battle phase, do nothing.
- **Turn guard:** Only execute if `isMyTurn.value === true`. If it's not the local player's turn, do nothing.
- **Duplicate shot guard:** Only execute if `opponentBoard.value[y][x] === CELL_STATES.EMPTY`. If the cell has already been targeted (is `HIT`, `MISS`, or `SUNK`), do nothing. The player should not be able to fire at the same cell twice.
- **Record shot in history:** Determine the player identifier: if the local player is host (check `useConnectionStore().isHost`), the player is `'a'`; otherwise `'b'`. Add a shot entry to `shotHistory`: `{ x, y, hit: false, sunk: null, player }`. The `hit` and `sunk` fields are set to placeholder values — they will be updated when `receiveResult()` is called with the actual result.
- **Toggle turn:** Set `isMyTurn.value = false`. The local player must now wait for the result.
- **Do NOT update `opponentBoard` yet.** The board is updated in `receiveResult()` when the opponent confirms whether it's a hit or miss.

Note: Import `useConnectionStore` inside the function body (cross-store pattern).

#### `receiveShot(x: number, y: number): { hit: boolean; sunk: ShipType | null }`

Processes an incoming shot from the opponent against the local player's board. Returns the result for the caller to send back.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.BATTLE`. If not in battle phase, return `{ hit: false, sunk: null }`.
- **Look up cell:** Check `myBoard.value[y][x]`.
  - If the cell is `CELL_STATES.SHIP`, it's a hit.
  - If the cell is `CELL_STATES.EMPTY`, it's a miss.
  - If the cell is already `HIT`, `MISS`, or `SUNK`, this is a duplicate shot — return `{ hit: false, sunk: null }` (defensive handling; this shouldn't happen in normal play).
- **Update board on hit:** Create a new board (copy via `myBoard.value.map(row => [...row])`). Set the cell to `CELL_STATES.HIT`. Assign the new board to `myBoard.value`.
- **Update board on miss:** Same copy pattern. Set the cell to `CELL_STATES.MISS`. Assign to `myBoard.value`.
- **Check for sunk ship:** If the shot was a hit, check if any ship in `myShips` is now fully sunk. For each ship in `myShips`, use `getShipCells(ship)` to get its cells. A ship is sunk when ALL of its cells on the updated `myBoard` are `CELL_STATES.HIT` (or `CELL_STATES.SUNK`). If a ship is newly sunk (it is the ship that contains the hit cell), mark all of that ship's cells as `CELL_STATES.SUNK` on the board and return `{ hit: true, sunk: ship.type }`.
- **Record in shot history:** Determine the opponent's player identifier (if local player is host/'a', opponent is 'b'; vice versa). Add: `{ x, y, hit, sunk, player: opponentPlayerId }`.
- **Toggle turn:** Set `isMyTurn.value = true`. It's now the local player's turn.
- Return `{ hit, sunk }`.

#### `receiveResult(x: number, y: number, hit: boolean, sunk: ShipType | null): void`

Processes the result of the local player's shot, as reported by the opponent.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.BATTLE`. If not in battle phase, do nothing.
- **Update opponent board:** Create a new board copy. If `hit` is `true`, set the cell at (x, y) to `CELL_STATES.HIT`. If `hit` is `false`, set it to `CELL_STATES.MISS`. Assign the new board to `opponentBoard.value`.
- **Handle sunk ship:** If `sunk` is not `null`, the opponent reports that the shot sank a ship of the given type. Since we don't know the opponent's ship positions during battle, we cannot mark all cells as `SUNK` yet. The `sunk` information is recorded in the shot history for the `remainingShips` getter and for post-game verification (Phase 12).
- **Update shot history:** Find the most recent shot in `shotHistory` that matches coordinates (x, y) and was fired by the local player and has `hit === false` (the placeholder). Update it: set `hit` to the provided value and `sunk` to the provided value. Create a new array reference for reactivity: `shotHistory.value = shotHistory.value.map(...)` or similar.
- **Do NOT toggle turn here.** The turn was already toggled in `fireShot()`. After `receiveResult`, if the game continues, `isMyTurn` should still be `false` (it's the opponent's turn). **Wait** — actually, after the local player fires and receives a result, the opponent then fires. So after `fireShot()` sets `isMyTurn = false`, and the opponent fires (which is processed by `receiveShot()` which sets `isMyTurn = true`), the turn is correctly back. So `receiveResult()` does NOT modify `isMyTurn`.

### Updated Return Object

Add all 3 actions to the return object:

```typescript
return {
  // ... existing state, getters, actions from tickets 002–004 ...
  fireShot,
  receiveShot,
  receiveResult,
}
```

### Test Requirements

Tests need to reach BATTLE phase, which requires the full setup flow. Create a helper function in the test file:

```typescript
function setupBattlePhase(store: ReturnType<typeof useGameStore>, isHost = true) {
  const connectionStore = useConnectionStore()
  connectionStore.setConnecting('test-room', isHost)

  store.startSetup()
  // Place all 5 ships in non-overlapping positions
  store.placeShip({ type: 'carrier', x: 0, y: 0, orientation: 'h' })
  store.placeShip({ type: 'battleship', x: 0, y: 1, orientation: 'h' })
  store.placeShip({ type: 'cruiser', x: 0, y: 2, orientation: 'h' })
  store.placeShip({ type: 'submarine', x: 0, y: 3, orientation: 'h' })
  store.placeShip({ type: 'destroyer', x: 0, y: 4, orientation: 'h' })

  const hash = 'a'.repeat(64)
  store.commitBoard(hash, new Uint8Array(32))
  store.receiveOpponentCommit('b'.repeat(64))
  store.startBattle()
}
```

Required test cases (minimum):

1. **`fireShot()` on empty cell records shot and toggles turn:** Set up battle phase as host (`isMyTurn === true`). Call `fireShot(5, 5)`. Verify `isMyTurn === false`, `shotHistory` has length 1 with `player === 'a'` and `hit === false` (placeholder).
2. **`fireShot()` is a no-op when not my turn:** Set up as joiner (`isMyTurn === false`). Call `fireShot(5, 5)`. Verify no change to `shotHistory`.
3. **`fireShot()` prevents duplicate shots:** Set up as host. Call `fireShot(5, 5)`, then simulate a result on that cell (call `receiveResult(5, 5, false, null)`). Then set `isMyTurn = true` directly, call `fireShot(5, 5)` again. Verify `shotHistory` length is still 1 (second shot blocked because cell is no longer EMPTY).
4. **`receiveShot()` on ship cell returns hit:** Set up battle phase. Call `receiveShot(0, 0)` (where carrier is at y=0). Verify returns `{ hit: true, sunk: null }` (carrier has 5 cells, only 1 hit). Verify `myBoard[0][0]` is `HIT`.
5. **`receiveShot()` on empty cell returns miss:** Call `receiveShot(9, 9)` (no ship there). Verify returns `{ hit: false, sunk: null }`. Verify `myBoard[9][9]` is `MISS`.
6. **`receiveShot()` detects sunk ship:** Set up battle phase. Hit all 2 cells of the destroyer (at y=4, x=0 and x=1). Verify the last hit returns `{ hit: true, sunk: 'destroyer' }`. Verify both cells are `SUNK` on `myBoard`.
7. **`receiveShot()` toggles turn to local player:** Verify `isMyTurn` is `true` after `receiveShot()`.
8. **`receiveResult()` updates opponent board on hit:** Fire a shot, then call `receiveResult(x, y, true, null)`. Verify `opponentBoard[y][x]` is `HIT`.
9. **`receiveResult()` updates opponent board on miss:** Fire a shot, then call `receiveResult(x, y, false, null)`. Verify `opponentBoard[y][x]` is `MISS`.
10. **`receiveResult()` updates shot history:** Fire a shot at (5, 5), call `receiveResult(5, 5, true, 'carrier')`. Verify the shot in `shotHistory` has `hit === true` and `sunk === 'carrier'`.

## Acceptance Criteria

- [ ] `fireShot()`, `receiveShot()`, and `receiveResult()` are exported from `useGameStore`
- [ ] `npm run type-check` passes with no errors
- [ ] `fireShot()` adds to `shotHistory` and sets `isMyTurn` to `false`
- [ ] `receiveShot()` correctly detects hits, misses, and sunk ships on `myBoard`
- [ ] `receiveShot()` sets `isMyTurn` to `true`
- [ ] `receiveResult()` updates `opponentBoard` with `HIT` or `MISS`
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Board immutability is critical.** Every board update must create a new array reference. Use `myBoard.value.map(row => [...row])` to shallow-copy all rows, modify the target cell in the copy, then assign back to `myBoard.value`. Never mutate `myBoard.value[y][x]` directly — this bypasses Vue reactivity.
- **Ship sinking detection in `receiveShot()`:** After marking a cell as `HIT`, check if the hit ship is now fully sunk. Find the ship that occupies the hit cell (iterate `myShips`, use `getShipCells()`, check if (x, y) is in the ship's cells). Then check if ALL cells of that ship are now `HIT`. If so, mark them all as `SUNK` and return the ship type. Do this on the same board copy before assigning to `myBoard.value`.
- **Cross-store import in `fireShot()`:** Import `useConnectionStore` inside the `fireShot()` function body to determine the local player identifier (`'a'` or `'b'`). Follow the same pattern as `startBattle()` from ticket 004.
- **Shot history updates in `receiveResult()`:** When updating the placeholder shot, create a new `shotHistory` array reference. Do not mutate the existing array or shot objects in place.
- **The turn flow is:** `fireShot()` sets `isMyTurn = false` → opponent processes → `receiveShot()` sets `isMyTurn = true` → local player fires again. The `receiveResult()` action does NOT toggle the turn.
- **`receiveShot()` records in shot history too.** Both players' shots are tracked in `shotHistory`. The `player` field distinguishes who fired.
- Board indexing is `board[y][x]`. Double-check coordinate order in all board access.
