# Phase 04 — Ticket 001: Connection Store

## Summary

Implement `useConnectionStore`, the Pinia store that manages all WebSocket connection state: connection status, room metadata, peer presence, latency tracking, and reconnect attempt counting. This is a thin reactive state layer — the actual WebSocket logic lives in the `useRelay` composable (Phase 6), which will call these store actions to update state. When done, the agent should have a fully tested connection store with 6 state refs, 2 getters, and 9 actions.

## Prerequisites

- **Phase 3 complete.** All types, constants, and utilities exist.
- **Phase 1** — Pinia is installed and registered in `app/src/main.ts`.

No specific file dependencies from Phase 2 or 3 are needed — this store uses only primitive types. However, the store must follow the Composition API store pattern defined in `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.3.

## Scope

**In scope:**

- `useConnectionStore` Pinia store with Composition API syntax
- All 6 state refs: `status`, `roomId`, `isHost`, `peerConnected`, `lastPingMs`, `reconnectAttempts`
- 2 getters: `isConnected`, `isReconnecting`
- 9 actions: `setConnecting`, `setConnected`, `setReconnecting`, `setDisconnected`, `setPeerConnected`, `updatePing`, `incrementReconnectAttempts`, `resetReconnectAttempts`, `reset`
- Unit tests for all actions, getters, and initial state

**Out of scope:**

- WebSocket connection logic — Phase 6 (`useRelay` composable calls these actions)
- Game state — ticket 002+ (`useGameStore`)
- Any UI components that consume this store — Phases 9, 13
- Reconnection backoff logic or timers — Phase 6

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/stores/connection.ts` | Create | Connection state Pinia store |
| `app/src/stores/connection.test.ts` | Create | Unit tests for connection store |

## Requirements

