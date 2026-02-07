# Phase 12 — Ticket 001: Game Over Core Component

## Summary

Create the `GameOver.vue` component with the winner announcement, both board grids (player's board and opponent's revealed board), and the reveal-pending loading state. This delivers the foundational game-over screen described in `docs/phases/phase-12-ui-game-over.md` Section 3. When done, the agent should have a presentational Vue component that correctly renders the end-of-game boards and winner text, with a full unit test suite.

## Prerequisites

- **Phase 2 complete.** All types exist: `CellState`, `CELL_STATES`, `PlacedShip`, `ShipType`, `Orientation` in `app/src/types/game.ts`.
- **Phase 10 complete.** `app/src/components/shared/GridCell.vue` exists and accepts a `state: CellState` prop.
- **Phase 11 complete.** Battle flow is implemented; this phase builds on top of battle conclusion.

Specific file dependencies:
- `app/src/types/game.ts` — exports `CellState`, `CELL_STATES`, `PlacedShip`
- `app/src/components/shared/GridCell.vue` — renders a single cell by `CellState`
- `app/src/utils/board.ts` — exports `getShipCells()`

## Scope

**In scope:**

- Create `app/src/components/game/GameOver.vue` with:
  - Full props and emits contract as defined in `docs/phases/phase-12-ui-game-over.md` Section 6
  - Winner announcement text: "You Win!" when `winner === 'me'`, "You Lose!" when `winner === 'opponent'`
  - "My Board" section: 10×10 CSS Grid of `GridCell` components showing the player's final board state
  - "Opponent Board" section: 10×10 CSS Grid of `GridCell` components showing the opponent's revealed board (battle state overlaid with revealed ship positions)
  - Reveal-pending state: when `opponentRevealed` is `false`, show a "Waiting for opponent to reveal board..." message instead of the opponent board grid
  - Computed property to merge `opponentBoard` (battle state) with `opponentShips` (revealed positions) into a fully revealed board
- Create `app/src/components/game/GameOver.test.ts` with unit tests

**Out of scope:**

- Verification badge ("Verified — Fair Game" / "Cheat Detected") — Ticket 002
- Rematch button and rematch waiting state — Ticket 002
- Wiring into `GameView.vue` — Ticket 003
- Animations or transitions — Phase 13 (nice to have)
- Lobby navigation — Phase 9

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/GameOver.vue` | Create | Game over screen: winner announcement, both board grids, reveal-pending state |
| `app/src/components/game/GameOver.test.ts` | Create | Unit tests for GameOver component rendering states |

## Requirements

### Props and Emits Contract

Define the full contract from `docs/phases/phase-12-ui-game-over.md` Section 6. All props and emits must be declared even though the rematch-related props and emit are not used until Ticket 002:

```typescript
import type { CellState, PlacedShip } from '../../types/game'

const props = defineProps<{
  winner: 'me' | 'opponent'
  cheatDetected: boolean
  myBoard: CellState[][]
  myShips: PlacedShip[]
  opponentBoard: CellState[][]
  opponentShips: PlacedShip[]
  opponentRevealed: boolean
  rematchRequested: boolean
  opponentRematchRequested: boolean
}>()

const emit = defineEmits<{
  requestRematch: []
}>()
```

### Imports

```typescript
import { computed } from 'vue'
import type { CellState, PlacedShip } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { getShipCells } from '../../utils/board'
import GridCell from '../shared/GridCell.vue'
```

### Revealed Opponent Board Computed Property

Compute the fully revealed opponent board by overlaying revealed ship positions onto the battle-state board:

```typescript
const revealedOpponentBoard = computed<CellState[][]>(() => {
  if (!props.opponentRevealed || props.opponentShips.length === 0) {
    return props.opponentBoard
  }

  const board = props.opponentBoard.map(row => [...row])
  for (const ship of props.opponentShips) {
    const cells = getShipCells(ship)
    for (const cell of cells) {
      if (board[cell.y]?.[cell.x] === CELL_STATES.EMPTY) {
        board[cell.y]![cell.x] = CELL_STATES.SHIP
      }
    }
  }
  return board
})
```

- If opponent has not revealed, return the battle-state board as-is.
- If opponent has revealed, overlay ship positions: cells that are `EMPTY` but contain a ship become `SHIP`. Cells that are already `HIT`, `MISS`, or `SUNK` keep their battle state.
- Must not mutate `props.opponentBoard` — create a copy.

### Winner Announcement

- When `props.winner === 'me'`: render the text **"You Win!"**
- When `props.winner === 'opponent'`: render the text **"You Lose!"**
- The winner text should be a prominent heading (e.g., `<h1>` or `<h2>`) with clear visual distinction. Use Tailwind classes for styling.
- Use a `data-testid="winner-text"` attribute for test targeting.

### Board Grids

Each board is a 10×10 CSS Grid of `GridCell` components:

```html
<div class="grid grid-cols-10 gap-0.5">
  <GridCell
    v-for="(cell, index) in flatBoard"
    :key="index"
    :state="cell"
  />
