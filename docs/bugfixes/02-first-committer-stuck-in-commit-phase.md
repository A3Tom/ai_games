# Bug 02: First Committer Stuck in COMMIT Phase

## Summary

When two players both click "Ready", only the player who clicked **last** transitions to the BATTLE phase. The player who clicked first remains stuck on "Waiting for opponent..." because `sendCommit()` does not check whether the opponent's commit hash has already been received.

## Severity

**Critical** — One player is always unable to play. The game is broken for the first player to commit.

## Reproduction

1. Open two browser tabs in the same room.
2. Both players place all 5 ships.
3. **Player A** clicks "Ready" first.
4. **Player B** clicks "Ready" second.
5. **Player B** enters the BATTLE phase and can play.
6. **Player A** remains stuck at "Waiting for opponent..." indefinitely.

The player who clicks "Ready" first is always the one who gets stuck.

## Root Cause

The mutual-readiness check (`myCommitHash !== null && opponentCommitHash !== null`) only exists in `handleCommit()` — the handler for **incoming** commit messages. It does not exist in `sendCommit()` — the function that handles the **outgoing** commit. This creates an ordering dependency where the transition only works for the player who receives the opponent's commit **after** their own.

### Detailed Trace

**Step 1 — Player A clicks Ready first:**

`sendCommit()` is called ([useGameProtocol.ts:359-364](app/src/composables/useGameProtocol.ts#L359-L364)):

```ts
async function sendCommit(ships: PlacedShip[]): Promise<void> {
  const result = await cryptoCommitBoard(ships)
  mySaltHex = result.saltHex
  gameStore.commitBoard(result.hash, result.salt)  // phase → COMMIT, myCommitHash set
  relay.send({ type: 'commit', hash: result.hash }) // sends hash to opponent
  // ← no check for opponentCommitHash here
}
```

Player A's state: `phase = 'commit'`, `myCommitHash = hash_A`, `opponentCommitHash = null`.

**Step 2 — Player B receives Player A's commit (Player B still in SETUP):**

`handleCommit()` is called ([useGameProtocol.ts:94-99](app/src/composables/useGameProtocol.ts#L94-L99)):

```ts
function handleCommit(message: CommitMessage): void {
  gameStore.receiveOpponentCommit(message.hash)  // stores hash_A
  if (gameStore.myCommitHash !== null && gameStore.opponentCommitHash !== null) {
    gameStore.startBattle()  // ← myCommitHash is null, check FAILS
  }
}
```

Player B's state: `phase = 'setup'`, `myCommitHash = null`, `opponentCommitHash = hash_A`.

The check fails because Player B has not committed yet — this is correct behavior at this point.

**Step 3 — Player B clicks Ready:**

`sendCommit()` is called for Player B:

```ts
gameStore.commitBoard(result.hash, result.salt)  // phase → COMMIT, myCommitHash set
relay.send({ type: 'commit', hash: result.hash }) // sends hash to Player A
// ← MISSING: no check for opponentCommitHash (which is already hash_A!)
```

Player B's state: `phase = 'commit'`, `myCommitHash = hash_B`, `opponentCommitHash = hash_A`.

**Both hashes are now present on Player B, but nobody calls `startBattle()`.**

**Step 4 — Player A receives Player B's commit:**

`handleCommit()` is called on Player A's side:

```ts
gameStore.receiveOpponentCommit(message.hash)  // stores hash_B
if (gameStore.myCommitHash !== null && gameStore.opponentCommitHash !== null) {
  gameStore.startBattle()  // ← BOTH non-null, check PASSES ✓
}
```

Player A transitions to BATTLE.

### Result

| Player | Receives opponent commit... | `startBattle()` called? | Outcome |
|--------|----------------------------|------------------------|---------|
| Player A (committed first) | After own commit (in `handleCommit`) | Yes | Enters BATTLE |
| Player B (committed second) | Before own commit (in `handleCommit`, then `sendCommit` has no check) | No | Stuck in COMMIT |

The asymmetry: `handleCommit()` checks for mutual readiness, but `sendCommit()` does not. The player who receives the opponent's commit **after** their own gets the check via `handleCommit`. The player who received it **before** their own never gets a second check.

## Affected Files

| File | Line(s) | Issue |
|------|---------|-------|
| [useGameProtocol.ts:359-364](app/src/composables/useGameProtocol.ts#L359-L364) | `sendCommit()` | Missing mutual-readiness check after `gameStore.commitBoard()` |
| [useGameProtocol.ts:94-99](app/src/composables/useGameProtocol.ts#L94-L99) | `handleCommit()` | Has the check, but only covers the "receive after own commit" case |

## Proposed Fix

Add the same mutual-readiness check to `sendCommit()`, immediately after `gameStore.commitBoard()`:

```ts
async function sendCommit(ships: PlacedShip[]): Promise<void> {
  const result = await cryptoCommitBoard(ships)
  mySaltHex = result.saltHex
  gameStore.commitBoard(result.hash, result.salt)
  relay.send({ type: 'commit', hash: result.hash })

  // If opponent's commit was already received, both are now ready → start battle
  if (gameStore.myCommitHash !== null && gameStore.opponentCommitHash !== null) {
    gameStore.startBattle()
  }
}
```

This is safe because:

- `gameStore.startBattle()` has its own guard: `if (phase.value !== GAME_PHASES.COMMIT) return` ([game.ts:111](app/src/stores/game.ts#L111)). If called twice (once in `sendCommit`, once in `handleCommit` due to a near-simultaneous commit), the second call is a no-op.
- The relay send happens before the check, so the opponent will receive the commit and trigger their own `handleCommit` → `startBattle()` path regardless.
- No new state or flags are introduced — the fix reuses the exact same check that already exists in `handleCommit`.
