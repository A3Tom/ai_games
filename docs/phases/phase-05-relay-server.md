# Phase 5: Relay Server

## 1. Objective

Build the stateless WebSocket relay server that brokers connections between players. Before this phase, all code lives in the frontend `app/` directory with no server. After this phase, a fully functional relay server runs in `relay/`, handles room-based message routing, enforces room limits, provides a health endpoint, and is packaged in a Docker container ready for deployment behind Caddy on the VPS.

## 2. Prerequisites

- **Phase 2** must be complete: protocol message types are defined (the relay mirrors a subset of these types for its own internal use).
- No strict dependency on Phases 3–4 (the relay is an independent codebase), but the message format in `docs/05-PROTOCOL-SPEC.md` is the shared contract.

Specific dependencies:
- `docs/05-PROTOCOL-SPEC.md` — message types, room management rules, rate limiting
- `docs/02-ARCHITECTURE.md` — relay directory structure (Section 2.2), Docker Compose (Section 6.1), Caddyfile (Section 6.2), Dockerfile (Section 6.3)

## 3. Scope

### In Scope

- Initialize the Node.js/Bun project in `relay/` with TypeScript.
- `relay/src/server.ts`: WebSocket upgrade, connection handling, message routing to room peers, rate limiting per client.
- `relay/src/room-manager.ts`: Room creation (implicit on first join), join/leave tracking, max 2 clients per room, room timeout cleanup (1 hour), peer count broadcasting.
- `relay/src/types.ts`: Relay-side message types (join, peer_count, peer_left, error).
- `relay/src/health.ts`: HTTP `/health` endpoint returning `{ status: "ok", rooms: <count>, connections: <count> }`.
- `relay/Dockerfile`: Multi-stage build (see `docs/02-ARCHITECTURE.md` Section 6.3).
- `relay/package.json` and `relay/tsconfig.json`.
- `relay/.env.example` with `PORT`, `MAX_ROOMS`, `MAX_CLIENTS_PER_ROOM`, `ROOM_TIMEOUT_MS`, `LOG_LEVEL`.
- `docker-compose.yml` at project root (see `docs/02-ARCHITECTURE.md` Section 6.1).
- Unit tests for room manager logic.
- Integration tests with mock WebSocket clients.

### Out of Scope

- Game logic of any kind — the relay forwards messages verbatim (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 1, `docs/02-ARCHITECTURE.md` Section 1).
- Message validation beyond JSON parsing and size limits — the relay does not inspect game message content.
- TLS termination — handled by Caddy (see `docs/02-ARCHITECTURE.md` Section 6.2).
- Caddyfile creation — Phase 13 (deploy).
- Persistent storage — the relay is fully stateless in-memory.
- Client-side connection logic — Phase 6.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `relay/package.json` | Create | Project metadata, scripts (`dev`, `build`, `start`, `test`), dependencies (`ws` or Bun built-in) |
| `relay/tsconfig.json` | Create | TypeScript config for the relay (strict mode) |
| `relay/.env.example` | Create | Environment variable template |
| `relay/src/server.ts` | Create | Entry point: HTTP server, WebSocket upgrade, message routing |
| `relay/src/room-manager.ts` | Create | Room lifecycle: create, join, leave, cleanup, broadcast |
| `relay/src/types.ts` | Create | Relay-side message type definitions |
| `relay/src/health.ts` | Create | `/health` HTTP endpoint handler |
| `relay/Dockerfile` | Create | Multi-stage Docker build for production |
| `docker-compose.yml` | Create | Docker Compose config for the relay service |
| `relay/src/room-manager.test.ts` | Create | Unit tests for room manager |
| `relay/src/server.test.ts` | Create | Integration tests with mock WebSocket clients |

## 5. Key Design Decisions

1. **Stateless relay — zero game logic:** The relay forwards JSON messages verbatim between peers in the same room. It never inspects `type`, `x`, `y`, `hit`, or any game-specific field. The only messages the relay itself generates are `peer_count`, `peer_left`, and `error` (see `docs/02-ARCHITECTURE.md` Section 1, `docs/05-PROTOCOL-SPEC.md` Section 2).

2. **Implicit room creation:** Rooms are created when the first client sends a `{ type: "join", roomId: "..." }` message. There is no explicit "create room" API (see `docs/05-PROTOCOL-SPEC.md` Section 3.2).

3. **Max 2 clients per room:** The third client attempting to join receives `{ type: "error", code: "ROOM_FULL" }` and is disconnected (see `docs/05-PROTOCOL-SPEC.md` Section 3.3).

4. **Room timeout:** Rooms with no activity are cleaned up after 1 hour (`ROOM_TIMEOUT_MS=3600000`). The timer resets on any message (see `docs/02-ARCHITECTURE.md` Section 6.1).

