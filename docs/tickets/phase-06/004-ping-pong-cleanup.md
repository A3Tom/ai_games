# Phase 06 — Ticket 004: Ping/Pong Latency and Unmount Cleanup

## Summary

Add periodic ping/pong for latency measurement and `onUnmounted` cleanup to `useRelay`. The composable sends a `ping` message at a regular interval while connected, measures round-trip time from `pong` responses, and updates the connection store with the latency. On component unmount, all resources are cleaned up: the WebSocket is closed, reconnect timers are cleared, and ping intervals are stopped. After this ticket, the `useRelay` composable is feature-complete per the phase overview.

## Prerequisites

- **Ticket 001** must be complete — `useRelay.ts` has WebSocket lifecycle, `send()`, `connected` ref.
- **Ticket 002** must be complete — message dispatch routes `pong` messages via `onGameMessage` callback.
- **Ticket 003** must be complete — reconnection logic exists with `reconnectTimeout` variable in closure scope.
- `app/src/stores/connection.ts` must exist (Phase 4) — exports `useConnectionStore` with `updatePing(ms: number)` action.
- `app/src/types/protocol.ts` — exports `PingMessage`, `PongMessage` types.

## Scope

**In scope:**

- Ping interval: send `{ type: "ping", timestamp: Date.now() }` every 30 seconds while connected
- Pong handling: intercept `pong` messages in the message handler (before forwarding to `onGameMessage`), calculate latency, call `store.updatePing(ms)`
- Start ping interval on successful connection (including after reconnect)
- Clear ping interval on disconnect, reconnecting, or unmount
- `onUnmounted` hook: close WebSocket, clear `reconnectTimeout`, clear ping interval, set `intentionalClose` flag
- Unit tests for ping/pong and cleanup

**Out of scope:**

- Responding to incoming `ping` messages (sending `pong` back) — Phase 8 (`useGameProtocol`) owns this because it's a game-level protocol concern
- Connection status UI — Phase 13
- Adaptive ping interval based on network conditions — not in scope for any phase

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useRelay.ts` | Modify | Add ping interval, pong handling, onUnmounted cleanup |
| `app/src/composables/useRelay.test.ts` | Modify | Add tests for ping/pong and cleanup behavior |

## Requirements

### Ping Interval Constant

Define at module level alongside the reconnection constants:

```typescript
const PING_INTERVAL_MS = 30_000
```

Export for test access:

```typescript
export { BASE_DELAY_MS, MAX_DELAY_MS, MAX_RETRIES, PING_INTERVAL_MS }
```

### Ping Sending

Maintain a `pingInterval: ReturnType<typeof setInterval> | null` variable in the composable's closure.

**Start ping interval** when the WebSocket opens successfully (both initial connection and reconnection):

```typescript
pingInterval = setInterval(() => {
  if (connected.value) {
    ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
  }
}, PING_INTERVAL_MS)
```

**Clear ping interval** in these scenarios:
- Before starting a new interval (prevent multiple concurrent intervals on reconnect)
- In `disconnect()`
- On unexpected close (before scheduling reconnect)
- In `onUnmounted`

Use a helper to safely clear:

```typescript
function clearPingInterval(): void {
  if (pingInterval !== null) {
    clearInterval(pingInterval)
    pingInterval = null
  }
}
```

### Pong Handling

Modify the `onmessage` dispatch logic (from ticket 002) to intercept `pong` messages before the relay/game message routing:

1. After parsing with `parseIncomingMessage()`, check if the message is a `PongMessage` using `isPongMessage()` from `utils/validation.ts`.
2. If it is a pong:
   - Calculate latency: `Date.now() - message.timestamp`.
   - Call `store.updatePing(latency)`.
   - Return — do NOT forward to `onGameMessage`.
3. If it is not a pong, continue with the existing relay/game dispatch logic.

Import `isPongMessage` from `../utils/validation`.

The dispatch order in the `onmessage` handler should now be:

```
parse message
if null → warn and return
if pong → calculate latency, update store, return
if peer_count → update store, return
if peer_left → update store, return
if relay error → warn, return
else → forward to onGameMessage
```

Note: `ping` messages from the peer are still forwarded to `onGameMessage` — only `pong` is intercepted. Phase 8 will handle responding to peer pings.

### `onUnmounted` Cleanup

Import `onUnmounted` from Vue:

```typescript
import { ref, onUnmounted } from 'vue'
```

Add at the end of the `useRelay` function body, before the `return` statement:

```typescript
onUnmounted(() => {
  intentionalClose = true
  clearPingInterval()
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(1000)
  }
})
```

The `intentionalClose = true` prevents the `close` handler from triggering reconnection after unmount.

### Modified `disconnect()`

Add ping interval cleanup to the existing `disconnect()` logic:

```typescript
function disconnect(): void {
  intentionalClose = true
  clearPingInterval()
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  ws.close(1000)
  connected.value = false
  store.setDisconnected()
}
```

### Modified Connection `open` Handler

Add ping interval startup to the existing `open` handler:

```typescript
// Existing logic from tickets 001/003...
connected.value = true
store.setConnected()  // or resetReconnectAttempts + setConnected for reconnect
ws.send(JSON.stringify({ type: 'join', roomId: options.roomId }))

