# Phase 08 — Ticket 001: Protocol Composable Scaffold and Simple Sends

## Summary

Create the `useGameProtocol` composable file with the public interfaces (`UseGameProtocolOptions`, `UseGameProtocolReturn`), dependency wiring to `useRelay`, `useGameStore`, `useConnectionStore`, and `useCrypto`, and the simple send functions: `sendReady()`, `sendRematch()`, and `disconnect()`. Complex sends (`sendCommit`, `sendShot`, `sendResult`, `sendReveal`) are defined as stubs to satisfy the return type and will be implemented in ticket 002. The incoming message handler is a placeholder that logs and will be replaced in ticket 003. When done, the agent should have a compiling composable that can send ready/rematch messages and disconnect.

## Prerequisites

- **Phase 2 complete.** `app/src/types/protocol.ts` — exports `GameMessage`, `ReadyMessage`, `RematchMessage`, and all message type variants.
- **Phase 3 complete.** `app/src/utils/validation.ts` — exports type guard functions.
- **Phase 4 complete.** `app/src/stores/game.ts` — exports `useGameStore`. `app/src/stores/connection.ts` — exports `useConnectionStore`.
- **Phase 6 complete.** `app/src/composables/useRelay.ts` — exports `useRelay`, `UseRelayOptions`, `UseRelayReturn`.
- **Phase 7 complete.** `app/src/composables/useCrypto.ts` — exports `useCrypto`, `commitBoard`, `verifyBoard`.

## Scope

**In scope:**

- `UseGameProtocolOptions` interface (exported)
- `UseGameProtocolReturn` interface (exported)
- `useGameProtocol(options)` composable function (exported)
- Internal wiring: instantiate `useRelay`, `useGameStore`, `useConnectionStore`, `useCrypto`
- `sendReady()` — sends `{ type: 'ready' }` via relay
- `sendRematch()` — sends `{ type: 'rematch' }` via relay
- `disconnect()` — calls `relay.disconnect()`
- Stub implementations for `sendCommit`, `sendShot`, `sendResult`, `sendReveal` that throw `Error('Not yet implemented')` — these will be replaced in ticket 002
- Placeholder `handleIncomingMessage` that logs a warning — replaced in ticket 003
- Unit tests for `sendReady`, `sendRematch`, `disconnect`

**Out of scope:**

- `sendCommit`, `sendShot`, `sendResult`, `sendReveal` implementations — ticket 002
- Incoming message dispatch and phase filtering — ticket 003
- Battle message handling (shot/result cycle) — ticket 004
- Reveal verification and cheat detection — ticket 005
- Reconnection sync protocol — ticket 006
- UI components that consume this composable — Phases 9–12

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useGameProtocol.ts` | Create | Game protocol composable with interfaces and simple send functions |
| `app/src/composables/useGameProtocol.test.ts` | Create | Unit tests for composable scaffold and simple sends |

## Requirements

### Imports

```typescript
import type { PlacedShip, ShipType } from '../types/game'
import type { GameMessage } from '../types/protocol'
import { useGameStore } from '../stores/game'
import { useConnectionStore } from '../stores/connection'
import { useRelay } from './useRelay'
import { useCrypto } from './useCrypto'
```

### `UseGameProtocolOptions` Interface

```typescript
export interface UseGameProtocolOptions {
  roomId: string
  isHost: boolean
}
```

These are the same values needed by `useRelay`. The `roomId` identifies the game room. `isHost` is `true` for the room creator (Player A), `false` for the joiner (Player B).

### `UseGameProtocolReturn` Interface

```typescript
export interface UseGameProtocolReturn {
  /** Signal that the player is ready (ships placed) */
  sendReady: () => void

  /** Commit the board: hash ships, send commit message, update store */
  sendCommit: (ships: PlacedShip[]) => Promise<void>

  /** Fire a shot at the opponent */
  sendShot: (x: number, y: number) => void

  /** Send result of opponent's shot against our board */
  sendResult: (x: number, y: number, hit: boolean, sunk: ShipType | null) => void

  /** Reveal board and salt after game ends */
  sendReveal: (ships: PlacedShip[], saltHex: string) => void

  /** Request a rematch */
  sendRematch: () => void

  /** Clean up connections and listeners */
  disconnect: () => void
}
```

This matches the phase overview Section 6 exactly. Export the interface for downstream consumers.

### Composable Function

```typescript
export function useGameProtocol(options: UseGameProtocolOptions): UseGameProtocolReturn
```

#### Internal Setup

Inside the composable function body:

1. Instantiate stores:
   ```typescript
   const gameStore = useGameStore()
   const connectionStore = useConnectionStore()
   ```

2. Instantiate crypto:
   ```typescript
   const { commitBoard: cryptoCommitBoard, verifyBoard: cryptoVerifyBoard } = useCrypto()
   ```

3. Define the incoming message handler (placeholder for now):
   ```typescript
   function handleIncomingMessage(message: GameMessage): void {
     console.warn('Incoming message handling not yet implemented:', message.type)
   }
   ```

4. Instantiate relay, passing the handler as the `onGameMessage` callback:
   ```typescript
   const relay = useRelay({
     roomId: options.roomId,
     isHost: options.isHost,
     onGameMessage: handleIncomingMessage,
   })
   ```

The ordering matters: the handler must be defined before `useRelay` is called because `useRelay` accepts it as a callback.

#### `sendReady(): void`

Sends a `ReadyMessage` to the opponent to signal that the local player has finished placing ships and is waiting.

- Calls `relay.send({ type: 'ready' })`.
- No phase guard needed here — the composable trusts the caller (UI components) to only call this during the SETUP phase. Phase enforcement is the responsibility of the UI layer which disables the "Ready" button outside setup.
- No return value.

#### `sendRematch(): void`

Sends a `RematchMessage` to the opponent to request a new game in the same room.

- Calls `relay.send({ type: 'rematch' })`.
- No return value.

#### `disconnect(): void`

Tears down the relay connection and cleans up.

- Calls `relay.disconnect()`.
- No return value.

#### Stub Functions

The following functions must exist to satisfy the `UseGameProtocolReturn` interface but are implemented as stubs in this ticket. They will be replaced with real implementations in ticket 002.

```typescript
async function sendCommit(_ships: PlacedShip[]): Promise<void> {
  throw new Error('sendCommit not yet implemented — see ticket 002')
}

