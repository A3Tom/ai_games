# Phase 05 — Ticket 005: WebSocket Server

## Summary

Implement the relay server entry point in `relay/src/server.ts` along with integration tests in `relay/src/server.test.ts`. The server creates an HTTP server, handles WebSocket upgrades, routes incoming messages through the `RoomManager`, enforces rate limiting and message size limits, and serves the health endpoint. When done, the agent should have a fully functional relay server that can be started with `npm run start` and passes all integration tests.

## Prerequisites

- **Ticket 002** must be complete — `relay/src/types.ts` exists with `JoinMessage`, `RelayErrorMessage`, `RELAY_ERROR_CODE`, `RelayConfig`, and `isJoinMessage` exports.
- **Ticket 003** must be complete — `relay/src/room-manager.ts` exists with `RoomManager` class exported.
- **Ticket 004** must be complete — `relay/src/health.ts` exists with `createHealthHandler` exported.

## Scope

**In scope:**

- `relay/src/server.ts`: HTTP server creation, WebSocket upgrade via `ws`, message handling loop, rate limiting per client, message size enforcement, environment variable parsing, structured logging, graceful process signal handling
- `relay/src/server.test.ts`: Integration tests using real WebSocket connections to verify the full join → message → leave lifecycle

**Out of scope:**

- `RoomManager` implementation — ticket 003 (imported and instantiated here)
- Health endpoint handler implementation — ticket 004 (imported and wired here)
- Type definitions — ticket 002 (imported here)
- Docker configuration — ticket 006
- TLS termination — handled by Caddy (Phase 13)
- Client-side connection composable — Phase 6

## Files

| File | Action | Description |
|------|--------|-------------|
| `relay/src/server.ts` | Create | Entry point: HTTP server, WebSocket server, message routing, rate limiting |
| `relay/src/server.test.ts` | Create | Integration tests with real WebSocket connections |

## Requirements

### Environment Variable Parsing

Read configuration from environment variables, falling back to defaults matching `.env.example`:

```typescript
const config: RelayConfig = {
  port: parseInt(process.env.PORT ?? '8080', 10),
  maxRooms: parseInt(process.env.MAX_ROOMS ?? '100', 10),
  maxClientsPerRoom: parseInt(process.env.MAX_CLIENTS_PER_ROOM ?? '2', 10),
  roomTimeoutMs: parseInt(process.env.ROOM_TIMEOUT_MS ?? '3600000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
}
```

### Server Setup

1. Create a `RoomManager` instance with the parsed config.
2. Create a health handler via `createHealthHandler(() => roomManager.getStats())`.
3. Create an HTTP server using `http.createServer(healthHandler)`.
4. Create a `WebSocketServer` from the `ws` package, attached to the HTTP server using the `server` option.
5. Listen on `config.port`.
6. Log server start: `{ event: "server_started", port: config.port }`.

### WebSocket Connection Handling

When a new WebSocket connection is established (`wss.on('connection', ...)`):

1. **Initialize per-client state:** Create a rate limiter tracker for this client (message count and window start time).
2. **Set up the message handler** (`ws.on('message', ...)`):
   a. **Parse the message as a string.** If the message is a `Buffer`, convert to string. If it's not valid UTF-8, ignore.
   b. **Check message size.** If the raw message exceeds 4096 bytes (4 KB), send `{ type: "error", code: "INVALID_MESSAGE", message: "Message too large" }` to the client and return. Reference: `docs/05-PROTOCOL-SPEC.md` Section 1 and phase overview decision 5.
   c. **Check rate limit.** If the client has exceeded 60 messages in the current minute window, send `{ type: "error", code: "RATE_LIMITED", message: "Rate limit exceeded" }` and return. Reference: `docs/05-PROTOCOL-SPEC.md` Section 10.1 and phase overview decision 6.
   d. **Increment the rate limiter counter** for this client.
   e. **Parse JSON.** Attempt `JSON.parse()`. If parsing fails, send `{ type: "error", code: "INVALID_MESSAGE", message: "Invalid JSON" }` and return.
   f. **Check if it's a join message** using `isJoinMessage()` from types.
      - If YES: Call `roomManager.join(parsed.roomId, ws)`. If join fails (room full), send `{ type: "error", code: "ROOM_FULL", message: "Room is full" }` and close the connection.
      - If NO: Call `roomManager.broadcast(ws, rawMessage)` to forward the raw message string to the other client in the room. **Forward the original raw string, not re-serialized JSON.** This preserves exact message format.
3. **Set up the close handler** (`ws.on('close', ...)`): Call `roomManager.leave(ws)`.
4. **Set up the error handler** (`ws.on('error', ...)`): Log the error and call `roomManager.leave(ws)`.

### Rate Limiting

Per `docs/05-PROTOCOL-SPEC.md` Section 10.1 and phase overview decision 6:

- **60 messages per client per minute.**
- Track per-client using a simple sliding window: store `{ count: number, windowStart: number }`.
- When a message arrives, check if `Date.now() - windowStart > 60000`. If yes, reset the window (`count = 0`, `windowStart = Date.now()`).
- If `count >= 60`, reject with rate limit error.
- Otherwise, increment `count`.
- Clean up rate limiter state when the client disconnects.

