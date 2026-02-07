# Phase 7: Crypto Composable

## 1. Objective

Implement the `useCrypto` composable that provides cryptographic board commitment and verification using the Web Crypto API. Before this phase, there is no hashing or verification logic. After this phase, the client can generate a SHA-256 commitment hash of a board layout with a random salt, and later verify an opponent's revealed board against their committed hash — enabling the full anti-cheat protocol.

## 2. Prerequisites

- **Phase 1** must be complete: project compiles and runs.
- **Phase 2** must be complete: `PlacedShip`, `ShipType`, `BoardCommitment` types are defined.

Specific dependencies:
- `app/src/types/game.ts` — `PlacedShip`, `ShipType`, `BoardCommitment`
- `docs/05-PROTOCOL-SPEC.md` Section 7 — commitment and verification algorithm
- `docs/02-ARCHITECTURE.md` Section 5.2–5.3 — serialization format, salt generation

## 3. Scope

### In Scope

- `app/src/composables/useCrypto.ts`: Board commitment (hash generation), board verification (hash comparison), deterministic board serialization, salt generation.
- Unit tests for the full commit-reveal cycle: honest boards verify, tampered boards fail.

### Out of Scope

- WebSocket message sending of commit/reveal — Phase 8 (`useGameProtocol`).
- Store updates on commit/reveal — Phase 4 stores are already defined; Phase 8 wires them.
- Post-game result verification (checking individual shot honesty against revealed board) — this logic may live in the game store (Phase 4) or the game protocol composable (Phase 8), not in the crypto composable. The crypto composable only handles hash commitment and verification.
- UI for displaying verification results — Phase 12.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/composables/useCrypto.ts` | Create | `commitBoard()` and `verifyBoard()` functions using Web Crypto API |
| `app/src/composables/useCrypto.test.ts` | Create | Unit tests for commit-reveal cycle with honest and tampered boards |

## 5. Key Design Decisions

1. **Web Crypto API only:** No external crypto libraries. `crypto.subtle.digest('SHA-256', ...)` is the sole hashing mechanism (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.5, `docs/03-CODING-STANDARDS.md` Section 9).

2. **Salt from `crypto.getRandomValues`:** The 32-byte salt must be generated with `crypto.getRandomValues(new Uint8Array(32))`, never `Math.random()` (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.5).

3. **Deterministic serialization:** Ships must be sorted alphabetically by `type` before `JSON.stringify`. The payload format is `JSON.stringify(ships) + ':' + saltHex` (see `docs/05-PROTOCOL-SPEC.md` Section 7.1, `docs/02-ARCHITECTURE.md` Section 5.3).

4. **Hex encoding:** Both the salt and the hash are represented as 64-character lowercase hexadecimal strings (see `docs/05-PROTOCOL-SPEC.md` Section 7.1 output specification).

5. **Error handling for non-HTTPS:** `crypto.subtle` is only available in secure contexts (HTTPS or localhost). If unavailable, show a user-facing error rather than silently proceeding without anti-cheat (see `docs/03-CODING-STANDARDS.md` Section 6).

6. **Composable is framework-agnostic:** `useCrypto` does not import Vue components. It may use Vue's `ref` if it needs to expose reactive state, but the core functions are pure async utilities (see `docs/03-CODING-STANDARDS.md` Section 5).

## 6. Interfaces & Contracts

### `app/src/composables/useCrypto.ts`

```typescript
import type { PlacedShip } from '../types/game'

interface CommitResult {
  hash: string         // 64-char lowercase hex SHA-256
  salt: Uint8Array     // 32 random bytes
  saltHex: string      // 64-char lowercase hex encoding of salt
}

/**
 * Generate a SHA-256 commitment hash for a board layout.
 *
 * Process (per docs/05-PROTOCOL-SPEC.md Section 7.1):
 * 1. Sort ships alphabetically by type
 * 2. canonical = JSON.stringify(sortedShips)
 * 3. saltHex = hex(crypto.getRandomValues(32))
 * 4. payload = canonical + ':' + saltHex
 * 5. hash = hex(SHA-256(payload))
 */
export function commitBoard(ships: PlacedShip[]): Promise<CommitResult>

/**
 * Verify an opponent's revealed board against their committed hash.
 *
 * Process (per docs/05-PROTOCOL-SPEC.md Section 7.2):
 * 1. canonical = JSON.stringify(opponentShips)  — already sorted
 * 2. payload = canonical + ':' + opponentSaltHex
 * 3. recomputedHash = hex(SHA-256(payload))
 * 4. return recomputedHash === opponentHash
 */
export function verifyBoard(
  opponentShips: PlacedShip[],
  opponentSaltHex: string,
  opponentHash: string
): Promise<boolean>

/**
 * Check if the Web Crypto API is available (secure context).
 */
export function isCryptoAvailable(): boolean

/**
 * Convenience: wrap commitBoard and verifyBoard in a composable
 * that can also expose reactive availability state.
 */
export function useCrypto(): {
  commitBoard: typeof commitBoard
  verifyBoard: typeof verifyBoard
  isAvailable: boolean
}
```

## 7. Acceptance Criteria

1. `commitBoard()` returns a `CommitResult` with a 64-character lowercase hex `hash`, a 32-byte `salt`, and a 64-character `saltHex`.
2. Calling `commitBoard()` twice with the same ships produces different hashes (because the salt is random).
3. `verifyBoard()` returns `true` when given the same ships and salt that were used to generate the hash.
4. `verifyBoard()` returns `false` when any ship position is modified after commitment.
5. `verifyBoard()` returns `false` when the salt is modified.
6. `verifyBoard()` returns `false` when a ship is added or removed.
7. `verifyBoard()` returns `false` when ship order changes but types are no longer sorted alphabetically (verifying that the sort is deterministic).
8. `commitBoard()` sorts ships alphabetically by `type` before hashing, so passing ships in any order produces the same hash as long as the same salt is used.
9. `isCryptoAvailable()` returns `true` in a secure context (localhost or HTTPS).
10. All crypto unit tests pass.
11. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **`commitBoard()`** used by Phase 8 (game protocol composable calls this when the player clicks "Ready" and sends the commit message).
- **`verifyBoard()`** used by Phase 8 or Phase 12 (called during the reveal phase to check opponent's board against their committed hash).
- **`isCryptoAvailable()`** used by Phase 9 (lobby UI can show an error if crypto is unavailable in a non-secure context).

### Boundaries

- The crypto composable does NOT send messages. It returns data (hash, salt) that Phase 8's `useGameProtocol` wraps into protocol messages and sends via `useRelay`.
- Post-game **shot result verification** (checking that each hit/miss was honest against the revealed board) is NOT part of this composable. That logic belongs in the game store (Phase 4) or the game protocol composable (Phase 8), using the `getShipCells()` utility from Phase 3.
- The crypto composable does NOT store state in Pinia. The game store (Phase 4) stores `myCommitHash`, `opponentCommitHash`, and `mySalt`.
