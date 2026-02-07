# Phase 06 — Ticket 001: Core WebSocket Connection Lifecycle

## Summary

Create the `useRelay` composable with the foundational WebSocket connection lifecycle: opening a connection to the relay server, sending the `join` control message, exposing `send()` / `disconnect()` / `connected`, and wiring status transitions to `useConnectionStore`. After this ticket, the composable can connect to the relay, announce room membership, send game messages, and cleanly disconnect — but does not yet handle incoming messages, reconnection, or ping/pong (those are tickets 002–004).

## Prerequisites

- **Phase 1** must be complete — Vue project structure exists with `app/src/composables/` directory.
- **Phase 2** must be complete — `app/src/types/protocol.ts` exports `GameMessage`, `JoinMessage`, `ClientControlMessage`.
- **Phase 4** must be complete — `app/src/stores/connection.ts` exports `useConnectionStore` with actions: `setConnecting(roomId, isHost)`, `setConnected()`, `setDisconnected()`.
- **Phase 5** must be complete — relay server is running for manual verification.

## Scope

**In scope:**

- `UseRelayOptions` interface with `roomId`, `isHost`, `onGameMessage` fields
- `UseRelayReturn` interface with `send`, `connected`, `reconnect`, `disconnect` fields
- `useRelay()` function: open WebSocket to `import.meta.env.VITE_RELAY_URL`
- On WebSocket `open`: call `store.setConnected()`, send `{ type: "join", roomId }` as JSON
- On WebSocket `close`: call `store.setDisconnected()` (reconnection logic added in ticket 003)
- On WebSocket `error`: log via `console.warn` (reconnection logic added in ticket 003)
- `send(message: GameMessage)`: serialize to JSON and send via WebSocket
- `disconnect()`: set intentional-close flag, close WebSocket, call `store.setDisconnected()`
- `connected`: `Ref<boolean>` reflecting whether WebSocket is open
- `reconnect()`: stub that logs a warning — real implementation in ticket 003
- Unit tests for all of the above

**Out of scope:**

- Incoming message parsing and dispatch — ticket 002
- Relay message handling (`peer_count`, `peer_left`, `error`) — ticket 002
- `onGameMessage` callback invocation — ticket 002
- Exponential backoff reconnection — ticket 003
- Ping/pong latency measurement — ticket 004
- `onUnmounted` cleanup — ticket 004

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useRelay.ts` | Create | WebSocket composable with connection lifecycle, send, disconnect |
| `app/src/composables/useRelay.test.ts` | Create | Unit tests for connection lifecycle |

## Requirements

### Interfaces

From `docs/phases/phase-06-connection-composable.md` Section 6:

```typescript
import type { Ref } from 'vue'
import type { GameMessage } from '../types/protocol'

interface UseRelayOptions {
  roomId: string
  isHost: boolean
  onGameMessage: (message: GameMessage) => void
}

interface UseRelayReturn {
  /** Send a game message to the peer */
  send: (message: GameMessage) => void

  /** Current WebSocket ready state */
  connected: Ref<boolean>

  /** Manually trigger a reconnection attempt */
  reconnect: () => void

  /** Close the connection and stop reconnection */
  disconnect: () => void
}

