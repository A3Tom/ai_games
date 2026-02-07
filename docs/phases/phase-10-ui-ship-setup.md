# Phase 10: UI — Ship Setup

## 1. Objective

Build the ship placement interface where players position their fleet on the 10×10 grid before battle. Before this phase, players can create/join rooms but see only a stub game view. After this phase, players can place all 5 ships via click-to-place with rotation, see real-time validation feedback, and click "Ready" to commit their board and exchange cryptographic hashes with their opponent.

## 2. Prerequisites

- **Phase 1** must be complete: Tailwind configured, `GameView` route exists.
- **Phase 2** must be complete: `CellState`, `ShipType`, `PlacedShip`, `Orientation`, `GamePhase` types; `FLEET_CONFIG` and `GRID_SIZE` constants.
- **Phase 3** must be complete: `canPlaceShip()`, `placeShip()`, `createEmptyBoard()`, `getShipCells()`.
- **Phase 4** must be complete: `useGameStore` with `placeShip()`, `removeShip()`, `commitBoard()` actions and `phase`, `myBoard`, `myShips` state.
- **Phase 7** must be complete: `useCrypto.commitBoard()` for hash generation.
- **Phase 8** must be complete: `useGameProtocol` with `sendReady()` and `sendCommit()`.
- **Phase 9** must be complete: lobby navigation delivers the player to `GameView` with a `roomId`.

Specific dependencies:
- `app/src/types/game.ts` — `CellState`, `PlacedShip`, `ShipType`, `Orientation`
- `app/src/constants/ships.ts` — `FLEET_CONFIG`
- `app/src/constants/grid.ts` — `GRID_SIZE`, `COLUMN_LABELS`, `ROW_LABELS`
- `app/src/utils/board.ts` — `canPlaceShip()`, `getShipCells()`
- `app/src/stores/game.ts` — `useGameStore`
- `app/src/composables/useGameProtocol.ts` — `sendCommit()`

## 3. Scope

### In Scope

- `app/src/views/GameView.vue`: Replace stub. Wire up `useGameProtocol`, conditionally render phase-specific components based on `gameStore.phase`.
- `app/src/components/game/SetupPhase.vue`: Ship placement grid and controls. Shown when `phase === 'setup'`.
- `app/src/components/game/ShipTray.vue`: Displays unplaced ships. Clicking a ship selects it for placement.
- `app/src/components/shared/GridCell.vue`: Reusable cell component for the 10×10 grid (used in setup, battle, and game over phases).
- Click-to-place interaction: select a ship from the tray, hover over the grid to preview placement, click to place. Tap/click to rotate between horizontal and vertical.
- Real-time validation: highlight valid positions in green, invalid positions in red during hover/preview.
- "Ready" button: enabled only when all 5 ships are placed. Commits the board (generates hash via `useCrypto`), sends the commit message, and transitions to the commit phase.
- Waiting state: after committing, show "Waiting for opponent..." until the opponent also commits.

### Out of Scope