The store must use the Composition API `defineStore` pattern per `docs/03-CODING-STANDARDS.md` Section 4.1 and `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.3: `defineStore('name', () => { ... })` with `ref`, `computed`, and plain functions.

### Imports

```typescript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
```

No game types are needed — all state uses primitives.

### Store Definition

```typescript
export const useConnectionStore = defineStore('connection', () => {
  // ... state, getters, actions
})
```

### State

```typescript
const status = ref<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected')
const roomId = ref<string | null>(null)
const isHost = ref<boolean>(false)
const peerConnected = ref<boolean>(false)
const lastPingMs = ref<number | null>(null)
const reconnectAttempts = ref<number>(0)
```

All state must be initialized to these exact default values.

### Getters

```typescript
const isConnected: ComputedRef<boolean>   // status.value === 'connected'
const isReconnecting: ComputedRef<boolean> // status.value === 'reconnecting'
```

Both are simple derivations of `status`. They must be `computed()` — not stored state.

### Actions

#### `setConnecting(roomId: string, isHost: boolean): void`

Transition to the `'connecting'` state. Sets `status` to `'connecting'`, stores the `roomId`, and sets `isHost`. This is called when the user creates or joins a room and the WebSocket connection is being established.

- Must set `status.value = 'connecting'`
- Must set `roomId.value` to the provided `roomId`
- Must set `isHost.value` to the provided `isHost`

Note: The parameter names shadow the state refs. Use the `.value` assignment carefully — rename the parameters or assign from the arguments object as needed. A common pattern is to use different parameter names (e.g., `newRoomId`, `hostFlag`) to avoid shadowing.

#### `setConnected(): void`

Transition to the `'connected'` state. Called when the WebSocket connection is successfully established.

- Must set `status.value = 'connected'`
- Must reset `reconnectAttempts.value = 0` (successful connection clears the retry counter)

#### `setReconnecting(): void`

Transition to the `'reconnecting'` state. Called when the WebSocket connection drops unexpectedly and the client begins retry attempts.

- Must set `status.value = 'reconnecting'`

#### `setDisconnected(): void`

Transition to the `'disconnected'` state. Called when the WebSocket is intentionally closed or max retries exceeded.

- Must set `status.value = 'disconnected'`
- Must set `peerConnected.value = false` (if we're disconnected, the peer is unreachable)

#### `setPeerConnected(connected: boolean): void`

Update peer presence. Called when a `peer_count` relay message indicates the other player has joined or a `peer_left` message indicates they disconnected.

- Must set `peerConnected.value` to the provided value.

#### `updatePing(ms: number): void`

Record the latest round-trip latency. Called when a pong response is received.

- Must set `lastPingMs.value` to the provided value.

#### `incrementReconnectAttempts(): number`

Increment the reconnect attempt counter and return the new count. Called by the reconnection logic before each retry.

- Must increment `reconnectAttempts.value` by 1.
- Must return the new value (after incrementing).

#### `resetReconnectAttempts(): void`

Reset the reconnect counter to zero. Called when reconnection succeeds.

- Must set `reconnectAttempts.value = 0`.

#### `reset(): void`

Reset all connection state to initial defaults. Called on full disconnect or when leaving a room.

- Must set `status.value = 'disconnected'`
- Must set `roomId.value = null`
- Must set `isHost.value = false`
- Must set `peerConnected.value = false`
- Must set `lastPingMs.value = null`
- Must set `reconnectAttempts.value = 0`

### Return Object

The store must export all 6 state refs, 2 getters, and 9 actions:

```typescript
return {
  // state
  status, roomId, isHost, peerConnected, lastPingMs, reconnectAttempts,
  // getters
  isConnected, isReconnecting,
  // actions
  setConnecting, setConnected, setReconnecting, setDisconnected,
  setPeerConnected, updatePing,
  incrementReconnectAttempts, resetReconnectAttempts, reset,
}
```

### Test Requirements

Tests must use Vitest and follow `docs/03-CODING-STANDARDS.md` Section 7.1. Each test must call `setActivePinia(createPinia())` in a `beforeEach` hook per `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.4.

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from './connection'
```

Required test cases (minimum):

1. **Initial state:** Store initializes with `status === 'disconnected'`, `roomId === null`, `isHost === false`, `peerConnected === false`, `lastPingMs === null`, `reconnectAttempts === 0`.
2. **`isConnected` getter:** Returns `false` initially, `true` after `setConnected()`.
3. **`isReconnecting` getter:** Returns `false` initially, `true` after `setReconnecting()`.
4. **Connection lifecycle:** `setConnecting` → `setConnected` → `setReconnecting` → `setConnected` transitions update `status` correctly.
5. **`setConnecting` sets roomId and isHost:** Verify both fields are set.
6. **`setConnected` resets reconnect attempts:** Set `reconnectAttempts` to 3 via repeated `incrementReconnectAttempts()`, then call `setConnected()`, verify `reconnectAttempts === 0`.
7. **`setDisconnected` clears peerConnected:** Set `peerConnected` to `true`, then call `setDisconnected()`, verify `peerConnected === false`.
8. **`incrementReconnectAttempts` returns new count:** Call three times, verify returns 1, 2, 3.
9. **`reset` restores all defaults:** Set various state values, call `reset()`, verify all fields match initial defaults.

## Acceptance Criteria

- [ ] File exists at `app/src/stores/connection.ts` with `useConnectionStore` exported
- [ ] File exists at `app/src/stores/connection.test.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] Store initializes with `status === 'disconnected'` and `roomId === null`
- [ ] Status transitions follow: `disconnected → connecting → connected` and `connected → reconnecting → connected`
- [ ] `reset()` restores all 6 state fields to their initial defaults
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Use the Composition API store pattern** (`defineStore('connection', () => { ... })`), not the Options API pattern. See `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.3 for the template.
- **Beware of parameter shadowing.** The `setConnecting` action has parameters named `roomId` and `isHost`, which are the same names as the state refs. Use different parameter names (e.g., `newRoomId`, `host`) or be careful with `.value` assignment. A common mistake is writing `roomId = newRoomId` instead of `roomId.value = newRoomId`.
- **Do not add WebSocket logic.** This store is a pure state container. The `useRelay` composable (Phase 6) owns the WebSocket and calls these actions. The store does not import `WebSocket`, set timers, or manage retries.
- **Do not persist to `localStorage`.** State is in-memory only per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4 (common mistakes table).
- **Do not add game state here.** Game phase, board, ships, etc. belong in `useGameStore` (ticket 002+).
- **Store test setup:** Always call `setActivePinia(createPinia())` in `beforeEach`. Failing to do so causes "getActivePinia was called with no active Pinia" errors.
