# Phase 10 — Ticket 003: SetupPhase Board Grid and Ship Placement

## Summary

Create the `SetupPhase.vue` component that renders a 10×10 board grid using `GridCell` components and integrates the `ShipTray` for ship selection. This ticket implements the core click-to-place interaction: selecting a ship from the tray, previewing its placement on the grid with validation highlighting, clicking to place, clicking to remove, and toggling rotation. After this ticket, the player can interactively place and remove all 5 ships on the board with real-time visual feedback. The "Ready" button and commit flow are handled in ticket 004.

## Prerequisites

- **Phase 1 complete.** Tailwind CSS configured.
- **Phase 2 complete.** Types (`CellState`, `ShipType`, `PlacedShip`, `Orientation`) and constants (`GRID_SIZE`, `FLEET_CONFIG`, `COLUMN_LABELS`, `ROW_LABELS`) exist.
- **Phase 3 complete.** `app/src/utils/board.ts` exports `canPlaceShip()`, `getShipCells()`.
- **Phase 4 complete.** `app/src/stores/game.ts` exports `useGameStore` with `placeShip()`, `removeShip()`, `myBoard`, `myShips`, `phase`.
- **Ticket 001 complete.** `app/src/components/shared/GridCell.vue` exists.
- **Ticket 002 complete.** `app/src/components/game/ShipTray.vue` exists.

## Scope

**In scope:**

- `app/src/components/game/SetupPhase.vue` — 10×10 grid layout, ship tray integration, ship selection state, hover preview with validation, click-to-place, click-to-remove, rotation toggle
- `app/src/components/game/SetupPhase.test.ts` — component tests for placement interactions

**Out of scope:**

- "Ready" button and commit flow — ticket 004
- "Waiting for opponent..." state — ticket 004
- `boardCommitted` emit — ticket 004
- GameView integration — ticket 005
- Opponent board — Phase 11
- Drag-and-drop — post-v1
- Animations — Phase 13

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/SetupPhase.vue` | Create | Board grid with ship placement interaction |
| `app/src/components/game/SetupPhase.test.ts` | Create | Component tests for placement logic |

## Requirements

### Component Contract

Based on `docs/phases/phase-10-ui-ship-setup.md` Section "Interfaces & Contracts". In this ticket, the component has no emits yet — the `boardCommitted` emit is added in ticket 004.

```typescript
// No props — SetupPhase accesses the game store directly
// No emits in this ticket — added in ticket 004
```

### Imports

```typescript
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../../stores/game'
import { canPlaceShip, getShipCells } from '../../utils/board'
import { FLEET_CONFIG } from '../../constants/ships'
import { GRID_SIZE, COLUMN_LABELS, ROW_LABELS } from '../../constants/grid'
import type { ShipType, Orientation, PlacedShip } from '../../types/game'
import GridCell from '../shared/GridCell.vue'
import ShipTray from './ShipTray.vue'
```

### Store Access

```typescript
const gameStore = useGameStore()
const { myBoard, myShips, phase } = storeToRefs(gameStore)
```

Per `docs/03-CODING-STANDARDS.md` Section 4.1, use `storeToRefs()` for reactive state destructuring.

### Internal State

As specified in `docs/phases/phase-10-ui-ship-setup.md`:

```typescript
const selectedShip = ref<ShipType | null>(null)
const currentOrientation = ref<Orientation>('h')
const hoveredCell = ref<{ x: number; y: number } | null>(null)
```

### Computed Properties

#### Preview Cells

Compute the cells that would be occupied by the selected ship at the hovered position, along with whether the placement is valid:

```typescript
const previewCells = computed<Array<{ x: number; y: number; valid: boolean }>>(() => {
  if (selectedShip.value === null || hoveredCell.value === null) {
    return []
  }

  const ship: PlacedShip = {
    type: selectedShip.value,
    x: hoveredCell.value.x,
    y: hoveredCell.value.y,
    orientation: currentOrientation.value,
  }

  const cells = getShipCells(ship)
  const isValid = canPlaceShip(myBoard.value, ship)

  return cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    valid: isValid,
  }))
})
```

#### All Ships Placed

```typescript
const allShipsPlaced = computed<boolean>(() =>
  myShips.value.length === FLEET_CONFIG.length
)
```

This computed is exposed for ticket 004 to use for the "Ready" button disabled state.

#### Cell Highlight State

For each cell in the grid, determine if it is part of the preview:

```typescript
function isCellHighlighted(x: number, y: number): boolean {
  return previewCells.value.some((c) => c.x === x && c.y === y)
}

