# Phase 04 — Ticket 006: Reveal and Endgame Actions

## Summary

Add the final 5 actions to `useGameStore`: `startReveal()`, `receiveReveal()`, `setCheatDetected()`, `finishGame()`, and `resetForRematch()`. These actions manage the post-battle lifecycle: transitioning from BATTLE to REVEAL when all ships of one player are sunk, processing the opponent's revealed board for anti-cheat verification, recording cheat detection results, crowning a winner, and resetting state for a rematch. When done, the complete game store is finished with all 13 actions, all phase transitions are implemented, and the full game lifecycle can be tested end-to-end.

## Prerequisites

- **Ticket 005 complete.** Battle actions exist — needed for testing the transition from battle to reveal and for complete game flow tests.
  - `app/src/stores/game.ts` — the game store to modify
  - `app/src/stores/game.test.ts` — the test file to extend

## Scope

**In scope:**

- `startReveal(): void` action
- `receiveReveal(ships: PlacedShip[], salt: string): void` action
- `setCheatDetected(detected: boolean): void` action
- `finishGame(winner: 'me' | 'opponent'): void` action
- `resetForRematch(): void` action
- Adding all 5 actions to the store's return object
- Unit tests for all 5 actions

**Out of scope:**

- Actually computing or verifying hashes — Phase 7 (`useCrypto` composable). The store receives pre-verified data.
- Cross-checking shot history against revealed board — Phase 7 or Phase 12 (game over UI). The store just stores the revealed data.
- Rematch protocol messages — Phase 8
- Game over UI rendering — Phase 12
- Opponent board rendering post-reveal — Phase 12

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/game.ts` | Modify | Add `startReveal()`, `receiveReveal()`, `setCheatDetected()`, `finishGame()`, `resetForRematch()` actions |
| `app/src/stores/game.test.ts` | Modify | Add tests for reveal and endgame actions |

## Requirements

### Imports

No new imports should be needed — all required types and utilities are already imported from prior tickets.

### Actions

#### `startReveal(): void`

Transitions from BATTLE to REVEAL phase. Called when all ships of either player have been sunk and it's time to exchange board reveals.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.BATTLE`. If not in battle phase, do nothing.
- Sets `phase.value = GAME_PHASES.REVEAL`.

This is a simple transition. The game protocol composable (Phase 8) determines when to call this based on the game state (e.g., after detecting all ships sunk via the `remainingShips` getter or `isAllSunk` utility).

#### `receiveReveal(ships: PlacedShip[], salt: string): void`

