# Phase 07 — Ticket 003: Board Verification Function

## Summary

Implement the `verifyBoard()` function that verifies an opponent's revealed board against their committed hash. This is the "reveal" half of the commit-reveal anti-cheat protocol defined in `docs/05-PROTOCOL-SPEC.md` Section 7.2. When done, the agent should have a tested function that recomputes a SHA-256 hash from revealed ships and salt, and compares it to the previously committed hash — returning `true` for honest boards and `false` for any tampering.

## Prerequisites

- **Ticket 001 complete.** `sha256()` and `toHex()` exist in `app/src/composables/useCrypto.ts`.
- **Ticket 002 complete.** `commitBoard()` exists — needed for integration-style tests that commit then verify.
  - `app/src/composables/useCrypto.ts` — exports `commitBoard`, `sha256`, `toHex`, `CommitResult`

## Scope

**In scope:**

- `verifyBoard(opponentShips: PlacedShip[], opponentSaltHex: string, opponentHash: string): Promise<boolean>` — exported function
- Unit tests covering honest verification, tampered positions, tampered salt, added/removed ships, and unsorted ships

**Out of scope:**

- `useCrypto()` composable wrapper — ticket 004
- Post-game shot result verification (checking hit/miss honesty against revealed board) — Phase 8
- Sending/receiving reveal messages over WebSocket — Phase 8
- UI display of verification results — Phase 12

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useCrypto.ts` | Modify | Add `verifyBoard` function |
| `app/src/composables/useCrypto.test.ts` | Modify | Add verification tests |

## Requirements

### `verifyBoard(opponentShips: PlacedShip[], opponentSaltHex: string, opponentHash: string): Promise<boolean>`

Verifies an opponent's revealed board against their committed hash.

```typescript
export async function verifyBoard(
  opponentShips: PlacedShip[],
  opponentSaltHex: string,
  opponentHash: string
): Promise<boolean>
```

**Algorithm** (per `docs/05-PROTOCOL-SPEC.md` Section 7.2):

1. **Serialize the revealed ships:** `const canonical = JSON.stringify(opponentShips)`. The ships are assumed to already be sorted alphabetically by `type`. This function does **NOT** sort the ships — it trusts that the input is in the same order used during commitment. This is intentional: if the opponent sends unsorted ships, the hash will not match, which is correct behavior.

2. **Construct payload:** `const payload = canonical + ':' + opponentSaltHex`. Same delimiter and format as `commitBoard`.

3. **Hash the payload:** `const recomputedHash = await sha256(payload)`.

4. **Compare:** `return recomputedHash === opponentHash`. Strict equality comparison. Both are 64-character lowercase hex strings.

**Key design decisions:**

- **No sorting.** Unlike `commitBoard`, this function does NOT sort the ships. It expects them to already be in alphabetical order (as they were when the hash was originally computed). If the opponent reveals ships in a different order than what was hashed, the verification correctly fails.
- **No input validation.** The function does not validate that `opponentSaltHex` is 64 characters or that `opponentHash` is 64 characters. It simply recomputes and compares. Invalid inputs will naturally produce a mismatch.
- **The function is `async`** because `sha256` is async.

### Test Requirements

Add tests to `app/src/composables/useCrypto.test.ts` in a `describe('verifyBoard', ...)` block.

Use the same test fixture as ticket 002, in **alphabetically sorted** order (this is the canonical order):

```typescript
const SORTED_SHIPS: PlacedShip[] = [
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
]
```

**Test pattern:** Most tests should first call `commitBoard(SORTED_SHIPS)` to get a valid `hash` and `saltHex`, then call `verifyBoard()` with variations to check pass/fail.

Required test cases:

1. **Honest board verifies successfully (AC 3):** Call `commitBoard(SORTED_SHIPS)`. Then `verifyBoard(SORTED_SHIPS, result.saltHex, result.hash)` returns `true`.

2. **Modified ship position fails (AC 4):** Call `commitBoard(SORTED_SHIPS)`. Create a tampered copy where one ship's `x` or `y` is changed. Call `verifyBoard(tamperedShips, result.saltHex, result.hash)`. Returns `false`.

3. **Modified salt fails (AC 5):** Call `commitBoard(SORTED_SHIPS)`. Call `verifyBoard(SORTED_SHIPS, 'ff'.repeat(32), result.hash)` with a different salt hex. Returns `false`.

4. **Added ship fails (AC 6 — addition):** Call `commitBoard(SORTED_SHIPS)`. Create a copy with an extra ship appended. Call `verifyBoard(extraShips, result.saltHex, result.hash)`. Returns `false`.

5. **Removed ship fails (AC 6 — removal):** Call `commitBoard(SORTED_SHIPS)`. Create a copy with one ship removed. Call `verifyBoard(fewerShips, result.saltHex, result.hash)`. Returns `false`.

6. **Unsorted ships fail (AC 7):** Call `commitBoard(SORTED_SHIPS)`. Create a shuffled copy where types are NOT in alphabetical order (e.g., `[submarine, carrier, destroyer, battleship, cruiser]`). Call `verifyBoard(shuffledShips, result.saltHex, result.hash)`. Returns `false`. This proves `verifyBoard` does not sort — and that the deterministic ordering matters.

7. **Modified ship orientation fails:** Call `commitBoard(SORTED_SHIPS)`. Create a tampered copy where one ship's `orientation` is flipped from `'h'` to `'v'`. Call `verifyBoard(tamperedShips, result.saltHex, result.hash)`. Returns `false`.

## Acceptance Criteria

- [ ] `verifyBoard()` is exported from `app/src/composables/useCrypto.ts`
- [ ] `verifyBoard()` returns `true` when given the same ships and salt used to generate the hash
- [ ] `verifyBoard()` returns `false` when any ship position is modified
- [ ] `verifyBoard()` returns `false` when the salt is modified
- [ ] `verifyBoard()` returns `false` when a ship is added or removed
- [ ] `verifyBoard()` returns `false` when ships are not in alphabetical order by type
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do NOT sort ships in `verifyBoard`.** This is intentional and different from `commitBoard`. The verification function expects ships in the exact order they were serialized during commitment (alphabetical by type). If the opponent sends them in a different order, verification fails. This is correct behavior — it means the opponent must reveal ships in the same canonical order.
- **Use `commitBoard` in tests** to generate valid hashes. Do not manually construct hashes — use the real `commitBoard` function and then verify against its output. This acts as an integration test of the commit-reveal cycle.
- **The sorted test fixture** (`SORTED_SHIPS`) must be in alphabetical order by `type`: battleship, carrier, cruiser, destroyer, submarine. Double-check this order before writing tests.
- **Tampering tests should modify a deep copy.** Use spread or `JSON.parse(JSON.stringify(...))` to create copies. Do not mutate the test fixture.
- **Phase overview AC 7** specifically tests that "ship order changes but types are no longer sorted alphabetically" causes failure. This verifies that the deterministic sort in `commitBoard` combined with the no-sort in `verifyBoard` creates a consistent protocol.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not add extra validation (checking ship count, checking salt length, etc.) to `verifyBoard`. The function's job is strictly hash comparison. Invalid inputs naturally produce mismatches.
