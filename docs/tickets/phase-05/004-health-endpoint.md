# Phase 05 — Ticket 004: Health Endpoint

## Summary

Implement the HTTP `/health` endpoint handler in `relay/src/health.ts`. This handler returns a JSON response with the relay's current status, room count, and connection count. It is used by Docker's `HEALTHCHECK` directive and for external monitoring. When done, the agent should have a standalone request handler function that can be wired into the HTTP server (ticket 005).

## Prerequisites

- **Ticket 001** must be complete — `relay/package.json` and `relay/tsconfig.json` exist with TypeScript installed.

No dependency on ticket 002 (types) or ticket 003 (room manager). The health handler defines its own response interface and accepts a stats-getter function via dependency injection, making it independently compilable.

## Scope

**In scope:**

- `HealthResponse` interface
- `createHealthHandler()` factory function that accepts a stats provider and returns an HTTP request handler
- The handler must respond to `GET /health` with JSON and return 404 for other paths

**Out of scope:**

- HTTP server creation — ticket 005 (`server.ts` creates the server and wires in this handler)
- Room manager implementation — ticket 003 (the handler uses dependency injection, not a direct import)
- WebSocket upgrade handling — ticket 005
- Docker health check configuration — ticket 006

## Files

| File | Action | Description |
|------|--------|-------------|
| `relay/src/health.ts` | Create | HTTP health check endpoint handler |

## Requirements

### HealthResponse Interface

From `docs/phases/phase-05-relay-server.md` Section 6:

```typescript
export interface HealthResponse {
  status: 'ok'
  rooms: number
  connections: number
}
```

### Handler Factory

```typescript
import { IncomingMessage, ServerResponse } from 'node:http'

type StatsProvider = () => { rooms: number; connections: number }

export function createHealthHandler(
  getStats: StatsProvider
): (req: IncomingMessage, res: ServerResponse) => void
```

The factory pattern uses dependency injection so that `health.ts` does not import `room-manager.ts` directly. In `server.ts` (ticket 005), the handler will be created like:

```typescript
const healthHandler = createHealthHandler(() => roomManager.getStats())
```

### Handler Behavior

The returned handler function must:

1. **Check the request URL and method.** If the request is `GET /health`, proceed. For all other paths or methods, return a `404` response with `{ "error": "Not found" }`.
2. **Call `getStats()`** to retrieve the current room and connection counts.
3. **Respond with JSON:**
   ```json
   { "status": "ok", "rooms": 0, "connections": 0 }
   ```
4. **Set headers:**
   - `Content-Type: application/json`
   - `Cache-Control: no-cache` (health data must always be fresh)
5. **Return HTTP 200** status code.

### Error Handling

- If `getStats()` throws, respond with HTTP 500 and `{ "error": "Internal server error" }`.
- The handler must never throw — catch all errors internally and return an appropriate HTTP error response.

Reference: `docs/02-ARCHITECTURE.md` Section 9.1 (health endpoint specification), `docs/phases/phase-05-relay-server.md` Section 6 (HealthResponse interface).

## Acceptance Criteria

- [ ] File exists at `relay/src/health.ts`
- [ ] `HealthResponse` interface is exported
- [ ] `createHealthHandler` function is exported
- [ ] `npm run build` in `relay/` produces no TypeScript errors
- [ ] Handler returns `200` with `{ "status": "ok", "rooms": 0, "connections": 0 }` for `GET /health` when stats provider returns zeroes
- [ ] Handler returns `404` for non-`/health` paths

## Notes for the Agent

- **Use dependency injection, not direct imports.** Do NOT `import { RoomManager } from './room-manager'` in this file. The `createHealthHandler` factory accepts a `getStats` callback, which `server.ts` will wire up later. This keeps the health module independently compilable and testable.
- **Use `node:http` types** (`IncomingMessage`, `ServerResponse`) for the handler signature. These are built-in Node.js types and do not require additional packages.
- **`res.end()` must be called** to finalize the response. Forgetting to call `res.end()` will cause the request to hang.
- **The handler handles non-health paths too.** When wired into the HTTP server in ticket 005, this handler will receive ALL HTTP requests (not just `/health`). It must return 404 for anything that isn't `GET /health`. The WebSocket upgrade is handled separately by the `ws` library before HTTP handlers fire.
- **Do not add CORS headers.** The health endpoint is accessed by Docker and monitoring tools, not browsers. CORS is unnecessary.
- Reference `docs/02-ARCHITECTURE.md` Section 6.1 for how Docker uses the health endpoint: `curl -f http://localhost:8080/health`.
