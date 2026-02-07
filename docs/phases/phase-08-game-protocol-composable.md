# Phase 8: Game Protocol Composable

## 1. Objective

Implement the `useGameProtocol` composable that bridges the transport layer (`useRelay`) and the application state layer (`useGameStore`) by sending typed game messages and receiving, validating, and dispatching incoming messages to the appropriate store actions. Before this phase, the relay composable can send/receive raw messages and the game store has actions, but nothing connects them. After this phase, the full message lifecycle is wired: UI action → store → protocol → relay → opponent, and opponent message → relay → protocol → validation → store → reactive UI update.

## 2. Prerequisites

- **Phase 2** must be complete: all protocol message types and type guards.
- **Phase 3** must be complete: message type guards and validation functions.
- **Phase 4** must be complete: `useGameStore` and `useConnectionStore` with all actions.
- **Phase 6** must be complete: `useRelay` composable for WebSocket transport.
- **Phase 7** must be complete: `useCrypto` composable for commit/verify operations.

Specific dependencies:
- `app/src/types/protocol.ts` — `GameMessage` and all variants
- `app/src/utils/validation.ts` — type guard functions, `parseIncomingMessage()`
- `app/src/stores/game.ts` — `useGameStore` actions
- `app/src/stores/connection.ts` — `useConnectionStore` for host/peer status
- `app/src/composables/useRelay.ts` — `send()`, `onGameMessage` callback
- `app/src/composables/useCrypto.ts` — `commitBoard()`, `verifyBoard()`

## 3. Scope

### In Scope

- `app/src/composables/useGameProtocol.ts`: The single composable that orchestrates the game protocol. All message sending and receiving goes through this composable.
- Outgoing message construction and sending: `sendReady()`, `sendCommit()`, `sendShot()`, `sendResult()`, `sendReveal()`, `sendRematch()`, `sendPing()`, `sendSyncRequest()`, `sendSyncResponse()`.
- Incoming message validation and dispatch: validate each incoming message against the current game phase (see `docs/05-PROTOCOL-SPEC.md` Section 5.1), then call the appropriate store action.
- Phase-aware message filtering: messages received outside their valid phase are logged and ignored (see `docs/05-PROTOCOL-SPEC.md` Section 5.1).
- Post-game shot result verification against the revealed board (see `docs/05-PROTOCOL-SPEC.md` Section 7.3).
- Sync request/response handling for reconnection (see `docs/05-PROTOCOL-SPEC.md` Section 9.2).

### Out of Scope

- Raw WebSocket management — Phase 6 (`useRelay`).
- Cryptographic hash computation — Phase 7 (`useCrypto`), though this composable calls it.
- UI components — Phases 9–12 call `useGameProtocol` methods.
- Store state definition — Phase 4.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/composables/useGameProtocol.ts` | Create | Game message orchestration: send, receive, validate, dispatch |

## 5. Key Design Decisions

1. **Single orchestration point:** Components never call `useRelay.send()` directly. All game messages go through `useGameProtocol`. This ensures validation, phase checking, and store updates are always applied (see `docs/04-AI-ASSISTANT-GUIDE.md` Phase 8 description).

2. **Phase-aware message filtering:** Before processing any incoming message, check that the message type is valid for the current game phase. Invalid-phase messages are logged as warnings and dropped (see `docs/05-PROTOCOL-SPEC.md` Section 5.1).

3. **Never trust the opponent:** Every incoming message is validated with type guards before being processed. Malformed messages are logged and dropped (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.4, `docs/03-CODING-STANDARDS.md` Section 6).

4. **Message order independence:** Do not assume messages arrive in order. Use state-based reconciliation where possible. Sequence numbers or state checks prevent duplicate processing (see `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.4).

5. **Shot debouncing:** Enforce a 200ms minimum between shot sends to prevent accidental double-clicks (see `docs/05-PROTOCOL-SPEC.md` Section 10.2).

