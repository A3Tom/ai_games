# Phase 10 — Ticket 001: GridCell Shared Component

## Summary

Create the `GridCell.vue` reusable component that renders a single cell on the game board. This is the fundamental visual building block used across all board-related phases: ship setup (Phase 10), battle (Phase 11), and game over/reveal (Phase 12). The component accepts coordinates, cell state, and interaction flags as props, emits click and hover events, and renders state-based styling using Tailwind utility classes. After this ticket, `GridCell.vue` exists with full prop/emit contracts and a component test file.

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind CSS configured.
- **Phase 2 complete.** `app/src/types/game.ts` exports `CellState` and `CELL_STATES`.
- `app/src/components/shared/` directory exists (created in Phase 9, Ticket 001).

## Scope

**In scope:**

- `app/src/components/shared/GridCell.vue` — reusable cell component with state-based styling, click and hover events, and highlight support for ship placement preview
- `app/src/components/shared/GridCell.test.ts` — component tests covering rendering, events, and conditional styling

**Out of scope:**

- Ship placement logic — ticket 003 (SetupPhase)
- Board-level grid layout (10×10 CSS Grid) — ticket 003 (SetupPhase)
- Opponent board click handling — Phase 11
- Drag-and-drop interactions — post-v1
- Animations or transitions — Phase 13

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/shared/GridCell.vue` | Create | Reusable grid cell with state-based styling and interaction events |
| `app/src/components/shared/GridCell.test.ts` | Create | Component tests for GridCell |

## Requirements

### Component Contract

As defined in `docs/phases/phase-10-ui-ship-setup.md` Section "Interfaces & Contracts":

```typescript
const props = defineProps<{
  x: number
  y: number
  state: CellState
  interactive: boolean      // false for display-only cells
  highlighted: boolean      // true during hover preview
  highlightValid: boolean   // green vs red highlight
}>()

const emit = defineEmits<{
  cellClick: [x: number, y: number]
  cellHover: [x: number, y: number]
}>()
```

### Imports

```typescript
import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'
```

### Template Structure

The component renders a single `<div>` element representing one grid cell. The element must:

1. Have a base size that works within a CSS Grid parent layout. Use `aspect-square` (Tailwind) to maintain a 1:1 aspect ratio. Do not use fixed pixel widths — the parent grid controls sizing.
2. Display a `cursor-pointer` when `interactive` is `true`, and `cursor-default` when `false`.
3. Apply state-based background colors (see Styling section below).
4. Apply highlight colors when `highlighted` is `true`, overriding the base state color.
5. Emit `cellClick` with `(props.x, props.y)` on click, but **only when `interactive` is `true`**. When `interactive` is `false`, clicking does nothing.
6. Emit `cellHover` with `(props.x, props.y)` on `mouseenter`, but **only when `interactive` is `true`**.
7. Include a visible border to delineate cells in the grid (e.g., `border border-gray-600`).

### Event Handlers

```typescript
function handleClick(): void {
  if (props.interactive) {
    emit('cellClick', props.x, props.y)
  }
}

function handleHover(): void {
  if (props.interactive) {
    emit('cellHover', props.x, props.y)
  }
}
```

Bind `handleClick` to the `@click` event and `handleHover` to the `@mouseenter` event on the root element.

### Styling Requirements

Use Tailwind utility classes exclusively. No `<style scoped>` block needed. Compute the CSS class dynamically based on props.

**State-based background colors** (when `highlighted` is `false`):

| `state` value | Background class | Description |
|---------------|-----------------|-------------|
| `'empty'` | `bg-blue-900` | Empty ocean cell |
| `'ship'` | `bg-gray-400` | Cell containing a ship segment |
| `'hit'` | `bg-red-600` | Ship cell that was hit |
| `'miss'` | `bg-blue-400` | Empty cell that was fired upon |
| `'sunk'` | `bg-red-900` | Cell of a fully sunk ship |

**Highlight colors** (when `highlighted` is `true`, overrides state color):

| `highlightValid` | Background class | Description |
|-------------------|-----------------|-------------|
| `true` | `bg-green-500/70` | Valid ship placement preview |
| `false` | `bg-red-500/70` | Invalid ship placement preview |

Use a computed property to derive the final CSS class string:

```typescript
const cellClass = computed(() => {
  if (props.highlighted) {
    return props.highlightValid ? 'bg-green-500/70' : 'bg-red-500/70'
  }
  // Map state to background color
  // ...
})
```

**Additional classes applied to all cells:**
- `aspect-square` — maintain square aspect ratio
- `border border-gray-600` — cell border
- `transition-colors duration-100` — smooth color transitions
- `cursor-pointer` when `interactive` is `true`, `cursor-default` otherwise
- `select-none` — prevent text selection during interactions

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Use `computed` for the cell class derivation — do not compute it inline in the template.
- Single root element (the cell `<div>`).
- Component must stay under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.

### Test Requirements

Create `app/src/components/shared/GridCell.test.ts` using Vitest and Vue Test Utils.

#### Required Test Cases (minimum)

1. **Renders with correct base class for empty state:** Mount with `state: 'empty'`, `interactive: true`, `highlighted: false`, `highlightValid: false`. Assert the root element has `bg-blue-900`.

2. **Renders ship state:** Mount with `state: 'ship'`. Assert the root element has `bg-gray-400`.

3. **Renders highlight valid override:** Mount with `state: 'empty'`, `highlighted: true`, `highlightValid: true`. Assert `bg-green-500/70` is present and `bg-blue-900` is not.

4. **Renders highlight invalid override:** Mount with `highlighted: true`, `highlightValid: false`. Assert `bg-red-500/70` is present.

5. **Emits cellClick when interactive:** Mount with `interactive: true`. Trigger click. Assert `cellClick` emitted with `[x, y]`.

6. **Does not emit cellClick when not interactive:** Mount with `interactive: false`. Trigger click. Assert `cellClick` was not emitted.

7. **Emits cellHover on mouseenter when interactive:** Mount with `interactive: true`. Trigger `mouseenter`. Assert `cellHover` emitted with `[x, y]`.

## Acceptance Criteria

- [ ] File exists at `app/src/components/shared/GridCell.vue` with `<script setup lang="ts">`
- [ ] Component accepts all 6 props: `x`, `y`, `state`, `interactive`, `highlighted`, `highlightValid`
- [ ] Component emits `cellClick` and `cellHover` with coordinates only when `interactive` is `true`
- [ ] State-based background colors are correct for all 5 `CellState` values
- [ ] Highlight colors override state colors when `highlighted` is `true`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do not add any board layout logic to this component.** GridCell is a single cell. The parent component (SetupPhase, PlayerBoard, OpponentBoard) is responsible for arranging cells in a 10×10 CSS Grid. GridCell just renders itself and emits events.
- **Use `aspect-square` for sizing**, not fixed pixel values. The parent grid controls the cell dimensions via `grid-template-columns`. This ensures the grid is responsive down to 375px viewport per `docs/01-PRD.md` success metrics.
- **The `highlighted` prop takes precedence over `state`** for background color. When the user is hovering with a selected ship during placement, highlight colors show whether the placement is valid — the underlying cell state doesn't matter visually in that moment.
- **Import `CellState` as a type import** (`import type { CellState }`) per `docs/03-CODING-STANDARDS.md` Section 2.1. Import `CELL_STATES` as a value import for the computed class logic.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not make the grid a fixed pixel size. Use relative units and `aspect-square`.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure: imports, props, emits, computed, functions.
