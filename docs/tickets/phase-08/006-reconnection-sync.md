# Phase 08 — Ticket 006: Reconnection Sync Protocol

## Summary

Replace the stub `handleSyncRequest` and `handleSyncResponse` handlers in `useGameProtocol` with real implementations that enable game state recovery after a WebSocket reconnection. When the opponent sends a `sync_request`, the composable responds with a `sync_response` containing the current game phase, turn number, and shot history. When a `sync_response` is received (after the local player reconnects), the composable reconciles the local state with the received state. This ticket also adds an internal `sendSyncRequest()` function triggered after reconnection. When done, two clients can recover from brief disconnections and resume the game.

## Prerequisites

- **Ticket 003 complete.** The incoming message dispatch infrastructure exists. The `handleSyncRequest` and `handleSyncResponse` stubs are the targets for replacement.
  - `app/src/composables/useGameProtocol.ts` — composable with dispatch logic.
  - `app/src/composables/useGameProtocol.test.ts` — the test file to extend.

## Scope

**In scope:**

- `handleSyncRequest(message: SyncRequestMessage)` — build a `SyncResponseMessage` from current game state and send it
- `handleSyncResponse(message: SyncResponseMessage)` — reconcile local state with the received state
- Internal `sendSyncRequest()` function — sends `{ type: 'sync_request' }`
- Reconnection trigger: when `connectionStore.peerConnected` changes to `true` after a reconnection, send a `sync_request`
- Unit tests for sync request/response handling and state reconciliation

**Out of scope:**

- WebSocket reconnection logic (exponential backoff) — Phase 6 (`useRelay`)
- Connection state management — Phase 4 (`useConnectionStore`)
- Battle message handling — ticket 004
- Reveal verification — ticket 005

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useGameProtocol.ts` | Modify | Replace sync stubs with real implementations, add reconnection watcher |
| `app/src/composables/useGameProtocol.test.ts` | Modify | Add tests for sync protocol |

## Requirements

### `handleSyncRequest(message: SyncRequestMessage): void`

Responds to the opponent's sync request with the current game state.

Build a `SyncResponseMessage` from the current game state:

```typescript
const response: SyncResponseMessage = {
  type: 'sync_response',
  phase: gameStore.phase,
  turnNumber: gameStore.shotHistory.length,
  shotHistory: gameStore.shotHistory.map(shot => ({
    x: shot.x,
    y: shot.y,
    hit: shot.hit,
    sunk: shot.sunk,
    player: shot.player,
  })),
}
```

Send via relay: `relay.send(response)`.

Notes:
- `turnNumber` is derived from the shot history length. Each shot is one "turn" (or half-turn). This is a simple approximation used for reconciliation.
- The shot history is the authoritative record of the game's progression.
- Do not include board positions in the sync response — those are private and protected by the commitment protocol.

### `handleSyncResponse(message: SyncResponseMessage): void`

Reconciles the local game state with the received sync response. Per `docs/05-PROTOCOL-SPEC.md` Section 9.2:

1. **Compare turn numbers:** Compare `message.turnNumber` with `gameStore.shotHistory.length`.

2. **If they match:** The local state is already up to date. No action needed. Resume normally.

3. **If the remote has more shots:** The local client missed some shots while disconnected. Apply the missing shots:
   - Iterate through `message.shotHistory` starting from index `gameStore.shotHistory.length`.
   - For each missing shot, determine if it was a local or opponent shot and replay it:
     - If the missing shot's `player` matches the local player role (`'a'` for host, `'b'` for joiner), call `gameStore.receiveResult(shot.x, shot.y, shot.hit, shot.sunk)` — the local player's shot result was missed.
     - If the missing shot's `player` matches the opponent role, call `gameStore.receiveShot(shot.x, shot.y)` — the opponent's shot was missed. Note: the result of `receiveShot` should match `shot.hit` and `shot.sunk`. If it doesn't, log a warning (state inconsistency).

4. **Phase reconciliation:** If `message.phase` is ahead of the local phase (e.g., remote is in `'reveal'` but local is in `'battle'`), transition the local state:
   - If remote phase is `'reveal'` and local is `'battle'`, call `gameStore.startReveal()`.
   - If remote phase is `'gameover'` and local is `'reveal'` or `'battle'`, call `gameStore.finishGame(...)` with appropriate winner.
   - Other transitions should not typically occur via sync.

5. **Turn state:** After reconciliation, the local player's `isMyTurn` should be derivable from the shot history: if the total number of shots is even, it's Player A's turn; if odd, it's Player B's turn. Verify this matches the store state and correct if needed.

### Internal `sendSyncRequest(): void`

Sends a sync request message to the opponent.

```typescript
function sendSyncRequest(): void {
  relay.send({ type: 'sync_request' })
}
```

This is NOT in the `UseGameProtocolReturn` interface — it is internal. It is triggered automatically on reconnection, not by UI code.

### Reconnection Trigger

Add a Vue `watch` on `connectionStore.peerConnected` to detect when the peer reconnects:

```typescript
import { watch } from 'vue'
import { storeToRefs } from 'pinia'

