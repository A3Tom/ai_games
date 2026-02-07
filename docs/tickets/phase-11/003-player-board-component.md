# Phase 11 — Ticket 003: PlayerBoard Component

## Summary

Create the `PlayerBoard.vue` component that displays the player's own 10x10 grid during battle. This is a read-only board showing ship placements, incoming hits from the opponent, and misses. It uses the `GridCell` shared component from Phase 10 to render each cell. After this ticket, the player's board renders correctly with column/row labels, all ship positions visible, and hit/miss state reflected from the store.

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind CSS configured.
- **Phase 2 complete.** `app/src/types/game.ts` exports `CellState`, `PlacedShip`.
- **Phase 2 complete.** `app/src/constants/grid.ts` exports `GRID_SIZE`, `COLUMN_LABELS`, `ROW_LABELS`.
- **Phase 10, Ticket 001 complete.** `app/src/components/shared/GridCell.vue` exists with `state`, `interactive`, `highlighted`, `highlightValid`, `x`, `y` props and `cellClick`, `cellHover` emits.

## Scope

**In scope:**

- `app/src/components/game/PlayerBoard.vue` — read-only 10x10 grid displaying the player's ships, incoming hits, and misses using GridCell components
- `app/src/components/game/PlayerBoard.test.ts` — component tests for rendering and non-interactivity

**Out of scope:**

- Opponent's board (interactive targeting grid) — ticket 004
- Ship placement interaction (drag/click to place) — Phase 10
- Reveal phase board display (showing opponent's ships) — Phase 12
- Integration into GameView layout — ticket 005

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/PlayerBoard.vue` | Create | Player's own board showing ships, hits, misses |
| `app/src/components/game/PlayerBoard.test.ts` | Create | Component tests for PlayerBoard |

## Requirements

### Component Contract

As defined in `docs/phases/phase-11-ui-battle.md` Section 6 "Interfaces & Contracts":

```typescript
import type { CellState, PlacedShip } from '../../types/game'

const props = defineProps<{
  board: CellState[][]   // 10x10 from gameStore.myBoard
  ships: PlacedShip[]    // from gameStore.myShips
}>()

// No emits — read-only display
```

### Imports

```typescript
import type { CellState, PlacedShip } from '../../types/game'
import { GRID_SIZE, COLUMN_LABELS, ROW_LABELS } from '../../constants/grid'
import GridCell from '../shared/GridCell.vue'
```

### Template Structure

The component renders a labeled 10x10 grid using CSS Grid:

```
     A   B   C   D   E   F   G   H   I   J
  1  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]
  2  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]
  ...
 10  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]
```

Structure:

1. **Board heading:** A `<h3>` element with text "Your Fleet", styled with `text-sm font-semibold text-blue-300 mb-1`.

2. **Grid container:** A `<div>` using CSS Grid with `GRID_SIZE + 1` columns (1 for row labels + 10 for cells). Template: `grid` with `grid-template-columns: auto repeat(10, 1fr)`.

3. **Column labels row:** First row contains an empty corner cell followed by 10 column label cells (A–J). Each label is centered text: `text-xs text-gray-400 text-center`.

4. **Grid rows (1–10):** Each row starts with a row label cell (1–10) followed by 10 `GridCell` components. The row label is styled: `text-xs text-gray-400 flex items-center justify-center`.

5. **GridCell props for each cell:**
   - `x`: column index (0–9)
   - `y`: row index (0–9)
   - `state`: `props.board[y][x]` — the CellState at that position
   - `interactive`: always `false` (player's board is read-only during battle)
   - `highlighted`: always `false`
   - `highlightValid`: always `false`

### Grid Layout CSS

Use Tailwind with an inline style for the grid template:

```html
<div
  class="grid gap-0"
  :style="{ gridTemplateColumns: `auto repeat(${GRID_SIZE}, 1fr)` }"
