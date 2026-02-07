# Phase 08 — Ticket 003: Incoming Message Dispatcher and Phase Filtering

## Summary

Replace the placeholder `handleIncomingMessage` in `useGameProtocol` with a real dispatch function that validates incoming messages against the current game phase, logs and drops invalid-phase messages, and routes valid messages to individual handler functions. This ticket implements handlers for `ready`, `commit`, `rematch`, `ping`, and `pong` messages. Handlers for `shot`, `result`, `reveal`, `sync_request`, and `sync_response` are defined as stubs and will be implemented in tickets 004–006. When done, the composable can receive and correctly process setup/commit/meta messages while rejecting messages that arrive in the wrong phase.

## Prerequisites

- **Ticket 001 complete.** `app/src/composables/useGameProtocol.ts` exists with the composable skeleton and relay wiring. The `onGameMessage` callback passed to `useRelay` is the target for replacement.
  - `app/src/composables/useGameProtocol.test.ts` — the test file to extend.
- **Phase 3 complete.** `app/src/utils/validation.ts` — exports type guard functions for all message types: `isReadyMessage()`, `isCommitMessage()`, `isShotMessage()`, `isResultMessage()`, `isRevealMessage()`, `isRematchMessage()`, `isPingMessage()`, `isPongMessage()`, `isSyncRequestMessage()`, `isSyncResponseMessage()`.

## Scope

**In scope:**

- Phase-valid message map: a mapping from each message type to the set of game phases where it is valid
- `handleIncomingMessage(message: GameMessage)` — the main dispatch function with phase validation
- Handler for `ready`: track opponent ready state in a local flag; if both players are ready, the composable can signal readiness (ready state is tracked locally, not in the store, since the store does not have an `opponentReady` field)
- Handler for `commit`: call `gameStore.receiveOpponentCommit(hash)`, and if both players have committed, call `gameStore.startBattle()`
- Handler for `rematch`: track opponent rematch request; if both players request rematch, call `gameStore.resetForRematch()`
- Handler for `ping`: auto-respond with `pong` containing the same timestamp
- Handler for `pong`: compute round-trip latency and call `connectionStore.updatePing(latency)`
- Stub handlers for `shot`, `result`, `reveal`, `sync_request`, `sync_response` that log warnings
- Unit tests for phase filtering and all implemented handlers

**Out of scope:**

