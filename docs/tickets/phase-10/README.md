# Phase 10 — UI: Ship Setup

## Ticket Index

| # | Ticket | Title | Files | Prerequisites |
|---|--------|-------|-------|---------------|
| 001 | [001-grid-cell-component.md](001-grid-cell-component.md) | GridCell Shared Component | 2 (create) | Phase 1, Phase 2 |
| 002 | [002-ship-tray-component.md](002-ship-tray-component.md) | ShipTray Component | 2 (create) | Phase 1, Phase 2 |
| 003 | [003-setup-phase-grid-placement.md](003-setup-phase-grid-placement.md) | SetupPhase Board Grid and Ship Placement | 2 (create) | Tickets 001, 002; Phases 2, 3, 4 |
| 004 | [004-setup-phase-ready-commit.md](004-setup-phase-ready-commit.md) | SetupPhase Ready Button and Commit Flow | 2 (modify) | Ticket 003; Phases 7, 8 |
| 005 | [005-game-view-phase-router.md](005-game-view-phase-router.md) | GameView Phase Router | 2 (1 modify, 1 create) | Ticket 004; Phases 4, 6, 8, 9 |

## Dependency Graph

```
001 (GridCell) ──────┐
                     ├──→ 003 (SetupPhase: Grid + Placement) ──→ 004 (SetupPhase: Ready + Commit) ──→ 005 (GameView)
002 (ShipTray) ──────┘
```

- Tickets 001 and 002 are **independent** of each other — they can be executed in parallel.
- Ticket 003 depends on both 001 and 002 (imports GridCell and ShipTray).
- Ticket 004 depends on 003 (modifies SetupPhase.vue created in 003).
- Ticket 005 depends on 004 (imports the complete SetupPhase component).

## Suggested Execution Order

```
Step 1: [PARALLEL] Ticket 001 (GridCell) + Ticket 002 (ShipTray)
Step 2: Ticket 003 (SetupPhase — grid and placement)
Step 3: Ticket 004 (SetupPhase — ready and commit)
Step 4: Ticket 005 (GameView — phase router)
```

- **Step 1** can be parallelized — two agents can work on 001 and 002 simultaneously since they share no files or dependencies.
- **Steps 2–4** are sequential — each builds on the output of the previous ticket.

## Estimated Total Tickets

**5 tickets.**

All tickets are appropriately sized:

- Tickets 001 and 002 are small (1 component + 1 test each).
- Ticket 003 is the largest (the interactive grid with placement logic). If during implementation the SetupPhase component exceeds 200 lines, consider extracting the grid rendering into a helper component — but this should not be needed if the template is kept concise.
- Ticket 004 is moderate (adding commit flow to an existing component).
- Ticket 005 is small (thin phase-routing view with placeholder content).

No tickets appear to need further splitting at this stage.