6. **Post-game result verification:** After receiving the opponent's reveal, verify both the board commitment hash AND the honesty of each shot result (see `docs/05-PROTOCOL-SPEC.md` Section 7.3). Call `gameStore.setCheatDetected(true)` if any check fails.

7. **Reconnection sync:** On receiving `sync_request`, respond with `sync_response` containing current phase, turn number, and shot history. On receiving `sync_response`, reconcile local state (see `docs/05-PROTOCOL-SPEC.md` Section 9.2).

## 6. Interfaces & Contracts

### `app/src/composables/useGameProtocol.ts`

```typescript
interface UseGameProtocolOptions {
  roomId: string
  isHost: boolean
}

interface UseGameProtocolReturn {
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

export function useGameProtocol(options: UseGameProtocolOptions): UseGameProtocolReturn
```

### Incoming Message Dispatch Map

| Incoming Message Type | Valid Phase(s) | Store Action Called |
|----------------------|---------------|-------------------|
| `ready` | SETUP | (track opponent ready state) |
| `commit` | COMMIT | `gameStore.receiveOpponentCommit(hash)` |
| `shot` | BATTLE | `gameStore.receiveShot(x, y)` → auto-sends result |
| `result` | BATTLE | `gameStore.receiveResult(x, y, hit, sunk)` |
| `reveal` | REVEAL | `gameStore.receiveReveal(ships, salt)` → verify |
| `rematch` | GAMEOVER | `gameStore.resetForRematch()` (when both agree) |
| `ping` | any | auto-responds with `pong` |
| `pong` | any | `connectionStore.updatePing(latency)` |
| `sync_request` | any | auto-responds with `sync_response` |
| `sync_response` | any | reconcile local state |

## 7. Acceptance Criteria

1. Calling `sendCommit(ships)` generates a hash via `useCrypto.commitBoard()`, updates `gameStore.commitBoard()`, and sends a `{ type: 'commit', hash }` message via `useRelay.send()`.
2. Calling `sendShot(3, 5)` sends `{ type: 'shot', x: 3, y: 5 }` and prevents another shot until a result is received.
3. Receiving a `shot` message during the BATTLE phase calls `gameStore.receiveShot()` and automatically sends back a `result` message.
4. Receiving a `shot` message during the SETUP phase logs a warning and does not process it.
5. Receiving a `commit` message updates `gameStore.opponentCommitHash` and, if both committed, transitions to BATTLE.
6. Receiving a `reveal` message triggers `useCrypto.verifyBoard()` and calls `gameStore.setCheatDetected(true)` if verification fails.
7. Post-game, the composable verifies every shot result against the opponent's revealed board (per `docs/05-PROTOCOL-SPEC.md` Section 7.3) and flags cheating if any mismatch is found.
8. Rapid shot attempts within 200ms are debounced — only the first is sent.
9. A `sync_request` received after reconnection generates a correct `sync_response` with the current phase, turn number, and shot history.
10. Two browser tabs can play a complete game (setup → commit → battle → reveal → gameover) through this composable.
11. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **`useGameProtocol` return object** consumed by Phase 10 (`sendCommit` for the "Ready" button), Phase 11 (`sendShot` for firing at opponent), Phase 12 (`sendReveal`, `sendRematch` for game over actions).
- **Automated message handling** means UI phases only need to call the send methods and read store state — they don't handle incoming messages directly.

### Boundaries

- Components (Phases 9–12) must call `useGameProtocol` methods for all game actions. They must NOT call `useRelay.send()` directly or manipulate the game store's phase transitions manually.
- The protocol composable owns the send/receive loop. The game store owns the state. The crypto composable owns hashing. Each has a clear responsibility boundary.
- If a new message type is needed in the future, it should be added to `types/protocol.ts` (Phase 2), given a type guard in `utils/validation.ts` (Phase 3), and handled here.
