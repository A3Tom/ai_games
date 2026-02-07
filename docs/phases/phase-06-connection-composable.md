# Phase 6: Connection Composable

## 1. Objective

Implement the `useRelay` composable that manages the WebSocket connection lifecycle between the client and the relay server. Before this phase, the relay server exists but no client code connects to it. After this phase, the client can connect to a room, receive relay system messages, dispatch incoming messages, handle disconnection with automatic reconnection using exponential backoff, and clean up on component unmount.

## 2. Prerequisites

- **Phase 1** must be complete: Vue project structure with composable directory.
- **Phase 2** must be complete: `RelayMessage`, `GameMessage`, `IncomingMessage`, `ClientControlMessage` types are defined in `types/protocol.ts`.
- **Phase 4** must be complete: `useConnectionStore` is implemented with actions for status updates, peer presence, and reconnect tracking.
- **Phase 5** must be complete: relay server is running and available for manual testing.

Specific dependencies:
- `app/src/types/protocol.ts` — `IncomingMessage`, `GameMessage`, `RelayMessage`, `ClientControlMessage`
- `app/src/stores/connection.ts` — `useConnectionStore` actions
- `app/src/utils/validation.ts` — `parseIncomingMessage()`, type guards for relay messages

## 3. Scope

### In Scope

- `app/src/composables/useRelay.ts`: WebSocket connection, message sending, message receiving and dispatch, automatic reconnection with exponential backoff, cleanup on unmount, ping/pong for latency measurement.
- Wire `useRelay` to `useConnectionStore` — update status on connect/disconnect/reconnect, update peer presence on `peer_count`/`peer_left`, track reconnect attempts.
- Read relay URL from `import.meta.env.VITE_RELAY_URL` (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 4, common mistakes table).

### Out of Scope

- Crypto operations — Phase 7.
- Game message interpretation and dispatch to game store — Phase 8 (`useGameProtocol`).
- UI components showing connection status — Phase 13.
- Rate limiting enforcement on the client side — Phase 8 or Phase 13.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/composables/useRelay.ts` | Create | WebSocket connection management, message send/receive, reconnection, cleanup |

## 5. Key Design Decisions

1. **Composable wraps raw WebSocket:** `useRelay` encapsulates all WebSocket lifecycle management. No other code in the app should create WebSocket instances directly (see `docs/03-CODING-STANDARDS.md` Section 5).

2. **Relay URL from environment:** The WebSocket URL comes from `import.meta.env.VITE_RELAY_URL`, never hardcoded (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 4, common mistakes table).

3. **Exponential backoff reconnection:** On unexpected disconnect, retry with delays: 1s, 2s, 4s, 8s, 16s, 30s (cap), max 10 retries. After max retries, set status to `'disconnected'` (see `docs/02-ARCHITECTURE.md` Section 7, `docs/05-PROTOCOL-SPEC.md` Section 9.1).

4. **Re-join room on reconnect:** After reconnecting, automatically re-send `{ type: "join", roomId }` to restore room membership (see `docs/05-PROTOCOL-SPEC.md` Section 9.1 step 5a).

5. **Cleanup on unmount:** The composable must close the WebSocket and clear all timers in `onUnmounted` (see `docs/03-CODING-STANDARDS.md` Section 5).

6. **Handle both `close` and `error` events:** Both must trigger reconnection logic and update `useConnectionStore`. Never silently ignore WebSocket errors (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 4, common mistakes table; `docs/03-CODING-STANDARDS.md` Section 6).

7. **Message callback pattern:** `useRelay` accepts an `onMessage` callback (or exposes an event emitter) that downstream composables (Phase 8) use to receive parsed messages. The relay composable parses raw JSON and validates it, then dispatches.

8. **Relay system messages handled internally:** `peer_count`, `peer_left`, and `error` messages are handled inside `useRelay` by updating `useConnectionStore`. Game messages are passed to the `onMessage` callback for Phase 8 to handle.

## 6. Interfaces & Contracts

### `app/src/composables/useRelay.ts`

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

### Connection Store Integration

The composable calls these `useConnectionStore` actions internally:
- `setConnecting(roomId, isHost)` — on initial connect attempt
- `setConnected()` — on WebSocket `open` event
- `setReconnecting()` — on unexpected close, before retry
- `setDisconnected()` — on max retries exceeded or manual disconnect
- `setPeerConnected(true/false)` — on `peer_count` (count === 2) or `peer_left`
- `updatePing(ms)` — on pong response
- `incrementReconnectAttempts()` — on each retry
- `resetReconnectAttempts()` — on successful reconnect

## 7. Acceptance Criteria

1. Calling `useRelay({ roomId: 'test', isHost: true, onGameMessage: ... })` opens a WebSocket connection to the relay URL from env.
2. On successful connection, `useConnectionStore.status` transitions to `'connected'`.
3. The composable automatically sends `{ type: "join", roomId: "test" }` after connection opens.
4. When a second client joins the same room, the `onGameMessage` callback is NOT called — the `peer_count` message is handled internally and `connectionStore.peerConnected` becomes `true`.
5. Calling `send({ type: 'ready' })` sends the JSON-serialized message over the WebSocket.
6. When the WebSocket closes unexpectedly, `connectionStore.status` transitions to `'reconnecting'` and the composable retries with exponential backoff.
7. After successful reconnection, the composable re-sends the `join` message automatically.
8. After 10 failed reconnection attempts, `connectionStore.status` transitions to `'disconnected'`.
9. When the component unmounts, the WebSocket is closed and no reconnection attempts continue.
10. A `peer_left` relay message sets `connectionStore.peerConnected` to `false`.
11. Two browser tabs connected to the same room via the relay can exchange messages — verified by console logging the `onGameMessage` callback.
12. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **`useRelay` composable** used by Phase 8 (`useGameProtocol`) as the transport layer for all game messages.
- **`send()` function** used by Phase 8 to dispatch typed game messages.
- **`onGameMessage` callback** is the entry point for Phase 8's message handling pipeline.
- **Connection status in store** used by Phase 9 (lobby shows peer status), Phase 13 (ConnectionStatus component).

### Boundaries

- **Phase 8 owns game message interpretation.** `useRelay` passes game messages to the callback without processing them. It does not import `useGameStore` or handle shots, results, commits, etc.
- The relay composable handles only transport concerns: connect, send, receive, reconnect, disconnect.
- Components must NOT call `useRelay.send()` directly — they go through `useGameProtocol` (Phase 8).