// New: start ping interval
clearPingInterval()  // Clear any existing interval first
pingInterval = setInterval(/* ... */)
```

### Modified Connection `close` Handler

Add ping interval cleanup to the `close` handler:

```typescript
connected.value = false
clearPingInterval()
// Existing reconnection logic from ticket 003...
```

### Test Requirements

Use `vi.useFakeTimers()` for ping interval tests. Mock `Date.now()` for latency calculations.

Required test cases (minimum):

1. **Ping sent after interval:** Open connection, advance time by `PING_INTERVAL_MS`. Assert `ws.send` called with a ping message containing a timestamp.
2. **No ping when disconnected:** Set `connected` to `false`, advance time past interval. Assert no ping sent.
3. **Pong updates store latency:** Simulate a pong message with `timestamp: 1000` while `Date.now()` returns `1050`. Assert `store.updatePing(50)` called.
4. **Pong not forwarded to onGameMessage:** Simulate a pong message. Assert `onGameMessage` NOT called.
5. **Ping interval restarted on reconnect:** Disconnect and reconnect. Advance time by `PING_INTERVAL_MS`. Assert ping sent on new WebSocket instance.
6. **Ping interval cleared on disconnect:** Call `disconnect()`. Advance time past interval. Assert no ping sent.
7. **onUnmounted closes WebSocket:** Trigger unmount. Assert `ws.close(1000)` called.
8. **onUnmounted clears reconnect timeout:** Start reconnection (unexpected close), then trigger unmount. Assert no new WebSocket created after advancing timers.
9. **onUnmounted clears ping interval:** Open connection, trigger unmount, advance time past interval. Assert no ping sent.
10. **No reconnection after unmount:** Trigger unmount, then simulate close. Assert `store.setReconnecting()` NOT called.

**Testing `onUnmounted`:** To trigger `onUnmounted` in tests, use Vue's `effectScope`:

```typescript
import { effectScope } from 'vue'

const scope = effectScope()
let relay: UseRelayReturn

scope.run(() => {
  relay = useRelay(options)
})

// ... test setup ...

scope.stop()  // triggers onUnmounted callbacks
```

## Acceptance Criteria

- [ ] Ping message sent every 30 seconds while connected
- [ ] Pong response updates `connectionStore.lastPingMs` via `updatePing()`
- [ ] Pong messages are NOT forwarded to `onGameMessage`
- [ ] Ping interval cleared on disconnect and reconnecting
- [ ] `onUnmounted` closes WebSocket, clears all timers, prevents reconnection
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Clear the ping interval BEFORE starting a new one.** When the WebSocket reconnects, the `open` handler fires again. If you start a new interval without clearing the old one, you'll have two intervals running simultaneously, sending pings twice as often. Always call `clearPingInterval()` before setting `pingInterval = setInterval(...)`.
- **Intercept `pong` BEFORE the relay/game dispatch.** The pong message is technically a `GameMessage` (part of the union), but `useRelay` needs to handle it internally for latency measurement. Check for pong first in the dispatch chain, then fall through to relay message checks, then game message forwarding.
- **Do NOT send pong responses to incoming pings.** That's Phase 8's responsibility (`useGameProtocol`). The `useRelay` composable only sends pings and processes pong responses. Incoming `ping` messages from the peer should be forwarded to `onGameMessage` like any other game message.
- **Use `effectScope` to test `onUnmounted`.** Vitest runs in Node, not in a Vue component lifecycle. Wrapping `useRelay()` in an `effectScope` and calling `scope.stop()` triggers all registered `onUnmounted` callbacks. This is the standard pattern for testing composables that use lifecycle hooks.
- **Mock `Date.now()` for latency tests.** Use `vi.spyOn(Date, 'now')` to control the timestamp. Set it to a known value before sending ping, then a later value when pong arrives, and assert the difference.
- **The `ws` variable must be `let`, not `const`.** Ticket 003 already requires this for reconnection (replacing the WebSocket instance). Ensure the `onUnmounted` handler references the current `ws` variable, not a stale closure.
- Reference `docs/05-PROTOCOL-SPEC.md` Section 5.6 for ping/pong message format and `docs/03-CODING-STANDARDS.md` Section 5 for composable cleanup rules.
