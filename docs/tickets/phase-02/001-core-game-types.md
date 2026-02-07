# Phase 02 — Ticket 001: Core Game Types

## Summary

Define all foundational game entity types, state enums, and interfaces in `app/src/types/game.ts`. This file establishes the shared vocabulary used by every subsequent phase — stores, utilities, composables, and components all import from here. When done, the agent should have a single type file that compiles cleanly and exports all core game types.

## Prerequisites

- **Phase 1 complete.** The Vue 3 + TypeScript project skeleton must exist with `strict: true` in `tsconfig.json` and the `app/src/types/` directory present.

## Scope

**In scope:**

- `CELL_STATES` as-const object and derived `CellState` type
- `GAME_PHASES` as-const object and derived `GamePhase` type
- `SHIP_TYPES` as-const object and derived `ShipType` type
- `Orientation` type alias
- `PlacedShip` interface
- `Shot` interface
- `BoardCommitment` interface
- `GameState` interface

**Out of scope:**

- Protocol message types — handled in ticket 004 (`app/src/types/protocol.ts`)
- Ship configuration constants (`FLEET_CONFIG`, sizes, names) — handled in ticket 003 (`app/src/constants/ships.ts`)
- Grid constants (`GRID_SIZE`, labels) — handled in ticket 002 (`app/src/constants/grid.ts`)
- `app/src/types/ships.ts` — not needed; all ship types live in `game.ts` per the phase overview
- Any runtime logic, utility functions, or store implementations

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/types/game.ts` | Create | Core game entity types, state enums (as-const), and interfaces |

## Requirements

All types must follow the coding standards in `docs/03-CODING-STANDARDS.md` Section 2 (TypeScript Rules):

- **No `enum` keyword.** Use `as const` objects with derived union types.
- **`interface` for object shapes, `type` for unions/aliases.**
- **Explicit `export` on every public type and const.**
- **No `any`.**

### `CELL_STATES` and `CellState`

```typescript
export const CELL_STATES = {
  EMPTY: 'empty',
  SHIP: 'ship',
  HIT: 'hit',
  MISS: 'miss',
  SUNK: 'sunk',
} as const

export type CellState = (typeof CELL_STATES)[keyof typeof CELL_STATES]
```

The five cell states represent the visual/logical state of each cell on a 10x10 board. `SHIP` is only visible on the player's own board. `SUNK` marks cells of a fully sunk ship.

### `GAME_PHASES` and `GamePhase`

```typescript
export const GAME_PHASES = {
  LOBBY: 'lobby',
  SETUP: 'setup',
  COMMIT: 'commit',
  BATTLE: 'battle',
  REVEAL: 'reveal',
  GAMEOVER: 'gameover',
} as const

export type GamePhase = (typeof GAME_PHASES)[keyof typeof GAME_PHASES]
```

Six phases representing the game state machine. See `docs/05-PROTOCOL-SPEC.md` Section 5 for the transition diagram:
`LOBBY → SETUP → COMMIT → BATTLE → REVEAL → GAMEOVER`

### `SHIP_TYPES` and `ShipType`

```typescript
export const SHIP_TYPES = {
  CARRIER: 'carrier',
  BATTLESHIP: 'battleship',
  CRUISER: 'cruiser',
  SUBMARINE: 'submarine',
  DESTROYER: 'destroyer',
} as const