export function useRelay(options: UseRelayOptions): UseRelayReturn
```

Export both `UseRelayOptions` and `UseRelayReturn` as named type exports so downstream code (Phase 8) can reference them.

### Relay URL

Read the WebSocket URL from `import.meta.env.VITE_RELAY_URL`. Do NOT hardcode the URL. See `docs/04-AI-ASSISTANT-GUIDE.md` Section 4 common mistakes table. If the env var is missing or empty, throw an `Error` with a descriptive message (e.g., `"VITE_RELAY_URL is not configured"`).

### Connection Lifecycle

1. When `useRelay(options)` is called, immediately call `store.setConnecting(options.roomId, options.isHost)`.
2. Create a `new WebSocket(relayUrl)`.
3. Set `connected` ref to `false` initially.
4. On `open` event:
   - Set `connected` to `true`.
   - Call `store.setConnected()`.
   - Send the join message: `ws.send(JSON.stringify({ type: 'join', roomId: options.roomId }))`.
5. On `close` event:
   - Set `connected` to `false`.
   - If the close was NOT intentional (i.e., `disconnect()` was not called), call `store.setDisconnected()`. In ticket 003, this will change to trigger reconnection instead.
   - If the close WAS intentional, the store was already updated in `disconnect()`.
6. On `error` event:
   - Log with `console.warn('WebSocket error:', event)`.
   - Do not update the store here — the `close` event always fires after `error` and handles store updates.

### `send(message: GameMessage)`

1. Check that `connected.value` is `true`. If not, log a warning (`console.warn('Cannot send: WebSocket not connected')`) and return without sending.
2. Serialize with `JSON.stringify(message)`.
3. Call `ws.send(serialized)`.

### `disconnect()`

1. Set the intentional-close flag to `true`.
2. Close the WebSocket with code `1000` (normal closure): `ws.close(1000)`.
3. Set `connected` to `false`.
4. Call `store.setDisconnected()`.

### `reconnect()`

In this ticket, implement as a no-op stub:

```typescript
reconnect: () => {
  console.warn('reconnect() not yet implemented — see ticket 003')
}
```

Ticket 003 replaces this with real exponential backoff logic.

### `connected` Ref

A `Ref<boolean>` that is `true` when the WebSocket is open and ready to send, `false` otherwise. Updated in `open`/`close` event handlers and `disconnect()`.

### Internal State

Maintain an `intentionalClose` boolean variable (not a ref — no reactivity needed) initialized to `false`. Set to `true` in `disconnect()`. Checked in the `close` handler to distinguish intentional vs. unexpected disconnects.

### Test Requirements

Tests must use Vitest per `docs/03-CODING-STANDARDS.md` Section 7. Mock `WebSocket` globally since the browser `WebSocket` API is not available in Node.

Create a mock WebSocket class:

```typescript
class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
  }

  // Helper to simulate events in tests
  simulateOpen(): void { ... }
  simulateClose(code?: number): void { ... }
  simulateError(): void { ... }
}
```

Stub `import.meta.env.VITE_RELAY_URL` using `vi.stubEnv('VITE_RELAY_URL', 'ws://localhost:8080')` or by mocking `import.meta`.

Mock `useConnectionStore` using `vi.mock('../stores/connection')` and return an object with `vi.fn()` for each action.

Required test cases (minimum):

1. **Constructor opens WebSocket to env URL:** Assert `new WebSocket` was called with the URL from env.
2. **setConnecting called immediately:** Store action called with `roomId` and `isHost` from options.
3. **Join message sent on open:** After simulating `open`, assert `ws.send` was called with `JSON.stringify({ type: 'join', roomId: 'test' })`.
4. **setConnected called on open:** Store action called after `open` event.
5. **send() serializes and sends:** Call `send({ type: 'ready' })`, assert `ws.send` called with `'{"type":"ready"}'`.
6. **send() warns when disconnected:** Call `send()` when `connected` is `false`, assert `console.warn` called and `ws.send` NOT called.
7. **disconnect() closes WebSocket:** Assert `ws.close(1000)` called and store updated.
8. **Unexpected close updates store:** Simulate `close` without calling `disconnect()`, assert `store.setDisconnected()` called.
9. **Intentional close does not double-update store:** Call `disconnect()` then simulate `close`, assert `store.setDisconnected()` called only once (in `disconnect()`).
10. **connected ref reflects state:** `false` initially, `true` after open, `false` after close.

## Acceptance Criteria

- [ ] File exists at `app/src/composables/useRelay.ts` with `useRelay` function exported
- [ ] File exists at `app/src/composables/useRelay.test.ts`
- [ ] `UseRelayOptions` and `UseRelayReturn` types are exported
- [ ] `npm run type-check` passes with no errors
- [ ] Store `setConnecting` called on construction with `roomId` and `isHost`
- [ ] Join message `{ type: "join", roomId }` sent on WebSocket open
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do NOT hardcode the relay URL.** Use `import.meta.env.VITE_RELAY_URL`. This is the #1 common mistake in the AI assistant guide (`docs/04-AI-ASSISTANT-GUIDE.md` Section 4).
- **Handle both `close` and `error` events.** Never silently ignore WebSocket errors. However, do not update the store in the `error` handler — the `close` event fires immediately after and handles status transitions. See `docs/03-CODING-STANDARDS.md` Section 6.
- **The `onmessage` handler is not wired up in this ticket.** Leave it unset or as a no-op. Ticket 002 adds message parsing and dispatch. Do not add any message handling logic here.
- **`reconnect()` is a stub in this ticket.** Return a function that logs a warning. Ticket 003 provides the real implementation. Do not implement reconnection logic.
- **Use `ref()` from Vue for `connected`.** Not `computed` — it's directly set in event handlers.
- **The composable does not use `onUnmounted` in this ticket.** Cleanup is added in ticket 004. This is intentional — the composable works correctly without it, and adding cleanup incrementally keeps tickets focused.
- **Mock WebSocket carefully.** The browser `WebSocket` is not available in Vitest's Node environment. You need to either mock it globally (`vi.stubGlobal('WebSocket', MockWebSocket)`) or use dependency injection. Global stubbing is simpler and matches how the real code will work.
- **Use `createPinia()` and `setActivePinia()` in test setup** to make `useConnectionStore` work in tests, OR mock the store entirely. Mocking the store is preferred for unit tests since you only need to verify the correct actions are called.
- Follow naming conventions from `docs/03-CODING-STANDARDS.md` Section 3: composable files use kebab-case (`useRelay.ts`), composable functions use `use` prefix (`useRelay`).