5. **Message size limit:** Messages exceeding 4 KB are rejected with `{ type: "error", code: "INVALID_MESSAGE" }` (see `docs/05-PROTOCOL-SPEC.md` Section 1, Section 10.1).

6. **Rate limiting:** Max 60 messages per client per minute (see `docs/05-PROTOCOL-SPEC.md` Section 10.1). IP-level rate limiting is handled by Caddy.

7. **Structured JSON logging:** Log room creation, deletion, peer join, peer leave, and errors to stdout for Docker log consumption (see `docs/02-ARCHITECTURE.md` Section 9.1).

8. **Docker deployment:** Multi-stage Dockerfile with `node:20-alpine`. The container exposes port 8080, runs as the `node` user, and includes a health check (see `docs/02-ARCHITECTURE.md` Section 6.3).

9. **Messages not echoed back to sender:** When a client sends a message, it is forwarded only to the *other* client(s) in the room — never back to the sender (see `docs/05-PROTOCOL-SPEC.md` Section 2.3).

## 6. Interfaces & Contracts

### `relay/src/types.ts`

```typescript
// Messages consumed by the relay (not forwarded)
interface JoinMessage {
  type: 'join'
  roomId: string
}

// Messages generated by the relay
interface PeerCountMessage {
  type: 'peer_count'
  count: number
}

interface PeerLeftMessage {
  type: 'peer_left'
}

interface RelayErrorMessage {
  type: 'error'
  code: 'ROOM_FULL' | 'INVALID_MESSAGE' | 'RATE_LIMITED'
  message: string
}

type RelayOutgoingMessage = PeerCountMessage | PeerLeftMessage | RelayErrorMessage
```

### `relay/src/room-manager.ts`

```typescript
interface Room {
  id: string
  clients: Set<WebSocket>
  createdAt: number
  lastActivityAt: number
  timeoutHandle: ReturnType<typeof setTimeout>
}

export class RoomManager {
  constructor(config: {
    maxRooms: number
    maxClientsPerRoom: number
    roomTimeoutMs: number
  })

  /** Add a client to a room. Returns { success, error? } */
  join(roomId: string, client: WebSocket): { success: boolean; error?: string }

  /** Remove a client from its room. Cleans up empty rooms. */
  leave(client: WebSocket): void

  /** Forward a message to all other clients in the sender's room */
  broadcast(sender: WebSocket, message: string): void

  /** Get current stats for the health endpoint */
  getStats(): { rooms: number; connections: number }
}
```

### `/health` Endpoint Response

```typescript
// GET /health → 200
interface HealthResponse {
  status: 'ok'
  rooms: number
  connections: number
}
```

### Docker Compose Service

```yaml
# Environment variables (from docs/02-ARCHITECTURE.md Section 6.1)
PORT: 8080
MAX_ROOMS: 100
MAX_CLIENTS_PER_ROOM: 2
ROOM_TIMEOUT_MS: 3600000
LOG_LEVEL: info
```

## 7. Acceptance Criteria

1. Running `npm run build` in `relay/` produces no TypeScript errors.
2. Running `npm run start` starts the relay server on the configured port.
3. The `/health` endpoint returns `{ "status": "ok", "rooms": 0, "connections": 0 }` when no clients are connected.
4. A WebSocket client sending `{ "type": "join", "roomId": "test1234" }` receives `{ "type": "peer_count", "count": 1 }`.
5. A second client joining the same room causes both clients to receive `{ "type": "peer_count", "count": 2 }`.
6. A third client joining a full room receives `{ "type": "error", "code": "ROOM_FULL" }` and is disconnected.
7. When one client sends a JSON message, the other client in the room receives it verbatim; the sender does not receive it back.
8. When a client disconnects, the remaining client receives `{ "type": "peer_left" }`.
9. Messages larger than 4 KB are rejected with an error response.
10. The `/health` endpoint reflects the current room and connection counts.
11. `docker build` succeeds on the relay Dockerfile.
12. The `docker-compose.yml` at the project root defines the relay service with correct environment variables, health check, resource limits, and network configuration.
13. All relay unit and integration tests pass.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **Running relay server** required by Phase 6 (connection composable connects to it), Phase 8 (game protocol composable sends/receives messages through it).
- **`docker-compose.yml`** used by Phase 13 (Polish & Deploy) for VPS deployment.
- **Health endpoint** used by Phase 13 for monitoring and Docker health checks.

### Boundaries

- Future phases must NOT add game logic to the relay. If relay behavior needs to change, it should remain limited to connection management and message forwarding.
- The `docker-compose.yml` created here defines the relay service. Phase 13 will add the Caddyfile and VPS deployment steps but should not restructure the relay service definition.
- Client-side WebSocket connection logic belongs in Phase 6 (`useRelay`), not in the relay server codebase.
