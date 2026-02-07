# Phase 04 — Stores: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-connection-store.md) | Connection Store | 2 (`stores/connection.ts`, `stores/connection.test.ts`) | Phase 3 |
| [002](002-game-store-foundation.md) | Game Store Foundation — State, Getters, and Setup Transition | 2 (`stores/game.ts`, `stores/game.test.ts`) | Phase 3 |
| [003](003-ship-placement-actions.md) | Ship Placement Actions | 2 (`stores/game.ts`, `stores/game.test.ts`) | Ticket 002 |
| [004](004-commit-phase-actions.md) | Commit Phase Actions | 2 (`stores/game.ts`, `stores/game.test.ts`) | Tickets 001, 002 |
| [005](005-battle-actions.md) | Battle Actions | 2 (`stores/game.ts`, `stores/game.test.ts`) | Tickets 003, 004 |
| [006](006-reveal-endgame-actions.md) | Reveal and Endgame Actions | 2 (`stores/game.ts`, `stores/game.test.ts`) | Ticket 005 |

## Dependency Graph

```
Phase 3 (complete)
  │
  ├──► 001 Connection Store ─────────────┐
  │                                      │
  └──► 002 Game Store Foundation ──┬─────┤
                                   │     │
                   003 Ship Placement    004 Commit Phase Actions
                                   │     │
                                   └──┬──┘
                                      │
                                 005 Battle Actions
                                      │
                                 006 Reveal & Endgame
```

**Key observations:**

- Tickets 001 and 002 are **fully independent** — they can be completed in any order or in parallel. Both depend only on Phase 3.
- Ticket 003 depends on **002 only** (needs the game store skeleton).
- Ticket 004 depends on **both 001 and 002** (needs connection store for `isHost` in `startBattle()`, and game store skeleton).
- Ticket 005 depends on **both 003 and 004** (needs ship placement for test setup, and commit/battle-start actions to reach BATTLE phase).
- Ticket 006 depends on **005 only** (needs battle actions for the complete game flow and for testing reveal transitions).

## Suggested Execution Order

```
Step 1 (parallel):  001 Connection Store
                    002 Game Store Foundation

Step 2 (parallel):  003 Ship Placement Actions
                    004 Commit Phase Actions

Step 3:             005 Battle Actions

Step 4:             006 Reveal and Endgame Actions
```

**Minimum sequential steps:** 4

**If executing linearly:** 001 → 002 → 003 → 004 → 005 → 006 (or swap 001/002 and 003/004 within their pairs)

## Estimated Total

**6 tickets.** The game store is decomposed into 5 incremental tickets (002–006) because it contains 11 state refs, 3 getters, and 13 actions — too much for a single session. The connection store is a single ticket (001) since it is simpler (6 state refs, 2 getters, 9 actions of mostly simple setters).

Sizing assessment:

- **Ticket 001** (connection store — 9 actions + tests): Simple setter actions. ~15–20 minutes.
- **Ticket 002** (game store foundation — 11 state + 3 getters + 1 action + tests): Moderate — defining all state and getting the getters right. ~25–30 minutes.
- **Ticket 003** (ship placement — 2 actions + tests): `placeShip` has non-trivial validation logic. ~20–25 minutes.
- **Ticket 004** (commit phase — 3 actions + tests): Includes cross-store interaction testing. ~20–25 minutes.
- **Ticket 005** (battle actions — 3 actions + tests): The most complex ticket — `receiveShot` has hit detection, sunk detection, and board updates. ~30–40 minutes.
- **Ticket 006** (reveal/endgame — 5 actions + tests): Actions are individually simple, but the lifecycle integration test adds testing time. ~25–35 minutes.

No tickets feel too large. Ticket 005 is the heaviest but the three actions are tightly coupled (fire/receive/result form a single exchange) and splitting them further would lose coherence. If it proves slow, `receiveShot()` (with its sunk-detection logic) could be extracted into its own ticket — but this is unlikely to be necessary.