Stores the opponent's revealed board data for anti-cheat verification.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.REVEAL`. If not in reveal phase, do nothing.
- Sets `opponentShips.value = ships`. This stores the full ship placement array as revealed by the opponent.
- The `salt` parameter is a 64-character hex string (the opponent's salt used in their commitment). The store does not verify the commitment — that is the crypto composable's responsibility (Phase 7). However, the salt must be available for verification. Store it in a way that's accessible: since the phase overview does not define an `opponentSalt` state ref, the salt should be passed to the verification logic directly by the caller (the game protocol composable). **Do not add a new state ref for this.** The store's job is to store the `opponentShips` for display purposes.

Note: If the caller needs the salt for verification, it will hold onto it outside the store. The store action only stores `ships`.

#### `setCheatDetected(detected: boolean): void`

Records whether the anti-cheat verification detected cheating.

- Sets `cheatDetected.value = detected`.
- **No phase guard.** This can be called during REVEAL or GAMEOVER phase as the verification may complete asynchronously.

#### `finishGame(winner: 'me' | 'opponent'): void`

Transitions to GAMEOVER and records the winner.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.REVEAL` or `phase.value === GAME_PHASES.BATTLE`. The transition from BATTLE is allowed as a fallback (e.g., if the opponent disconnects during battle, the local player wins). The normal flow is REVEAL → GAMEOVER.
- Sets `winner.value = winner`.
- Sets `phase.value = GAME_PHASES.GAMEOVER`.

#### `resetForRematch(): void`

Resets all game state to prepare for a new game, transitioning to SETUP phase. Connection state (in `useConnectionStore`) is NOT affected — both players remain connected.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.GAMEOVER`. If not in gameover phase, do nothing.
- Reset all game state to initial values:
  - `phase.value = GAME_PHASES.SETUP` (go directly to setup, not lobby — both players are already in the room)
  - `myBoard.value = createEmptyBoard()`
  - `opponentBoard.value = createEmptyBoard()`
  - `myShips.value = []`
  - `opponentShips.value = []`
  - `isMyTurn.value = false`
  - `myCommitHash.value = null`
  - `opponentCommitHash.value = null`
  - `mySalt.value = null`
  - `winner.value = null`
  - `cheatDetected.value = false`
  - `shotHistory.value = []`

Note: The reset goes to SETUP, not LOBBY. In a rematch, both players are already in the room and connected, so they skip the lobby and go straight to ship placement.

### Updated Return Object

Add all 5 actions to the return object. After this ticket, the store exports all 27 members specified in the phase overview:

```typescript
return {
  // state (11)
  phase, myBoard, opponentBoard, myShips, opponentShips,
  isMyTurn, myCommitHash, opponentCommitHash, mySalt,
  winner, cheatDetected, shotHistory,
  // getters (3)
  isGameOver, remainingShips, canFire,
  // actions (13)
  startSetup, placeShip, removeShip, commitBoard,
  receiveOpponentCommit, startBattle, fireShot,
  receiveShot, receiveResult, startReveal,
  receiveReveal, setCheatDetected, finishGame, resetForRematch,
}
```

### Test Requirements

Tests need the full game flow. Reuse or extend the `setupBattlePhase` helper from ticket 005.

Required test cases (minimum):

1. **`startReveal()` transitions battle → reveal:** Set up battle phase, call `startReveal()`. Verify `phase === 'reveal'`.
2. **`startReveal()` is a no-op outside battle phase:** Verify no change when called in setup or commit phase.
3. **`receiveReveal()` stores opponent ships:** Transition to reveal phase. Call `receiveReveal()` with a valid ship array and salt string. Verify `opponentShips` matches the provided array.
4. **`receiveReveal()` is a no-op outside reveal phase:** Verify `opponentShips` is not modified when called in battle phase.
5. **`setCheatDetected()` sets the flag:** Call `setCheatDetected(true)`. Verify `cheatDetected === true`.
6. **`finishGame()` transitions to gameover with winner:** Transition to reveal, call `finishGame('me')`. Verify `phase === 'gameover'` and `winner === 'me'`.
7. **`finishGame()` also works from battle phase:** Set up battle phase, call `finishGame('opponent')`. Verify `phase === 'gameover'` and `winner === 'opponent'`.
8. **`isGameOver` returns true after `finishGame()`:** Verify `isGameOver === true` after `finishGame()`.
9. **`resetForRematch()` resets all game state to setup:** Run through a complete game flow (setup → commit → battle → reveal → gameover), call `resetForRematch()`. Verify: `phase === 'setup'`, `myBoard` is empty, `opponentBoard` is empty, `myShips` is empty, `opponentShips` is empty, `isMyTurn === false`, `myCommitHash === null`, `opponentCommitHash === null`, `mySalt === null`, `winner === null`, `cheatDetected === false`, `shotHistory` is empty.
10. **`resetForRematch()` is a no-op outside gameover phase:** Verify state is unchanged when called during battle.
11. **Full game lifecycle test:** Run through the complete cycle: lobby → setup → place ships → commit → battle → exchange shots → reveal → gameover → rematch → setup. Verify phase at each transition. This is an integration test that exercises all actions together.

## Acceptance Criteria

- [ ] All 5 actions (`startReveal`, `receiveReveal`, `setCheatDetected`, `finishGame`, `resetForRematch`) are exported from `useGameStore`
- [ ] `npm run type-check` passes with no errors
- [ ] `resetForRematch()` resets all 11 state fields and transitions to `'setup'` (not `'lobby'`)
- [ ] `isGameOver` getter returns `true` after `finishGame()` is called
- [ ] `finishGame()` stores the winner correctly
- [ ] The complete game store exports exactly 27 members (11 state + 3 getters + 13 actions)
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **`resetForRematch()` goes to SETUP, not LOBBY.** This is intentional — in a rematch scenario, both players are already connected and in the room. They skip the lobby and go directly to ship placement. See the phase overview Section 5, decision 6.
- **Do not implement hash verification.** The store's `receiveReveal()` just stores data. The crypto composable (Phase 7) handles recomputing the hash from the revealed ships + salt and comparing against `opponentCommitHash`. The game protocol composable (Phase 8) orchestrates the verification and calls `setCheatDetected()` with the result.
- **The `salt` parameter in `receiveReveal()` is NOT stored in the game store.** The phase overview does not include an `opponentSalt` state ref. The caller (game protocol composable) holds the salt and passes it to the crypto composable for verification. The store only stores `opponentShips` for display on the game over screen.
- **`finishGame()` allows transition from BATTLE.** This handles the edge case where the game ends abnormally (e.g., opponent disconnects). The normal flow is BATTLE → REVEAL → GAMEOVER, but BATTLE → GAMEOVER is also valid.
- **Full lifecycle test:** This is a longer integration test that exercises all 13 actions in sequence. It's valuable for catching interaction bugs between actions. Set up the connection store, run through every phase transition, and verify the state at each step.
- **After this ticket, the game store is complete.** Verify that the return object has exactly 27 members by counting in the source code. Future phases will consume this store but should NOT add new state or actions to it.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not add `localStorage` persistence for game state. State resets on page refresh by design.
