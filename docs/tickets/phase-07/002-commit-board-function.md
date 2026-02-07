# Phase 07 — Ticket 002: Board Commitment Function

## Summary

Implement the `commitBoard()` function that generates a SHA-256 commitment hash for a board layout with a random 32-byte salt. This is the "commit" half of the commit-reveal anti-cheat protocol defined in `docs/05-PROTOCOL-SPEC.md` Section 7.1. When done, the agent should have a tested function that accepts an array of ship placements (in any order) and returns a `CommitResult` with a deterministic hash, random salt bytes, and their hex encoding.

## Prerequisites

- **Ticket 001 complete.** The following must exist in `app/src/composables/useCrypto.ts`:
  - `CommitResult` interface (exported)
  - `toHex()` function (for hex encoding)
  - `sha256()` function (for SHA-256 hashing)
- `app/src/types/game.ts` — exports `PlacedShip`, `ShipType`

## Scope

**In scope:**

- `commitBoard(ships: PlacedShip[]): Promise<CommitResult>` — exported function
- Deterministic ship sorting (alphabetical by `type`) before serialization
- Salt generation using `crypto.getRandomValues(new Uint8Array(32))`
- Payload construction: `JSON.stringify(sortedShips) + ':' + saltHex`
- Unit tests for commitment properties

**Out of scope:**

- `verifyBoard()` function — ticket 003
- `useCrypto()` composable wrapper — ticket 004
- Sending the commit hash over WebSocket — Phase 8
- Storing the hash/salt in the game store — Phase 4/8

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useCrypto.ts` | Modify | Add `commitBoard` function |
| `app/src/composables/useCrypto.test.ts` | Modify | Add commitment tests |

## Requirements

### `commitBoard(ships: PlacedShip[]): Promise<CommitResult>`

Generates a SHA-256 commitment hash for a board layout.

```typescript
export async function commitBoard(ships: PlacedShip[]): Promise<CommitResult>
```

**Algorithm** (per `docs/05-PROTOCOL-SPEC.md` Section 7.1):

1. **Sort ships alphabetically by `type`:** Create a sorted copy of the input array. Do NOT mutate the input. Sort by `ship.type` using standard string comparison (`.sort((a, b) => a.type.localeCompare(b.type))`). The `ShipType` values are: `'battleship'`, `'carrier'`, `'cruiser'`, `'destroyer'`, `'submarine'` — alphabetical order is: battleship, carrier, cruiser, destroyer, submarine.

2. **Serialize deterministically:** `const canonical = JSON.stringify(sortedShips)`. Because the array is sorted and each `PlacedShip` object has a fixed set of properties (`type`, `x`, `y`, `orientation`), `JSON.stringify` produces a deterministic string.

3. **Generate salt:** `const salt = crypto.getRandomValues(new Uint8Array(32))`. This produces 32 cryptographically random bytes. **Never use `Math.random()`** (`docs/04-AI-ASSISTANT-GUIDE.md` Section 2.5).

4. **Hex-encode the salt:** `const saltHex = toHex(salt)`. This produces a 64-character lowercase hex string.

5. **Construct payload:** `const payload = canonical + ':' + saltHex`. The colon `:` is the delimiter between the canonical board and the salt hex.

6. **Hash the payload:** `const hash = await sha256(payload)`. This produces a 64-character lowercase hex SHA-256 hash.

7. **Return:** `{ hash, salt, saltHex }`.

**Constraints:**

- The function must NOT mutate the input `ships` array. Use `[...ships].sort(...)` or `ships.slice().sort(...)`.
- The function is `async` because `sha256` (and `crypto.subtle.digest`) is asynchronous.
- No input validation is required. The caller is responsible for passing a valid array of 5 `PlacedShip` objects. The crypto composable does not enforce fleet composition rules (that's in `docs/05-PROTOCOL-SPEC.md` Section 7 note: "ships are assumed valid").

### Test Requirements

Add tests to `app/src/composables/useCrypto.test.ts` in a `describe('commitBoard', ...)` block.

Use this test fixture for ship placements:

```typescript
const TEST_SHIPS: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]
```

Required test cases:

1. **Returns valid `CommitResult` structure:** Call `commitBoard(TEST_SHIPS)`. Verify:
   - `result.hash` is a string of length 64 matching `/^[0-9a-f]{64}$/`
   - `result.salt` is a `Uint8Array` of length 32
   - `result.saltHex` is a string of length 64 matching `/^[0-9a-f]{64}$/`

2. **Different calls produce different hashes (random salt):** Call `commitBoard(TEST_SHIPS)` twice. Verify `result1.hash !== result2.hash`. (The probability of collision is astronomically small — `2^-256`.)

3. **Different calls produce different salts:** Verify `result1.saltHex !== result2.saltHex`.

4. **Deterministic sort — shuffled ships produce verifiable hash:** Create a shuffled copy of `TEST_SHIPS` (e.g., `[destroyer, carrier, submarine, battleship, cruiser]`). Call `commitBoard(shuffledShips)`. Then manually reconstruct the expected payload using sorted ships and the returned `saltHex`: `JSON.stringify(sortedShips) + ':' + result.saltHex`. Compute `sha256(payload)` and verify it equals `result.hash`. This proves the sort happened correctly.

5. **Does not mutate input array:** Create a shuffled array. Store a copy of the original order. Call `commitBoard(shuffled)`. Verify the original array order is unchanged.

## Acceptance Criteria

- [ ] `commitBoard()` is exported from `app/src/composables/useCrypto.ts`
- [ ] `commitBoard()` returns a `CommitResult` with 64-char lowercase hex `hash`, 32-byte `salt`, and 64-char `saltHex`
- [ ] Calling `commitBoard()` twice with the same ships produces different hashes (random salt)
- [ ] Passing ships in any order produces the same hash when the sort is verified against the returned salt (deterministic serialization)
- [ ] The input ships array is not mutated
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Never use `Math.random()` for salt generation.** Use `crypto.getRandomValues(new Uint8Array(32))`. This is a hard requirement from `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.5.
- **Do not mutate the input.** Use `[...ships].sort(...)` to create a sorted copy. The original array must remain in the caller's order.
- **Sort by `type` using `localeCompare`.** The alphabetical order of the 5 ship types is: battleship, carrier, cruiser, destroyer, submarine. Using `localeCompare` ensures consistent sorting regardless of locale.
- **The payload delimiter is a colon** (`:`). The format is `JSON.stringify(sortedShips) + ':' + saltHex`. This matches `docs/05-PROTOCOL-SPEC.md` Section 7.1 and `docs/02-ARCHITECTURE.md` Section 5.2.
- **Testing deterministic sort:** To verify AC 8 from the phase overview without controlling the salt, reconstruct the payload from the returned `saltHex` and sorted ships, then hash it and compare to `result.hash`. This is the recommended approach since the salt is generated internally.
- **`saltHex` must match `toHex(salt)`.** This is a consistency requirement — the hex encoding of the salt bytes in the result must be the same function used to encode the salt in the payload.
