# Phase 11 — Ticket 005: GameView Battle Integration

## Summary

Modify `GameView.vue` to replace the battle phase placeholder (from Phase 10, Ticket 005) with the full battle UI. This wires together `PlayerBoard`, `OpponentBoard`, `TurnIndicator`, and `GameStatus` into a responsive two-board layout, connects store state to component props, handles the fire event through the game protocol, and derives sunk ship lists from store state. After this ticket, the battle phase is fully playable with alternating turns, hit/miss feedback, and end-of-game detection triggering the REVEAL phase transition.

## Prerequisites

- **Phase 10, Ticket 005 complete.** `GameView.vue` has phase-routing with `SetupPhase` rendering and battle/gameover placeholders.
- **Phase 4 complete.** `useGameStore` exports `fireShot()`, `startReveal()`, `canFire`, `isMyTurn`, `myBoard`, `opponentBoard`, `myShips`, `shotHistory`, `phase`.
- **Phase 8 complete.** `useGameProtocol` exports `sendShot()`.
- **Ticket 001 complete.** `TurnIndicator.vue` exists.
- **Ticket 002 complete.** `GameStatus.vue` exists.
- **Ticket 003 complete.** `PlayerBoard.vue` exists.
- **Ticket 004 complete.** `OpponentBoard.vue` exists.
- **Phase 3 complete.** `app/src/utils/board.ts` exports `isAllSunk()` and `getShipCells()`.

## Scope

**In scope:**

- Modify `app/src/views/GameView.vue` — replace battle placeholder with responsive battle layout using all four battle components
- Computed properties for `mySunkShips` and `opponentSunkShips` derived from store state
- Fire event handler wiring: OpponentBoard `fire` → `gameStore.fireShot()` + `protocol.sendShot()`
- End-of-game detection: watch for `isAllSunk()` conditions → call `gameStore.startReveal()`
- Update `app/src/views/GameView.test.ts` — add tests for battle phase rendering

**Out of scope:**

- Battle component internals (PlayerBoard, OpponentBoard, TurnIndicator, GameStatus) — tickets 001–004
- Game over / reveal UI — Phase 12
- Protocol implementation (sendShot, sendResult) — Phase 8
- Store actions (fireShot, receiveShot, receiveResult) — Phase 4

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/views/GameView.vue` | Modify | Add battle phase rendering with all four battle components |
| `app/src/views/GameView.test.ts` | Modify | Add tests for battle phase rendering and fire event handling |

## Requirements

### New Imports

Add to the existing imports in `GameView.vue`:

```typescript
import { computed, watch } from 'vue'
import type { ShipType, Shot } from '../types/game'
import { CELL_STATES } from '../types/game'
import { getShipCells } from '../utils/board'
import { isAllSunk } from '../utils/board'
import { useConnectionStore } from '../stores/connection'
import PlayerBoard from '../components/game/PlayerBoard.vue'
import OpponentBoard from '../components/game/OpponentBoard.vue'
import TurnIndicator from '../components/game/TurnIndicator.vue'
import GameStatus from '../components/game/GameStatus.vue'
```

**Note:** Some of these imports may already be present from Phase 10. The agent should check and add only what's missing.

### Store Access

Extend the existing `storeToRefs` destructuring:

```typescript
const gameStore = useGameStore()
const { phase, myBoard, opponentBoard, myShips, isMyTurn, canFire, shotHistory } = storeToRefs(gameStore)
```

### Protocol Access

Access the protocol composable for sending shots (already initialized in `onMounted`):

```typescript
const protocol = useGameProtocol()
```

**Note:** Check the actual Phase 8 implementation. If `useGameProtocol()` returns a singleton or is initialized elsewhere, adapt accordingly. The key requirement is access to `protocol.sendShot(x, y)`.

### Computed Properties for Sunk Ships

Derive sunk ship lists from store state for the `GameStatus` component:

```typescript
const mySunkShips = computed<ShipType[]>(() => {
  return myShips.value
    .filter((ship) => {
      const cells = getShipCells(ship)
      return cells.every((cell) => {
        const state = myBoard.value[cell.y]?.[cell.x]
        return state === CELL_STATES.SUNK
      })
    })
    .map((ship) => ship.type)
})

