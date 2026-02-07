# Phase 05 — Ticket 001: Relay Project Scaffolding

## Summary

Initialize the `relay/` Node.js project with TypeScript, installing dependencies and configuring build tooling. This creates the foundation that all subsequent Phase 5 tickets build upon. When done, the agent should have a `relay/` directory with `package.json`, `tsconfig.json`, and `.env.example` — where `npm install`, `npm run build`, and `npm run test` all execute without errors (even if there is no source code to compile yet).

## Prerequisites

- **Phase 2 complete** — protocol message types are defined in `app/src/types/protocol.ts`. The relay mirrors a subset of these types independently (no cross-project imports).
- No dependencies on Phases 3–4; the relay is a standalone codebase.

## Scope

**In scope:**

- `relay/package.json` with project metadata, scripts (`dev`, `build`, `start`, `test`), and dependencies (`ws`, `@types/ws`, `typescript`, `vitest`)
- `relay/tsconfig.json` with strict TypeScript configuration targeting Node.js 20
- `relay/.env.example` with all environment variables documented
- Running `npm install` to generate `package-lock.json`

**Out of scope:**

- Any source code in `relay/src/` — tickets 002–005 handle all source files
- `relay/Dockerfile` — ticket 006
- `docker-compose.yml` — ticket 006
- ESLint/Prettier configuration for the relay — not specified in the phase overview; follow the same standards manually

## Files

| File | Action | Description |
|------|--------|-------------|
| `relay/package.json` | Create | Project metadata, scripts, dependencies |
| `relay/tsconfig.json` | Create | Strict TypeScript config for Node.js 20 |
| `relay/.env.example` | Create | Environment variable template with defaults |

## Requirements

### `relay/package.json`

```json
{
  "name": "sea-strike-relay",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  }
}
```

**Dependencies:**

- `ws` — WebSocket server library (per `docs/02-ARCHITECTURE.md` Section 2.2, `docs/03-CODING-STANDARDS.md` Section 8 dependency policy)

**Dev dependencies:**

- `typescript` (^5.x)
- `@types/ws`
- `@types/node`
- `tsx` — for development mode (`dev` script)
- `vitest` — test runner (per `docs/03-CODING-STANDARDS.md` Section 7)

Do not add any other dependencies. The relay must remain minimal per `docs/03-CODING-STANDARDS.md` Section 8 (dependency policy).

### `relay/tsconfig.json`

Must use strict mode per `docs/03-CODING-STANDARDS.md` Section 1.1:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

Key points:
- `strict: true` is mandatory
- `noUncheckedIndexedAccess: true` per coding standards
- Exclude test files from compilation output (tests run via Vitest, not compiled to `dist/`)
- `module: "Node16"` and `moduleResolution: "Node16"` to match `"type": "module"` in package.json

### `relay/.env.example`

```env
# Relay server configuration
PORT=8080
MAX_ROOMS=100
MAX_CLIENTS_PER_ROOM=2
ROOM_TIMEOUT_MS=3600000
LOG_LEVEL=info
```

These match the environment variables from `docs/02-ARCHITECTURE.md` Section 6.1.

## Acceptance Criteria

- [ ] `relay/package.json` exists with `name`, `version`, `type: "module"`, and all 4 scripts (`dev`, `build`, `start`, `test`)
- [ ] `relay/tsconfig.json` exists with `strict: true` and `noUncheckedIndexedAccess: true`
- [ ] `relay/.env.example` exists with all 5 environment variables (`PORT`, `MAX_ROOMS`, `MAX_CLIENTS_PER_ROOM`, `ROOM_TIMEOUT_MS`, `LOG_LEVEL`)
- [ ] `npm install` in `relay/` completes without errors
- [ ] `ws` is listed as a production dependency
- [ ] `typescript`, `vitest`, `@types/ws`, `@types/node`, and `tsx` are listed as dev dependencies

## Notes for the Agent

- **Do not create any `src/` files in this ticket.** The `relay/src/` directory and all source files are handled by tickets 002–005. Creating stub files here would conflict with those tickets.
- **Use `"type": "module"`** in package.json. The relay uses ES modules throughout, matching the modern Node.js pattern.
- **Run `npm install` after creating package.json** to generate `package-lock.json`. The lock file should be committed.
- **Do not add `eslint` or `prettier`** to the relay package.json unless the phase overview explicitly calls for it. The relay is a small codebase; linting configuration for it is not in scope for Phase 5.
- **The `build` script must be plain `tsc`** — this compiles TypeScript to `dist/`. The Dockerfile (ticket 006) depends on `npm run build` producing `dist/server.js`.
- Reference `docs/03-CODING-STANDARDS.md` Section 1 for TypeScript strictness rules and Section 8 for the dependency policy.
