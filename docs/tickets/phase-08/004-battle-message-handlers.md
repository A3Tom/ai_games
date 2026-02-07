# Phase 08 — Ticket 004: Battle Phase Shot and Result Handlers

## Summary

Replace the stub `handleShot` and `handleResult` handlers in `useGameProtocol` with real implementations that process the battle-phase shot-result cycle. When the opponent fires a shot, the composable calls `gameStore.receiveShot()` to check the local board, then automatically sends back a `result` message via `sendResult()`. When a result is received for the local player's shot, the composable calls `gameStore.receiveResult()` and clears the `awaitingResult` flag. This ticket also detects when all ships of either player are sunk and triggers the transition to the REVEAL phase. When done, two clients can exchange shots and results through the composable.

## Prerequisites

- **Ticket 002 complete.** `sendResult()` is implemented — the shot handler needs it to send the auto-response.
  - `app/src/composables/useGameProtocol.ts` — `sendResult()` function is available in the composable scope.
- **Ticket 003 complete.** The incoming message dispatch infrastructure and phase-valid message map exist. The `handleShot` and `handleResult` stubs are the targets for replacement.
  - `app/src/composables/useGameProtocol.test.ts` — the test file to extend.

## Scope

**In scope:**

- `handleShot(message: ShotMessage)` — calls `gameStore.receiveShot(x, y)`, sends result back via `sendResult()`, detects game-over condition
- `handleResult(message: ResultMessage)` — calls `gameStore.receiveResult(x, y, hit, sunk)`, clears `awaitingResult`, detects game-over condition
- Game-over detection: when all ships of either player are sunk, call `gameStore.startReveal()` and send the local player's reveal
- Unit tests for shot handling, result handling, auto-response, awaitingResult clearing, and game-over detection

**Out of scope:**

