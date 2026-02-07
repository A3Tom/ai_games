# Phase 02 — Type Foundation: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-core-game-types.md) | Core Game Types | 1 (`types/game.ts`) | Phase 1 |
| [002](002-grid-constants.md) | Grid Constants | 1 (`constants/grid.ts`) | Phase 1 |
| [003](003-fleet-constants.md) | Fleet Constants | 1 (`constants/ships.ts`) | Ticket 001 |
| [004](004-protocol-message-types.md) | Protocol Message Types | 1 (`types/protocol.ts`) | Ticket 001 |

## Dependency Graph

```
Phase 1 (complete)
  │
  ├──► 001 Core Game Types ──┬──► 003 Fleet Constants
  │                          │
  │                          └──► 004 Protocol Message Types
  │
  └──► 002 Grid Constants
```

**Key observations:**
- Tickets 001 and 002 are **independent** — they can be completed in either order or in parallel.
- Tickets 003 and 004 both depend on 001 only — they are **independent of each other** and can be completed in parallel once 001 is done.
- No ticket depends on 002 within this phase.

## Suggested Execution Order

```
Step 1:  001 Core Game Types    ║  002 Grid Constants
         (parallel)             ║  (parallel)
                                ║
Step 2:  003 Fleet Constants    ║  004 Protocol Message Types
         (parallel)             ║  (parallel)
```

**Minimum sequential steps:** 2 (001 → 003/004, with 002 at any point)

**If executing linearly:** 001 → 002 → 003 → 004 (or 001 → 003 → 004 → 002)

## Estimated Total

**4 tickets.** All are appropriately sized — each touches exactly 1 file and contains only type/constant definitions with no runtime logic. No tickets feel too large or warrant further splitting.

**Note on `types/ships.ts`:** The phase overview lists this as an optional file ("Ship-specific types if needed"). Since `ShipType` lives in `game.ts` and `ShipConfig` lives in `constants/ships.ts`, a separate `types/ships.ts` is not needed and has been omitted. If during implementation a need arises, it can be added as a small follow-up.
