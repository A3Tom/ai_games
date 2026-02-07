# Phase 05 — Relay Server: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-relay-project-scaffolding.md) | Relay Project Scaffolding | 3 (`package.json`, `tsconfig.json`, `.env.example`) | Phase 2 |
| [002](002-relay-message-types.md) | Relay Message Types | 1 (`src/types.ts`) | Ticket 001 |
| [003](003-room-manager.md) | Room Manager | 2 (`src/room-manager.ts`, `src/room-manager.test.ts`) | Tickets 001, 002 |
| [004](004-health-endpoint.md) | Health Endpoint | 1 (`src/health.ts`) | Ticket 001 |
| [005](005-websocket-server.md) | WebSocket Server | 2 (`src/server.ts`, `src/server.test.ts`) | Tickets 002, 003, 004 |
| [006](006-docker-config.md) | Docker Configuration | 3 (`Dockerfile`, `.dockerignore`, `docker-compose.yml`) | Tickets 001, 005 |

## Dependency Graph

```
Phase 2 (complete)
  │
  └──► 001 Project Scaffolding
        │
        ├──► 002 Message Types ──┬──► 003 Room Manager ─────┐
        │                        │                           │
        └────────────────────────┼──► 004 Health Endpoint ──┤
                                 │                           │
                                 └───────────────────► 005 WebSocket Server
                                                             │
                                                        006 Docker Config
```

**Key observations:**

- Ticket 001 is the sole entry point — every other ticket depends on the project scaffolding.
- Tickets 003 and 004 are **fully independent** of each other — they can be completed in any order or in parallel. Both depend on 001; ticket 003 additionally depends on 002.
- Ticket 004 uses dependency injection (accepts a stats callback), so it does NOT depend on ticket 003 (room manager). This was an intentional design choice to maximize parallelism.
- Ticket 005 is the convergence point — it imports and wires together types (002), room manager (003), and health handler (004).
- Ticket 006 depends on 005 because `docker build` executes `npm run build`, which requires all source files to exist and compile.

## Suggested Execution Order

```
Step 1:             001 Project Scaffolding

Step 2 (parallel):  002 Message Types
                    004 Health Endpoint

Step 3:             003 Room Manager (needs 002)

Step 4:             005 WebSocket Server (needs 002, 003, 004)

Step 5:             006 Docker Configuration (needs 005)
```

**Minimum sequential steps:** 5

**If executing linearly:** 001 → 002 → 004 → 003 → 005 → 006 (or swap 002/004 since they're independent once 001 is done)

**Alternative linear order:** 001 → 002 → 003 → 004 → 005 → 006 (simpler but doesn't exploit the 002/004 parallelism)

## Estimated Total

**6 tickets.** This matches the natural file groupings in the phase overview (11 files across 6 logical units).

Sizing assessment:

- **Ticket 001** (scaffolding — 3 config files): Straightforward file creation. ~10–15 minutes.
- **Ticket 002** (types — 1 file): Small file with interfaces, union type, const, and one type guard. ~10–15 minutes.
- **Ticket 003** (room manager — 2 files): The most substantial logic ticket. Room lifecycle, timeout management, broadcasting, plus 9+ unit tests. ~35–45 minutes.
- **Ticket 004** (health endpoint — 1 file): Small handler with dependency injection. ~10–15 minutes.
- **Ticket 005** (server — 2 files): Ties everything together. HTTP + WebSocket server, rate limiting, message routing, plus 7+ integration tests. ~35–45 minutes.
- **Ticket 006** (Docker — 3 files): Mostly copying from architecture spec. ~10–15 minutes.

**Splitting assessment:** Tickets 003 and 005 are the heaviest. Ticket 003 could theoretically be split into "room manager implementation" and "room manager tests," but the decomposition rules (Rule 3) require tests to be in the same ticket as the code they test. Ticket 005 could be split into "server implementation" and "integration tests," but the same rule applies. Both tickets are within the 45-minute soft guideline and have coherent single deliverables, so no further splitting is recommended.