- Drag-and-drop ship placement — this is "Should Have" (see `docs/01-PRD.md` US-16). Click-to-place is the primary interaction for Phase 10. Drag-and-drop can be added in Phase 13 or post-v1.
- Opponent board view — Phase 11.
- Battle mechanics — Phase 11.
- Game over / reveal — Phase 12.
- Animations — Phase 13 (Nice to Have).

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/views/GameView.vue` | Modify | Replace stub with phase-switching logic and protocol initialization |
| `app/src/components/game/SetupPhase.vue` | Create | Ship placement grid, placement interaction, validation, "Ready" button |
| `app/src/components/game/ShipTray.vue` | Create | Display of unplaced ships, ship selection for placement |
| `app/src/components/shared/GridCell.vue` | Create | Reusable grid cell with state-based styling |

## 5. Key Design Decisions

1. **Phase-conditional rendering in `GameView`:** `GameView` uses `gameStore.phase` to determine which component to show: `SetupPhase` (setup/commit), battle components (Phase 11), or `GameOver` (Phase 12). This keeps `GameView` as a thin orchestrator (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.2 — components under 200 lines).

2. **Click-to-place over drag-and-drop:** The primary placement interaction is click-based: select ship from tray → click grid cell → ship placed. Rotation toggles on tap/click or a dedicated button. This is simpler to implement and more accessible. Drag-and-drop (US-16, "Should Have") can be layered on later (see `docs/01-PRD.md` Section 3.4).

3. **Grid cell as reusable component:** `GridCell.vue` accepts cell state and coordinates as props and emits click events. It is reused in the setup grid, player board (Phase 11), and opponent board (Phase 11) (see `docs/02-ARCHITECTURE.md` Section 2.1 — `GridCell.vue` in shared components).

4. **Responsive grid sizing:** The board must be playable on a 375px viewport (iPhone SE). Use CSS Grid with relative units (`vmin`, `%`, `fr`), not fixed pixel sizes (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6, common mistakes table).

5. **Commit flow:** "Ready" button triggers: `useCrypto.commitBoard(ships)` → `gameStore.commitBoard(hash, salt)` → `useGameProtocol.sendCommit(ships)`. The store transitions to the `commit` phase. The UI shows a waiting state until the opponent also commits (see `docs/05-PROTOCOL-SPEC.md` Section 5).

6. **Ship removal:** Players can click a placed ship to remove it and re-place it before committing. Once committed, the board is locked.

## 6. Interfaces & Contracts

### `app/src/views/GameView.vue`

```typescript
const props = defineProps<{
  roomId: string
}>()

// Initializes useGameProtocol(roomId) on mount
// Renders phase-specific component based on gameStore.phase
```

### `app/src/components/game/SetupPhase.vue`

```typescript
const emit = defineEmits<{
  boardCommitted: []
}>()

// Internal state:
// - selectedShip: ShipType | null
// - currentOrientation: Orientation ('h' | 'v')
// - previewCells: Array<{ x: number; y: number; valid: boolean }>
```

### `app/src/components/game/ShipTray.vue`

```typescript
const props = defineProps<{
  ships: ShipConfig[]       // from FLEET_CONFIG
  placedShips: PlacedShip[] // already placed on board
}>()

const emit = defineEmits<{
  shipSelected: [shipType: ShipType]
}>()
```

### `app/src/components/shared/GridCell.vue`

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

## 7. Acceptance Criteria

1. When both players are in the room, the setup phase renders automatically (or transitions from lobby once `peer_count === 2`).
2. The ship tray shows all 5 ships from `FLEET_CONFIG` with their names and sizes.
3. Clicking a ship in the tray selects it for placement (visual indicator on the selected ship).
4. Hovering over the grid with a selected ship shows a preview of where the ship would be placed.
5. Valid placements are highlighted in green; invalid placements (out of bounds, overlapping) are highlighted in red.
6. Clicking a valid cell places the ship on the board and removes it from the tray.
7. Clicking/tapping a rotation button or using a keyboard shortcut toggles the ship orientation between horizontal and vertical.
8. Placed ships can be clicked on the board to remove them back to the tray.
9. The "Ready" button is disabled until all 5 ships are placed.
10. Clicking "Ready" commits the board, sends the hash to the opponent, and shows "Waiting for opponent...".
11. When both players have committed, the game transitions to the BATTLE phase.
12. The grid renders correctly on a 375px-wide viewport without horizontal scrolling.
13. `GridCell.vue` correctly reflects `CellState` visually (empty, ship, hit, miss, sunk).
14. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **`GameView.vue` phase router** — the phase-switching logic created here is extended in Phase 11 (battle components) and Phase 12 (game over component).
- **`GridCell.vue`** — reused by Phase 11 (`PlayerBoard.vue`, `OpponentBoard.vue`) and Phase 12 (`GameOver.vue`).
- **Committed board state** — `gameStore.myCommitHash` and `gameStore.mySalt` are set here, used by Phase 12 for the reveal.

### Boundaries

- `SetupPhase.vue` does NOT render the opponent's board or any battle UI — that belongs to Phase 11.
- `GameView.vue` is extended (not rewritten) in Phases 11 and 12 by adding new phase-conditional components.
- Drag-and-drop ship placement is NOT part of this phase — it can be added in Phase 13 or post-v1.
