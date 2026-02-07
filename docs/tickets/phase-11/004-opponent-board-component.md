# Phase 11 — Ticket 004: OpponentBoard Component

## Summary

Create the `OpponentBoard.vue` component that displays the opponent's 10x10 grid as the targeting interface during battle. Unlike PlayerBoard, this board is interactive: the player clicks cells to fire shots. It enforces turn-based interaction (only clickable during the player's turn), prevents duplicate shots on already-fired cells, and emits a `fire` event with coordinates when a valid cell is clicked. After this ticket, the targeting grid exists with full prop/emit contracts, click validation, visual disabled state, and a component test file.

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind CSS configured.
- **Phase 2 complete.** `app/src/types/game.ts` exports `CellState`, `CELL_STATES`.
- **Phase 2 complete.** `app/src/constants/grid.ts` exports `GRID_SIZE`, `COLUMN_LABELS`, `ROW_LABELS`.
- **Phase 10, Ticket 001 complete.** `app/src/components/shared/GridCell.vue` exists with `state`, `interactive`, `highlighted`, `highlightValid`, `x`, `y` props and `cellClick`, `cellHover` emits.

## Scope

**In scope:**

- `app/src/components/game/OpponentBoard.vue` — interactive 10x10 targeting grid with click-to-fire, turn validation, and visual disabled state
- `app/src/components/game/OpponentBoard.test.ts` — component tests for interactivity, event emission, and validation

**Out of scope:**

