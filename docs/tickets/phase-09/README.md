# Phase 09 — UI Lobby: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-app-header-component.md) | AppHeader Shared Component | 1 (`AppHeader.vue`) | Phase 1 |
| [002](002-create-room-component.md) | CreateRoom Lobby Component | 2 (`CreateRoom.vue`, `CreateRoom.test.ts`) | Phases 1, 3, 7 |
| [003](003-join-room-component.md) | JoinRoom Lobby Component | 2 (`JoinRoom.vue`, `JoinRoom.test.ts`) | Phase 1 |
| [004](004-lobby-view-integration.md) | LobbyView Layout and Navigation Integration | 2 (`LobbyView.vue`, `LobbyView.test.ts`) | Phase 1, Tickets 002, 003 |
| [005](005-app-vue-header-integration.md) | Add AppHeader to App.vue Root Layout | 1 (`App.vue`) | Phase 1, Ticket 001 |

## Dependency Graph

```
Phases 1, 2, 3, 4, 6, 7, 8 (complete)
  │
  ├──► 001 AppHeader ──────────────────────► 005 App.vue Header Integration
  │
  ├──► 002 CreateRoom ──┐
  │                      ├──► 004 LobbyView Integration
  └──► 003 JoinRoom ────┘
```

**Key observations:**
- Tickets 001, 002, and 003 are **independent of each other** — they can be completed in any order or in parallel. Each creates a self-contained component.
- Ticket 004 depends on **both** 002 and 003 — it composes `CreateRoom` and `JoinRoom` into the lobby view and wires navigation.
- Ticket 005 depends only on 001 — it adds `AppHeader` to the root `App.vue` layout.
- Tickets 004 and 005 are **independent of each other** — they can be completed in either order or in parallel.

## Suggested Execution Order

```
Step 1:  001 AppHeader  ║  002 CreateRoom  ║  003 JoinRoom
         (parallel — all three are independent)

Step 2:  004 LobbyView Integration  ║  005 App.vue Header Integration
         (parallel — 004 needs 002+003, 005 needs 001)
```

**Minimum sequential steps:** 2
**If executing linearly:** 001 → 002 → 003 → 004 → 005 (or many other valid orderings)

## Estimated Total

**5 tickets.** This is a straightforward UI phase with well-separated components.

**Sizing assessment:**
- **Ticket 001** (AppHeader): Very small (~10 minutes). Purely presentational, no logic, no tests.
- **Ticket 002** (CreateRoom): Medium (~30–40 minutes). Has crypto check, room ID generation, clipboard API, and 5 test cases.
- **Ticket 003** (JoinRoom): Medium (~25–35 minutes). Has input validation, form handling, and 7 test cases.
- **Ticket 004** (LobbyView): Small-medium (~20–30 minutes). Composes existing components, adds navigation handlers, 4 test cases.
- **Ticket 005** (App.vue integration): Very small (~10 minutes). Single import + template change, no tests needed.

No tickets feel too large for a single session. Ticket 002 is the most complex due to the crypto availability check and clipboard functionality, but it's well within the 45-minute guideline.

**Phase completion checkpoint:** After all 5 tickets, the lobby should be fully functional: users can create rooms (seeing a shareable link with copy support), join rooms by ID (with validation), and both paths navigate to the game view. The "Sea Strike" header appears on every page. Running `npm run build` should produce no TypeScript errors.
