# Phase 02 — Ticket 003: Fleet Constants

## Summary

Define the fleet configuration constants in `app/src/constants/ships.ts`, including the `ShipConfig` interface and the `FLEET_CONFIG` array that specifies each ship's type, display name, and size. This file is the single source of truth for fleet composition and is consumed by board utilities (Phase 3), the ship placement UI (Phase 10), and game logic throughout. When done, the agent should have a constants file that compiles cleanly and exports the fleet configuration.

## Prerequisites

- **Ticket 001** (`app/src/types/game.ts`) must be completed. This ticket imports `ShipType` from that file.

## Scope

**In scope:**

- `ShipConfig` interface
- `FLEET_CONFIG` readonly array of ship configurations
- `FLEET_SIZE` constant (count of ships)
- `TOTAL_SHIP_CELLS` constant (sum of all ship sizes)

**Out of scope:**

- `ShipType` type definition — already defined in ticket 001 (`app/src/types/game.ts`)
- Grid constants — handled in ticket 002 (`app/src/constants/grid.ts`)
- Ship placement logic (`canPlaceShip`, `placeShip`) — Phase 3
- Ship tray UI component — Phase 10

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/constants/ships.ts` | Create | Fleet configuration: ship types, names, sizes |

## Requirements

Follow coding standards from `docs/03-CODING-STANDARDS.md` Section 2.1 (no `enum`), Section 2.3 (naming conventions), and Section 2.5 (`interface` for objects).

### `ShipConfig`

```typescript
import type { ShipType } from '../types/game'

export interface ShipConfig {
  type: ShipType
  name: string
  size: number
}
```

A configuration record for a single ship in the fleet. `type` links to the `ShipType` union from `game.ts`. `name` is the human-readable display name (title case). `size` is the number of cells the ship occupies.

### `FLEET_CONFIG`

```typescript
export const FLEET_CONFIG: readonly ShipConfig[] = [
  { type: 'carrier', name: 'Carrier', size: 5 },
  { type: 'battleship', name: 'Battleship', size: 4 },
  { type: 'cruiser', name: 'Cruiser', size: 3 },
  { type: 'submarine', name: 'Submarine', size: 3 },
  { type: 'destroyer', name: 'Destroyer', size: 2 },
] as const
```

The standard Battleship fleet. The array is ordered by size (descending), which is the conventional placement order. The `as const` assertion ensures the array and its contents are deeply readonly. The `readonly ShipConfig[]` type annotation ensures consumers see it as immutable.

**Fleet composition** (from `docs/01-PRD.md` Section 3):
| Ship | Size |
|------|------|
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

### `FLEET_SIZE`

```typescript
export const FLEET_SIZE = FLEET_CONFIG.length
```

The number of ships in the fleet (5). Derived from `FLEET_CONFIG` to keep the single source of truth. Used by placement validation to confirm all ships are placed before committing.

### `TOTAL_SHIP_CELLS`

```typescript
export const TOTAL_SHIP_CELLS = FLEET_CONFIG.reduce((sum, ship) => sum + ship.size, 0)
```

The total number of cells occupied by all ships (17). Used to determine when all ships have been sunk (total hits = 17 means game over). See `docs/05-PROTOCOL-SPEC.md` Section 5.2 — the game transitions from BATTLE to REVEAL when all of one player's ship cells are hit.

**Source of truth:** `docs/01-PRD.md` Section 3 (fleet composition), `docs/phases/phase-02-type-foundation.md` (Interfaces & Contracts section).

## Acceptance Criteria

- [ ] File exists at `app/src/constants/ships.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `FLEET_CONFIG` contains exactly 5 entries: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- [ ] `FLEET_SIZE` equals `5`
- [ ] `TOTAL_SHIP_CELLS` equals `17`
- [ ] `ShipConfig.type` is typed as `ShipType` (imported from `../types/game`), not as `string`
- [ ] The import uses `import type` syntax: `import type { ShipType } from '../types/game'`

## Notes for the Agent

- **Use `import type`** for the `ShipType` import. Since `ShipType` is only used as a type (in the `ShipConfig` interface), the import should use the `type` modifier per `docs/03-CODING-STANDARDS.md` Section 2.1. This ensures the import is erased at compile time.
- **Do not duplicate `ShipType` values.** Use the string literal values (`'carrier'`, `'battleship'`, etc.) directly in `FLEET_CONFIG` — TypeScript will verify they match the `ShipType` union through the `ShipConfig` interface.
- **`FLEET_CONFIG` ordering is by size descending.** This is a UI convention (larger ships placed first), not a protocol requirement. The protocol requires alphabetical sorting for commitment, which is handled separately in the crypto composable (Phase 7).
- **`TOTAL_SHIP_CELLS` must be computed from `FLEET_CONFIG`**, not hardcoded as `17`. If the fleet ever changes, the constant should update automatically.
- **Do not add ship-specific helper functions** (like `getShipSize(type)`). Utility functions belong in Phase 3.
