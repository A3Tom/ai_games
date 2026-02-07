# Phase 10 — Ticket 002: ShipTray Component

## Summary

Create the `ShipTray.vue` component that displays the player's fleet as a list of ships, visually distinguishing between unplaced and already-placed ships, and allowing the player to select an unplaced ship for placement on the board. This component is a controlled input — it receives the fleet configuration and current placement state as props and emits a selection event. After this ticket, the ship tray renders correctly and emits `shipSelected` events, ready for integration into `SetupPhase` (ticket 003).

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind CSS configured.
- **Phase 2 complete.** `app/src/types/game.ts` exports `ShipType`, `PlacedShip`. `app/src/constants/ships.ts` exports `ShipConfig`, `FLEET_CONFIG`.
- No dependency on ticket 001 (GridCell). ShipTray and GridCell are independent components.

## Scope

**In scope:**

- `app/src/components/game/ShipTray.vue` — displays fleet ships with selection interaction
- `app/src/components/game/ShipTray.test.ts` — component tests for rendering and selection

**Out of scope:**

- Ship placement on the board — ticket 003 (SetupPhase)
- Drag-and-drop from tray to board — post-v1
- Ship rotation controls — ticket 003 (SetupPhase handles rotation)
- GridCell component — ticket 001
- Ready/commit button — ticket 004

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/ShipTray.vue` | Create | Fleet display with ship selection |
| `app/src/components/game/ShipTray.test.ts` | Create | Component tests for ShipTray |

## Requirements

### Component Contract

As defined in `docs/phases/phase-10-ui-ship-setup.md` Section "Interfaces & Contracts":

```typescript
const props = defineProps<{
  ships: ShipConfig[]       // from FLEET_CONFIG
  placedShips: PlacedShip[] // already placed on board
}>()

const emit = defineEmits<{
  shipSelected: [shipType: ShipType]
}>()
```

### Imports

```typescript
import { computed } from 'vue'
import type { ShipType, PlacedShip } from '../../types/game'
import type { ShipConfig } from '../../constants/ships'
```

### Internal State

This component has no internal state. It derives everything from props:

```typescript
const unplacedShips = computed<ShipConfig[]>(() =>
  props.ships.filter(
    (ship) => !props.placedShips.some((placed) => placed.type === ship.type)
  )
)
```

Alternatively, track whether each ship is placed via a computed that maps each `ShipConfig` to a `{ config: ShipConfig; isPlaced: boolean }` structure. Either approach is acceptable as long as the template can distinguish placed from unplaced ships.

### Template Structure

The component renders a container element (e.g., `<div>`) containing:

1. **A heading** — "Your Fleet" or similar descriptive text.
2. **A list of ships** — one entry for each ship in `props.ships` (all 5 ships always visible). Each entry displays:
   - The ship's `name` (e.g., "Carrier", "Destroyer")
   - The ship's `size` — shown as a visual indicator. Render `size` number of small squares/blocks in a row to represent the ship's length (e.g., 5 small colored blocks for Carrier). Use `<span>` or `<div>` elements styled with Tailwind.
   - **Placed indicator:** If the ship has been placed (its `type` exists in `placedShips`), show it as visually muted/dimmed (e.g., reduced opacity, strikethrough, or grayed-out background) and mark it with a checkmark or "(placed)" label.
   - **Unplaced + clickable:** If the ship has NOT been placed, it should appear prominent and clickable. Clicking it emits `shipSelected` with the ship's `type`.
3. Ships should be listed in the same order as `FLEET_CONFIG` (Carrier, Battleship, Cruiser, Submarine, Destroyer).

### Event Handler

```typescript
function handleShipClick(shipType: ShipType): void {
  // Only allow selecting ships that haven't been placed yet
  const isPlaced = props.placedShips.some((s) => s.type === shipType)
  if (!isPlaced) {
    emit('shipSelected', shipType)
  }
}
```

### Styling Requirements

Use Tailwind utility classes exclusively (see `docs/03-CODING-STANDARDS.md` Section 3.4).

- **Container:** Vertical list with spacing between entries. Use `flex flex-col gap-2` or similar.
- **Ship entry (unplaced):** Visible, styled as a clickable button or card. Use `cursor-pointer` and a hover effect (e.g., `hover:bg-gray-700`). Add padding, rounded corners.
- **Ship entry (placed):** Muted appearance. Use `opacity-50` and `cursor-default`. No hover effect. Clicking does nothing (guard in handler).
- **Ship length indicator:** A row of small squares. Each square could be `w-4 h-4 bg-gray-400 rounded-sm` (unplaced) or `w-4 h-4 bg-gray-600 rounded-sm` (placed). Use `flex gap-1` to lay them out horizontally.
- **Mobile-first:** The tray should stack vertically and be readable on 375px viewport. It sits beside the grid on wider screens and below on narrow screens (the parent layout handles this).

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Use `computed` for deriving placed/unplaced status — do not compute inline in the template.
- Single root element preferred.
- Component must stay under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.

### Test Requirements

Create `app/src/components/game/ShipTray.test.ts` using Vitest and Vue Test Utils.

#### Required Test Cases (minimum)

1. **Renders all 5 ships:** Mount with `ships: FLEET_CONFIG` and `placedShips: []`. Assert 5 ship entries are rendered with correct names.

2. **Placed ships appear muted:** Mount with one ship in `placedShips` (e.g., `[{ type: 'carrier', x: 0, y: 0, orientation: 'h' }]`). Assert the carrier entry has `opacity-50` or equivalent muted class.

3. **Unplaced ships are clickable:** Mount with `placedShips: []`. Click the destroyer entry. Assert `shipSelected` emitted with `['destroyer']`.

4. **Placed ships do not emit on click:** Mount with carrier placed. Click the carrier entry. Assert `shipSelected` was NOT emitted.

5. **Ship size indicators render correct count:** Mount with `ships: FLEET_CONFIG`. Assert the carrier entry shows 5 size indicator blocks. Assert the destroyer entry shows 2.

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/ShipTray.vue` with `<script setup lang="ts">`
- [ ] All 5 ships from `FLEET_CONFIG` are rendered with names and size indicators
- [ ] Placed ships are visually muted and not clickable
- [ ] Clicking an unplaced ship emits `shipSelected` with the correct `ShipType`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **This component is a controlled input.** It does not manage which ship is "selected" — that state lives in the parent (SetupPhase, ticket 003). ShipTray only knows about the fleet config and which ships have been placed. It emits `shipSelected` and lets the parent decide what to do.
- **Do not import or use `useGameStore` in this component.** The store is accessed by the parent (SetupPhase), which passes the relevant data as props. This keeps ShipTray pure and testable without store mocking.
- **Always render all 5 ships**, even placed ones. The player needs to see their full fleet. Placed ships are just visually distinguished (dimmed), not removed from the list.
- **Ship order matters.** Render ships in FLEET_CONFIG order (Carrier → Battleship → Cruiser → Submarine → Destroyer). Do not sort alphabetically — the display order matches the config order.
- **The `ShipConfig` type** is exported from `app/src/constants/ships.ts`, not from the types directory. Import it from there.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for component structure: imports, props, emits, computed, functions.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. ShipTray has no business logic — it's purely presentational with a click handler that delegates to the parent via emit.
