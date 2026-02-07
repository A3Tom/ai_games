# Phase 04 — Ticket 002: Game Store Foundation — State, Getters, and Setup Transition

## Summary

Create `useGameStore` with all 11 state refs initialized to their default values, the 3 computed getters (`isGameOver`, `remainingShips`, `canFire`), and the `startSetup()` action that transitions from lobby to setup phase. This establishes the game store's skeleton — all reactive state is defined, the getters are functional, and the first phase transition works. Subsequent tickets (003–006) will add the remaining 12 actions incrementally.

## Prerequisites

- **Phase 3 complete.** All types, constants, and utilities exist.
- **Phase 1** — Pinia is installed and registered in `app/src/main.ts`.
- `app/src/types/game.ts` — exports `GamePhase`, `GAME_PHASES`, `CellState`, `PlacedShip`, `Shot`, `ShipType`, `CELL_STATES`
- `app/src/constants/ships.ts` — exports `FLEET_CONFIG`
- `app/src/constants/grid.ts` — exports `GRID_SIZE`
- `app/src/utils/board.ts` — exports `createEmptyBoard`, `isAllSunk`, `getShipCells`

## Scope

**In scope:**

- All 11 state refs: `phase`, `myBoard`, `opponentBoard`, `myShips`, `opponentShips`, `isMyTurn`, `myCommitHash`, `opponentCommitHash`, `mySalt`, `winner`, `cheatDetected`, `shotHistory`
- 3 getters: `isGameOver`, `remainingShips`, `canFire`
- 1 action: `startSetup()`
- Unit tests for initialization, all 3 getters, and `startSetup()`

**Out of scope:**

- Ship placement actions (`placeShip`, `removeShip`) — ticket 003
- Commit phase actions (`commitBoard`, `receiveOpponentCommit`, `startBattle`) — ticket 004
- Battle actions (`fireShot`, `receiveShot`, `receiveResult`) — ticket 005
- Reveal and endgame actions (`startReveal`, `receiveReveal`, `setCheatDetected`, `finishGame`, `resetForRematch`) — ticket 006
- Connection store — ticket 001

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/game.ts` | Create | Game state store with state, getters, and `startSetup()` action |
| `app/src/stores/game.test.ts` | Create | Unit tests for store initialization, getters, and `startSetup()` |

## Requirements

The store must use the Composition API `defineStore` pattern per `docs/03-CODING-STANDARDS.md` Section 4.1 and `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.3.

### Imports

```typescript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { GamePhase, CellState, PlacedShip, Shot, ShipType } from '../types/game'
import { GAME_PHASES, CELL_STATES } from '../types/game'
import { createEmptyBoard, isAllSunk, getShipCells } from '../utils/board'
import { FLEET_CONFIG } from '../constants/ships'
```

Note: Not all imports are used by this ticket's actions, but they are needed for the getters. Unused imports will be consumed by actions added in tickets 003–006. If the TypeScript config flags unused imports as errors, import only what is needed for the getters and `startSetup()` — subsequent tickets will add imports as needed.

### Store Definition

```typescript
export const useGameStore = defineStore('game', () => {
  // ... state, getters, actions
})
```

### State Initialization

All 11 refs must be initialized to these exact default values:

```typescript
const phase = ref<GamePhase>(GAME_PHASES.LOBBY)
const myBoard = ref<CellState[][]>(createEmptyBoard())
const opponentBoard = ref<CellState[][]>(createEmptyBoard())
const myShips = ref<PlacedShip[]>([])
const opponentShips = ref<PlacedShip[]>([])
const isMyTurn = ref<boolean>(false)
const myCommitHash = ref<string | null>(null)
const opponentCommitHash = ref<string | null>(null)
const mySalt = ref<Uint8Array | null>(null)
const winner = ref<'me' | 'opponent' | null>(null)
const cheatDetected = ref<boolean>(false)
const shotHistory = ref<Shot[]>([])
```

### Getters

#### `isGameOver: ComputedRef<boolean>`

Returns `true` when the game phase is `GAME_PHASES.GAMEOVER`. This is the simplest and most reliable check — the `finishGame()` action (ticket 006) is responsible for transitioning to `GAMEOVER` when all ships of either player are sunk.

```typescript
const isGameOver = computed(() => phase.value === GAME_PHASES.GAMEOVER)
```

#### `remainingShips: ComputedRef<{ me: number; opponent: number }>`

Returns the count of ships not yet fully sunk for each player.

- **`me`**: Count of ships in `myShips` where at least one cell on `myBoard` is still `CELL_STATES.SHIP` (not `HIT` or `SUNK`). Use `getShipCells()` to compute each ship's cells, then check `myBoard[y][x]`. If `myShips` is empty, return 0.
- **`opponent`**: Total fleet size (5) minus the number of distinct non-null `sunk` values found in `shotHistory` where the shot has `hit === true` and `sunk !== null`. Only count shots that represent the local player's attacks. Since `fireShot()` (ticket 005) adds shots with `player: 'a'` for host or `'b'` for joiner, and `receiveShot()` adds shots with the opponent's player id, you can determine "my shots" as those where `player` matches the host/joiner perspective. **However**, for this ticket, the simplest correct approach is: count the total unique `sunk` ship types across ALL shots in `shotHistory` where `sunk !== null` and compare against which player fired. See the Notes for the Agent section for implementation guidance.

