# Bug 01: Commit Hash Never Sent to Opponent

## Summary

After both players place their ships and click "Ready", each client transitions locally to the COMMIT phase and displays "Waiting for opponent..." — but the game never progresses to BATTLE. Both players remain stuck indefinitely because the board commitment hash is never sent over the relay to the opponent.

## Severity

**Critical** — The game is completely unplayable. No workaround exists for users.

## Reproduction

1. Open two browser tabs, create a room, and have both join.
2. Both players place all 5 ships and click "Ready".
3. Both players see "Waiting for opponent..." indefinitely.
4. The game never transitions to the BATTLE phase.

## Root Cause

There is a broken handoff between `SetupPhase.vue` and `GameView.vue` for sending the commit message over the relay.

### The flow that executes today

1. Player clicks "Ready" in `SetupPhase.vue` ([SetupPhase.vue:97-109](app/src/components/game/SetupPhase.vue#L97-L109)):
   - `cryptoCommitBoard(myShips)` generates the SHA-256 hash and salt.
   - `gameStore.commitBoard(hash, salt)` stores the hash/salt and transitions `phase` from `setup` to `commit` ([game.ts:94-99](app/src/stores/game.ts#L94-L99)).
   - `emit('boardCommitted')` fires to the parent `GameView`.

2. `GameView.vue` receives the event ([GameView.vue:53-55](app/src/views/GameView.vue#L53-L55)):
   ```ts
   function handleBoardCommitted(): void {
     // Store has already transitioned to COMMIT phase; handler exists for future use
   }
   ```
   **This is a no-op.** No relay message is sent.

3. The opponent's `handleCommit` handler ([useGameProtocol.ts:94-99](app/src/composables/useGameProtocol.ts#L94-L99)) — which would store the opponent's hash and trigger `startBattle()` — is never invoked because no `commit` message ever arrives over the WebSocket.

### Why the no-op exists

A TODO comment in `SetupPhase.vue` ([lines 103-104](app/src/components/game/SetupPhase.vue#L103-L104)) explains the conflict:

```ts
// TODO: TICKET CONFLICT — useGameProtocol requires (options: UseGameProtocolOptions) and cannot
// be called from SetupPhase. The commit hash relay send is handled by GameView via protocol.
```

The intent was for `GameView` to handle sending the commit via the protocol, but the `handleBoardCommitted` handler was left as a stub.

### Duplication issue

`useGameProtocol.sendCommit()` ([useGameProtocol.ts:359-364](app/src/composables/useGameProtocol.ts#L359-L364)) performs both the crypto **and** the store update **and** the relay send:

```ts
async function sendCommit(ships: PlacedShip[]): Promise<void> {
  const result = await cryptoCommitBoard(ships)
  mySaltHex = result.saltHex
  gameStore.commitBoard(result.hash, result.salt)
  relay.send({ type: 'commit', hash: result.hash })
}
```

But `SetupPhase.handleReady()` already performs its own crypto and store update before emitting `boardCommitted`. This means `sendCommit()` cannot simply be called from `handleBoardCommitted` without double-executing the crypto and store transition (the store guard `if (phase.value !== GAME_PHASES.SETUP) return` would silently reject the second `commitBoard` call since the phase is already `commit`).

### Secondary issue: `mySaltHex` not set

Even if the relay message were sent, the protocol's internal `mySaltHex` variable ([useGameProtocol.ts:80](app/src/composables/useGameProtocol.ts#L80)) is never populated when `SetupPhase` handles the crypto directly. This variable is needed later by `sendReveal()` ([useGameProtocol.ts:380-382](app/src/composables/useGameProtocol.ts#L380-L382)) to send the salt to the opponent during the REVEAL phase. If the commit were sent without going through `sendCommit()`, the reveal phase would send an empty salt string, causing cheat detection to falsely trigger.

### Protocol spec violation

Per `05-PROTOCOL-SPEC.md` Section 5:

```
SETUP → COMMIT:  Both send "ready"
COMMIT → BATTLE: Both send "commit" and receive opponent's commit
```

The current implementation sends neither a `ready` nor a `commit` message over the relay. The `sendReady()` function exists in the protocol ([useGameProtocol.ts:354-357](app/src/composables/useGameProtocol.ts#L354-L357)) but is never called from any component.

## Affected Components

| File | Role in Bug |
|------|------------|
| `components/game/SetupPhase.vue` | Performs crypto + store update locally, emits event, but never sends relay message |
| `views/GameView.vue` | Receives `boardCommitted` event but handler is a no-op |
| `composables/useGameProtocol.ts` | Has `sendCommit()` and `sendReady()` but neither is ever called during setup |
| `stores/game.ts` | Store transitions work correctly in isolation; not at fault |

## Proposed Fix

Consolidate the commit responsibility into `useGameProtocol.sendCommit()` — the single function designed to own the entire commit flow (crypto, store, relay). Remove the duplicate crypto/store logic from `SetupPhase`.

### Changes

**1. `SetupPhase.vue` — Remove crypto and store logic from `handleReady`**

Stop performing the crypto commitment and store transition in the component. Instead, just emit an event with the ships to signal that the player is ready to commit.

```ts
// Update the emit signature to pass ships
const emit = defineEmits<{
  boardCommitted: [ships: PlacedShip[]]
}>()

async function handleReady(): Promise<void> {
  if (!allShipsPlaced.value || isCommitting.value) return
  isCommitting.value = true
  try {
    emit('boardCommitted', myShips.value)
  } finally {
    isCommitting.value = false
  }
}
```

Since the crypto is async and the UI needs a loading state, an alternative is to keep the `isCommitting` flag but move the async work to `GameView`. The simplest approach: emit the ships and let the parent handle everything.

**2. `GameView.vue` — Call `protocol.sendCommit()` in the handler**

```ts
async function handleBoardCommitted(ships: PlacedShip[]): Promise<void> {
  await protocol.sendCommit(ships)
}
```

Update the template to pass the ships:
```html
<SetupPhase @board-committed="handleBoardCommitted" />
```

This calls `sendCommit()` which:
- Computes the crypto hash and salt
- Stores them via `gameStore.commitBoard()`
- Sets `mySaltHex` for later use in the reveal phase
- Sends `{ type: 'commit', hash }` over the relay

**3. `SetupPhase.vue` — Remove `useCrypto` import and direct crypto usage**

The `useCrypto` import and `cryptoCommitBoard` call can be removed from `SetupPhase` since the protocol composable handles it.

### Result

After the fix, the flow becomes:

1. Player clicks "Ready" in `SetupPhase` -> emits `boardCommitted` with ships.
2. `GameView.handleBoardCommitted(ships)` calls `protocol.sendCommit(ships)`.
3. `sendCommit` performs crypto, updates store (phase -> `commit`), sets `mySaltHex`, and sends `{ type: 'commit', hash }` over the relay.
4. Opponent's `handleCommit` receives the hash, stores it, checks if both commits exist, and calls `gameStore.startBattle()` to transition to BATTLE.
5. Both players enter the battle phase.

This aligns with the protocol spec, eliminates the duplicate crypto/store logic, and ensures `mySaltHex` is correctly set for the reveal phase.