- Shot and result handling — ticket 004
- Reveal verification and cheat detection — ticket 005
- Reconnection sync — ticket 006
- Send functions — tickets 001 and 002

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useGameProtocol.ts` | Modify | Replace placeholder handler with real dispatch logic |
| `app/src/composables/useGameProtocol.test.ts` | Modify | Add tests for dispatch, phase filtering, and handlers |

## Requirements

### Phase-Valid Message Map

Define a mapping from message types to the phases where they are permitted, based on `docs/05-PROTOCOL-SPEC.md` Section 5.1:

```typescript
const VALID_PHASES_FOR_MESSAGE: Record<string, readonly string[]> = {
  ready: ['setup'],
  commit: ['setup', 'commit'],
  shot: ['battle'],
  result: ['battle'],
  reveal: ['reveal'],
  rematch: ['gameover'],
  ping: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
  pong: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
  sync_request: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
  sync_response: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
}
```

Notes:
- `commit` is valid in both `setup` and `commit` phases because the opponent may commit before or after the local player (see Phase 4 ticket 004: `receiveOpponentCommit` works in both phases).
- `ping`, `pong`, `sync_request`, and `sync_response` are valid in ANY phase — they are meta messages.
- Any message type not in the map should be logged and dropped.

### `handleIncomingMessage(message: GameMessage): void`

Replace the placeholder from ticket 001 with:

1. **Phase check:** Look up `message.type` in `VALID_PHASES_FOR_MESSAGE`. If the current phase (`gameStore.phase`) is NOT in the valid list, log a warning and return:
   ```
   console.warn(`Ignoring '${message.type}' message in '${gameStore.phase}' phase`)
   ```

2. **Dispatch by type:** Use a `switch` statement on `message.type` to call the appropriate handler function. Each handler is a separate named function for readability and testability. If the message type is unrecognized, log a warning.

### Handler: `handleReady(message: ReadyMessage)`

The `ready` message signals that the opponent has finished placing ships.

- Track the opponent's ready state in a local variable: `opponentReady = true`.
- The `opponentReady` variable is a plain `let boolean` (not a ref) declared inside the composable function scope, initialized to `false`.
- The local player's ready state is tracked by whether `sendReady()` has been called. Add a local `localReady` boolean, set to `true` inside `sendReady()` (modify the ticket 001 implementation to set this flag).
- When both `localReady` and `opponentReady` are `true`, the setup phase is complete. No automatic phase transition is triggered here — the commit phase is initiated by the player explicitly calling `sendCommit()`. The ready signals are informational.

### Handler: `handleCommit(message: CommitMessage)`

The `commit` message carries the opponent's board commitment hash.

1. Call `gameStore.receiveOpponentCommit(message.hash)`.
2. After storing the opponent's commit, check if both commits are present: `gameStore.myCommitHash !== null && gameStore.opponentCommitHash !== null`.
3. If both are present, call `gameStore.startBattle()` to transition to the BATTLE phase and set turn order. Per Phase 4 ticket 004: `startBattle()` checks both commits and uses `connectionStore.isHost` for turn order.

### Handler: `handleRematch(message: RematchMessage)`

The `rematch` message signals that the opponent wants to play again.

- Track the opponent's rematch request: `opponentRematchRequested = true`.
- Add a local `localRematchRequested` boolean, set to `true` inside `sendRematch()` (modify the ticket 001 implementation to set this flag).
- When both `localRematchRequested` and `opponentRematchRequested` are `true`, call `gameStore.resetForRematch()` to transition to SETUP phase for a new game.
- After `resetForRematch()`, reset both flags to `false` so they're clean for the next potential rematch cycle.

### Handler: `handlePing(message: PingMessage)`

Auto-respond with a pong echoing the timestamp.

- Send: `relay.send({ type: 'pong', timestamp: message.timestamp })`.
- No store updates.

### Handler: `handlePong(message: PongMessage)`

Compute round-trip latency and update the connection store.

- Calculate latency: `const latency = Date.now() - message.timestamp`.
- Call `connectionStore.updatePing(latency)`.
- If `latency` is negative (clock skew), clamp to 0.

### Stub Handlers

Define stub handlers for message types implemented in later tickets. Each stub logs a warning and returns:

```typescript
function handleShot(message: ShotMessage): void {
  console.warn('handleShot not yet implemented — see ticket 004')
}

function handleResult(message: ResultMessage): void {
  console.warn('handleResult not yet implemented — see ticket 004')
}

function handleReveal(message: RevealMessage): void {
  console.warn('handleReveal not yet implemented — see ticket 005')
}

function handleSyncRequest(message: SyncRequestMessage): void {
  console.warn('handleSyncRequest not yet implemented — see ticket 006')
}