For initial implementation (before battle actions exist), this getter returns `{ me: 0, opponent: 5 }` when no ships are placed, and `{ me: N, opponent: 5 }` after ships are placed (where N = number of placed ships, since none are hit yet).

#### `canFire: ComputedRef<boolean>`

Returns `true` when the player is allowed to fire a shot.

```typescript
const canFire = computed(() => phase.value === GAME_PHASES.BATTLE && isMyTurn.value)
```

Both conditions must be true: the game is in the battle phase AND it is the local player's turn.

### Actions

#### `startSetup(): void`

Transitions from LOBBY to SETUP phase.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.LOBBY`. If the current phase is not LOBBY, do nothing (no-op).
- Sets `phase.value = GAME_PHASES.SETUP`.
- Initializes `myBoard` to a fresh empty board: `myBoard.value = createEmptyBoard()`.
- Clears `myShips`: `myShips.value = []`.

This is called when the player enters the ship placement screen. The boards are re-initialized to ensure clean state.

### Return Object

For this ticket, export all 11 state refs, all 3 getters, and the `startSetup()` action. Subsequent tickets will add more actions to the return object.

```typescript
return {
  // state
  phase, myBoard, opponentBoard, myShips, opponentShips,
  isMyTurn, myCommitHash, opponentCommitHash, mySalt,
  winner, cheatDetected, shotHistory,
  // getters
  isGameOver, remainingShips, canFire,
  // actions
  startSetup,
}
```

### Test Requirements

Tests must use Vitest with `setActivePinia(createPinia())` in `beforeEach`.

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from './game'
import { GAME_PHASES, CELL_STATES } from '../types/game'
```

Required test cases (minimum):

1. **Initial state:** `phase === 'lobby'`, `myBoard` is 10×10 with all cells `'empty'`, `opponentBoard` is 10×10 with all cells `'empty'`, `myShips` is empty array, `isMyTurn === false`, `myCommitHash === null`, `winner === null`, `cheatDetected === false`, `shotHistory` is empty array.
2. **`isGameOver` getter:** Returns `false` when phase is `'lobby'`. Returns `false` when phase is `'battle'`.
3. **`remainingShips` getter:** Returns `{ me: 0, opponent: 5 }` when no ships are placed and no shots fired.
4. **`canFire` getter:** Returns `false` when phase is `'lobby'`. Returns `false` when phase is `'battle'` but `isMyTurn` is `false`.
5. **`startSetup()` transitions phase:** Phase changes from `'lobby'` to `'setup'`.
6. **`startSetup()` is a no-op in wrong phase:** Manually set `phase` to `'battle'` (via direct ref access in test), call `startSetup()`, verify phase is still `'battle'`.
7. **`startSetup()` re-initializes boards:** Place some data on `myBoard` (via direct ref access), call `startSetup()`, verify `myBoard` is a fresh empty board.

## Acceptance Criteria

- [ ] File exists at `app/src/stores/game.ts` with `useGameStore` exported
- [ ] File exists at `app/src/stores/game.test.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] Store initializes with `phase === 'lobby'` and both boards as 10×10 empty grids
- [ ] `startSetup()` transitions `phase` from `'lobby'` to `'setup'`
- [ ] `startSetup()` is a no-op when called from any phase other than `'lobby'`
- [ ] All 3 getters (`isGameOver`, `remainingShips`, `canFire`) return correct values for the initial state
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Use the Composition API store pattern** (`defineStore('game', () => { ... })`), not the Options API. See `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.3.
- **Board indexing is `board[y][x]`**, not `board[x][y]`. Outer array = rows (y), inner = columns (x). Consistent with `docs/02-ARCHITECTURE.md` Section 4.
- **`remainingShips` implementation guidance:** For `me`, iterate `myShips`, use `getShipCells(ship)` to get each ship's cells, check if ALL cells on `myBoard` are `HIT` or `SUNK`. If so, that ship is sunk; otherwise it's remaining. For `opponent`, the simplest approach is to count unique non-null `sunk` values from `shotHistory`. However, until battle actions are implemented (ticket 005), `shotHistory` will be empty, so `opponent` will always be 5. This is correct behavior for this ticket.
- **Do not implement actions beyond `startSetup()`.** Leave the remaining 12 actions for tickets 003–006. Do not add stubs or placeholder functions — only export what is implemented.
- **Do not persist to `localStorage`.** State is in-memory only per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4.
- **Performance note from `docs/03-CODING-STANDARDS.md` Section 8:** Consider using `shallowRef` for `myBoard` and `opponentBoard` if deep reactivity on the 10×10 array causes performance issues. However, for correctness, start with `ref` and optimize later only if needed. If you use `shallowRef`, you must trigger reactivity manually by reassigning the entire array (e.g., `myBoard.value = newBoard`), which is the pattern used by `placeShip()` and other board-modifying actions.
- **Common mistake:** Do not store derived data in state. `isGameOver`, `remainingShips`, and `canFire` must be `computed()` getters, not `ref()` values. See `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.3.
- **Store test setup:** Always call `setActivePinia(createPinia())` in `beforeEach`. This creates a fresh Pinia instance for each test, ensuring test isolation.