const opponentSunkShips = computed<ShipType[]>(() => {
  const connectionStore = useConnectionStore()
  const localPlayer: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'
  return shotHistory.value
    .filter(
      (shot): shot is Shot & { sunk: ShipType } =>
        shot.player === localPlayer && shot.sunk !== null,
    )
    .map((shot) => shot.sunk)
})
```

### Fire Event Handler

Handle the `fire` event from `OpponentBoard`:

```typescript
function handleFire(x: number, y: number): void {
  gameStore.fireShot(x, y)
  protocol.sendShot(x, y)
}
```

This calls the store action first (updating local state, setting `isMyTurn = false`) and then sends the shot message via the protocol.

### End-of-Game Detection

Watch for all ships of either player being sunk to trigger the REVEAL phase transition:

```typescript
watch(
  [myBoard, shotHistory],
  () => {
    if (phase.value !== GAME_PHASES.BATTLE) return

    // Check if all of player's ships are sunk
    const myAllSunk = myShips.value.length > 0 && myShips.value.every((ship) => {
      const cells = getShipCells(ship)
      return cells.every((cell) => {
        const state = myBoard.value[cell.y]?.[cell.x]
        return state === CELL_STATES.SUNK
      })
    })

    // Check if all opponent ships are sunk (5 unique sunk types in shot history)
    const connectionStore = useConnectionStore()
    const localPlayer: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'
    const opponentSunkCount = new Set(
      shotHistory.value
        .filter((shot) => shot.player === localPlayer && shot.sunk !== null)
        .map((shot) => shot.sunk),
    ).size
    const opponentAllSunk = opponentSunkCount === 5

    if (myAllSunk || opponentAllSunk) {
      gameStore.startReveal()
    }
  },
)
```

**Important:** Watch specific refs (`myBoard`, `shotHistory`), not the entire store. Per `docs/03-CODING-STANDARDS.md` performance rules and `docs/04-AI-ASSISTANT-GUIDE.md` Section 4 common mistakes.

### Template Changes

Replace the battle phase placeholder `<div>` in the existing template with the battle layout:

```html
<!-- Replace this: -->
<div
  v-else-if="phase === GAME_PHASES.BATTLE"
  class="flex flex-1 items-center justify-center"
>
  <p class="text-gray-400">Battle phase — coming in Phase 11</p>
</div>

<!-- With this: -->
<div
  v-else-if="phase === GAME_PHASES.BATTLE"
  class="flex flex-1 flex-col items-center gap-4 p-4"
>
  <TurnIndicator :is-my-turn="isMyTurn" />

  <div class="flex w-full flex-col items-center gap-6 md:flex-row md:justify-center md:gap-8">
    <PlayerBoard :board="myBoard" :ships="myShips" />
    <OpponentBoard
      :board="opponentBoard"
      :is-my-turn="isMyTurn"
      :can-fire="canFire"
      @fire="handleFire"
    />
  </div>

  <GameStatus
    :my-ships="myShips"
    :my-sunk-ships="mySunkShips"
    :opponent-sunk-ships="opponentSunkShips"
  />
