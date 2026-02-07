# Phase 04 — Ticket 004: Commit Phase Actions

## Summary

Add the `commitBoard()`, `receiveOpponentCommit()`, and `startBattle()` actions to `useGameStore`. These actions manage the transition from SETUP through COMMIT to BATTLE phase: the local player commits their board (setup → commit), the opponent's commit hash is received, and when both players have committed, the battle begins. `startBattle()` determines turn order based on host status from the connection store. When done, the agent should have the complete commit-phase flow tested and working.

## Prerequisites

- **Ticket 001 complete.** `useConnectionStore` exists — needed by `startBattle()` to determine host status for turn order.
  - `app/src/stores/connection.ts` — exports `useConnectionStore` with `isHost` state
- **Ticket 002 complete.** `useGameStore` exists with all state refs, getters, and `startSetup()`.
  - `app/src/stores/game.ts` — the game store to modify

Note: This ticket does NOT depend on ticket 003 (ship placement). The commit phase actions operate on `myCommitHash`, `opponentCommitHash`, and `mySalt` — not on ship placement. However, in a real game flow, ships would be placed before committing. For testing, the agent can either depend on ticket 003 or set state directly.

## Scope

**In scope:**

- `commitBoard(hash: string, salt: Uint8Array): void` action
- `receiveOpponentCommit(hash: string): void` action
- `startBattle(): void` action
- Adding all 3 actions to the store's return object
- Unit tests for all 3 actions, including cross-store interaction with `useConnectionStore`

**Out of scope:**

- Actually computing the hash (SHA-256) — Phase 7 (`useCrypto` composable). This action receives a pre-computed hash.
- Generating the salt — Phase 7. This action receives a pre-generated salt.
- Ship placement validation before commit — the caller (game protocol composable, Phase 8) is responsible for ensuring all ships are placed before calling `commitBoard`.
- Battle actions (`fireShot`, `receiveShot`, `receiveResult`) — ticket 005
- Sending/receiving WebSocket messages — Phase 8

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/game.ts` | Modify | Add `commitBoard()`, `receiveOpponentCommit()`, `startBattle()` actions |
| `app/src/stores/game.test.ts` | Modify | Add tests for commit phase actions |

## Requirements

### Imports

Ensure the following are imported in `game.ts` (add only what's new):

```typescript
import { useConnectionStore } from './connection'
```

**Critical:** Import `useConnectionStore` **inside the `startBattle` function body**, not at the module level and not at the store definition level. This is the cross-store communication pattern from `docs/03-CODING-STANDARDS.md` Section 4.2 — importing inside actions prevents circular dependency issues.

### Actions

#### `commitBoard(hash: string, salt: Uint8Array): void`

Stores the local player's board commitment and transitions from SETUP to COMMIT.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.SETUP`. If not in setup phase, do nothing.
- Sets `myCommitHash.value = hash`.
- Sets `mySalt.value = salt`.
- Sets `phase.value = GAME_PHASES.COMMIT`.

The `hash` is a 64-character hex string (SHA-256 of the canonical board representation + salt). The `salt` is a `Uint8Array` of 32 bytes from `crypto.getRandomValues()`. Neither value is validated here — the crypto composable (Phase 7) is responsible for generating correct values.

#### `receiveOpponentCommit(hash: string): void`

Stores the opponent's board commitment hash.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.SETUP` or `phase.value === GAME_PHASES.COMMIT`. The opponent may commit before or after the local player.
- Sets `opponentCommitHash.value = hash`.
- If the local player has already committed (`myCommitHash.value !== null`) and now the opponent has also committed, **do NOT auto-transition to battle**. The transition to battle is handled by an explicit `startBattle()` call from the game protocol composable (Phase 8) after both commits are confirmed.

#### `startBattle(): void`

Transitions from COMMIT to BATTLE phase and sets initial turn order.

- **Phase guard:** Only execute if `phase.value === GAME_PHASES.COMMIT`. If not in commit phase, do nothing.
- **Both commits required:** Only execute if both `myCommitHash.value !== null` and `opponentCommitHash.value !== null`. If either is missing, do nothing.
- **Turn order:** Import `useConnectionStore` inside this function body. Read `connectionStore.isHost`. If the local player is the host (Player A), set `isMyTurn.value = true`. If the local player is the joiner (Player B), set `isMyTurn.value = false`. Per `docs/05-PROTOCOL-SPEC.md` Section 6: "Host (Player A) goes first."
- Sets `phase.value = GAME_PHASES.BATTLE`.