</div>
```

Flatten the 2D board array for `v-for` iteration:

```typescript
const flatMyBoard = computed(() => props.myBoard.flat())
const flatRevealedOpponentBoard = computed(() => revealedOpponentBoard.value.flat())
```

**My Board section:**
- Label: "Your Board"
- Uses `flatMyBoard` (the player's final board state from the store — already has SHIP/HIT/MISS/SUNK)
- Use a `data-testid="my-board"` attribute on the grid container.

**Opponent Board section:**
- Label: "Opponent's Board"
- Uses `flatRevealedOpponentBoard` (merged battle state + revealed ships)
- Conditionally rendered: only show the grid when `opponentRevealed` is `true`
- When `opponentRevealed` is `false`, show: "Waiting for opponent to reveal board..."
- Use a `data-testid="opponent-board"` attribute on the grid container (when rendered).
- Use a `data-testid="reveal-pending"` attribute on the waiting message.

### Layout

Use Tailwind utilities. Mobile-first responsive design per `docs/03-CODING-STANDARDS.md`:

- Outer container: `flex flex-col items-center gap-6 p-4`
- Winner heading at top, large and prominent
- Two board sections side-by-side on desktop, stacked on mobile: `flex flex-col gap-6 md:flex-row md:gap-8`
- Each board section includes a label above the grid
- The layout must be usable on a 375px viewport per `docs/01-PRD.md` technical constraints

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.
- Follow component structure order: Imports → Props & emits → Computed → Template.
- Keep the component under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.
- No business logic in the component — it is purely presentational. It receives all data via props.

### Test Requirements

Tests must use Vitest and Vue Test Utils. Co-locate at `app/src/components/game/GameOver.test.ts` per `docs/03-CODING-STANDARDS.md` Section 7.1.

#### Mocking Strategy

Stub `GridCell` to avoid testing its internals:

```typescript
const GridCellStub = {
  name: 'GridCell',
  template: '<div class="grid-cell-stub" :data-state="state"></div>',
  props: ['state'],
}
```

Mock `getShipCells` if needed, or use real ship data with known coordinates.

#### Required Test Cases (minimum)

1. **Renders "You Win!" when winner is 'me':** Mount with `winner: 'me'`. Assert text "You Win!" is present via `data-testid="winner-text"`.

2. **Renders "You Lose!" when winner is 'opponent':** Mount with `winner: 'opponent'`. Assert text "You Lose!" is present.

3. **Renders my board grid with 100 GridCell components:** Mount with a 10×10 board. Assert the `data-testid="my-board"` container has 100 GridCellStub children.

4. **Renders opponent board grid when opponentRevealed is true:** Mount with `opponentRevealed: true` and a non-empty `opponentShips` array. Assert the `data-testid="opponent-board"` container is present with 100 GridCellStub children.

5. **Shows reveal-pending message when opponentRevealed is false:** Mount with `opponentRevealed: false`. Assert `data-testid="reveal-pending"` is present. Assert `data-testid="opponent-board"` is NOT present.

6. **Revealed opponent board overlays ships onto empty cells:** Mount with `opponentRevealed: true`, an `opponentBoard` with some HIT cells and otherwise EMPTY, and `opponentShips` with known positions. Assert that GridCellStub components at ship coordinates that were EMPTY now receive `state: 'ship'`. Assert that GridCellStub components at ship coordinates that were HIT still receive `state: 'hit'`.

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/GameOver.vue` with `<script setup lang="ts">`
- [ ] File exists at `app/src/components/game/GameOver.test.ts`
- [ ] Component renders "You Win!" when `winner` prop is `'me'`
- [ ] Component renders "You Lose!" when `winner` prop is `'opponent'`
- [ ] My board grid renders 100 GridCell components from `myBoard` prop
- [ ] Opponent board grid renders only when `opponentRevealed` is `true`, with ship positions overlaid
- [ ] "Waiting for opponent to reveal board..." message shows when `opponentRevealed` is `false`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read `GridCell.vue` first** to understand its prop interface. It should accept a `state: CellState` prop. Use it exactly as implemented — do not modify GridCell.
- **Board indexing is `board[y][x]`.** The outer array is rows (y), inner is columns (x). When flattening for `v-for`, the order is row 0 left-to-right, then row 1, etc. This matches CSS Grid's row-major order.
- **Do not mutate props.** The `revealedOpponentBoard` computed creates a copy of `opponentBoard` before overlaying ships. Use `map(row => [...row])` to shallow-copy.
- **Define all props and emits now**, even though `requestRematch` emit and rematch-related props (`rematchRequested`, `opponentRematchRequested`) are not used until Ticket 002. Defining the full contract upfront ensures the component interface is stable.
- **Do not add the verification badge or rematch button** — those are Ticket 002. If you find yourself adding cheat detection display or rematch UI, stop.
- **Keep the component under 200 lines** per `docs/03-CODING-STANDARDS.md` Section 3.1. The component is presentational — all game logic lives in stores and composables.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. This component receives all data via props and dispatches events via emits. It does not call store actions or composable functions directly.
- **Use CSS Grid with `grid-cols-10`** for the board layout. Use relative units or let Tailwind handle sizing. Do not use fixed pixel dimensions per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4.