>
```

The `auto` column is for row labels. The `repeat(10, 1fr)` distributes cell columns equally.

**Responsive sizing:** The grid should fill available width up to a maximum. Use `max-w-sm w-full mx-auto` on the outer container to constrain the board size while remaining responsive down to 375px (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6).

### Iteration Pattern

Use `v-for` to iterate over rows and cells:

```html
<!-- Column labels -->
<div></div> <!-- empty corner -->
<div v-for="label in COLUMN_LABELS" :key="label" class="...">{{ label }}</div>

<!-- Grid rows -->
<template v-for="(row, y) in board" :key="y">
  <div class="...">{{ ROW_LABELS[y] }}</div>
  <GridCell
    v-for="(cell, x) in row"
    :key="`${x}-${y}`"
    :x="x"
    :y="y"
    :state="cell"
    :interactive="false"
    :highlighted="false"
    :highlight-valid="false"
  />
</template>
```

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- No computed properties needed — all rendering is directly from props.
- Single root element wrapping the heading and grid.
- Component must stay under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1 (expected: ~60–80 lines).

### Test Requirements

Create `app/src/components/game/PlayerBoard.test.ts` using Vitest and Vue Test Utils.

#### Test Setup

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerBoard from './PlayerBoard.vue'
import type { CellState, PlacedShip } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { GRID_SIZE } from '../../constants/grid'

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => CELL_STATES.EMPTY as CellState),
  )
}

const mockShips: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]
```

#### Mocking Strategy

Stub `GridCell` to avoid importing the real component (which may have its own dependencies):

```typescript
const GridCellStub = {
  name: 'GridCell',
  template: '<div class="grid-cell-stub" :data-state="state" :data-interactive="interactive"></div>',
  props: ['x', 'y', 'state', 'interactive', 'highlighted', 'highlightValid'],
}
```

Mount with `global.stubs`: `{ GridCell: GridCellStub }`.

#### Required Test Cases (minimum)

1. **Renders 100 GridCell components:** Mount with an empty board. Assert 100 GridCell stubs are rendered (10x10).

2. **All cells are non-interactive:** Mount with an empty board. Assert every GridCell stub has `data-interactive="false"`.

3. **Passes correct CellState to cells:** Create a board with `board[0][0] = 'ship'` and `board[1][1] = 'hit'`. Mount. Assert the GridCell at (0,0) has `data-state="ship"` and the one at (1,1) has `data-state="hit"`.

4. **Renders column labels A through J:** Mount. Assert the text "A" through "J" appears in the rendered output.

5. **Renders row labels 1 through 10:** Mount. Assert the text "1" through "10" appears in the rendered output.

6. **Displays "Your Fleet" heading:** Mount. Assert the text "Your Fleet" is present.

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/PlayerBoard.vue` with `<script setup lang="ts">`
- [ ] Component accepts `board` (CellState[][]) and `ships` (PlacedShip[]) props
- [ ] Renders a 10x10 grid of GridCell components (100 cells total)
- [ ] All GridCell instances have `interactive` set to `false`
- [ ] Column labels (A–J) and row labels (1–10) are displayed
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **GridCell handles all cell-level styling.** PlayerBoard just passes the `CellState` from the board array to each GridCell. Do not re-implement the color mapping — GridCell already does that (see Phase 10, Ticket 001).
- **The `ships` prop is accepted but not directly used for rendering.** The board array already contains `ship`, `hit`, `miss`, and `sunk` cell states which encode all the visual information. The `ships` prop is part of the interface contract for potential future use (e.g., showing ship outlines in Phase 12 reveal). Accept it in props but do not use it in the template.
- **Use `GRID_SIZE` from constants, not hardcoded `10`.** This ensures consistency and makes the grid size a single source of truth (see `app/src/constants/grid.ts`).
- **Do not use fixed pixel widths for the grid.** Use CSS Grid with `1fr` columns so the board scales with its container. The parent (GameView) controls the available width. This ensures the board is playable on 375px viewports per `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not make the grid a fixed pixel size. Use relative units.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure: imports, props, template.
