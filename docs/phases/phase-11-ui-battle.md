# Phase 11: UI — Battle

## 1. Objective

Build the battle phase interface where players alternate firing shots at each other's grids. Before this phase, players can place ships and commit boards, but battle has no UI. After this phase, the full turn-based battle loop is playable: players see their own board with incoming hits/misses, fire shots at the opponent's grid, see hit/miss/sunk feedback, and the game detects when all ships of one player are sunk to trigger the end-of-game transition.

## 2. Prerequisites

- **Phase 1** must be complete: Tailwind, routing.
- **Phase 2** must be complete: `CellState`, `ShipType`, `PlacedShip`, `Shot` types.
- **Phase 3** must be complete: board utilities (`isAllSunk`, `getShipCells`).
- **Phase 4** must be complete: `useGameStore` with `fireShot()`, `receiveShot()`, `receiveResult()`, `isMyTurn`, `canFire`, `shotHistory`.
- **Phase 8** must be complete: `useGameProtocol` with `sendShot()`, `sendResult()` and incoming shot/result handling.
- **Phase 10** must be complete: `GameView.vue` with phase routing, `GridCell.vue` component.

Specific dependencies:
- `app/src/stores/game.ts` — `useGameStore` state and actions
- `app/src/composables/useGameProtocol.ts` — `sendShot()`
- `app/src/components/shared/GridCell.vue` — reused for both boards
- `app/src/types/game.ts` — `CellState`, `Shot`, `ShipType`
- `app/src/constants/ships.ts` — `FLEET_CONFIG` for fleet status display

## 3. Scope

### In Scope

- `app/src/components/game/PlayerBoard.vue`: Displays the player's own 10×10 grid showing ship placements, incoming hits, and misses. Read-only during battle.
- `app/src/components/game/OpponentBoard.vue`: Displays the opponent's 10×10 grid as the targeting interface. Clickable during the player's turn.
- `app/src/components/game/TurnIndicator.vue`: Shows whose turn it is ("Your Turn" / "Opponent's Turn").
- `app/src/components/game/GameStatus.vue`: Shows fleet status — how many ships remain for each player, with ship names and sizes.
- Wire the shot → result → board update cycle: click opponent cell → `sendShot()` → receive `result` → update `opponentBoard` state → toggle turn.
- Disable opponent board clicks when it's not the player's turn.
- Prevent duplicate shots on already-fired cells.
- End-of-game detection: when `isAllSunk()` returns true for either player, transition to the REVEAL phase.

### Out of Scope

- Game over / reveal UI — Phase 12.
- Shot animations and sinking animations — Phase 13 (Nice to Have, US-17).
- Turn timer — Phase 13 or post-v1 (Nice to Have, US-19).
- Sound effects — post-v1.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/components/game/PlayerBoard.vue` | Create | Player's own board showing ships, hits, misses |
| `app/src/components/game/OpponentBoard.vue` | Create | Targeting grid — clickable during player's turn |
| `app/src/components/game/TurnIndicator.vue` | Create | Turn state display ("Your Turn" / "Opponent's Turn") |
| `app/src/components/game/GameStatus.vue` | Create | Fleet status for both players |
| `app/src/views/GameView.vue` | Modify | Add battle phase rendering with `PlayerBoard`, `OpponentBoard`, `TurnIndicator`, `GameStatus` |

## 5. Key Design Decisions

1. **Two-board layout:** The battle screen shows both the player's board and the opponent's board side-by-side (or stacked on mobile). The player's board is read-only; the opponent's board is interactive (see `docs/04-AI-ASSISTANT-GUIDE.md` Phase 11 description).

2. **Click-to-fire:** Clicking a cell on the opponent board fires a shot. The cell must be unfired (not already `hit` or `miss`). The board is visually disabled during the opponent's turn (see `docs/05-PROTOCOL-SPEC.md` Section 6.1 — turn validation).

3. **Shot debounce:** Rapid clicks are debounced (200ms minimum between shots) to prevent accidental double-fires. This is enforced at the protocol layer (Phase 8) but the UI should also visually disable after a shot is sent until a result is received (see `docs/05-PROTOCOL-SPEC.md` Section 10.2).

4. **Cell state visual mapping:** `GridCell` must visually distinguish all `CellState` values: empty (water), ship (player board only), hit (red/marked), miss (white/dot), sunk (distinct from regular hit). Use Tailwind classes (see `docs/03-CODING-STANDARDS.md` Section 3.4).

5. **Fleet status tracking:** `GameStatus.vue` shows each ship type and whether it's been sunk. For the opponent, sunk status is known from `result` messages with `sunk` field. For the player, it's derived from `myBoard` state (see `docs/01-PRD.md` US-05, US-07).

6. **Responsive layout:** On narrow viewports, boards stack vertically. On wider viewports, boards display side-by-side. The grid must remain playable on 375px (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6).

7. **Automatic result sending:** When the opponent fires a shot, `useGameProtocol` automatically calls `gameStore.receiveShot()` to determine hit/miss/sunk, then sends the result back. The UI does not need to handle this — it only renders the updated store state (see Phase 8 design).

## 6. Interfaces & Contracts

### `app/src/components/game/PlayerBoard.vue`

```typescript
const props = defineProps<{
  board: CellState[][]   // 10x10 from gameStore.myBoard
  ships: PlacedShip[]    // from gameStore.myShips
}>()