</div>
```

### Responsive Layout

The two-board layout uses Tailwind responsive classes:

- **Mobile (< md):** Boards stack vertically — `flex flex-col gap-6`
- **Desktop (>= md):** Boards side-by-side — `md:flex-row md:justify-center md:gap-8`

The overall structure is:
1. `TurnIndicator` at the top (full width)
2. Two boards in a flex row/column
3. `GameStatus` at the bottom (full width)

The layout must be usable on a 375px-wide viewport per `docs/phases/phase-11-ui-battle.md` Acceptance Criterion 14.

### Vue Conventions

- Keep `GameView.vue` under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1. The component is a phase router with battle wiring — all game logic remains in stores and composables.
- Use `storeToRefs` for reactive store state destructuring.
- Do not call store actions directly from the template — use handler functions.
- Follow `docs/03-CODING-STANDARDS.md` Section 3.2 for import ordering: Vue, libraries, composables, stores, components, types, utils.

### Test Requirements

Update `app/src/views/GameView.test.ts` (created in Phase 10, Ticket 005) to add battle phase tests.

#### Mocking Strategy

Add stubs for the new battle components:

```typescript
const PlayerBoardStub = { name: 'PlayerBoard', template: '<div class="player-board-stub"></div>', props: ['board', 'ships'] }
const OpponentBoardStub = { name: 'OpponentBoard', template: '<div class="opponent-board-stub"></div>', props: ['board', 'isMyTurn', 'canFire'], emits: ['fire'] }
const TurnIndicatorStub = { name: 'TurnIndicator', template: '<div class="turn-indicator-stub"></div>', props: ['isMyTurn'] }
const GameStatusStub = { name: 'GameStatus', template: '<div class="game-status-stub"></div>', props: ['myShips', 'mySunkShips', 'opponentSunkShips'] }
```

#### Required Test Cases (minimum)

1. **Battle phase renders all four components:** Set store phase to `GAME_PHASES.BATTLE`. Mount GameView with stubs. Assert all four component stubs are present in the rendered output.

2. **Battle phase does not render SetupPhase:** Set store phase to `GAME_PHASES.BATTLE`. Assert the SetupPhase component is NOT rendered.

3. **PlayerBoard receives myBoard and myShips as props:** Set store to battle phase with a non-empty board. Assert PlayerBoardStub receives the correct `board` and `ships` props.

4. **OpponentBoard receives correct props:** Set store to battle phase. Assert OpponentBoardStub receives `board`, `isMyTurn`, and `canFire` props matching the store state.

5. **Fire event triggers gameStore.fireShot:** Set store to battle phase with `isMyTurn: true`. Emit a `fire` event from OpponentBoardStub with coordinates `(3, 4)`. Assert `gameStore.fireShot` was called with `(3, 4)`.

## Acceptance Criteria

- [ ] Battle phase renders `TurnIndicator`, `PlayerBoard`, `OpponentBoard`, and `GameStatus` when `phase === 'battle'`
- [ ] `SetupPhase` is NOT rendered during battle phase
- [ ] Store state is correctly wired to all component props
- [ ] `OpponentBoard` fire event triggers `gameStore.fireShot()` and `protocol.sendShot()`
- [ ] `mySunkShips` correctly derived from `myShips` + `myBoard` SUNK state
- [ ] `opponentSunkShips` correctly derived from `shotHistory` sunk results
- [ ] Layout is responsive: stacked on mobile, side-by-side on desktop
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read the existing `GameView.vue` first.** It should have been modified by Phase 10, Ticket 005 to include the phase router with SetupPhase and placeholders. You are replacing only the battle placeholder block. Do not touch the setup, lobby, or gameover sections.
- **Check how `useGameProtocol` exposes `sendShot`.** The exact API depends on Phase 8's implementation. It might be `protocol.sendShot(x, y)` or `sendShot(x, y)` destructured from the composable return. Adapt the `handleFire` function to match.
- **The end-of-game detection watches `myBoard` and `shotHistory`.** Do NOT watch the entire game store. Watch only the specific refs that change during battle. This avoids unnecessary re-computation per `docs/03-CODING-STANDARDS.md` performance rules.
- **Do not add `isAllSunk()` calls from `utils/board.ts` if the function signature doesn't match.** The watcher uses inline sunk checks on `myShips` + `myBoard` and sunk count from `shotHistory`. If `isAllSunk()` from Phase 3 accepts a board and ships array and works correctly, prefer using it over inline logic. Check the actual Phase 3 implementation.
- **`handleFire` calls both store and protocol.** The store updates local state immediately (sets `isMyTurn = false`, adds placeholder shot to history). The protocol sends the message to the opponent. Both must be called — the store for immediate UI feedback, the protocol for network communication.
- **Keep GameView thin.** It's a phase router with wiring. The computed properties and watcher are the only logic. All game logic (hit detection, turn management, board updates) lives in the store and protocol composable per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. The `handleFire` function delegates to store and protocol — it does not validate shots, check turns, or update boards. That's the store's job.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure and import ordering.
