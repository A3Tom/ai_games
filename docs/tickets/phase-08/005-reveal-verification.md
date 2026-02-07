# Phase 08 — Ticket 005: Reveal Handling and Post-Game Verification

## Summary

Replace the stub `handleReveal` handler in `useGameProtocol` with the real implementation that processes the opponent's revealed board, verifies the commitment hash via `useCrypto.verifyBoard()`, cross-checks every shot result against the revealed board positions, and flags cheating if any mismatch is found. After verification, the composable determines the winner and transitions to GAMEOVER. When done, the full anti-cheat protocol (commit → reveal → verify) is wired end-to-end, and the composable correctly detects both tampered boards and dishonest shot results.

## Prerequisites

- **Ticket 003 complete.** The incoming message dispatch infrastructure exists. The `handleReveal` stub is the target for replacement.
  - `app/src/composables/useGameProtocol.ts` — composable with dispatch logic.
  - `app/src/composables/useGameProtocol.test.ts` — the test file to extend.
- **Phase 7 complete.** `useCrypto` provides `verifyBoard(opponentShips, opponentSaltHex, opponentHash): Promise<boolean>`.

## Scope

**In scope:**

- `handleReveal(message: RevealMessage)` — process opponent's revealed board and salt
- Commitment hash verification via `cryptoVerifyBoard()`
- Shot result honesty verification: cross-check every shot the opponent defended against their revealed board (per `docs/05-PROTOCOL-SPEC.md` Section 7.3)
- Call `gameStore.setCheatDetected(true)` if any verification fails
- Call `gameStore.receiveReveal(ships, salt)` to store the revealed data
- Call `gameStore.finishGame(winner)` to transition to GAMEOVER
- Winner determination: the player whose ships are NOT all sunk wins
- Unit tests for honest board, tampered hash, and dishonest shot results

**Out of scope:**

- Sending the local reveal — ticket 004 (handled when game-over is detected)
- Battle message handling — ticket 004
- Reconnection sync — ticket 006
- UI rendering of the verification result — Phase 12

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useGameProtocol.ts` | Modify | Replace `handleReveal` stub with verification logic |
| `app/src/composables/useGameProtocol.test.ts` | Modify | Add tests for reveal verification and cheat detection |

## Requirements

### `handleReveal(message: RevealMessage): void`

Processes the opponent's revealed board and performs anti-cheat verification.

**Important:** This function calls `async` operations (`cryptoVerifyBoard`) but the handler itself is synchronous (called from the dispatch switch). Wrap the async verification in an immediately-invoked async function or use `.then()/.catch()`. The recommended approach is to extract the async work into a separate function:

```typescript
function handleReveal(message: RevealMessage): void {
  void verifyAndFinish(message)
}

