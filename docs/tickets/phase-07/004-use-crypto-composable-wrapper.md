# Phase 07 — Ticket 004: useCrypto Composable Wrapper

## Summary

Implement the `useCrypto()` composable function that bundles `commitBoard`, `verifyBoard`, and `isAvailable` into a single composable return object. This is the public API that future phases (Phase 8, 9, 12) will import. When done, the agent should have the complete `useCrypto` composable with a full end-to-end commit-reveal integration test, and `npm run build` should produce no errors.

## Prerequisites

- **Ticket 001 complete.** `isCryptoAvailable()` exists.
- **Ticket 002 complete.** `commitBoard()` exists.
- **Ticket 003 complete.** `verifyBoard()` exists.
- All three functions are exported from `app/src/composables/useCrypto.ts`.

## Scope

**In scope:**

- `useCrypto()` composable function (exported)
- Returns `{ commitBoard, verifyBoard, isAvailable }` where `isAvailable` is a boolean
- End-to-end integration test: commit with shuffled ships via the composable, then verify with sorted ships
- Final build verification

**Out of scope:**

- Vue reactive state beyond a plain boolean (no `ref` needed unless `isAvailable` needs to be reactive — for this phase, a plain boolean suffices since crypto availability does not change at runtime)
- Sending/receiving messages — Phase 8 (`useGameProtocol`)
- Store integration — Phase 4/8 (the game store stores hashes; the composable only computes them)
- UI for crypto unavailability — Phase 9

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useCrypto.ts` | Modify | Add `useCrypto` composable function |
| `app/src/composables/useCrypto.test.ts` | Modify | Add composable and integration tests |

## Requirements

### `useCrypto()`

A convenience composable that wraps the individual crypto functions.

```typescript
export function useCrypto(): {
  commitBoard: typeof commitBoard
  verifyBoard: typeof verifyBoard
  isAvailable: boolean
}
```

**Implementation:**

- Call `isCryptoAvailable()` once and store the result as `isAvailable`.
- Return `{ commitBoard, verifyBoard, isAvailable }`.
- `commitBoard` and `verifyBoard` are the same exported functions from this module — just re-exposed through the composable return object.
- This is a synchronous function. It does not need to be async. The `commitBoard` and `verifyBoard` functions it returns are async, but the composable itself just bundles references.

**Design rationale** (per `docs/03-CODING-STANDARDS.md` Section 5):

- Composables return refs, computed values, and functions.
- Since `isAvailable` does not change at runtime (crypto.subtle is either present or not when the page loads), a plain `boolean` is sufficient. Using a Vue `ref` here would be over-engineering. If a future phase needs reactivity (e.g., for testing or SSR), it can be upgraded then.
- The composable does not import Vue components or UI code. It is framework-agnostic.
- The composable does not manage lifecycle hooks (`onMounted`, `onUnmounted`) because there is nothing to clean up. Crypto functions are stateless.

### Test Requirements

Add tests to `app/src/composables/useCrypto.test.ts` in a `describe('useCrypto', ...)` block.

Required test cases:

1. **Returns correct shape:** Call `useCrypto()`. Verify the returned object has:
   - `commitBoard` — is a function
   - `verifyBoard` — is a function
   - `isAvailable` — is a boolean

2. **`isAvailable` is `true` in test environment:** Since Vitest runs in an environment with `crypto.subtle` available, `isAvailable` should be `true`.

3. **End-to-end commit-reveal via composable (honest board):** Use the composable's `commitBoard` with ships in a shuffled (non-alphabetical) order. Then use the composable's `verifyBoard` with the same ships in alphabetically sorted order, plus the returned `saltHex` and `hash`. Verify it returns `true`. This tests the full round-trip through the composable API.

4. **End-to-end commit-reveal via composable (tampered board):** Use the composable's `commitBoard`. Then use `verifyBoard` with a modified ship placement. Verify it returns `false`.

Use this shuffled test fixture:

```typescript
const SHUFFLED_SHIPS: PlacedShip[] = [
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
]

const SORTED_SHIPS: PlacedShip[] = [
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
]
```

The end-to-end test should:
1. `const { commitBoard, verifyBoard } = useCrypto()`
2. `const result = await commitBoard(SHUFFLED_SHIPS)`
3. `const isValid = await verifyBoard(SORTED_SHIPS, result.saltHex, result.hash)`
4. `expect(isValid).toBe(true)`

## Acceptance Criteria

- [ ] `useCrypto()` is exported from `app/src/composables/useCrypto.ts`
- [ ] `useCrypto()` returns an object with `commitBoard` (function), `verifyBoard` (function), and `isAvailable` (boolean)
- [ ] `isAvailable` is `true` in a secure context (test environment)
- [ ] End-to-end commit-reveal round-trip through the composable succeeds for an honest board
- [ ] End-to-end commit-reveal round-trip through the composable fails for a tampered board
- [ ] `npm run build` produces no TypeScript errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Keep the composable simple.** It is a thin wrapper. Do not add caching, state management, error boundaries, or anything beyond bundling the three existing functions into a return object.
- **No Vue imports needed** for this implementation. Since `isAvailable` is a plain boolean, there's no need for `ref()` or `computed()`. If the linter or type checker complains about missing Vue composable patterns, that's fine — this composable is intentionally framework-agnostic per `docs/03-CODING-STANDARDS.md` Section 5.
- **The end-to-end test is the most important test in this ticket.** It validates that the full commit-reveal cycle works when accessed through the composable API — commit with shuffled ships, verify with sorted ships. This is the primary deliverable of Phase 7 as described in `docs/04-AI-ASSISTANT-GUIDE.md` Phase 7 checkpoint: "Crypto tests pass with both honest and tampered boards."
- **Run `npm run build` as a final check.** The phase overview AC 11 requires no TypeScript errors from the build. This is the gate for phase completion.
- **Do not add an index barrel file** for composables. The phase overview does not call for one, and creating one would be out of scope.
