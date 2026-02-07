# Phase 08 — Ticket 002: Commit, Shot, and Reveal Send Functions

## Summary

Replace the stub implementations of `sendCommit()`, `sendShot()`, `sendResult()`, and `sendReveal()` in `useGameProtocol` with their real implementations. `sendCommit` integrates with `useCrypto` to generate the board hash and updates the game store. `sendShot` enforces a 200ms debounce and an `awaitingResult` guard to prevent double-shots. `sendResult` and `sendReveal` construct and send typed messages. When done, the agent should have all outgoing message functions fully implemented and tested.

## Prerequisites

- **Ticket 001 complete.** `app/src/composables/useGameProtocol.ts` exists with the composable skeleton, interfaces, relay wiring, and stub implementations to replace.
  - `app/src/composables/useGameProtocol.test.ts` — the test file to extend.

## Scope

**In scope:**

- `sendCommit(ships: PlacedShip[]): Promise<void>` — calls `cryptoCommitBoard(ships)`, calls `gameStore.commitBoard(hash, salt)`, sends `{ type: 'commit', hash }` via relay
- `sendShot(x: number, y: number): void` — enforces 200ms debounce and `awaitingResult` guard, sends `{ type: 'shot', x, y }` via relay, sets `awaitingResult = true`
- `sendResult(x: number, y: number, hit: boolean, sunk: ShipType | null): void` — sends `{ type: 'result', x, y, hit, sunk }` via relay
- `sendReveal(ships: PlacedShip[], saltHex: string): void` — sends `{ type: 'reveal', ships, salt: saltHex }` via relay
- Internal state: `awaitingResult` boolean flag, `lastShotTime` timestamp
- Unit tests for all four functions

**Out of scope:**