```typescript
function startBattle(): void {
  if (phase.value !== GAME_PHASES.COMMIT) return
  if (myCommitHash.value === null || opponentCommitHash.value === null) return

  const connectionStore = useConnectionStore()
  isMyTurn.value = connectionStore.isHost

  phase.value = GAME_PHASES.BATTLE
}
```

### Updated Return Object

Add all 3 actions to the return object:

```typescript
return {
  // ... existing state, getters, actions from tickets 002–003 ...
  commitBoard,
  receiveOpponentCommit,
  startBattle,
}
```

### Test Requirements

Tests need both stores, so `setActivePinia(createPinia())` will initialize both.

```typescript
import { useConnectionStore } from './connection'
```

Required test cases (minimum):

1. **`commitBoard()` stores hash and salt:** Call `startSetup()`, then `commitBoard('abc123...', salt)`. Verify `myCommitHash === 'abc123...'`, `mySalt` matches the provided salt, and `phase === 'commit'`.
2. **`commitBoard()` transitions setup → commit:** Verify phase change.
3. **`commitBoard()` is a no-op outside setup phase:** Verify no state change when called in lobby phase.
4. **`receiveOpponentCommit()` stores opponent hash:** Call `startSetup()`, then `receiveOpponentCommit('def456...')`. Verify `opponentCommitHash === 'def456...'`.
5. **`receiveOpponentCommit()` works in both setup and commit phases:** Set phase to `'commit'`, call `receiveOpponentCommit()`, verify it stores the hash.
6. **`startBattle()` transitions commit → battle with host going first:** Set up connection store with `isHost = true`. Call `startSetup()`, `commitBoard(hash, salt)`, `receiveOpponentCommit(hash2)`, `startBattle()`. Verify `phase === 'battle'` and `isMyTurn === true`.
7. **`startBattle()` sets joiner's turn to false:** Set up connection store with `isHost = false`. Follow the same flow. Verify `isMyTurn === false`.
8. **`startBattle()` is a no-op without both commits:** Call `startSetup()`, `commitBoard(hash, salt)` (but NOT `receiveOpponentCommit`), then `startBattle()`. Verify phase is still `'commit'`.

For tests that need the connection store's `isHost` to be set, call `connectionStore.setConnecting('test-room', true)` (or `false` for joiner) before the game store operations.

## Acceptance Criteria

- [ ] `commitBoard()`, `receiveOpponentCommit()`, and `startBattle()` are exported from `useGameStore`
- [ ] `npm run type-check` passes with no errors
- [ ] `commitBoard()` transitions from `'setup'` to `'commit'` and stores hash and salt
- [ ] `receiveOpponentCommit()` stores the opponent's commit hash
- [ ] When both commits are set, `startBattle()` transitions to `'battle'`
- [ ] `isMyTurn` is `true` for host and `false` for joiner at battle start
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Cross-store import pattern:** Import `useConnectionStore` inside the `startBattle()` function body, NOT at the top of the file or inside the `defineStore` callback. This is the pattern from `docs/03-CODING-STANDARDS.md` Section 4.2:
  ```typescript
  function startBattle(): void {
    const connectionStore = useConnectionStore()
    // ...
  }
  ```
  Importing at the module level can cause circular dependency issues when stores reference each other.
- **Do not auto-transition to battle.** When `receiveOpponentCommit()` is called and both hashes exist, do NOT automatically call `startBattle()`. The game protocol composable (Phase 8) orchestrates this transition. `receiveOpponentCommit` only stores data.
- **Salt is a `Uint8Array`, not a string.** The `mySalt` state ref holds raw bytes. Hex encoding happens in the crypto composable (Phase 7). In tests, create a salt with `new Uint8Array(32)` or `new Uint8Array([1, 2, 3, ...])`.
- **The hash is not validated here.** The store trusts that the caller provides a valid 64-character hex SHA-256 hash. Validation belongs in the crypto composable.
- **Test setup for connection store:** In tests that check host/joiner behavior, you need to set up the connection store's `isHost` before calling `startBattle()`. Use `connectionStore.setConnecting('room-id', true)` to set isHost to true, or `connectionStore.setConnecting('room-id', false)` for joiner.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not implement crypto or hash computation in the store. The store receives pre-computed values.
