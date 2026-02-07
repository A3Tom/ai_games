# Phase 01 — Project Scaffolding: Ticket Index

## Ticket Index

| # | Title | New Files | Modified Files | Prerequisites |
|---|-------|-----------|----------------|---------------|
| 001 | [Vite + Vue 3 + TypeScript Project Initialization](001-project-initialization.md) | 11 | 0 | None |
| 002 | [Tailwind CSS and Global Styles](002-tailwind-css-setup.md) | 4 | 2 | 001 |
| 003 | [ESLint and Prettier Configuration](003-eslint-prettier-config.md) | 2 | 1 | 001 |
| 004 | [Vue Router with Hash History and Stub Views](004-router-and-stub-views.md) | 4 | 2 | 001 |

## Dependency Graph

```
001  Project Initialization
 │
 ├── 002  Tailwind CSS Setup
 │
 ├── 003  ESLint + Prettier Config
 │
 └── 004  Router + Stub Views
```

Tickets 002, 003, and 004 all depend on 001 but have **no dependencies on each other**. They can be executed in any order after 001 completes. There are no circular dependencies.

## Suggested Execution Order

```
Step 1:  001  (must be first — everything depends on it)
Step 2:  003  (recommended second — catches lint issues in subsequent work)
Step 3:  002  (Tailwind available for stub views)
Step 4:  004  (creates views that pass lint and can use Tailwind classes)
```

**Parallel execution opportunities:** After Ticket 001, tickets 002, 003, and 004 could theoretically be worked on in parallel by separate agents, since they touch different files. However, sequential execution in the order above produces the cleanest result:

- Running 003 before 004 means the stub views are written lint-clean from the start.
- Running 002 before 004 means the stub views can use Tailwind utility classes.
- If parallelizing, note that both 002 and 004 modify `main.ts` and `App.vue` — they would need to be merged carefully.

## Estimated Total

**4 tickets.**

All tickets are appropriately sized for the scaffolding phase. Ticket 001 touches the most files (11) but they are all trivially small configuration and boilerplate files that form an indivisible bootstrapping unit. No tickets are candidates for further splitting.

## Phase Completion Checklist

When all 4 tickets are complete, verify the phase overview's acceptance criteria (`docs/phases/phase-01-project-scaffolding.md` Section 7):

- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts Vite and the app loads in a browser
- [ ] `npm run build` produces a production build with no TypeScript errors
- [ ] `/#/` renders LobbyView stub
- [ ] `/#/game/test123` renders GameView stub with `roomId` = `"test123"`
- [ ] `/#/nonexistent` renders NotFoundView stub
- [ ] Tailwind utility classes render correctly
- [ ] `npm run lint` produces no errors
- [ ] `.env.example` contains `VITE_RELAY_URL` and `VITE_ROOM_ID_LENGTH`
- [ ] GameView uses lazy loading for code splitting
