# Phase 06 — Ticket 003: Exponential Backoff Reconnection

## Summary

Add automatic reconnection with exponential backoff to `useRelay`. When the WebSocket closes unexpectedly, the composable retries with increasing delays (1s → 2s → 4s → 8s → 16s → 30s cap), up to 10 attempts. On successful reconnect, it re-sends the `join` message and resets retry state. After max retries, it transitions to `'disconnected'`. This also replaces the `reconnect()` stub from ticket 001 with a working manual reconnect trigger.

## Prerequisites

- **Ticket 001** must be complete — `useRelay.ts` has WebSocket lifecycle, `connected` ref, `intentionalClose` flag, `disconnect()`.
- **Ticket 002** must be complete — message dispatch is wired up, so reconnected WebSocket instances have their `onmessage` handler set.
- `app/src/stores/connection.ts` must exist (Phase 4) — exports `useConnectionStore` with `setReconnecting()`, `setConnected()`, `setDisconnected()`, `incrementReconnectAttempts()`, `resetReconnectAttempts()` actions.

## Scope

**In scope:**

- Reconnection constants: `BASE_DELAY_MS = 1000`, `MAX_DELAY_MS = 30000`, `MAX_RETRIES = 10`
- Modify `close` handler: if not intentional close, trigger reconnection instead of `setDisconnected()`
- `scheduleReconnect()` internal function: calculates delay, sets timeout, creates new WebSocket
- Exponential backoff formula: `Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)`
- On each retry: call `store.incrementReconnectAttempts()`
- On successful reconnect: call `store.resetReconnectAttempts()`, `store.setConnected()`, re-send join message
- After max retries exceeded: call `store.setDisconnected()`
- Replace `reconnect()` stub with real implementation: resets retry count and triggers immediate reconnection
- Track `reconnectTimeout` handle for cleanup (used by ticket 004)
- Unit tests for all reconnection scenarios using `vi.useFakeTimers()`

**Out of scope:**

