# Phase 4: Stores

## 1. Objective

Implement the two Pinia stores that form the core state management layer: `useGameStore` for all game logic and state machine transitions, and `useConnectionStore` for WebSocket connection status and room metadata. Before this phase, types, constants, and utility functions exist but there is no reactive state. After this phase, a fully tested state machine governs game phase transitions, board management, shot processing, and turn handling — ready to be wired to the network layer and UI.

## 2. Prerequisites

- **Phase 1** must be complete: Pinia is installed and registered in `main.ts`.
- **Phase 2** must be complete: all types (`GameState`, `GamePhase`, `CellState`, `PlacedShip`, `Shot`, `ShipType`) and constants (`FLEET_CONFIG`, `GRID_SIZE`) are defined.
- **Phase 3** must be complete: utility functions (`createEmptyBoard`, `canPlaceShip`, `placeShip`, `isAllSunk`, `isValidPlacement`, `isValidShot`) are implemented and tested.

Specific dependencies:
- `app/src/types/game.ts` — all game types
- `app/src/types/protocol.ts` — message types (for action signatures)
- `app/src/constants/ships.ts` — `FLEET_CONFIG`
- `app/src/constants/grid.ts` — `GRID_SIZE`
- `app/src/utils/board.ts` — all board utility functions
- `app/src/utils/validation.ts` — validation functions

## 3. Scope

### In Scope

- `app/src/stores/game.ts`: Full game state, phase transitions (lobby → setup → commit → battle → reveal → gameover), board management, ship placement, shot processing, turn management, commit/reveal handling, winner detection, cheat detection, rematch reset.
- `app/src/stores/connection.ts`: WebSocket connection status, room ID, host flag, peer connection status, ping latency, reconnect attempt counter.
- Unit tests for both stores.

### Out of Scope

- WebSocket connection logic — Phase 6 (composable calls store actions to update state).
- Crypto (hashing, verification) — Phase 7 (composable calls store actions with hash/reveal data).
- Message sending/receiving — Phase 8 (game protocol composable bridges relay and stores).
- UI components that consume store state — Phases 9–12.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/stores/game.ts` | Create | Game state store: phase machine, board state, ship placement, shot processing, turn management, commit/reveal, winner/cheat detection |
| `app/src/stores/connection.ts` | Create | Connection state store: WebSocket status, room ID, host flag, peer presence, latency, reconnect tracking |
| `app/src/stores/game.test.ts` | Create | Unit tests for game store actions, getters, and phase transitions |
| `app/src/stores/connection.test.ts` | Create | Unit tests for connection store actions |

## 5. Key Design Decisions

1. **Composition API store syntax:** Stores must use the `defineStore('name', () => { ... })` pattern with `ref`, `computed`, and plain functions — not the Options API store syntax (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.3 template, `docs/03-CODING-STANDARDS.md` Section 4.1).

2. **Stores own state; components read via `storeToRefs`:** Components must never mutate store state directly. All mutations go through actions (see `docs/03-CODING-STANDARDS.md` Section 4.1).

3. **Cross-store communication via actions:** If `useGameStore` needs connection info, it imports `useConnectionStore` inside its actions — not at module level — to avoid circular dependencies (see `docs/03-CODING-STANDARDS.md` Section 4.2).

4. **No derived data in state:** Anything computable from existing state (e.g., `remainingShips`, `isGameOver`) must be a getter, not stored state (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.3).

5. **Phase transition guards:** Actions that trigger phase transitions (e.g., `commitBoard`, `fireShot`) must validate that the current phase allows the operation. Invalid-phase calls should be no-ops or throw.

6. **Player A (host) goes first:** The host (room creator) takes the first turn. `isMyTurn` is initialized based on `connectionStore.isHost` when transitioning to the BATTLE phase (see `docs/05-PROTOCOL-SPEC.md` Section 6).

7. **In-memory only:** Game state lives only in Pinia's in-memory store. No `localStorage` persistence — state resets on page refresh, which is correct behavior (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 4, common mistakes table).

## 6. Interfaces & Contracts

### `app/src/stores/game.ts`

```typescript
import { defineStore } from 'pinia'

