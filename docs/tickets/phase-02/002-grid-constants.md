# Phase 02 — Ticket 002: Grid Constants

## Summary

Define the grid dimension and label constants in `app/src/constants/grid.ts`. These constants establish the 10x10 board dimensions and the column/row labels (A–J, 1–10) used throughout the UI and board logic. When done, the agent should have a single constants file that compiles cleanly and exports all grid-related constants.

## Prerequisites

- **Phase 1 complete.** The project skeleton must exist with the `app/src/constants/` directory present.
- **No in-phase dependencies.** This ticket is independent of all other Phase 2 tickets and can be completed in parallel with ticket 001.

## Scope

**In scope:**

- `GRID_SIZE` constant
- `COLUMN_LABELS` as-const tuple
- `ROW_LABELS` as-const tuple

**Out of scope:**

- Ship constants (`FLEET_CONFIG`, ship sizes) — handled in ticket 003 (`app/src/constants/ships.ts`)
- Board utility functions (`createEmptyBoard`, `canPlaceShip`) — Phase 3
- Any types or interfaces — handled in ticket 001 (`app/src/types/game.ts`)

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/constants/grid.ts` | Create | Grid size and label constants |

## Requirements

All constants must follow the coding standards in `docs/03-CODING-STANDARDS.md` Section 2.3 (Naming):

- Constants use `UPPER_SNAKE_CASE`.
- Use `as const` for tuple literals to preserve literal types.
- Explicit `export` on every constant.

### `GRID_SIZE`

```typescript
export const GRID_SIZE = 10
```

The board is always 10x10. This constant is used by board utilities (Phase 3) to validate coordinates, create empty boards, and check ship placement bounds. It is a plain number, not wrapped in an object.

### `COLUMN_LABELS`

```typescript
export const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const
```

Column labels for display purposes. Index 0 = 'A', index 9 = 'J'. The `as const` assertion preserves the tuple type so that `COLUMN_LABELS[0]` has type `'A'`, not `string`. The array must contain exactly 10 elements matching `GRID_SIZE`.

### `ROW_LABELS`

```typescript
export const ROW_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const
```

Row labels for display purposes. These are strings (not numbers) because they are used in the UI for labeling. Index 0 = '1', index 9 = '10'. The array must contain exactly 10 elements matching `GRID_SIZE`.

**Source of truth:** `docs/02-ARCHITECTURE.md` Section 4 (grid dimensions), `docs/01-PRD.md` Section 3 (board is 10x10, columns A–J, rows 1–10).

## Acceptance Criteria

- [ ] File exists at `app/src/constants/grid.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `GRID_SIZE` is exported and equals `10`
- [ ] `COLUMN_LABELS` is exported as a readonly tuple of exactly 10 string literals `'A'` through `'J'`
- [ ] `ROW_LABELS` is exported as a readonly tuple of exactly 10 string literals `'1'` through `'10'`
- [ ] No imports from other project files — this file is fully self-contained

## Notes for the Agent

- **This is the simplest ticket in Phase 2.** It should take under 10 minutes.
- **Use `as const`** on the label arrays to get literal tuple types, not `string[]`. This enables type-safe indexing in later phases.
- **Do not add derived types** like `type ColumnLabel = (typeof COLUMN_LABELS)[number]` unless they are explicitly specified in the phase overview. Keep the file minimal. Consumers can derive what they need.
- **Do not import `GRID_SIZE` from another file** or compute it from the label arrays. Keep it as a plain numeric literal for clarity.
- **Row labels are strings, not numbers.** `'10'` is a string. This is intentional — they are display labels, not coordinates. Coordinates use 0-indexed numbers.