export type ShipType = (typeof SHIP_TYPES)[keyof typeof SHIP_TYPES]
```

Five ship types matching the standard Battleship fleet. The string values must be lowercase and match exactly — they are used as discriminators in protocol messages (`docs/05-PROTOCOL-SPEC.md` Section 4).

### `Orientation`

```typescript
export type Orientation = 'h' | 'v'
```

Ship placement orientation: horizontal (`'h'`) or vertical (`'v'`). Matches the protocol spec (`docs/05-PROTOCOL-SPEC.md` Section 4.4).

### `PlacedShip`

```typescript
export interface PlacedShip {
  type: ShipType
  x: number
  y: number
  orientation: Orientation
}
```

Represents a ship placed on the board. `x` and `y` are 0-indexed coordinates of the ship's top-left cell. `x` is the column (0–9), `y` is the row (0–9). The ship extends right (horizontal) or down (vertical) from this origin.

### `Shot`

```typescript
export interface Shot {
  x: number
  y: number
  hit: boolean
  sunk: ShipType | null
  player: 'a' | 'b'
}
```

A recorded shot in the game history. The `sunk` field is always present (not optional) — it is `null` when the shot did not sink a ship, or the `ShipType` value when it did. `player` identifies who fired: `'a'` is the room creator (first turn), `'b'` is the joiner. See `docs/05-PROTOCOL-SPEC.md` Section 4.3 (ResultMessage) and Section 5.2 (turn management).

### `BoardCommitment`

```typescript
export interface BoardCommitment {
  ships: PlacedShip[]
}
```

The canonical board representation used for the commit-reveal anti-cheat protocol. The `ships` array **must be sorted alphabetically by `type`** before serialization. This deterministic ordering ensures that `JSON.stringify(ships)` produces the same string for the same board layout. See `docs/05-PROTOCOL-SPEC.md` Section 6 (Board Commitment Protocol).

### `GameState`

```typescript
export interface GameState {
  phase: GamePhase
  myBoard: CellState[][]
  opponentBoard: CellState[][]
  myShips: PlacedShip[]
  opponentShips: PlacedShip[]
  isMyTurn: boolean
  myCommitHash: string | null
  opponentCommitHash: string | null
  mySalt: Uint8Array | null
  winner: 'me' | 'opponent' | null
  cheatDetected: boolean
  shotHistory: Shot[]
}
```

The complete client-side game state. `myBoard` and `opponentBoard` are 10x10 2D arrays of `CellState`. `myCommitHash` and `opponentCommitHash` are 64-character hex strings (SHA-256) or `null` before commitment. `mySalt` is a 32-byte random value or `null`. See `docs/02-ARCHITECTURE.md` Section 4 (State Management).

## Acceptance Criteria

- [ ] File exists at `app/src/types/game.ts`
- [ ] `npm run type-check` passes with no errors (the file compiles under strict mode)
- [ ] `CellState`, `GamePhase`, and `ShipType` are derived from `as const` objects using indexed access types — no `enum` keyword used
- [ ] `GameMessage` discriminated union is NOT in this file (it belongs in `protocol.ts`)
- [ ] All 8 exports are present: `CELL_STATES`, `CellState`, `GAME_PHASES`, `GamePhase`, `SHIP_TYPES`, `ShipType`, `Orientation`, `PlacedShip`, `Shot`, `BoardCommitment`, `GameState` (11 named exports total: 3 const objects + 8 types/interfaces)
- [ ] `Shot.sunk` is typed as `ShipType | null` (not optional `ShipType | undefined`)
- [ ] No runtime logic — file contains only `const` declarations and type/interface definitions

## Notes for the Agent

- **Do not use TypeScript `enum`.** The coding standards (`docs/03-CODING-STANDARDS.md` Section 2.1) explicitly forbid it. Use `as const` objects with `(typeof X)[keyof typeof X]` pattern.
- **Do not add index/barrel files.** Re-exports will be handled when consumers are built in later phases.
- **Do not add JSDoc comments unless they clarify non-obvious semantics.** The types are self-documenting. A brief comment on `BoardCommitment` explaining the sorting requirement is appropriate.
- **`GameState` uses `Uint8Array` for `mySalt`.** This is intentional — it stores raw bytes from `crypto.getRandomValues()`. The hex encoding happens at serialization time in the crypto composable (Phase 7).
- **The `winner` field uses `'me' | 'opponent'`**, not player IDs. This is a client-local perspective — each client knows itself as "me."
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not store the board as a string array. Use the typed `CellState[][]`.