- Send functions — tickets 001 and 002
- Phase filtering — ticket 003 (the dispatch already rejects shots outside BATTLE phase)
- Reveal verification — ticket 005 (handles the incoming reveal after the transition)
- Reconnection sync — ticket 006

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useGameProtocol.ts` | Modify | Replace `handleShot` and `handleResult` stubs with real implementations |
| `app/src/composables/useGameProtocol.test.ts` | Modify | Add tests for battle message handlers |

## Requirements

### `handleShot(message: ShotMessage): void`

Processes an incoming shot from the opponent against the local player's board.

1. Call `const result = gameStore.receiveShot(message.x, message.y)`. This returns `{ hit: boolean, sunk: ShipType | null }`. The store also updates `myBoard`, records the shot in `shotHistory`, and toggles `isMyTurn` to `true`.

2. Send the result back to the opponent: `sendResult(message.x, message.y, result.hit, result.sunk)`.

3. **Game-over check:** After processing the shot, check if the game is over. Use `gameStore.isGameOver` getter (or the `remainingShips` getter, or the `isAllSunk` utility from `utils/board.ts`). If all of the local player's ships are sunk:
   - Call `gameStore.startReveal()` to transition from BATTLE to REVEAL.
   - Automatically send the local player's reveal: call `sendReveal(gameStore.myShips, toHex(gameStore.mySalt!))` where `toHex` converts the `Uint8Array` salt to hex. However, since `toHex` is internal to `useCrypto.ts` and not exposed through the `useCrypto()` composable, the agent should compute the hex from the salt stored in the game store. The `mySalt` is a `Uint8Array` and the protocol expects a hex string. Use the same hex-encoding approach: `Array.from(gameStore.mySalt!).map(b => b.toString(16).padStart(2, '0')).join('')`.
   - Alternatively, store the `saltHex` from the `sendCommit` call (ticket 002) in a composable-local variable and use it here. This is cleaner — add a `let mySaltHex: string = ''` internal variable that is set in `sendCommit` when the crypto result is returned.

**Recommended approach:** Add `let mySaltHex = ''` as internal state in the composable. In `sendCommit()`, after getting the crypto result, set `mySaltHex = result.saltHex`. Then in `handleShot()` and `handleResult()`, when game-over is detected, use `sendReveal(gameStore.myShips, mySaltHex)`.

### `handleResult(message: ResultMessage): void`

Processes the result of the local player's shot, as reported by the opponent.

1. Call `gameStore.receiveResult(message.x, message.y, message.hit, message.sunk)`. This updates `opponentBoard` and `shotHistory` in the store.

2. Clear the awaiting flag: `awaitingResult = false`. This allows the local player to fire their next shot (via `sendShot`).

3. **Game-over check:** After processing the result, check if the game is over. The local player may have sunk the opponent's last ship. Check if all 5 opponent ships have been sunk by examining `shotHistory` for sunk entries, or use a tracking mechanism.

   Since the opponent's board positions are unknown during battle, game-over detection on the result side is based on counting sunk ships. If `message.sunk` is not null, increment a counter of sunk opponent ships. When 5 ships are sunk, the game is over.

   **Recommended approach:** Add `let opponentSunkCount = 0` as internal state. In `handleResult`, if `message.sunk !== null`, increment `opponentSunkCount`. When `opponentSunkCount >= 5`:
   - Call `gameStore.startReveal()`.
   - Send reveal: `sendReveal(gameStore.myShips, mySaltHex)`.

### Internal State Additions

Add the following internal variables to the composable function body (alongside `awaitingResult` and `lastShotTime` from ticket 002):

```typescript
let mySaltHex = ''
let opponentSunkCount = 0
```

- `mySaltHex`: Set in `sendCommit()` from the crypto result. Used by `sendReveal()` during game-over.
- `opponentSunkCount`: Incremented when a result reports a sunk ship. Used to detect when all 5 opponent ships are sunk.

Modify `sendCommit()` from ticket 002 to store `mySaltHex`:
```typescript
async function sendCommit(ships: PlacedShip[]): Promise<void> {
  const result = await cryptoCommitBoard(ships)
  mySaltHex = result.saltHex  // <-- add this line
  gameStore.commitBoard(result.hash, result.salt)
  relay.send({ type: 'commit', hash: result.hash })
}
```

### Game-Over Trigger from Both Sides

Game over can be triggered from two paths:

1. **Local player's ships all sunk** (detected in `handleShot`): The opponent's shot sinks the local player's last ship. `gameStore.receiveShot()` will mark the ship as `SUNK`. The composable checks if all local ships are sunk.

2. **Opponent's ships all sunk** (detected in `handleResult`): The local player's shot sinks the opponent's last ship. The result message reports `sunk` for the final ship.

In both cases, the composable calls `gameStore.startReveal()` and sends the local reveal. Both players send their reveals, and ticket 005's `handleReveal` processes the incoming reveal.

### Detecting All Local Ships Sunk

To check if all local ships are sunk in `handleShot`, use the game store's board state. Import and use `isAllSunk` from `utils/board.ts` if available, or check using the store:

```typescript
function areAllLocalShipsSunk(): boolean {
  return gameStore.myShips.every(ship => {
    // Check if all cells of this ship are HIT or SUNK on myBoard
    // Use getShipCells from utils/board.ts
  })
}
```

Alternatively, a simpler approach: check if `result.sunk` was returned AND count the total number of sunk ships so far (similar to `opponentSunkCount` but for local ships). Add `let localSunkCount = 0`. In `handleShot`, if `result.sunk !== null`, increment `localSunkCount`. When `localSunkCount >= 5`, all ships are sunk.

**Recommended approach for consistency:** Use sunk counters for both sides:

```typescript
let localSunkCount = 0
let opponentSunkCount = 0
```

### Test Requirements

Extend `app/src/composables/useGameProtocol.test.ts`.

For battle tests, the game store must be in BATTLE phase. Use a helper that sets up the full game flow:

```typescript
function setupBattlePhase(protocol: UseGameProtocolReturn, gameStore: ReturnType<typeof useGameStore>) {
  gameStore.startSetup()
  gameStore.placeShip({ type: 'carrier', x: 0, y: 0, orientation: 'h' })
  gameStore.placeShip({ type: 'battleship', x: 0, y: 1, orientation: 'h' })
  gameStore.placeShip({ type: 'cruiser', x: 0, y: 2, orientation: 'h' })
  gameStore.placeShip({ type: 'submarine', x: 0, y: 3, orientation: 'h' })
  gameStore.placeShip({ type: 'destroyer', x: 0, y: 4, orientation: 'h' })
  // Manually set commit state to bypass async crypto
  gameStore.commitBoard('a'.repeat(64), new Uint8Array(32))
  gameStore.receiveOpponentCommit('b'.repeat(64))
  gameStore.startBattle()
}
```

Required test cases:

1. **Incoming shot calls `receiveShot` and sends result:** Set up battle phase. Simulate `{ type: 'shot', x: 0, y: 0 }` (carrier is there → hit). Assert `gameStore.receiveShot(0, 0)` was called. Assert `relay.send` was called with a result message containing `hit: true`.

2. **Incoming shot on empty cell sends miss result:** Simulate `{ type: 'shot', x: 9, y: 9 }` (no ship → miss). Assert result message contains `hit: false, sunk: null`.

3. **Incoming result calls `receiveResult` and clears awaitingResult:** Set up as host (my turn). Call `sendShot(5, 5)` to set `awaitingResult = true`. Then simulate `{ type: 'result', x: 5, y: 5, hit: false, sunk: null }`. Assert `gameStore.receiveResult` was called. Then call `sendShot(6, 6)` — it should succeed (awaitingResult was cleared), so assert a second shot message was sent.

4. **Sinking last opponent ship triggers reveal:** Set `opponentSunkCount` to 4 (mock 4 sunk ships already). Simulate a result with `sunk: 'destroyer'`. Assert `gameStore.startReveal()` was called. Assert `relay.send` was called with a `reveal` message.

5. **Sinking last local ship triggers reveal:** Set up battle phase. Sink all cells of all 5 ships via repeated shot messages. After the final shot that sinks the 5th ship, assert `gameStore.startReveal()` was called.

## Acceptance Criteria

- [ ] Receiving a `shot` message during BATTLE calls `gameStore.receiveShot()` and auto-sends a `result` message
- [ ] The auto-sent result correctly reports hit/miss/sunk from `gameStore.receiveShot()` return value
- [ ] Receiving a `result` message calls `gameStore.receiveResult()` and clears `awaitingResult`
- [ ] After clearing `awaitingResult`, a new `sendShot()` call succeeds
- [ ] When all ships of either player are sunk, `gameStore.startReveal()` is called and a reveal message is sent
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **The shot handler auto-sends the result.** This is the key orchestration behavior: the composable receives a shot, consults the store for the result, and sends it back. The component is NOT involved in this loop. See `docs/04-AI-ASSISTANT-GUIDE.md` Phase 8: "Components never call `useRelay.send()` directly."
- **`awaitingResult` is a closure variable** from ticket 002. It is accessible in `handleResult` because both functions are in the same composable function scope. Use the `clearAwaitingResult()` helper or set `awaitingResult = false` directly.
- **Game-over detection uses sunk ship counters**, not board state inspection. This is simpler and avoids importing board utilities into the composable. Counting sunk reports (from `result.sunk` and `receiveShot().sunk`) is reliable because the protocol guarantees each ship is sunk exactly once.
- **Both sides send reveals.** When game-over is detected (from either `handleShot` or `handleResult`), the composable transitions to REVEAL and sends its own reveal. The opponent does the same. Ticket 005 handles the incoming reveal.
- **The `mySaltHex` variable must be set before game-over can occur.** It is set in `sendCommit()` which happens during the COMMIT phase, well before any shots are fired. If `mySaltHex` is empty when reveal is needed, it indicates a bug in the flow.
- **Reset counters on rematch.** When `gameStore.resetForRematch()` is called (in the rematch handler from ticket 003), reset `localSunkCount`, `opponentSunkCount`, `awaitingResult`, `lastShotTime`, and `mySaltHex` to their initial values. Add a reset block in the rematch handler or create an internal `resetInternalState()` helper.
- **Board indexing is `board[y][x]`.** Double-check coordinate order when examining test assertions. The store uses `myBoard[y][x]`.