- Player's own board (read-only display) — ticket 003
- Shot animations or visual feedback transitions — Phase 13
- Shot debounce at protocol layer — Phase 8 (already implemented)
- Reveal phase board display (showing opponent's ships) — Phase 12
- Integration into GameView layout — ticket 005

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/OpponentBoard.vue` | Create | Targeting grid — clickable during player's turn |
| `app/src/components/game/OpponentBoard.test.ts` | Create | Component tests for OpponentBoard |

## Requirements

### Component Contract

As defined in `docs/phases/phase-11-ui-battle.md` Section 6 "Interfaces & Contracts":

```typescript
import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'

const props = defineProps<{
  board: CellState[][]   // 10x10 from gameStore.opponentBoard
  isMyTurn: boolean      // controls interactivity
  canFire: boolean       // from gameStore.canFire (phase === battle && isMyTurn)
}>()

const emit = defineEmits<{
  fire: [x: number, y: number]
}>()
```

### Imports

```typescript
import { computed } from 'vue'
import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { GRID_SIZE, COLUMN_LABELS, ROW_LABELS } from '../../constants/grid'
import GridCell from '../shared/GridCell.vue'
```

### Template Structure

The layout is identical to PlayerBoard (labeled 10x10 CSS Grid) but with key differences in interactivity:

1. **Board heading:** A `<h3>` element with text "Enemy Fleet", styled with `text-sm font-semibold text-red-300 mb-1`.

2. **Grid container:** Same CSS Grid layout as PlayerBoard — `auto repeat(10, 1fr)` columns, `gap-0`.

3. **Column labels and row labels:** Identical to PlayerBoard.

4. **GridCell props for each cell:**
   - `x`: column index (0–9)
   - `y`: row index (0–9)
   - `state`: `props.board[y][x]` — the CellState at that position
   - `interactive`: `true` only when the cell can be fired upon (see interactivity logic below)
   - `highlighted`: `false` (no hover preview on opponent board)
   - `highlightValid`: `false`

5. **GridCell events:**
   - `@cell-click="handleCellClick"` — bound on every GridCell

### Interactivity Logic

A cell is interactive (clickable) when ALL of the following are true:
- `props.canFire` is `true` (it's the battle phase and player's turn)
- The cell state is `CELL_STATES.EMPTY` (not already fired upon)

Use a function to determine interactivity per cell:

```typescript
function isCellInteractive(x: number, y: number): boolean {
  return props.canFire && props.board[y]?.[x] === CELL_STATES.EMPTY
}
```

Pass this to each GridCell: `:interactive="isCellInteractive(x, y)"`.

### Event Handler

When a GridCell emits `cellClick`, the handler validates and emits `fire`:

```typescript
function handleCellClick(x: number, y: number): void {
  if (!props.canFire) return
  if (props.board[y]?.[x] !== CELL_STATES.EMPTY) return
  emit('fire', x, y)
}
```

The double-check in the handler is defensive — GridCell's `interactive` prop should already prevent clicks on non-interactive cells, but the handler validates again as a safety net (see `docs/05-PROTOCOL-SPEC.md` Section 6.1 — turn validation).

### Visual Disabled State

When `props.canFire` is `false` (opponent's turn or awaiting result), the entire board should appear visually muted:

- Apply `opacity-60` to the grid container when `!canFire`
- Apply `cursor-not-allowed` to the grid container when `!canFire`

Use a computed class:

```typescript
const boardClass = computed(() => {
  return props.canFire
    ? ''
    : 'opacity-60 cursor-not-allowed'
})
```

Apply to the grid container alongside the base grid classes.

### Grid Layout CSS

Same as PlayerBoard:

```html
<div
  :class="['grid gap-0', boardClass]"
  :style="{ gridTemplateColumns: `auto repeat(${GRID_SIZE}, 1fr)` }"
>
```

**Responsive sizing:** Use `max-w-sm w-full mx-auto` on the outer container, same as PlayerBoard.

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Use `computed` for derived class strings.
- Component must stay under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1 (expected: ~80–100 lines).

### Test Requirements

Create `app/src/components/game/OpponentBoard.test.ts` using Vitest and Vue Test Utils.

#### Test Setup

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OpponentBoard from './OpponentBoard.vue'
import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { GRID_SIZE } from '../../constants/grid'

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => CELL_STATES.EMPTY as CellState),
  )
}

const GridCellStub = {
  name: 'GridCell',
  template: '<div class="grid-cell-stub" :data-state="state" :data-interactive="interactive" @click="$emit(\'cellClick\', x, y)"></div>',
  props: ['x', 'y', 'state', 'interactive', 'highlighted', 'highlightValid'],
  emits: ['cellClick', 'cellHover'],
}
```

Mount with `global.stubs`: `{ GridCell: GridCellStub }`.

#### Required Test Cases (minimum)

1. **Renders 100 GridCell components:** Mount with an empty board, `isMyTurn: true`, `canFire: true`. Assert 100 GridCell stubs are rendered.

2. **Cells are interactive when canFire is true and cell is empty:** Mount with empty board and `canFire: true`. Assert all GridCell stubs have `data-interactive="true"`.

3. **Cells are not interactive when canFire is false:** Mount with empty board and `canFire: false`. Assert all GridCell stubs have `data-interactive="false"`.

4. **Already-fired cells are not interactive even when canFire is true:** Create a board with `board[0][0] = CELL_STATES.HIT`. Mount with `canFire: true`. Assert the GridCell at (0,0) has `data-interactive="false"` while other cells have `data-interactive="true"`.

5. **Emits fire event with coordinates on valid cell click:** Mount with empty board and `canFire: true`. Find the GridCell stub at position (3, 4) and trigger its `cellClick` event. Assert the `fire` event was emitted with `[3, 4]`.

6. **Does not emit fire event when canFire is false:** Mount with `canFire: false`. Trigger a `cellClick` event on a GridCell stub. Assert `fire` was not emitted.

7. **Does not emit fire event for already-fired cell:** Create a board with `board[2][3] = CELL_STATES.MISS`. Mount with `canFire: true`. Trigger `cellClick` on the cell at (3, 2). Assert `fire` was not emitted.

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/OpponentBoard.vue` with `<script setup lang="ts">`
- [ ] Component accepts `board`, `isMyTurn`, and `canFire` props
- [ ] Component emits `fire` event with `[x, y]` coordinates
- [ ] Cells are interactive only when `canFire` is `true` AND cell state is `empty`
- [ ] Already-fired cells (hit/miss/sunk) are never interactive
- [ ] Board appears visually muted when `canFire` is `false`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **The `isMyTurn` prop and `canFire` prop overlap.** The store's `canFire` getter already includes `isMyTurn` (it's `phase === 'battle' && isMyTurn`). The `isMyTurn` prop is included in the contract for potential future use (e.g., distinct "awaiting result" vs "opponent's turn" visual states in Phase 13). For now, use `canFire` for all interactivity decisions. Accept both props as specified.
- **Defensive validation in the handler is intentional.** Even though GridCell won't emit `cellClick` when `interactive` is `false`, the `handleCellClick` handler re-validates. This guards against edge cases where the board state changes between render and click (see `docs/05-PROTOCOL-SPEC.md` Section 6.1).
- **Do not implement shot debounce in this component.** The 200ms debounce is handled at the protocol layer (Phase 8). After a shot is fired, `canFire` becomes `false` in the store (because `fireShot` sets `isMyTurn = false`), which disables the board until the result is received and the opponent takes their turn.
- **The opponent board never shows `ship` state during battle.** The `opponentBoard` in the store only contains `empty`, `hit`, and `miss` values. Ship positions are unknown until reveal. The component still passes the state through to GridCell, which handles all cell state rendering.
- **Use the same grid layout pattern as PlayerBoard (ticket 003).** The CSS Grid structure, column/row labels, and responsive sizing should be identical. Only the interactivity and heading differ.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put game logic (hit detection, turn management) in this component. It only validates clicks and emits events. The store and protocol handle the rest.
