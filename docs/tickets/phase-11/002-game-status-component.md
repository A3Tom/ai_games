# Phase 11 — Ticket 002: GameStatus Component

## Summary

Create the `GameStatus.vue` component that displays fleet status for both players during battle. It shows each ship type with its name, size, and sunk/active status for the player's fleet and the opponent's fleet. After this ticket, the component exists with full prop contract, visual distinction between sunk and active ships, and a component test file.

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind CSS configured.
- **Phase 2 complete.** `app/src/types/game.ts` exports `PlacedShip`, `ShipType`, `SHIP_TYPES`.
- **Phase 2 complete.** `app/src/constants/ships.ts` exports `FLEET_CONFIG` and `ShipConfig`.
- `app/src/components/game/` directory exists (created in Phase 10).

## Scope

**In scope:**

- `app/src/components/game/GameStatus.vue` — fleet status display for both players showing ship names, sizes, and sunk status
- `app/src/components/game/GameStatus.test.ts` — component tests covering rendering, sunk state, and visual distinction

**Out of scope:**

- Final game tally / game over summary — Phase 12
- Ship icons or graphical ship representations — post-v1
- Integration into GameView layout — ticket 005
- Deriving sunk ships from store state — ticket 005 (GameView computes and passes as props)

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/GameStatus.vue` | Create | Fleet status for both players |
| `app/src/components/game/GameStatus.test.ts` | Create | Component tests for GameStatus |

## Requirements

### Component Contract

As defined in `docs/phases/phase-11-ui-battle.md` Section 6 "Interfaces & Contracts":

```typescript
import type { PlacedShip, ShipType } from '../../types/game'

const props = defineProps<{
  myShips: PlacedShip[]
  mySunkShips: ShipType[]       // derived from myBoard hit state by parent
  opponentSunkShips: ShipType[] // derived from shotHistory sunk results by parent
}>()
```

No emits — this is a display-only component.

### Imports

```typescript
import { computed } from 'vue'
import type { PlacedShip, ShipType } from '../../types/game'
import { FLEET_CONFIG } from '../../constants/ships'
```

### Template Structure

The component renders two fleet status sections side-by-side (or stacked on narrow viewports):

1. **"Your Fleet" section:** Lists each ship from `FLEET_CONFIG`. A ship is marked as sunk if its `type` appears in `props.mySunkShips`.

2. **"Enemy Fleet" section:** Lists each ship from `FLEET_CONFIG`. A ship is marked as sunk if its `type` appears in `props.opponentSunkShips`.

Each fleet section contains:
- A heading ("Your Fleet" / "Enemy Fleet")
- A ship count summary (e.g., "3 / 5 remaining")
- A list of all 5 ship types, each showing:
  - Ship name (from `FLEET_CONFIG[i].name`)
  - Ship size indicator (visual dots or blocks representing the size, e.g., 5 squares for Carrier)
  - Sunk/active visual state

### Computed Properties

```typescript
const myRemainingCount = computed(() => {
  return FLEET_CONFIG.length - props.mySunkShips.length
})

const opponentRemainingCount = computed(() => {
  return FLEET_CONFIG.length - props.opponentSunkShips.length
})

function isShipSunk(sunkList: ShipType[], shipType: ShipType): boolean {
  return sunkList.includes(shipType)
}
```

### Ship Size Indicator

For each ship, render a row of small squares (inline `<span>` elements) equal to the ship's size. This provides a visual representation of each ship's length. Use Tailwind classes:

- **Active ship squares:** `bg-gray-400` (matching the `ship` cell state color)
- **Sunk ship squares:** `bg-red-900` (matching the `sunk` cell state color)

Each square: `inline-block w-3 h-3 rounded-sm mr-0.5`

### Styling Requirements

Use Tailwind utility classes exclusively. No `<style scoped>` block.

**Section container:**
- `flex flex-col gap-1`

**Section heading:**
- `text-sm font-semibold uppercase tracking-wide`
- "Your Fleet": `text-blue-300`
- "Enemy Fleet": `text-red-300`

**Ship count summary:**
- `text-xs text-gray-400`

**Ship row (active):**
- Ship name: `text-sm text-gray-200`

**Ship row (sunk):**
- Ship name: `text-sm text-red-400 line-through`

**Overall layout:**
- Two sections in a flex row on wider viewports: `flex flex-row gap-6`
- Stack on narrow viewports: `flex flex-col gap-4 sm:flex-row sm:gap-6`

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Use `computed` for derived values.
- Import `FLEET_CONFIG` from constants — do not hardcode ship names or sizes.
- Component must stay under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.

### Test Requirements

Create `app/src/components/game/GameStatus.test.ts` using Vitest and Vue Test Utils.

#### Test Setup

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GameStatus from './GameStatus.vue'
import type { PlacedShip, ShipType } from '../../types/game'
import { FLEET_CONFIG } from '../../constants/ships'

const mockShips: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]
```

#### Required Test Cases (minimum)

1. **Renders all 5 ship names for player fleet:** Mount with `myShips: mockShips`, `mySunkShips: []`, `opponentSunkShips: []`. Assert all 5 ship names from `FLEET_CONFIG` appear in the rendered output.

2. **Renders all 5 ship names for enemy fleet:** Same setup. Assert the enemy fleet section also lists all 5 ship names.

3. **Marks player ship as sunk:** Mount with `mySunkShips: ['destroyer']`. Assert the Destroyer entry in the player fleet has the `line-through` class.

4. **Marks opponent ship as sunk:** Mount with `opponentSunkShips: ['carrier']`. Assert the Carrier entry in the enemy fleet has the `line-through` class.

5. **Shows correct remaining count:** Mount with `mySunkShips: ['destroyer', 'submarine']`. Assert the player fleet summary text contains "3" (remaining) or "3 / 5".

6. **Active ships do not have line-through:** Mount with `mySunkShips: []`. Assert no ship row in the player fleet has the `line-through` class.

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/GameStatus.vue` with `<script setup lang="ts">`
- [ ] Component accepts `myShips`, `mySunkShips`, and `opponentSunkShips` props
- [ ] All 5 ship types from `FLEET_CONFIG` are listed for both player and enemy fleets
- [ ] Sunk ships are visually distinct from active ships (line-through + color change)
- [ ] Ship size indicators render the correct number of squares per ship
- [ ] Remaining ship count is accurate for both players
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Import ship data from `FLEET_CONFIG`, do not hardcode.** The ship names, types, and sizes must come from `app/src/constants/ships.ts`. This ensures consistency with the rest of the codebase and makes the component resilient to config changes.
- **The `mySunkShips` and `opponentSunkShips` props are arrays of `ShipType`.** The parent component (GameView) is responsible for deriving these from store state. This component just renders what it receives.
- **Do not import any stores or composables.** All data comes via props. This keeps the component pure and testable.
- **Keep the ship size indicator simple.** Small inline squares are sufficient. Do not add SVG icons or elaborate ship graphics — that's post-v1 polish.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.4** for Tailwind usage — utility classes only, no custom CSS.
- **Reference `docs/01-PRD.md` US-05 and US-07** for the user story context: players should see which ships have been sunk and what's remaining.
