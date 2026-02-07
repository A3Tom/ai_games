# Phase 03 — Board Utilities: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-board-utility-functions.md) | Board Utility Functions | 2 (`utils/board.ts`, `utils/board.test.ts`) | Phase 2 |
| [002](002-protocol-message-type-guards.md) | Protocol Message Type Guards | 2 (`utils/validation.ts`, `utils/validation.test.ts`) | Phase 2 (Ticket 004: protocol types) |
| [003](003-game-validation-functions.md) | Game Validation Functions | 2 (`utils/validation.ts`, `utils/validation.test.ts`) | Tickets 001, 002 |
| [004](004-room-id-generation.md) | Room ID Generation | 2 (`utils/room-id.ts`, `utils/room-id.test.ts`) | Phase 1 (nanoid installed) |

## Dependency Graph

```
Phase 2 (complete)
  │
  ├──► 001 Board Utility Functions ──────┐
  │                                      │
  ├──► 002 Protocol Message Type Guards ─┤──► 003 Game Validation Functions
  │                                      │
  └──► 004 Room ID Generation            │
       (independent)                     │
```

**Key observations:**

- Tickets 001, 002, and 004 are **fully independent** — they can be completed in any order or in parallel.
- Ticket 003 depends on **both** 001 and 002:
  - It imports `getShipCells()` from `board.ts` (ticket 001) for overlap detection.
  - It adds functions to `validation.ts` (created in ticket 002).
- Ticket 004 has no dependencies on other Phase 3 tickets.

## Suggested Execution Order

```
Step 1 (parallel):  001 Board Utility Functions
                    002 Protocol Message Type Guards
                    004 Room ID Generation

Step 2:             003 Game Validation Functions
```

**Minimum sequential steps:** 2

**If executing linearly:** 001 → 002 → 003 → 004 (or 004 at any point — it's independent)

## Estimated Total

**4 tickets.** All are appropriately sized:

- **Ticket 001** (5 functions + tests) is the largest but the functions are closely related pure utilities — a reasonable single session of work (~35–45 minutes).
- **Ticket 002** (13 type guards + parser + tests) is substantial in function count but each guard follows the same pattern, making it mechanical rather than complex (~30–40 minutes).
- **Ticket 003** (2 functions + tests) is modest. It was split from ticket 002 to respect the dependency on `board.ts` and keep the validation.ts file buildable at each step (~15–20 minutes).
- **Ticket 004** (1 function + tests) is trivially small but isolated correctly as its own deliverable (~10 minutes).

No tickets feel too large. If ticket 002 proves slow during implementation (due to the volume of type guards), it could be split into "game message guards" and "relay message guards + parser" — but this is unlikely to be necessary.