function isCellHighlightValid(x: number, y: number): boolean {
  const cell = previewCells.value.find((c) => c.x === x && c.y === y)
  return cell?.valid ?? false
}
```

These are helper functions (not computed) called per-cell in the template. This is acceptable because the preview cells array is small (2–5 entries) and the lookup is O(n) with n ≤ 5.

### Event Handlers

#### Ship Selection (from ShipTray)

```typescript
function handleShipSelected(shipType: ShipType): void {
  selectedShip.value = shipType
}
```

#### Cell Hover

```typescript
function handleCellHover(x: number, y: number): void {
  hoveredCell.value = { x, y }
}
```

#### Cell Click (Place or Remove)

```typescript
function handleCellClick(x: number, y: number): void {
  // If a ship is selected, try to place it
  if (selectedShip.value !== null) {
    const ship: PlacedShip = {
      type: selectedShip.value,
      x,
      y,
      orientation: currentOrientation.value,
    }
    const placed = gameStore.placeShip(ship)
    if (placed) {
      selectedShip.value = null  // Deselect after successful placement
      hoveredCell.value = null   // Clear preview
    }
    return
  }

  // If no ship selected, check if clicking on a placed ship to remove it
  const placedShip = myShips.value.find((s) => {
    const cells = getShipCells(s)
    return cells.some((c) => c.x === x && c.y === y)
  })
  if (placedShip) {
    gameStore.removeShip(placedShip.type)
  }
}
```

#### Rotation Toggle

```typescript
function handleRotate(): void {
  currentOrientation.value = currentOrientation.value === 'h' ? 'v' : 'h'
}
```

Also listen for the `R` key press to toggle rotation. Add and remove the keyboard listener on mount/unmount:

```typescript
import { onMounted, onUnmounted } from 'vue'

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'r' || event.key === 'R') {
    handleRotate()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
```

#### Mouse Leave (clear preview when cursor leaves the grid)

```typescript
function handleGridMouseLeave(): void {
  hoveredCell.value = null
}
```

### Template Structure

The component renders a responsive layout with two main sections:

1. **Board section** — contains column labels, row labels, and the 10×10 grid:

   - **Column labels row:** 10 labels (`A`–`J`) from `COLUMN_LABELS`, aligned above the grid columns. Render as a row of centered text elements matching grid column widths.
   - **Grid with row labels:** For each of the 10 rows, render a row label (`1`–`10` from `ROW_LABELS`) followed by 10 `GridCell` components.
   - **Grid layout:** Use CSS Grid with `grid-template-columns: repeat(10, 1fr)` on the cell container. The grid must be responsive — use `max-w-[min(90vw,24rem)]` or similar to constrain size while remaining usable on 375px viewports.
   - Bind `@mouseleave="handleGridMouseLeave"` on the grid container.

2. **Controls section** — below or beside the grid:
   - `ShipTray` component with `:ships="FLEET_CONFIG"` and `:placed-ships="myShips"` props, handling `@ship-selected="handleShipSelected"`.
   - **Rotation button:** A button showing current orientation ("Horizontal" / "Vertical") that calls `handleRotate` on click. Show when a ship is selected.
   - **Selected ship indicator:** Text showing which ship is currently selected for placement (e.g., "Placing: Carrier"). Show when `selectedShip` is not null.

**Layout:**
- On screens ≥ 640px (`sm:` breakpoint), use a side-by-side layout: grid on the left, tray/controls on the right.
- On screens < 640px, stack vertically: grid on top, tray/controls below.
- Use Tailwind responsive utilities: `flex flex-col sm:flex-row`.

### Styling Requirements

- Mobile-first design per `docs/01-PRD.md` success metrics (375px viewport).
- CSS Grid for the 10×10 board: `grid grid-cols-10`.
- Do not use fixed pixel widths for the grid — use relative units. The grid container should have a `max-width` relative to the viewport (e.g., `max-w-[min(90vw,24rem)]`) and `w-full`.
- Column and row labels should be subtle (e.g., `text-xs text-gray-400`).
- Rotation button styled as a secondary action (e.g., `bg-gray-700 text-white px-3 py-1 rounded`).
- All styling via Tailwind utility classes per `docs/03-CODING-STANDARDS.md` Section 3.4.

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Follow component structure order: imports, store access, refs, computed, functions, lifecycle hooks.
- Component must stay under 200 lines. If it approaches this limit, the template can use helper components or be tightened — but do not extract logic to a composable unless it exceeds 200 lines.

### Test Requirements

Create `app/src/components/game/SetupPhase.test.ts` using Vitest and Vue Test Utils. Since SetupPhase uses the game store, create a test Pinia instance per `docs/03-CODING-STANDARDS.md` Section 7.

#### Mocking Strategy

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SetupPhase from './SetupPhase.vue'
import { useGameStore } from '../../stores/game'
import { GAME_PHASES } from '../../types/game'
```

In `beforeEach`, create a fresh Pinia instance and set the game store to setup phase:

```typescript
beforeEach(() => {
  setActivePinia(createPinia())
  const store = useGameStore()
  store.startSetup()  // Transitions to SETUP phase with empty board
})
```

#### Required Test Cases (minimum)

1. **Renders 100 GridCell components:** Mount SetupPhase. Assert that 100 GridCell instances are rendered (10×10 grid).

2. **Renders ShipTray with FLEET_CONFIG:** Mount SetupPhase. Assert ShipTray is rendered and receives the fleet config.

3. **Placing a ship updates the board:** Use the store to simulate: call `store.placeShip({ type: 'destroyer', x: 0, y: 0, orientation: 'h' })`. Assert that the corresponding GridCells now show `'ship'` state.

4. **Rotation toggle changes orientation:** Find and click the rotation button. Assert the displayed orientation text changes from "Horizontal" to "Vertical" (or vice versa).

5. **All ships placed computed is correct:** Place all 5 ships via the store. Assert that the `allShipsPlaced` logic is satisfied (this will be used by the "Ready" button in ticket 004 — for now, just verify the internal computed works by checking that the component doesn't show placement prompts when all ships are placed).

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/SetupPhase.vue` with `<script setup lang="ts">`
- [ ] 10×10 grid renders using `GridCell` components with column (A–J) and row (1–10) labels
- [ ] Clicking a ship in `ShipTray` selects it for placement
- [ ] Hovering over the grid shows a green or red preview of the selected ship's footprint
- [ ] Clicking a valid cell places the ship on the board via `gameStore.placeShip()`
- [ ] Clicking a placed ship on the board removes it via `gameStore.removeShip()`
- [ ] Rotation toggle (button + `R` key) switches between horizontal and vertical orientation
- [ ] Grid is responsive and usable on 375px viewport without horizontal scrolling
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do not implement the "Ready" button or commit flow in this ticket.** That is ticket 004. This ticket focuses exclusively on the interactive ship placement experience. Leave a clear spot in the template where the "Ready" button will be added.
- **Board indexing is `board[y][x]`**, not `board[x][y]`. The outer array is rows (y), inner is columns (x). When iterating to render the grid, the outer loop is `y` (rows 0–9) and the inner loop is `x` (columns 0–9). See `docs/02-ARCHITECTURE.md` Section 4.
- **Use `storeToRefs()`** to destructure `myBoard` and `myShips` from the store. Do not access `gameStore.myBoard` directly in the template — this breaks reactivity in some edge cases. See `docs/03-CODING-STANDARDS.md` Section 4.1.
- **The `canPlaceShip` import is from `utils/board.ts`**, not from the store. The store's `placeShip` action already calls `canPlaceShip` internally and returns `false` if invalid. However, the component needs `canPlaceShip` separately for the preview computation (to determine valid/invalid highlighting without actually placing the ship).
- **`getShipCells` may return out-of-bounds coordinates.** This is by design — `canPlaceShip` handles bounds checking. In the preview, cells that are out of bounds simply won't match any grid cell and won't highlight anything (the grid only renders cells 0–9).
- **Keyboard listener cleanup is critical.** Always remove the `keydown` listener in `onUnmounted` to prevent memory leaks and ghost handlers. See `docs/04-AI-ASSISTANT-GUIDE.md` Section 5, composable template for cleanup pattern.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not make the grid a fixed pixel size. Use CSS Grid with relative units (`vmin`, `%`, `fr`).
- **Keep the component under 200 lines.** If approaching the limit, prefer tightening the template (fewer wrapper divs, less verbose Tailwind) over extracting sub-components. The logic is inherently co-located.