function sendShot(_x: number, _y: number): void {
  throw new Error('sendShot not yet implemented — see ticket 002')
}

function sendResult(_x: number, _y: number, _hit: boolean, _sunk: ShipType | null): void {
  throw new Error('sendResult not yet implemented — see ticket 002')
}

function sendReveal(_ships: PlacedShip[], _saltHex: string): void {
  throw new Error('sendReveal not yet implemented — see ticket 002')
}
```

Prefix unused parameters with `_` to satisfy `noUnusedParameters` in the TypeScript strict config.

#### Return Object

```typescript
return {
  sendReady,
  sendCommit,
  sendShot,
  sendResult,
  sendReveal,
  sendRematch,
  disconnect,
}
```

### Test Requirements

Create `app/src/composables/useGameProtocol.test.ts`.

#### Mocking Strategy

Mock `useRelay` to capture the `onGameMessage` callback and provide a controllable `send` spy:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockSend = vi.fn()
const mockDisconnect = vi.fn()
const mockReconnect = vi.fn()
let capturedOnGameMessage: ((msg: GameMessage) => void) | null = null

vi.mock('./useRelay', () => ({
  useRelay: vi.fn((options: { onGameMessage: (msg: GameMessage) => void }) => {
    capturedOnGameMessage = options.onGameMessage
    return {
      send: mockSend,
      connected: { value: true },
      reconnect: mockReconnect,
      disconnect: mockDisconnect,
    }
  }),
}))

vi.mock('./useCrypto', () => ({
  useCrypto: vi.fn(() => ({
    commitBoard: vi.fn(),
    verifyBoard: vi.fn(),
    isAvailable: true,
  })),
}))
```

Use `setActivePinia(createPinia())` in `beforeEach` to initialize real Pinia stores. Reset all mocks in `beforeEach` with `vi.clearAllMocks()` and set `capturedOnGameMessage = null`.

#### Required Test Cases

1. **`useRelay` is called with correct options:** Call `useGameProtocol({ roomId: 'abc123', isHost: true })`. Assert `useRelay` was called with `{ roomId: 'abc123', isHost: true, onGameMessage: expect.any(Function) }`.

2. **`sendReady()` sends ready message:** Call `protocol.sendReady()`. Assert `mockSend` was called with `{ type: 'ready' }`.

3. **`sendRematch()` sends rematch message:** Call `protocol.sendRematch()`. Assert `mockSend` was called with `{ type: 'rematch' }`.

4. **`disconnect()` calls relay disconnect:** Call `protocol.disconnect()`. Assert `mockDisconnect` was called once.

5. **Stub functions throw:** Assert that calling `protocol.sendCommit([])`, `protocol.sendShot(0, 0)`, `protocol.sendResult(0, 0, false, null)`, or `protocol.sendReveal([], '')` throws an error with a message containing "not yet implemented".

## Acceptance Criteria

- [ ] File exists at `app/src/composables/useGameProtocol.ts` with `useGameProtocol` exported
- [ ] `UseGameProtocolOptions` and `UseGameProtocolReturn` interfaces are exported
- [ ] `sendReady()` sends `{ type: 'ready' }` via `relay.send()`
- [ ] `sendRematch()` sends `{ type: 'rematch' }` via `relay.send()`
- [ ] `disconnect()` calls `relay.disconnect()`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do not implement complex send functions in this ticket.** `sendCommit`, `sendShot`, `sendResult`, and `sendReveal` are stubs. They will be replaced in ticket 002. Using `throw new Error(...)` for stubs ensures that any accidental call during testing will surface clearly.
- **Do not implement incoming message handling.** The `handleIncomingMessage` is a placeholder `console.warn`. Ticket 003 replaces it with real dispatch logic.
- **Prefix unused parameters with `_`** in stub functions to avoid TypeScript `noUnusedParameters` errors.
- **The composable calls `useRelay` synchronously during initialization.** This means `useRelay` is invoked as soon as `useGameProtocol` is called. The relay connection starts immediately.
- **Follow the composable pattern from `docs/03-CODING-STANDARDS.md` Section 5** and `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.2. The composable returns plain functions and values — no refs are needed in this composable since all reactive state is managed by the stores.
- **Do not add `onUnmounted` cleanup in this ticket.** The `disconnect()` function provides explicit cleanup. If lifecycle cleanup is needed, it can be added in a later ticket.
- **The `capturedOnGameMessage` pattern in tests** captures the callback passed to `useRelay` so that later test tickets (003–006) can simulate incoming messages by calling `capturedOnGameMessage(msg)` directly.
- **Mock both `useRelay` and `useCrypto`** in the test file. The mocks should be set up before importing `useGameProtocol`. Use `vi.mock()` with factory functions at the top of the test file.
