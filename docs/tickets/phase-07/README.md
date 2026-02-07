# Phase 07 — Crypto Composable: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-crypto-helpers-and-availability.md) | Crypto Helper Utilities and Availability Check | 2 (`useCrypto.ts`, `useCrypto.test.ts`) | Phases 1, 2 |
| [002](002-commit-board-function.md) | Board Commitment Function | 2 (`useCrypto.ts`, `useCrypto.test.ts`) | Ticket 001 |
| [003](003-verify-board-function.md) | Board Verification Function | 2 (`useCrypto.ts`, `useCrypto.test.ts`) | Tickets 001, 002 |
| [004](004-use-crypto-composable-wrapper.md) | useCrypto Composable Wrapper | 2 (`useCrypto.ts`, `useCrypto.test.ts`) | Tickets 001, 002, 003 |

## Dependency Graph

```
Phases 1, 2 (complete)
  │
  └──► 001 Crypto Helper Utilities and Availability Check
        │
        └──► 002 Board Commitment Function
              │
              └──► 003 Board Verification Function
                    │
                    └──► 004 useCrypto Composable Wrapper
```

**Key observations:**

- This phase has a **strictly linear** dependency chain. All four tickets modify the same two files (`useCrypto.ts` and `useCrypto.test.ts`), so parallel execution is not possible.
- Each ticket incrementally adds a layer to the crypto module: helpers → commit → verify → composable wrapper.
- The linear ordering reflects the natural build-up: you need hex encoding and SHA-256 before commitment, commitment before verification (for integration tests), and all functions before the composable wrapper.
- Ticket 003 depends on ticket 002 because its tests use `commitBoard()` to generate valid hashes for verification testing (integration-style tests).

## Suggested Execution Order

```
Step 1:  001 Crypto Helper Utilities and Availability Check
Step 2:  002 Board Commitment Function
Step 3:  003 Board Verification Function
Step 4:  004 useCrypto Composable Wrapper
```

**Minimum sequential steps:** 4

No parallel execution is possible within this phase since all tickets operate on the same files. Execute strictly in order.

## Estimated Total

**4 tickets.** This matches the four logical layers of the `useCrypto` composable: helpers, commit, verify, and wrapper.

Sizing assessment:

- **Ticket 001** (helpers + availability — 2 files): Light. Creates the module with `toHex`, `sha256`, `isCryptoAvailable`, and `CommitResult` interface, plus 7 test cases. ~15–25 minutes.
- **Ticket 002** (commitBoard — 2 files): Moderate. Implements the commitment algorithm with deterministic sorting, salt generation, and 5 test cases. ~20–30 minutes.
- **Ticket 003** (verifyBoard — 2 files): Moderate. Implements verification plus 7 test cases covering all tampering scenarios. ~20–30 minutes.
- **Ticket 004** (composable wrapper — 2 files): Light. Thin wrapper function plus 4 tests including end-to-end integration. ~15–20 minutes.

**Splitting assessment:** All tickets are comfortably within the 45-minute guideline. No ticket is heavy enough to warrant further splitting. The total estimated agent time is 70–105 minutes for the full phase.

## Phase Completion Checkpoint

Per `docs/04-AI-ASSISTANT-GUIDE.md` Phase 7 checkpoint: "Crypto tests pass with both honest and tampered boards." After ticket 004 is complete:

- All unit tests for `toHex`, `sha256`, `isCryptoAvailable`, `commitBoard`, and `verifyBoard` pass.
- The end-to-end commit-reveal integration test passes for honest boards.
- The end-to-end commit-reveal integration test fails for tampered boards.
- `npm run build` produces no TypeScript errors.