- `sync_request` / `sync_response` reconciliation after reconnection — Phase 8
- UI for reconnection status — Phase 13
- Ping/pong — ticket 004
- `onUnmounted` cleanup of reconnect timers — ticket 004

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useRelay.ts` | Modify | Add reconnection logic with exponential backoff |
| `app/src/composables/useRelay.test.ts` | Modify | Add tests for reconnection scenarios |

## Requirements

### Reconnection Constants

Define at module level (not inside the composable function):

```typescript
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30_000
const MAX_RETRIES = 10
```

Export these constants so tests can reference them:

```typescript
export { BASE_DELAY_MS, MAX_DELAY_MS, MAX_RETRIES }
```

### Modified `close` Handler

Replace the current `close` handler logic (from ticket 001) with:

1. Set `connected` to `false`.
2. If `intentionalClose` is `true`, return (store was already updated in `disconnect()`).
3. If retry count has reached `MAX_RETRIES`, call `store.setDisconnected()` and return.
4. Call `store.setReconnecting()`.
5. Call `scheduleReconnect()`.

### `scheduleReconnect()` Internal Function

This function is NOT exported — it's an implementation detail inside the composable closure.

```typescript
function scheduleReconnect(): void
```

Behavior:

1. Calculate the delay: `Math.min(BASE_DELAY_MS * 2 ** retryCount, MAX_DELAY_MS)` where `retryCount` starts at 0 for the first retry.
2. Store the timeout handle in a `reconnectTimeout` variable (so ticket 004 can clear it in `onUnmounted`).
3. After the delay:
   a. Increment `retryCount` (local variable).
   b. Call `store.incrementReconnectAttempts()`.
   c. Create a new `WebSocket(relayUrl)`.
   d. Wire `onopen`, `onclose`, `onerror`, `onmessage` handlers on the new instance (same handlers as the original, operating on the new WebSocket reference).
   e. Replace the internal WebSocket reference so `send()` and `disconnect()` use the new socket.

### On Successful Reconnect (new WebSocket `open` event)

1. Set `connected` to `true`.
2. Call `store.resetReconnectAttempts()`.
3. Call `store.setConnected()`.
4. Re-send the join message: `ws.send(JSON.stringify({ type: 'join', roomId: options.roomId }))`.
5. Reset `retryCount` to 0.

### On Failed Reconnect (new WebSocket `close` or `error`)

The new WebSocket's `close` handler runs the same logic as the original: if not intentional and retries remain, schedule another reconnect. If retries exhausted, `setDisconnected()`.

### `reconnect()` Public Method

Replace the stub from ticket 001:

1. If already connected (`connected.value === true`), return — no action needed.
2. Reset `retryCount` to 0.
3. Call `store.resetReconnectAttempts()`.
4. Clear any existing `reconnectTimeout`.
5. Call `store.setReconnecting()`.
6. Immediately attempt connection (no delay for manual reconnect): create new WebSocket, wire handlers.

### Internal State Additions

- `retryCount: number` — initialized to 0, incremented on each retry, reset on successful reconnect or manual `reconnect()`.
- `reconnectTimeout: ReturnType<typeof setTimeout> | null` — handle for the pending reconnect timer. Set in `scheduleReconnect()`, cleared in `reconnect()`. Will also be cleared in `onUnmounted` (ticket 004).

### Backoff Schedule Verification

For reference, the expected delay sequence (per `docs/05-PROTOCOL-SPEC.md` Section 9.1):

| Retry # | Delay (ms) |
|---------|-----------|
| 1 | 1000 |
| 2 | 2000 |
| 3 | 4000 |
| 4 | 8000 |
| 5 | 16000 |
| 6 | 30000 (capped) |
| 7 | 30000 |
| 8 | 30000 |
| 9 | 30000 |
| 10 | 30000 |

After attempt 10 fails, `setDisconnected()` is called and no further retries occur.

### Test Requirements

Use `vi.useFakeTimers()` for all reconnection tests. Remember to call `vi.useRealTimers()` in `afterEach`.

Required test cases (minimum):

1. **Unexpected close triggers reconnection:** Simulate open then close (not intentional). Assert `store.setReconnecting()` called. Assert reconnect timeout is scheduled.
2. **First retry after 1s delay:** After unexpected close, advance timers by 1000ms. Assert new WebSocket created.
3. **Backoff doubles:** After first retry fails (close), advance by 2000ms. Assert another WebSocket created. After that fails, advance by 4000ms. Assert another created.
4. **Backoff caps at 30s:** After 5 failed retries, verify next delay is 30000ms, not 32000ms.
5. **Successful reconnect re-sends join:** Create new WebSocket in retry, simulate open. Assert join message sent. Assert `store.resetReconnectAttempts()` called.
6. **Successful reconnect resets retry count:** After successful reconnect, simulate another close. Assert delay is 1000ms again (not continuing from previous).
7. **Max retries sets disconnected:** Simulate 10 failed retries. Assert `store.setDisconnected()` called. Assert no further timeout scheduled.
8. **Intentional disconnect prevents reconnection:** Call `disconnect()`, simulate close. Assert `scheduleReconnect` NOT called. Assert `store.setReconnecting()` NOT called.
9. **Manual reconnect() resets and retries immediately:** After max retries, call `reconnect()`. Assert new WebSocket created immediately (no delay). Assert `retryCount` reset.
10. **incrementReconnectAttempts called on each retry:** After 3 retries, assert `store.incrementReconnectAttempts()` called 3 times.

## Acceptance Criteria

- [ ] Unexpected WebSocket close triggers reconnection with exponential backoff
- [ ] Backoff follows schedule: 1s, 2s, 4s, 8s, 16s, 30s (capped)
- [ ] After successful reconnect, join message is re-sent automatically
- [ ] After 10 failed retries, `connectionStore.status` transitions to `'disconnected'`
- [ ] `reconnect()` resets retry state and connects immediately
- [ ] `disconnect()` prevents any further reconnection attempts
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Use `vi.useFakeTimers()` for reconnection tests.** Real timers would make tests slow and flaky. Advance time with `vi.advanceTimersByTime(ms)`. Remember to call `vi.useRealTimers()` in `afterEach` to avoid polluting other test suites.
- **Replace the internal WebSocket reference on reconnect.** When a new WebSocket is created for a retry, the composable's internal `ws` variable must point to the new instance. This ensures `send()` and `disconnect()` operate on the current connection. Use a `let` binding, not `const`.
- **Wire ALL event handlers on the new WebSocket.** The new WebSocket needs `onopen`, `onclose`, `onerror`, and `onmessage` — the same handlers as the original. Consider extracting a `createConnection()` or `wireHandlers(ws)` helper to avoid duplicating handler setup code.
- **The `close` event fires code `1006` for abnormal closure.** In tests, simulate unexpected close with `simulateClose(1006)` or just `simulateClose()` (default). Intentional close uses code `1000` (set by `disconnect()`), but the handler checks the `intentionalClose` flag, not the close code.
- **Do not implement `onUnmounted` cleanup in this ticket.** Ticket 004 handles clearing the reconnect timeout on unmount. In this ticket, the `reconnectTimeout` variable just needs to exist and be set correctly — cleanup comes later.
- **The `reconnectTimeout` variable must be accessible** to the `disconnect()` function (clear it to prevent pending reconnects after disconnect) and eventually to `onUnmounted` (ticket 004). Declare it in the composable's closure scope.
- **Clear `reconnectTimeout` in `disconnect()`.** When the user intentionally disconnects, cancel any pending reconnect timer. Add `clearTimeout(reconnectTimeout)` to the `disconnect()` function alongside the existing logic.
- Reference `docs/05-PROTOCOL-SPEC.md` Section 9.1 for the reconnection protocol and `docs/02-ARCHITECTURE.md` Section 7 for the reconnection strategy diagram.
