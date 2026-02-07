# Phase 12 — UI: Game Over & Reveal

## Ticket Index

| # | Ticket | Title | Files | Prerequisites |
|---|--------|-------|-------|---------------|
| 001 | [001-game-over-core-component.md](001-game-over-core-component.md) | Game Over Core Component | 2 (create) | Phase 2, Phase 10 (GridCell), Phase 11 |
| 002 | [002-verification-rematch-controls.md](002-verification-rematch-controls.md) | Verification Badge and Rematch Controls | 2 (modify) | Ticket 001 |
| 003 | [003-game-view-gameover-integration.md](003-game-view-gameover-integration.md) | GameView Game Over Integration | 2 (modify) | Tickets 001–002; Phases 4, 8, 10, 11 |

## Dependency Graph

```
001 (Game Over Core) ──→ 002 (Verification & Rematch) ──→ 003 (GameView Integration)
```

- Ticket 001 is the foundation — creates the GameOver component with props contract, winner text, and board grids.
- Ticket 002 depends on Ticket 001 — adds verification badge and rematch controls to the existing component.
- Ticket 003 depends on Tickets 001 and 002 — wires the complete component into GameView with store state mapping and event handling.
- The dependency chain is strictly linear. No tickets within this phase can be parallelized because they modify the same files in sequence.

## Suggested Execution Order

```
Step 1: Ticket 001 (Game Over Core Component)
Step 2: Ticket 002 (Verification Badge and Rematch Controls)
Step 3: Ticket 003 (GameView Game Over Integration)
```

- All steps are sequential — each ticket modifies files created or modified by the previous ticket.
- No parallel execution is possible within this phase.
- The linear chain is expected given that Phase 12 creates one new component (built in two tickets) and modifies one existing file (one ticket).

## Estimated Total Tickets

**3 tickets.**

All tickets are appropriately sized:

- Ticket 001 (Game Over Core) is moderate — creates a new Vue component with two 10×10 board grids, a computed property for board merging, and conditional rendering for the reveal-pending state. Estimated ~80–100 lines of component code + ~80 lines of tests.
- Ticket 002 (Verification & Rematch) is small — adds a verification badge and rematch button/waiting state to the existing component. Estimated ~30–40 lines of additions to the component + ~60 lines of test additions.
- Ticket 003 (GameView Integration) is moderate — adds imports, computed properties, local state, event handler, and template changes to GameView, plus test updates. Estimated ~40–60 lines of changes + ~40 lines of test additions.

No tickets appear to need further splitting. The total component size after Ticket 002 should be approximately 110–140 lines, well within the 200-line component limit. GameView additions are incremental on top of existing phase-routing code.