### Message Size Validation

Per `docs/05-PROTOCOL-SPEC.md` Section 1 and phase overview decision 5:

- Check `Buffer.byteLength(message, 'utf8')` or the raw buffer length.
- Maximum: 4096 bytes (4 KB).
- Reject with `{ type: "error", code: "INVALID_MESSAGE", message: "Message too large" }`.
- Do this check BEFORE JSON parsing to avoid wasting CPU on oversized messages.

### Structured Logging

Continue the logging pattern from ticket 003. Log to stdout as JSON with ISO 8601 timestamps:

- `server_started` — on successful listen
- `client_connected` — new WebSocket connection
- `client_disconnected` — WebSocket close/error
- `rate_limited` — when a client exceeds the rate limit
- `invalid_message` — when a message fails size or JSON validation

### Graceful Shutdown

Handle `SIGTERM` and `SIGINT` signals:

1. Close the WebSocket server (stop accepting new connections).
2. Close the HTTP server.
3. Log `{ event: "server_stopped" }`.
4. Exit with code 0.

### Integration Test Requirements

Tests must use Vitest and the `ws` package to create real WebSocket client connections to a test server instance. Each test should:

1. Start a server on a random available port (use port `0` to let the OS assign).
2. Connect WebSocket clients.
3. Assert behavior.
4. Close all connections and the server after each test.

Use `beforeEach` / `afterEach` to manage server lifecycle and prevent port conflicts.

Required test cases (minimum):

1. **Health endpoint responds:** Make an HTTP GET to `/health`, verify `{ status: "ok", rooms: 0, connections: 0 }` response.
2. **Client join flow:** Connect a client, send `{ type: "join", roomId: "test1234" }`, verify it receives `{ type: "peer_count", count: 1 }`.
3. **Two clients in same room:** Both join same room, verify both receive `{ type: "peer_count", count: 2 }`.
4. **Message forwarding:** Client A and Client B in same room. Client A sends a game message. Client B receives it verbatim. Client A does NOT receive it back.
5. **Room full rejection:** Two clients join a room. Third client joins same room, receives `{ type: "error", code: "ROOM_FULL" }`.
6. **Peer disconnect notification:** Two clients in room. Client A disconnects. Client B receives `{ type: "peer_left" }`.
7. **Oversized message rejected:** Client sends a message larger than 4 KB, receives `{ type: "error", code: "INVALID_MESSAGE" }`.

### Helper for Tests

Create a helper to connect a WebSocket client and wait for it to be ready:

```typescript
function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}
```

Also create a helper to wait for the next message:

```typescript
function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(data.toString()))
  })
}
```

## Acceptance Criteria

- [ ] File exists at `relay/src/server.ts`
- [ ] File exists at `relay/src/server.test.ts`
- [ ] `npm run build` in `relay/` produces no TypeScript errors
- [ ] `npm run start` starts the server on the configured port (verify via health endpoint)
- [ ] A client sending `{ "type": "join", "roomId": "test" }` receives `{ "type": "peer_count", "count": 1 }`
- [ ] Messages are forwarded to peers verbatim and never echoed to sender
- [ ] Messages exceeding 4 KB are rejected with `INVALID_MESSAGE` error
- [ ] All tests pass via `npm run test` in `relay/`

## Notes for the Agent

- **Forward the RAW string, not re-serialized JSON.** When broadcasting, pass the original message string to `roomManager.broadcast()`, not `JSON.stringify(parsed)`. Re-serialization could alter whitespace or key ordering. The relay must be transparent per `docs/04-AI-ASSISTANT-GUIDE.md` Section 1.
- **Do NOT add game logic.** The relay never inspects `type`, `x`, `y`, `hit`, `sunk`, or any game-specific fields. The only message type the relay looks at is `join`. Everything else is forwarded blindly. This is the most critical architectural constraint — per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4 common mistake #1.
- **Check message size BEFORE JSON.parse().** Parsing a 10 MB JSON payload is expensive. Reject oversized messages at the byte level first.
- **Rate limiter cleanup.** When a client disconnects, remove its rate limiter entry to prevent memory leaks. The rate limiter map should only contain entries for currently connected clients.
- **Integration tests need careful cleanup.** WebSocket connections and HTTP servers must be properly closed after each test. Use `afterEach` hooks and `Promise.all` for closing multiple clients. Failing to clean up causes `EADDRINUSE` errors or test hangs.
- **Use port 0 for test servers.** Binding to port 0 lets the OS assign an available port, preventing conflicts between parallel tests. Get the assigned port from `server.address().port` after the server starts listening.
- **`ws` message events deliver `Buffer` by default.** Convert to string with `.toString()` or configure `ws` with the appropriate options.
- Reference `docs/05-PROTOCOL-SPEC.md` Section 1 (transport), Section 2 (connection lifecycle), Section 3 (room management), and Section 10 (rate limiting).