export const useGameStore = defineStore('game', () => {
  // === State ===
  const phase: Ref<GamePhase>
  const myBoard: Ref<CellState[][]>
  const opponentBoard: Ref<CellState[][]>
  const myShips: Ref<PlacedShip[]>
  const opponentShips: Ref<PlacedShip[]>
  const isMyTurn: Ref<boolean>
  const myCommitHash: Ref<string | null>
  const opponentCommitHash: Ref<string | null>
  const mySalt: Ref<Uint8Array | null>
  const winner: Ref<'me' | 'opponent' | null>
  const cheatDetected: Ref<boolean>
  const shotHistory: Ref<Shot[]>

  // === Getters ===
  const isGameOver: ComputedRef<boolean>
  const remainingShips: ComputedRef<{ me: number; opponent: number }>
  const canFire: ComputedRef<boolean>  // phase === 'battle' && isMyTurn

  // === Actions ===
  function startSetup(): void           // lobby → setup
  function placeShip(ship: PlacedShip): boolean  // returns false if invalid
  function removeShip(type: ShipType): void
  function commitBoard(hash: string, salt: Uint8Array): void  // setup → commit
  function receiveOpponentCommit(hash: string): void
  function startBattle(): void          // commit → battle (when both committed)
  function fireShot(x: number, y: number): void
  function receiveShot(x: number, y: number): { hit: boolean; sunk: ShipType | null }
  function receiveResult(x: number, y: number, hit: boolean, sunk: ShipType | null): void
  function startReveal(): void          // battle → reveal (when game won/lost)
  function receiveReveal(ships: PlacedShip[], salt: string): void
  function setCheatDetected(detected: boolean): void
  function finishGame(winner: 'me' | 'opponent'): void  // reveal → gameover
  function resetForRematch(): void      // gameover → setup

  return {
    // state
    phase, myBoard, opponentBoard, myShips, opponentShips,
    isMyTurn, myCommitHash, opponentCommitHash, mySalt,
    winner, cheatDetected, shotHistory,
    // getters
    isGameOver, remainingShips, canFire,
    // actions
    startSetup, placeShip, removeShip, commitBoard,
    receiveOpponentCommit, startBattle, fireShot,
    receiveShot, receiveResult, startReveal,
    receiveReveal, setCheatDetected, finishGame, resetForRematch,
  }
})
```

### `app/src/stores/connection.ts`

```typescript
import { defineStore } from 'pinia'

export const useConnectionStore = defineStore('connection', () => {
  // === State ===
  const status: Ref<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>
  const roomId: Ref<string | null>
  const isHost: Ref<boolean>
  const peerConnected: Ref<boolean>
  const lastPingMs: Ref<number | null>
  const reconnectAttempts: Ref<number>

  // === Getters ===
  const isConnected: ComputedRef<boolean>  // status === 'connected'
  const isReconnecting: ComputedRef<boolean>

  // === Actions ===
  function setConnecting(roomId: string, isHost: boolean): void
  function setConnected(): void
  function setReconnecting(): void
  function setDisconnected(): void
  function setPeerConnected(connected: boolean): void
  function updatePing(ms: number): void
  function incrementReconnectAttempts(): number  // returns new count
  function resetReconnectAttempts(): void
  function reset(): void

  return {
    status, roomId, isHost, peerConnected, lastPingMs, reconnectAttempts,
    isConnected, isReconnecting,
    setConnecting, setConnected, setReconnecting, setDisconnected,
    setPeerConnected, updatePing,
    incrementReconnectAttempts, resetReconnectAttempts, reset,
  }
})
```

## 7. Acceptance Criteria

1. Running `npm run test` passes all store tests with zero failures.
2. `useGameStore` initializes with `phase === 'lobby'` and empty boards.
3. Calling `startSetup()` transitions `phase` from `'lobby'` to `'setup'`.
4. Calling `placeShip()` with a valid ship adds it to `myShips` and updates `myBoard`. Returns `true`.
5. Calling `placeShip()` with an overlapping ship returns `false` and does not modify state.
6. Calling `commitBoard()` transitions `phase` from `'setup'` to `'commit'` and stores the hash and salt.
7. When both `myCommitHash` and `opponentCommitHash` are set, calling `startBattle()` transitions to `'battle'`.
8. `isMyTurn` is `true` for the host and `false` for the joiner when battle begins.
9. Calling `fireShot()` adds a shot to `shotHistory` and toggles `isMyTurn` after receiving a result.
10. `receiveShot()` looks up the cell on `myBoard` and returns `{ hit, sunk }` correctly.
11. `isGameOver` getter returns `true` when all ships of either player are sunk.
12. `resetForRematch()` resets all game state back to the setup phase while preserving connection state.
13. `useConnectionStore` initializes with `status === 'disconnected'` and `roomId === null`.
14. Connection store status transitions follow: `disconnected → connecting → connected` and `connected → reconnecting → connected`.
15. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **`useGameStore`** consumed by Phase 8 (game protocol composable dispatches to store actions), Phase 10 (ship setup UI reads/writes ships), Phase 11 (battle UI reads boards and turn state), Phase 12 (game over UI reads winner and cheat detection).
- **`useConnectionStore`** consumed by Phase 6 (connection composable updates status), Phase 8 (protocol composable checks connection), Phase 9 (lobby UI reads peer status), Phase 13 (ConnectionStatus component reads status).

### Boundaries

- Future phases must NOT add game logic outside of `useGameStore`. The store is the single source of truth for game state transitions.
- Components (Phases 9–12) must use `storeToRefs()` for reactive reads and call store actions for mutations — never mutate state directly.
- The connection composable (Phase 6) calls `useConnectionStore` actions to update status — it does not own connection state itself.
