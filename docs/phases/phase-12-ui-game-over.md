# Phase 12: UI — Game Over & Reveal

## 1. Objective

Build the game over interface that shows the winner, reveals both boards, verifies the opponent's board against their cryptographic commitment, and offers a rematch option. Before this phase, the battle ends but there is no end-of-game UI. After this phase, the full game lifecycle is complete: players see who won, view the opponent's revealed board, receive a "Verified — Fair Game" or "Cheat Detected" badge, and can start a new game via rematch.

## 2. Prerequisites

- **Phase 2** must be complete: all types including `PlacedShip`, `ShipType`, `GamePhase`.
- **Phase 4** must be complete: `useGameStore` with `winner`, `cheatDetected`, `opponentShips`, `receiveReveal()`, `resetForRematch()`.
- **Phase 7** must be complete: `useCrypto.verifyBoard()` for hash verification.
- **Phase 8** must be complete: `useGameProtocol` with `sendReveal()`, `sendRematch()`, and incoming reveal/rematch handling.
- **Phase 10** must be complete: `GameView.vue` phase routing, `GridCell.vue`.
- **Phase 11** must be complete: battle flow triggers the REVEAL phase transition on game end.

Specific dependencies:
- `app/src/stores/game.ts` — `useGameStore` (winner, cheatDetected, opponentShips, mySalt, myShips, phase)
- `app/src/composables/useGameProtocol.ts` — `sendReveal()`, `sendRematch()`
- `app/src/composables/useCrypto.ts` — `verifyBoard()`
- `app/src/components/shared/GridCell.vue` — for rendering revealed boards

## 3. Scope

### In Scope

- `app/src/components/game/GameOver.vue`: The full game-over screen:
  - Winner announcement ("You Win!" / "You Lose!").
  - Opponent's full board reveal (all ship positions visible).
  - Verification badge: "Verified — Fair Game" or "Cheat Detected" based on hash and shot-result verification.
  - "Rematch" button to start a new game in the same room.
  - Waiting state for rematch ("Waiting for opponent to accept rematch...").
- Automatic reveal flow: when the game ends (battle → reveal), both clients send their board + salt. On receiving the opponent's reveal, verify the commitment hash and verify all shot results.
- Wire into `GameView.vue` for the `reveal` and `gameover` phases.

### Out of Scope

- Lobby navigation after game — Phase 9 already handles this (player can navigate away).
- Animations for reveal — Phase 13 (Nice to Have).
- Persistent game history — explicitly a non-goal (see `docs/01-PRD.md` Section 1.2).
- Spectator mode — explicitly a non-goal.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/components/game/GameOver.vue` | Create | Game over screen: winner, board reveal, verification, rematch |
| `app/src/views/GameView.vue` | Modify | Add gameover/reveal phase rendering |

## 5. Key Design Decisions

1. **Automatic reveal on game end:** When the battle phase ends (all ships sunk), both clients automatically transition to the REVEAL phase and send their `reveal` message containing their ship placements and salt hex. This is triggered by `useGameProtocol`, not by user action (see `docs/05-PROTOCOL-SPEC.md` Section 5).

2. **Two-stage verification:** First, verify the opponent's board commitment hash (re-hash their revealed ships + salt, compare to the hash received during COMMIT phase). Second, verify all shot results — for each shot the opponent defended, check that reported hits/misses match their revealed board (see `docs/05-PROTOCOL-SPEC.md` Section 7.2 and 7.3).

3. **Cheat detection is binary:** If either verification step fails, `cheatDetected` is set to `true` and a clear "Cheat Detected" warning is shown. There is no partial trust (see `docs/01-PRD.md` US-15).

4. **Opponent board display:** After reveal, the opponent's full board is shown with all ship positions. This allows the player to visually inspect the opponent's placement and confirm the game was fair (see `docs/01-PRD.md` US-08).

5. **Rematch protocol:** Both players must send `rematch` to start a new game. The UI shows a "Rematch" button. Once one player clicks it, they see "Waiting for opponent...". When both have sent `rematch`, the game resets to SETUP (see `docs/05-PROTOCOL-SPEC.md` Section 5 — GAMEOVER → SETUP transition).

6. **Refuse-to-reveal as forfeit:** If the opponent does not send a reveal message within a reasonable timeout, they forfeit, and the local client can display a warning. The exact timeout is implementation-defined but should be documented (see `docs/02-ARCHITECTURE.md` Section 5.1 — "Player refuses to reveal board → treated as forfeit").

## 6. Interfaces & Contracts

### `app/src/components/game/GameOver.vue`

```typescript
const props = defineProps<{
  winner: 'me' | 'opponent'
  cheatDetected: boolean
  myBoard: CellState[][]
  myShips: PlacedShip[]
  opponentBoard: CellState[][]
  opponentShips: PlacedShip[]     // empty until reveal received
  opponentRevealed: boolean       // true once reveal message received
  rematchRequested: boolean       // true if I've requested rematch
  opponentRematchRequested: boolean
}>()

const emit = defineEmits<{
  requestRematch: []
}>()
```

### Reveal & Verification Flow

```
Battle ends (all ships sunk)
  → gameStore.startReveal()     // phase → 'reveal'
  → useGameProtocol.sendReveal(myShips, mySaltHex)

Receive opponent reveal:
  → useCrypto.verifyBoard(opponentShips, opponentSaltHex, opponentCommitHash)
  → Verify shot results against revealed board (Protocol Spec 7.3)
  → gameStore.setCheatDetected(!valid)
  → gameStore.receiveReveal(ships, salt)
  → gameStore.finishGame(winner)  // phase → 'gameover'
```

### Rematch Flow

```
Player clicks "Rematch"
  → useGameProtocol.sendRematch()
  → UI shows "Waiting for opponent..."

Opponent also sends "rematch"
  → gameStore.resetForRematch()   // phase → 'setup', boards cleared
  → Both players see SetupPhase again
```

## 7. Acceptance Criteria

1. When the game ends, the reveal phase is entered automatically and both clients exchange board + salt.
2. After receiving the opponent's reveal, their full board is displayed showing all ship positions.
3. The verification badge shows "Verified — Fair Game" when the opponent's hash matches their revealed board and all shot results were honest.
4. The verification badge shows "Cheat Detected" when the opponent's hash does not match their revealed board.
5. The verification badge shows "Cheat Detected" when any shot result (hit/miss) does not match the opponent's revealed board.
6. The winner announcement correctly shows "You Win!" or "You Lose!" based on `gameStore.winner`.
7. The "Rematch" button is visible after the game ends.
8. Clicking "Rematch" sends a `rematch` message and shows "Waiting for opponent...".
9. When both players click "Rematch", the game resets to the SETUP phase with empty boards.
10. Two browsers can play a complete game from setup through game over, see both boards revealed, and start a rematch.
11. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **Complete game lifecycle** — after this phase, the full game is playable end-to-end.
- Phase 13 adds polish (animations, responsive tweaks, connection status widget) but does not modify core game-over logic.

### Boundaries

- Game-over verification logic (hash check + shot result check) should be finalized here. Phase 13 must NOT change verification logic.
- The rematch mechanism resets to SETUP — it does not create a new room or require re-navigation.
- Post-v1 features like game history, replay, or spectator mode are out of scope.