function handleSyncResponse(message: SyncResponseMessage): void {
  console.warn('handleSyncResponse not yet implemented — see ticket 006')
}
```

### Test Requirements

Extend `app/src/composables/useGameProtocol.test.ts`. Use the `capturedOnGameMessage` callback (from ticket 001's mock setup) to simulate incoming messages.

To simulate receiving a message:
```typescript
capturedOnGameMessage!({ type: 'ready' })
```

Required test cases:

1. **Phase filtering — shot in SETUP phase is dropped:** Set `gameStore.phase` to `'setup'` (via `gameStore.startSetup()`). Call `capturedOnGameMessage({ type: 'shot', x: 3, y: 5 })`. Assert `console.warn` was called with a message containing "Ignoring". Assert `gameStore.receiveShot` was NOT called (or that the shot stub handler ran instead of a real handler).

2. **Phase filtering — commit in SETUP phase is accepted:** Set phase to `'setup'`. Call `capturedOnGameMessage({ type: 'commit', hash: 'a'.repeat(64) })`. Assert `gameStore.receiveOpponentCommit` was called with the hash.

3. **Phase filtering — ready in BATTLE phase is dropped:** Set phase to `'battle'`. Call `capturedOnGameMessage({ type: 'ready' })`. Assert `console.warn` was called.

4. **Handle commit — stores hash and starts battle when both committed:** Set up: call `gameStore.startSetup()`, place all ships, call `sendCommit(ships)` (which sets `myCommitHash`). Then simulate receiving `{ type: 'commit', hash: 'b'.repeat(64) }`. Assert `gameStore.opponentCommitHash` is set. Assert `gameStore.phase` is `'battle'` (both committed → startBattle called).

5. **Handle ping — auto-responds with pong:** Simulate `{ type: 'ping', timestamp: 1000 }`. Assert `relay.send` was called with `{ type: 'pong', timestamp: 1000 }`.

6. **Handle pong — updates connection store latency:** Mock `Date.now()` to return `1100`. Simulate `{ type: 'pong', timestamp: 1000 }`. Assert `connectionStore.updatePing(100)` was called.

7. **Handle rematch — resets game when both agree:** Transition game to `'gameover'` state. Call `protocol.sendRematch()` to set local flag. Simulate `{ type: 'rematch' }`. Assert `gameStore.resetForRematch` was called (or `gameStore.phase` is `'setup'`).

## Acceptance Criteria

- [ ] Receiving a `shot` message during SETUP phase logs a warning and does not process it
- [ ] Receiving a `commit` message during SETUP or COMMIT phase calls `gameStore.receiveOpponentCommit(hash)`
- [ ] When both players have committed, `gameStore.startBattle()` is called automatically
- [ ] Receiving a `ping` auto-responds with `pong` containing the same timestamp
- [ ] Receiving a `pong` computes latency and calls `connectionStore.updatePing()`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **The phase-valid message map is the source of truth for phase filtering.** Any incoming message whose type is not valid for the current phase is logged and dropped. This implements `docs/05-PROTOCOL-SPEC.md` Section 5.1: "Any message received outside its valid phase should be logged and ignored."
- **Use `switch` for dispatch, not `if-else` chains.** A switch on `message.type` with TypeScript discriminated unions provides exhaustiveness checking. Add a `default` case that logs an unexpected type.
- **The `localReady` and `opponentReady` flags are internal state**, not store state. The game store does not have an `opponentReady` field. These flags exist only to track the ready/rematch handshake within the composable.
- **`handleCommit` calls `startBattle()` when both commits are present.** This is the orchestration role of the protocol composable. The game store's `receiveOpponentCommit()` only stores data — it does NOT auto-transition. The composable checks the condition and triggers the transition. See Phase 4 ticket 004 Notes: "Do not auto-transition to battle."
- **Modify `sendReady()` from ticket 001** to set `localReady = true` before sending. Modify `sendRematch()` to set `localRematchRequested = true`. These are small additions to existing functions.
- **Reset `opponentReady` and `localReady`** when a rematch happens (in the rematch handler after `resetForRematch()`). Also reset `opponentRematchRequested` and `localRematchRequested`.
- **`handlePong` latency calculation** uses `Date.now() - message.timestamp`. The timestamp in the ping/pong message is set by `Date.now()` on the sender's side. Network latency is the round-trip difference. Clamp negative values to 0 to handle potential clock skew.
- **Stub handlers for shot/result/reveal/sync** are intentional. They will be replaced in tickets 004–006. The stubs ensure the dispatch switch is complete and the project compiles.
- **Do not validate message structure in the handler.** Message validation (type guards) was already done by `parseIncomingMessage()` in `useRelay` (Phase 6 ticket 002). The `onGameMessage` callback receives pre-validated `GameMessage` values. Trust the input here.