// No emits — read-only display
```

### `app/src/components/game/OpponentBoard.vue`

```typescript
const props = defineProps<{
  board: CellState[][]   // 10x10 from gameStore.opponentBoard
  isMyTurn: boolean      // controls interactivity
  canFire: boolean       // from gameStore.canFire
}>()

const emit = defineEmits<{
  fire: [x: number, y: number]
}>()
```

### `app/src/components/game/TurnIndicator.vue`

```typescript
const props = defineProps<{
  isMyTurn: boolean
}>()
```

### `app/src/components/game/GameStatus.vue`

```typescript
const props = defineProps<{
  myShips: PlacedShip[]
  mySunkShips: ShipType[]       // derived from myBoard hit state
  opponentSunkShips: ShipType[] // derived from shotHistory sunk results
}>()
```

## 7. Acceptance Criteria

1. The battle phase renders when `gameStore.phase === 'battle'`, showing both player and opponent boards.
2. The player's board displays all 5 placed ships with correct positions and orientations.
3. Incoming hits on the player's board are visually marked as hits; misses are marked differently.
4. The opponent's board starts empty (all cells unfired) and accumulates hit/miss markers as shots are fired.
5. Clicking a cell on the opponent's board during the player's turn fires a shot and sends a `shot` message.
6. Clicking a cell on the opponent's board during the opponent's turn has no effect (board appears disabled).
7. Clicking an already-fired cell has no effect.
8. After firing a shot, the board is visually disabled until the result is received.
9. When a `result` message indicates `sunk`, the sunken ship type is displayed in `GameStatus`.
10. `TurnIndicator` shows "Your Turn" when `isMyTurn === true` and "Opponent's Turn" otherwise.
11. `GameStatus` accurately shows remaining vs. sunk ships for both players.
12. When all ships of one player are sunk, the game transitions to the REVEAL phase.
13. Two browser tabs can play a complete battle sequence with alternating turns.
14. The layout is usable on a 375px-wide viewport.
15. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **Battle UI components** are complete after this phase.
- **`PlayerBoard.vue`** may be reused or adapted by Phase 12 (game over) to show the player's final board.
- **`OpponentBoard.vue`** may be adapted by Phase 12 to show the opponent's revealed board.
- **`GameStatus.vue`** may be shown on the game over screen as a final tally.
- End-of-game detection triggers the REVEAL phase, which Phase 12 renders.

### Boundaries

- The battle components do NOT handle the reveal, verification, or game-over display — that belongs to Phase 12.
- Shot animations and visual effects are NOT part of this phase — Phase 13 can add CSS transitions or animations.
- The turn timer (US-19, Nice to Have) is NOT implemented here — it can be added in Phase 13 or post-v1.