- `sendReady`, `sendRematch`, `disconnect` — already implemented in ticket 001
- Incoming message handling — tickets 003–006
- Clearing `awaitingResult` on receiving a result — ticket 004 (the incoming result handler clears it)
- Triggering `sendResult` automatically on receiving a shot — ticket 004

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useGameProtocol.ts` | Modify | Replace stub send functions with real implementations |
| `app/src/composables/useGameProtocol.test.ts` | Modify | Add tests for commit, shot, result, and reveal sends |

## Requirements

### Internal State

Add the following internal (non-reactive) state variables inside the `useGameProtocol` function body. These are plain variables, NOT Vue refs — they do not need to be reactive because no template or computed property reads them:

```typescript
let awaitingResult = false
let lastShotTime = 0
```

- `awaitingResult` is `true` after `sendShot()` is called and before the incoming `result` handler (ticket 004) clears it. Prevents the player from firing multiple shots without receiving results.
- `lastShotTime` records `Date.now()` of the last shot send. Used for 200ms debounce per `docs/05-PROTOCOL-SPEC.md` Section 10.2.

### `sendCommit(ships: PlacedShip[]): Promise<void>`

Commits the board by generating a cryptographic hash and sending it to the opponent.

1. Call `const result = await cryptoCommitBoard(ships)` to generate `{ hash, salt, saltHex }`.
2. Call `gameStore.commitBoard(result.hash, result.salt)` to store the commitment in the game store and transition to COMMIT phase.
3. Send the commit message: `relay.send({ type: 'commit', hash: result.hash })`.

- This function is `async` because `cryptoCommitBoard` is async.
- The `result.salt` is a `Uint8Array` passed to the store. The `result.saltHex` is NOT sent to the opponent — only the hash is sent during the commit phase. The salt is sent later during the reveal phase.
- After this function completes, `gameStore.phase` will be `'commit'` and `gameStore.myCommitHash` will be set.

### `sendShot(x: number, y: number): void`

Fires a shot at the opponent's board with debounce and double-shot protection.

1. **Debounce guard:** Check if `Date.now() - lastShotTime < 200`. If true, return immediately without sending. This prevents accidental double-clicks per `docs/05-PROTOCOL-SPEC.md` Section 10.2.
2. **Awaiting result guard:** Check if `awaitingResult` is `true`. If true, return immediately. The player must wait for the result of their previous shot before firing again. Per `docs/05-PROTOCOL-SPEC.md` Section 6: "A client must not send a shot unless it has received a result for its previous shot."
3. Record the shot time: `lastShotTime = Date.now()`.
4. Set `awaitingResult = true`.
5. Send: `relay.send({ type: 'shot', x, y })`.

Note: This function does NOT call `gameStore.fireShot()`. The store's `fireShot` action is called by the component or protocol composable as a separate step. The `sendShot` function is purely about sending the message with guards. However, if the phase overview intends for `sendShot` to also update the store, the agent should check the phase overview's acceptance criterion #2: "Calling `sendShot(3, 5)` sends `{ type: 'shot', x: 3, y: 5 }` and prevents another shot until a result is received." This focuses on the send + guard behavior.

**Design decision:** The agent should also call `gameStore.fireShot(x, y)` inside `sendShot()` to update the game store (toggle turn, record in shot history). This keeps the protocol composable as the single orchestration point — components call `sendShot()` and the composable handles both the store update and the relay send. Add this call BEFORE the relay send:

```
gameStore.fireShot(x, y)
relay.send({ type: 'shot', x, y })
```

If `gameStore.fireShot()` does nothing (e.g., it's not the player's turn or the cell was already shot), the function should still respect its own debounce and awaitingResult guards.

### `sendResult(x: number, y: number, hit: boolean, sunk: ShipType | null): void`

Sends the result of the opponent's shot against the local player's board.

- Constructs and sends: `relay.send({ type: 'result', x, y, hit, sunk })`.
- No guards or store updates — this is a simple send. The store was already updated by `gameStore.receiveShot()` in the incoming shot handler (ticket 004).

### `sendReveal(ships: PlacedShip[], saltHex: string): void`

Sends the local player's board and salt to the opponent for post-game verification.

- Constructs and sends: `relay.send({ type: 'reveal', ships, salt: saltHex })`.
- Note the field name in the message is `salt` (not `saltHex`). The value is the 64-character hex encoding of the 32-byte salt. See `docs/05-PROTOCOL-SPEC.md` Section 4.1: `RevealMessage.salt` is a `string` (hex-encoded).
- No store updates — the local player's board is already known to the store.

### Export `awaitingResult` Reset Hook

Ticket 004 needs to clear `awaitingResult` when a result is received. To enable this without exposing internal state, add an internal function:

```typescript
function clearAwaitingResult(): void {
  awaitingResult = false
}
```

This function is NOT in the return interface — it is internal. Ticket 004's incoming result handler will call it. Since both the send functions and the incoming handlers live in the same composable function scope, `clearAwaitingResult` (and `awaitingResult`) are accessible via closure.

### Test Requirements

Extend `app/src/composables/useGameProtocol.test.ts` with a new `describe` block for the send functions.

The mocking strategy from ticket 001 is already in place. Additionally, the `useCrypto` mock needs `commitBoard` to return a resolved promise:

```typescript
const mockCryptoCommitBoard = vi.fn().mockResolvedValue({
  hash: 'a'.repeat(64),
  salt: new Uint8Array(32),
  saltHex: '0'.repeat(64),
})
```

Required test cases:

1. **`sendCommit` calls crypto, store, and relay:** Call `sendCommit(ships)`. Assert `cryptoCommitBoard` was called with `ships`. Assert `gameStore.commitBoard` was called with the hash and salt. Assert `relay.send` was called with `{ type: 'commit', hash: 'aaa...a' }`.

2. **`sendShot` sends shot message:** Call `sendShot(3, 5)`. Assert `relay.send` was called with `{ type: 'shot', x: 3, y: 5 }`.

3. **`sendShot` debounces rapid calls:** Call `sendShot(3, 5)`, then immediately call `sendShot(4, 6)` (within 200ms). Assert `relay.send` was called only once.

4. **`sendShot` blocks while awaiting result:** Call `sendShot(3, 5)`. Without clearing awaitingResult, wait 250ms then call `sendShot(4, 6)`. Assert `relay.send` was called only once (the debounce passed but awaitingResult is still true).

5. **`sendResult` sends result message:** Call `sendResult(3, 5, true, 'carrier')`. Assert `relay.send` was called with `{ type: 'result', x: 3, y: 5, hit: true, sunk: 'carrier' }`.

6. **`sendReveal` sends reveal message with correct field names:** Call `sendReveal(ships, 'ff'.repeat(32))`. Assert `relay.send` was called with `{ type: 'reveal', ships, salt: 'ff'.repeat(32) }`.

For the debounce test, use `vi.useFakeTimers()` and `vi.advanceTimersByTime(200)` to control time. Remember to call `vi.useRealTimers()` in cleanup.

## Acceptance Criteria

- [ ] `sendCommit(ships)` generates hash via `useCrypto`, updates `gameStore.commitBoard()`, and sends `{ type: 'commit', hash }` via relay
- [ ] `sendShot(3, 5)` sends `{ type: 'shot', x: 3, y: 5 }` and prevents another shot until result is received
- [ ] Rapid shot attempts within 200ms are debounced — only the first is sent
- [ ] `sendResult` sends a correctly structured `ResultMessage`
- [ ] `sendReveal` sends a `RevealMessage` with `salt` field (not `saltHex`)
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Remove the stub `throw` statements** when replacing with real implementations. The stubs from ticket 001 should be completely replaced — do not leave any `throw new Error('Not yet implemented')` in the final code.
- **`awaitingResult` is NOT a Vue ref.** It's a plain `let` variable. No reactivity is needed because nothing in a template reads it. It's purely internal control flow.
- **The 200ms debounce uses `Date.now()`**, not `setTimeout`. This is a simple time-based gate — if less than 200ms have passed since the last shot, the new shot is silently dropped. No timer is created.
- **The `sendShot` function calls `gameStore.fireShot(x, y)` to update the store.** This is the single orchestration point pattern — components call `sendShot`, and the composable handles both store and relay. Do not require the component to call `gameStore.fireShot` separately.
- **The RevealMessage `salt` field** is named `salt` in the protocol spec (see `docs/05-PROTOCOL-SPEC.md` Section 4.1), not `saltHex`. Even though the value is hex-encoded, the field name is `salt`. Match the protocol exactly.
- **Do not add phase guards to send functions.** The protocol composable trusts the caller to invoke sends at the right time. Phase enforcement happens in the game store actions (which have phase guards) and in the incoming message handler (ticket 003). Adding phase guards here would create redundant checks.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not add `localStorage` persistence for `awaitingResult` or `lastShotTime`. These are ephemeral in-memory state.