async function verifyAndFinish(message: RevealMessage): Promise<void> {
  // async verification logic here
}
```

The `void` prefix satisfies the `no-floating-promises` lint rule by explicitly discarding the promise.

#### Step 1: Store the revealed data

Call `gameStore.receiveReveal(message.ships, message.salt)` to store the opponent's ship placements. Per Phase 4 ticket 006, this stores `opponentShips` but does NOT store the salt in the game store. The salt is only used locally for verification.

#### Step 2: Verify commitment hash

Call `cryptoVerifyBoard(message.ships, message.salt, gameStore.opponentCommitHash!)`.

- `message.ships` is the `ShipPlacement[]` array from the reveal message (already sorted alphabetically by type, per protocol).
- `message.salt` is the 64-character hex string.
- `gameStore.opponentCommitHash` is the hash received during the COMMIT phase. The `!` non-null assertion is safe because the game cannot reach the REVEAL phase without both commits being exchanged.

If `verifyBoard` returns `false`:
- Call `gameStore.setCheatDetected(true)`.
- Log: `console.warn('Cheat detected: board commitment hash mismatch')`.
- Still proceed to finish the game — the cheat flag will be shown in the UI.

#### Step 3: Verify shot result honesty

Per `docs/05-PROTOCOL-SPEC.md` Section 7.3, after verifying the hash, also verify that every shot result reported by the opponent was honest.

Algorithm:

1. Get the opponent's revealed ships: `message.ships`.
2. Build a set of cells occupied by the opponent's ships. For each ship, compute all cells it occupies based on `x`, `y`, `orientation`, and the ship's size (look up size from `FLEET_CONFIG` in `constants/ships.ts` or from the `SHIP_SIZES` mapping).
3. Iterate through `gameStore.shotHistory`. For each shot where the LOCAL player was the attacker (i.e., `shot.player === 'a'` if local player is host, or `shot.player === 'b'` if joiner):
   - If `shot.hit === true`, verify that `(shot.x, shot.y)` is in the occupied cells set. If NOT → cheat detected.
   - If `shot.hit === false`, verify that `(shot.x, shot.y)` is NOT in the occupied cells set. If it IS → cheat detected.
4. For sunk ship verification: for each shot where `shot.sunk !== null`:
   - Verify the ship of type `shot.sunk` exists in the revealed ships.
   - Verify ALL cells of that ship have been hit (all cells appear in the shot history as hits).
5. If any check fails, call `gameStore.setCheatDetected(true)`.

**Helper function:** Extract the shot verification into a named function for clarity:

```typescript
function verifyShotHonesty(
  revealedShips: ShipPlacement[],
  shotHistory: Shot[],
  localPlayerRole: 'a' | 'b'
): boolean
```

Returns `true` if all shots are honest, `false` if any mismatch is found.

To determine the local player role: `connectionStore.isHost ? 'a' : 'b'`.

To compute ship cells, either import `getShipCells` from `utils/board.ts` (if it accepts `ShipPlacement` / `PlacedShip`) or compute inline: for a ship at `(x, y)` with orientation `'h'` and size `n`, the cells are `(x, y), (x+1, y), ..., (x+n-1, y)`. For `'v'`: `(x, y), (x, y+1), ..., (x, y+n-1)`.

To look up ship size, use the fleet configuration constant. Import from `constants/ships.ts`:

```typescript
import { FLEET_CONFIG } from '../constants/ships'
```

Where `FLEET_CONFIG` maps `ShipType` to `{ size: number, ... }`. The exact structure depends on Phase 2 ticket 003. If `FLEET_CONFIG` is an array, find the entry by type. If it's a record, look up by key.

#### Step 4: Determine winner

The winner is the player whose fleet is NOT completely sunk:
- If the local player's ships are all sunk → `winner = 'opponent'`.
- If the opponent's ships are all sunk → `winner = 'me'`.

Use the sunk counts from ticket 004's internal state (`localSunkCount` and `opponentSunkCount`), or determine from the store state.

Call `gameStore.finishGame(winner)` to transition to GAMEOVER.

### Test Requirements

Extend `app/src/composables/useGameProtocol.test.ts`.

For reveal tests, the game must be in REVEAL phase with a valid shot history. Set up:
1. Full game flow to BATTLE phase.
2. Manually set `gameStore.phase` to `'reveal'` (or go through the full shot exchange).
3. Set `gameStore.opponentCommitHash` to a known value.

Mock `cryptoVerifyBoard`:
- For honest board test: return `true`.
- For tampered board test: return `false`.

Required test cases:

1. **Honest board passes verification:** Set up reveal phase. Mock `verifyBoard` to return `true`. Simulate `{ type: 'reveal', ships: [...], salt: '...' }`. Assert `gameStore.setCheatDetected` was NOT called with `true`. Assert `gameStore.finishGame` was called.

2. **Tampered hash triggers cheat detection:** Mock `verifyBoard` to return `false`. Simulate reveal message. Assert `gameStore.setCheatDetected(true)` was called.

3. **Dishonest shot result triggers cheat detection:** Mock `verifyBoard` to return `true` (hash is fine). Set up shot history with a hit at `(0, 0)`. But the revealed ships show no ship at `(0, 0)`. Simulate reveal. Assert `gameStore.setCheatDetected(true)` was called.

4. **`receiveReveal` stores opponent ships:** Simulate reveal with specific ships. Assert `gameStore.opponentShips` matches the revealed ships.

5. **`finishGame` determines correct winner:** When local ships are all sunk, assert `finishGame('opponent')`. When opponent ships are all sunk, assert `finishGame('me')`.

## Acceptance Criteria

- [ ] Receiving a `reveal` message triggers `useCrypto.verifyBoard()` and calls `gameStore.setCheatDetected(true)` if verification fails
- [ ] Post-game shot honesty check verifies every local-player shot against the revealed board (per `docs/05-PROTOCOL-SPEC.md` Section 7.3)
- [ ] Dishonest shot results (hit reported for empty cell, or miss reported for ship cell) trigger cheat detection
- [ ] `gameStore.receiveReveal()` is called to store the opponent's ships
- [ ] `gameStore.finishGame()` is called with the correct winner after verification
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **The `handleReveal` function is synchronous but calls async operations.** Use `void verifyAndFinish(message)` to fire-and-forget the async verification. The `void` keyword satisfies `@typescript-eslint/no-floating-promises`. Do NOT `await` in the synchronous handler — the dispatch switch does not expect a promise.
- **Verification is two-part:** First check the commitment hash (did the opponent tamper with their board layout?). Then check shot honesty (did the opponent lie about hits/misses?). Both checks must pass for the game to be considered fair. Either failure sets `cheatDetected = true`.
- **Shot honesty verification per `docs/05-PROTOCOL-SPEC.md` Section 7.3:** For each shot where the opponent was defending, look up the cell on the revealed board. If they said "hit" but the cell is empty → cheat. If they said "miss" but the cell has a ship → cheat.
- **The local player role** is `'a'` if host, `'b'` if joiner. Shots fired by the local player have `player === localRole` in the shot history. The opponent defended those shots — their honesty is what we verify.
- **Ship size lookup:** Use the `FLEET_CONFIG` or `SHIP_SIZES` constant from Phase 2. If unavailable, hardcode the sizes: carrier=5, battleship=4, cruiser=3, submarine=3, destroyer=2. But prefer importing the constant.
- **`gameStore.opponentCommitHash!` non-null assertion** is safe because the REVEAL phase is only reached after both commits are exchanged. If paranoid, add a null check and log an error.
- **The game always finishes, even if cheating is detected.** Call `finishGame()` regardless. The UI (Phase 12) will show the cheat badge alongside the game result.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not use external crypto libraries. Verification uses `useCrypto.verifyBoard()` which internally uses `crypto.subtle`.
