# Phase 13 — Polish & Deploy

## Ticket Index

| # | Ticket | Title | Files | Prerequisites |
|---|--------|-------|-------|---------------|
| 001 | [001-connection-status-component.md](001-connection-status-component.md) | Connection Status Component | 2 (create) | Phases 1–12 (connection store from Phase 4) |
| 002 | [002-app-header-connection-status.md](002-app-header-connection-status.md) | AppHeader Connection Status Integration | 2 (modify) | Ticket 001; Phase 9 (AppHeader) |
| 003 | [003-reconnection-overlay-component.md](003-reconnection-overlay-component.md) | Reconnection Overlay Component | 2 (create) | Phases 1–12 (connection store from Phase 4/6) |
| 004 | [004-game-view-reconnection-integration.md](004-game-view-reconnection-integration.md) | GameView Reconnection Overlay Integration | 2 (modify) | Ticket 003; Phase 10/11/12 (GameView) |
| 005 | [005-responsive-layout-fixes.md](005-responsive-layout-fixes.md) | Responsive Layout Fixes | 3 (modify) | Phases 1–12 (all game screens exist) |
| 006 | [006-github-actions-deploy.md](006-github-actions-deploy.md) | GitHub Actions Deploy Workflow | 1 (create) | Phases 1–12 (app builds successfully) |
| 007 | [007-caddyfile-reverse-proxy.md](007-caddyfile-reverse-proxy.md) | Caddyfile Reverse Proxy Configuration | 1 (create) | Phase 5 (relay + docker-compose) |

## Dependency Graph

```
001 (ConnectionStatus) ──→ 002 (AppHeader Integration)

003 (ReconnectionOverlay) ──→ 004 (GameView Integration)

005 (Responsive Fixes)          [independent]

006 (GitHub Actions Deploy)     [independent]

007 (Caddyfile)                 [independent]
```

- Tickets 001 → 002 form a chain: create the component, then wire it into the header.
- Tickets 003 → 004 form a chain: create the overlay, then wire it into GameView.
- Tickets 005, 006, and 007 are fully independent of each other and of the two chains above.
- The two chains (001→002 and 003→004) are also independent of each other.

## Suggested Execution Order

```
Step 1 (parallel): Ticket 001, Ticket 003, Ticket 005, Ticket 006, Ticket 007
Step 2 (parallel): Ticket 002 (after 001), Ticket 004 (after 003)
```

Five tickets can be worked on simultaneously in Step 1 since they have no cross-dependencies. Step 2 completes the two integration tickets once their component prerequisites are done.

If working sequentially, a reasonable order is:

```
001 → 002 → 003 → 004 → 005 → 006 → 007
```

This builds the connection status feature first (visible feedback), then reconnection UI, then responsive polish, then infrastructure. But any ordering that respects the two dependency chains (001→002, 003→004) is valid.

## Estimated Total Tickets

**7 tickets.**

All tickets are appropriately sized:

- **Ticket 001** (ConnectionStatus) is moderate — creates a new Vue component with computed status logic and 8 test cases. Estimated ~60–80 lines of component code + ~80 lines of tests.
- **Ticket 002** (AppHeader Integration) is small — adds an import and component tag to an existing file. Estimated ~5–10 lines of changes + ~20 lines of tests.
- **Ticket 003** (ReconnectionOverlay) is moderate — creates an overlay component with two states (reconnecting/disconnected) and retry functionality. Estimated ~70–90 lines of component code + ~60 lines of tests.
- **Ticket 004** (GameView Integration) is small — adds an import and component tag to an existing file. Estimated ~5–10 lines of changes + ~15 lines of tests.
- **Ticket 005** (Responsive Fixes) is moderate — audits and fixes up to 3 files for mobile layout. Changes are Tailwind class adjustments, not structural. Estimated ~10–30 lines of changes across files.
- **Ticket 006** (GitHub Actions) is small — creates a single YAML file from an existing specification. Estimated ~40 lines.
- **Ticket 007** (Caddyfile) is small — creates a single 3-line config file plus verification. Estimated ~5 lines of config + inspection work.

No tickets appear to need further splitting. The largest tickets (001, 003) each create one component with tests and stay well under the 200-line component limit.

## Manual Post-Deployment Verification

The following acceptance criteria from the phase overview require a live deployment and cannot be automated by AI agent tickets:

- **AC 12:** Full game played through production deployment (create → join → setup → battle → game over → verify → rematch)
- **AC 13:** Lighthouse performance score > 90 on the deployed site

These should be verified manually by the developer after completing all tickets and deploying to GitHub Pages and the VPS.
