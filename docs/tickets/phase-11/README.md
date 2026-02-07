# Phase 11 — UI: Battle

## Ticket Index

| # | Ticket | Title | Files | Prerequisites |
|---|--------|-------|-------|---------------|
| 001 | [001-turn-indicator-component.md](001-turn-indicator-component.md) | TurnIndicator Component | 2 (create) | Phase 1, Phase 2 |
| 002 | [002-game-status-component.md](002-game-status-component.md) | GameStatus Component | 2 (create) | Phase 1, Phase 2 |
| 003 | [003-player-board-component.md](003-player-board-component.md) | PlayerBoard Component | 2 (create) | Phase 10 Ticket 001 (GridCell) |
| 004 | [004-opponent-board-component.md](004-opponent-board-component.md) | OpponentBoard Component | 2 (create) | Phase 10 Ticket 001 (GridCell) |
| 005 | [005-game-view-battle-integration.md](005-game-view-battle-integration.md) | GameView Battle Integration | 2 (modify) | Tickets 001–004; Phases 3, 4, 8, 10 |

## Dependency Graph

```
001 (TurnIndicator) ──────┐
                           │
002 (GameStatus) ──────────┤
                           ├──→ 005 (GameView Battle Integration)
003 (PlayerBoard) ─────────┤
                           │
004 (OpponentBoard) ───────┘
```

- Tickets 001, 002, 003, and 004 are **fully independent** of each other — they share no files, imports, or internal dependencies. All four can be executed in parallel.
- Ticket 005 depends on all of 001–004 (imports all four battle components into GameView).
- Tickets 003 and 004 depend on Phase 10 Ticket 001 (GridCell shared component) as a cross-phase dependency.
- Tickets 001 and 002 have no cross-phase dependencies beyond Phases 1 and 2 (types and Tailwind).

## Suggested Execution Order

```
Step 1: [PARALLEL] Ticket 001 (TurnIndicator) + Ticket 002 (GameStatus) + Ticket 003 (PlayerBoard) + Ticket 004 (OpponentBoard)
Step 2: Ticket 005 (GameView Battle Integration)
```

- **Step 1** is fully parallelizable — up to four agents can work on tickets 001–004 simultaneously since they share no files or dependencies within this phase.
- **Step 2** is sequential — it depends on all four components from Step 1 being complete.

If parallel execution is not available, any ordering of 001–004 works. The simplest linear sequence is: 001 → 002 → 003 → 004 → 005.

## Estimated Total Tickets

**5 tickets.**

All tickets are appropriately sized:

- Tickets 001 (TurnIndicator) is very small (~30 lines, single boolean prop, display-only).
- Ticket 002 (GameStatus) is moderate (fleet status for both players, uses FLEET_CONFIG).
- Tickets 003 (PlayerBoard) and 004 (OpponentBoard) are moderate (10x10 grids with GridCell, column/row labels). They share a similar structure but differ in interactivity.
- Ticket 005 (GameView) is moderate (wiring four components, two computed properties, one watcher, one event handler).

No tickets appear to need further splitting. The largest tickets (003, 004, 005) are estimated at 80–100 lines of component code each, well within the 200-line component limit.