// Inside the composable function:
const { peerConnected } = storeToRefs(connectionStore)

watch(peerConnected, (newValue, oldValue) => {
  if (newValue && !oldValue && gameStore.phase !== 'lobby') {
    // Peer reconnected while game is in progress
    sendSyncRequest()
  }
})
```

This watch fires when `peerConnected` transitions from `false` to `true` AND the game is past the lobby phase (meaning there's a game in progress that needs syncing). If the game is in the lobby phase, no sync is needed — the normal flow will handle it.

### Test Requirements

Extend `app/src/composables/useGameProtocol.test.ts`.

Required test cases:

1. **Sync request sends current game state:** Set up a game in BATTLE phase with some shot history. Simulate `{ type: 'sync_request' }`. Assert `relay.send` was called with a `sync_response` containing the correct `phase`, `turnNumber`, and `shotHistory`.

2. **Sync response with matching state — no changes:** Set up a game with 4 shots in history. Simulate a `sync_response` with `turnNumber: 4` and matching `shotHistory`. Assert the game store was NOT modified.

3. **Sync response with more shots — missing shots applied:** Set up a game with 2 shots. Simulate a `sync_response` with `turnNumber: 4` and 4 shots in history. Assert the 2 missing shots are replayed (appropriate store actions called).

4. **Sync response with ahead phase — phase transition applied:** Set up a game in BATTLE phase. Simulate a `sync_response` with `phase: 'reveal'`. Assert `gameStore.startReveal()` was called.

5. **Reconnection triggers sync request:** Set `connectionStore.peerConnected` to `false`, then set it to `true` while game is in BATTLE phase. Assert `relay.send` was called with `{ type: 'sync_request' }`.

## Acceptance Criteria

- [ ] Receiving a `sync_request` generates a correct `sync_response` with phase, turn number, and shot history
- [ ] Receiving a `sync_response` with matching state makes no changes
- [ ] Receiving a `sync_response` with additional shots replays the missing shots
- [ ] Peer reconnection during an active game automatically sends a `sync_request`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **The sync protocol is best-effort.** It handles the common case of brief disconnections where one player misses a few messages. It does NOT handle catastrophic state divergence (e.g., both clients have completely different shot histories). In that rare case, log a warning and proceed with the remote state.
- **Do not send board positions in sync_response.** Board layouts are private. The sync only shares the shot history (which both players see during gameplay) and the current phase.
- **The `watch` on `peerConnected`** uses Vue's `watch` API. This is the first Vue reactivity import in the composable. Import `watch` from `vue` and `storeToRefs` from `pinia`. The watch automatically cleans up when the component unmounts (Vue's default behavior for watches created in `setup`/composable context).
- **`sendSyncRequest` is NOT in the return interface.** It is internal — triggered by the reconnection watcher, not by UI code. Components do not manually initiate sync.
- **Turn number is `shotHistory.length`.** This is a pragmatic choice. Each entry in the shot history represents one half-turn (one player's shot). The total count serves as a sequence number for reconciliation.
- **State reconciliation is additive only.** The sync handler adds missing shots — it never removes or modifies existing shots. If the remote has fewer shots than local, do nothing (the local state is ahead, which shouldn't normally happen but is harmless).
- **Phase transitions during sync** should be conservative. Only transition forward (e.g., battle → reveal), never backward. If the remote phase is behind the local phase, ignore the phase field.
- Per `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.4: "Never assume message order. Use state-based reconciliation." The sync protocol follows this principle — it reconciles based on state comparison, not message sequence numbers.
- **Clean up the watcher** if `disconnect()` is called. Either use `watchEffect` with a scope, or store the `watch` return value and call it in `disconnect()`:
  ```typescript
  const stopWatcher = watch(peerConnected, ...)
  // In disconnect:
  stopWatcher()
  ```
