# Phase 08 — Game Protocol Composable: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-protocol-composable-scaffold.md) | Protocol Composable Scaffold and Simple Sends | 2 (`useGameProtocol.ts`, `useGameProtocol.test.ts`) | Phases 2, 3, 4, 6, 7 |
| [002](002-commit-shot-reveal-sends.md) | Commit, Shot, and Reveal Send Functions | 2 (`useGameProtocol.ts`, `useGameProtocol.test.ts`) | Ticket 001 |
| [003](003-incoming-message-dispatcher.md) | Incoming Message Dispatcher and Phase Filtering | 2 (`useGameProtocol.ts`, `useGameProtocol.test.ts`) | Ticket 001 |
| [004](004-battle-message-handlers.md) | Battle Phase Shot and Result Handlers | 2 (`useGameProtocol.ts`, `useGameProtocol.test.ts`) | Tickets 002, 003 |
| [005](005-reveal-verification.md) | Reveal Handling and Post-Game Verification | 2 (`useGameProtocol.ts`, `useGameProtocol.test.ts`) | Ticket 003 |
| [006](006-reconnection-sync.md) | Reconnection Sync Protocol | 2 (`useGameProtocol.ts`, `useGameProtocol.test.ts`) | Ticket 003 |

## Dependency Graph

```
Phases 2, 3, 4, 6, 7 (complete)
  │
  └──► 001 Scaffold & Simple Sends
         │
         ├──► 002 Commit/Shot/Reveal Sends ──┐
         │                                    │
         └──► 003 Message Dispatcher ─────────┼──► 004 Battle Handlers
                   │                          │
                   ├──► 005 Reveal Verify     │
                   │                          │
                   └──► 006 Reconnection Sync │
```

**Key observations:**
- Ticket 001 is the foundation — all other tickets depend on it.
- Tickets 002 and 003 are **independent of each other** — they can be completed in either order or in parallel once 001 is done.
- Ticket 004 depends on **both** 002 and 003 — it needs `sendResult()` from 002 and the dispatch infrastructure from 003.
- Tickets 005 and 006 depend only on 003 — they are **independent of each other** and of 002 (though 005 may use `mySaltHex` from 004's modifications to `sendCommit`).
- Tickets 005 and 006 can be completed in parallel.

## Suggested Execution Order

```
Step 1:  001 Scaffold & Simple Sends
         (sequential — foundation)

Step 2:  002 Commit/Shot/Reveal Sends  ║  003 Message Dispatcher
         (parallel)                     ║  (parallel)

Step 3:  004 Battle Handlers
         (sequential — depends on 002 + 003)

Step 4:  005 Reveal Verification       ║  006 Reconnection Sync
         (parallel)                     ║  (parallel)
```

**Minimum sequential steps:** 4
**If executing linearly:** 001 → 002 → 003 → 004 → 005 → 006 (or 001 → 003 → 002 → 004 → 005 → 006)

## Estimated Total

**6 tickets.** All tickets modify the same two files (`useGameProtocol.ts` and `useGameProtocol.test.ts`), building the composable incrementally. Each ticket adds a focused slice of functionality.

**Sizing assessment:**
- Tickets 001, 002, 006 are well-sized (15–25 minutes each).
- Ticket 003 is moderate (25–35 minutes) due to the dispatch infrastructure plus 5 real handlers and 5 stubs.
- Ticket 004 is moderate (25–35 minutes) due to the game-over detection logic and internal state management.
- Ticket 005 is the largest (30–45 minutes) due to the two-part verification (hash + shot honesty). If it proves too large during implementation, the shot honesty verification could be split into its own ticket. But the logic is straightforward — iterate shots and check against revealed positions — so it should fit within one session.

**Phase completion checkpoint:** After all 6 tickets, two browser tabs should be able to play a complete game (setup → commit → battle → reveal → gameover) through the `useGameProtocol` composable, with anti-cheat verification and reconnection recovery. Running `npm run build` should produce no TypeScript errors.
