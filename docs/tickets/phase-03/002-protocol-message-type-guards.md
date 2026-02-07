# Phase 03 — Ticket 002: Protocol Message Type Guards

## Summary

Implement type guard functions for every protocol message type and a `parseIncomingMessage()` utility in `app/src/utils/validation.ts`. These runtime validators ensure the client never processes malformed or unexpected messages from the WebSocket relay. When done, the agent should have a validation module with 13 type guard functions and a JSON-to-typed-message parser, all fully tested.

## Prerequisites

- **Phase 2 complete.** Specifically:
  - `app/src/types/protocol.ts` — exports all message interfaces (`ShotMessage`, `ResultMessage`, `CommitMessage`, `ReadyMessage`, `RevealMessage`, `RematchMessage`, `PingMessage`, `PongMessage`, `SyncRequestMessage`, `SyncResponseMessage`, `PeerCountMessage`, `PeerLeftMessage`, `RelayErrorMessage`) and union types (`GameMessage`, `RelayMessage`, `IncomingMessage`) (Phase 2, Ticket 004)
  - `app/src/types/game.ts` — exports `SHIP_TYPES`, `ShipType`, `GAME_PHASES`, `GamePhase` (Phase 2, Ticket 001)
- **No in-phase dependencies.** This ticket does not depend on ticket 001 (board utils) or ticket 004 (room ID). It can be completed in parallel with them.

## Scope

**In scope:**

- 13 type guard functions — one per protocol message type
- `parseIncomingMessage()` — parses raw JSON string into a typed `IncomingMessage` or `null`
- Unit tests for all type guards and the parser

**Out of scope:**

- `isValidPlacement()` and `isValidShot()` — handled in ticket 003 (game validation)
- Board utility functions — handled in ticket 001
- Room ID generation — handled in ticket 004
- Any relay-side validation — Phase 5
- Message sending/dispatching logic — Phase 6 and Phase 8

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/utils/validation.ts` | Create | Type guard functions for all protocol messages and `parseIncomingMessage()` |
| `app/src/utils/validation.test.ts` | Create | Unit tests for all type guards and the parser |

## Requirements

All type guards must follow the pattern described in `docs/05-PROTOCOL-SPEC.md` Section 8. They validate both the **structure** (correct fields exist with correct types) and **value ranges** (coordinates in [0, 9], hash is 64-char hex, etc.). Follow `docs/03-CODING-STANDARDS.md` Section 2 (no `any`, explicit types) and `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.4 (always validate incoming messages).

### Imports

```typescript
import type {
  ShotMessage,
  ResultMessage,
  CommitMessage,
  ReadyMessage,
  RevealMessage,
  RematchMessage,
  PingMessage,
  PongMessage,
  SyncRequestMessage,
  SyncResponseMessage,
  PeerCountMessage,
  PeerLeftMessage,
  RelayErrorMessage,
  IncomingMessage,
} from '../types/protocol'
import { SHIP_TYPES } from '../types/game'
import { GAME_PHASES } from '../types/game'
```

Use `import type` for all type-only imports. Import `SHIP_TYPES` and `GAME_PHASES` as value imports since they are used at runtime for validation.

### Helper: Coordinate validation

Many guards share coordinate validation logic. Extract a private helper:

```typescript
function isValidCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9
}
```

This is not exported — it's an internal implementation detail.

### Type Guard: `isShotMessage()`

```typescript
export function isShotMessage(msg: unknown): msg is ShotMessage
```

Validates:
- `msg` is a non-null object
- `msg.type === 'shot'`
- `msg.x` is an integer in [0, 9]
- `msg.y` is an integer in [0, 9]

Reference: `docs/05-PROTOCOL-SPEC.md` Section 8 (example type guard).

### Type Guard: `isResultMessage()`

```typescript
export function isResultMessage(msg: unknown): msg is ResultMessage
```

Validates:
- `msg.type === 'result'`
- `msg.x` is an integer in [0, 9]
- `msg.y` is an integer in [0, 9]
- `msg.hit` is a boolean
- `msg.sunk` is either `null` or a valid `ShipType` value (one of `Object.values(SHIP_TYPES)`)

### Type Guard: `isCommitMessage()`

```typescript
export function isCommitMessage(msg: unknown): msg is CommitMessage
```

Validates:
- `msg.type === 'commit'`
- `msg.hash` is a string of exactly 64 lowercase hex characters (regex: `/^[0-9a-f]{64}$/`)

### Type Guard: `isReadyMessage()`

```typescript
export function isReadyMessage(msg: unknown): msg is ReadyMessage
```

Validates:
- `msg.type === 'ready'`
- No other fields required

### Type Guard: `isRevealMessage()`

```typescript
export function isRevealMessage(msg: unknown): msg is RevealMessage
```

Validates:
- `msg.type === 'reveal'`
- `msg.ships` is an array of exactly 5 elements
- Each element in `msg.ships` has: `type` (valid `ShipType`), `x` (integer 0–9), `y` (integer 0–9), `orientation` (`'h'` or `'v'`)
- `msg.salt` is a string of exactly 64 lowercase hex characters

Note: This validates **structural correctness** of the reveal message. It does not validate fleet composition (correct ship types, no overlaps) — that is `isValidPlacement()`'s job in ticket 003.

### Type Guard: `isRematchMessage()`

```typescript
export function isRematchMessage(msg: unknown): msg is RematchMessage
```

Validates:
- `msg.type === 'rematch'`

### Type Guard: `isPingMessage()`

```typescript
export function isPingMessage(msg: unknown): msg is PingMessage
```

Validates:
- `msg.type === 'ping'`
- `msg.timestamp` is a number (positive, finite)

### Type Guard: `isPongMessage()`

```typescript
export function isPongMessage(msg: unknown): msg is PongMessage
```

Validates:
- `msg.type === 'pong'`
- `msg.timestamp` is a number (positive, finite)

### Type Guard: `isSyncRequestMessage()`

```typescript
export function isSyncRequestMessage(msg: unknown): msg is SyncRequestMessage
```

Validates:
- `msg.type === 'sync_request'`

### Type Guard: `isSyncResponseMessage()`

```typescript
export function isSyncResponseMessage(msg: unknown): msg is SyncResponseMessage
```

Validates:
- `msg.type === 'sync_response'`
- `msg.phase` is a valid `GamePhase` value (one of `Object.values(GAME_PHASES)`)
- `msg.turnNumber` is a non-negative integer
- `msg.shotHistory` is an array where each element has: `x` (integer 0–9), `y` (integer 0–9), `hit` (boolean), `sunk` (`ShipType | null`), `player` (`'a'` or `'b'`)

### Type Guard: `isPeerCountMessage()`

```typescript
export function isPeerCountMessage(msg: unknown): msg is PeerCountMessage
```

Validates:
- `msg.type === 'peer_count'`
- `msg.count` is a positive integer

### Type Guard: `isPeerLeftMessage()`

```typescript
export function isPeerLeftMessage(msg: unknown): msg is PeerLeftMessage
```

Validates:
- `msg.type === 'peer_left'`

### Type Guard: `isRelayErrorMessage()`

```typescript
export function isRelayErrorMessage(msg: unknown): msg is RelayErrorMessage
```

Validates:
- `msg.type === 'error'`
- `msg.code` is one of `'ROOM_FULL' | 'INVALID_MESSAGE' | 'RATE_LIMITED'`
- `msg.message` is a string

### `parseIncomingMessage()`

```typescript
export function parseIncomingMessage(raw: string): IncomingMessage | null
```

- Attempts to `JSON.parse(raw)`. If parsing fails, returns `null`.
- Runs the parsed object through each type guard in sequence. Returns the object (narrowed to `IncomingMessage`) if any guard matches.
- If no guard matches, returns `null`.
- Must not throw. Catches `JSON.parse` errors internally.
- The check order does not matter for correctness (each guard checks `msg.type`), but for efficiency, check the most frequent message types first: `shot`, `result`, `peer_count`, then the rest.

### Test Requirements

Tests must use Vitest. Co-locate at `app/src/utils/validation.test.ts`.

Required test cases (minimum):

1. **`isShotMessage`**: Accepts `{ type: 'shot', x: 5, y: 3 }`. Rejects `{ type: 'shot', x: 10, y: 3 }` (out of range). Rejects `{ type: 'shot', x: 1.5, y: 3 }` (not integer). Rejects `null`, `undefined`, `"string"`.
2. **`isResultMessage`**: Accepts valid result with `sunk: null`. Accepts valid result with `sunk: 'carrier'`. Rejects `sunk: 'battlecruiser'` (invalid ship type).
3. **`isCommitMessage`**: Accepts 64-char lowercase hex hash. Rejects 63-char hash. Rejects uppercase hex. Rejects non-hex characters.
4. **`isRevealMessage`**: Accepts valid reveal with 5 ships and 64-char salt. Rejects reveal with 4 ships. Rejects invalid ship orientation.
5. **`isPeerCountMessage`**: Accepts `{ type: 'peer_count', count: 2 }`. Rejects `{ type: 'peer_count', count: -1 }`.
6. **`isRelayErrorMessage`**: Accepts valid error codes. Rejects unknown error codes.
7. **`parseIncomingMessage`**: Parses valid JSON into correct type. Returns `null` for malformed JSON. Returns `null` for valid JSON that doesn't match any message type.

## Acceptance Criteria

- [ ] File exists at `app/src/utils/validation.ts` with all 13 type guards and `parseIncomingMessage` exported
- [ ] File exists at `app/src/utils/validation.test.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `isShotMessage()` returns `true` for `{ type: 'shot', x: 5, y: 3 }` and `false` for `{ type: 'shot', x: 10, y: 3 }`
- [ ] `isCommitMessage()` rejects hashes that are not exactly 64 lowercase hex characters
- [ ] `parseIncomingMessage()` returns `null` for malformed JSON and for valid JSON with unknown `type` values
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Use `unknown` as the parameter type for all type guards**, not `any`. Narrow with property checks. This follows `docs/03-CODING-STANDARDS.md` Section 2.1 and `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.1.
- **Check `typeof msg === 'object' && msg !== null`** before accessing properties. The `in` operator can be used to check for property existence: `'type' in msg`.
- **Do not import from `board.ts`** (ticket 001). Type guards only depend on protocol types and game constant values (`SHIP_TYPES`, `GAME_PHASES`). Game validation functions (`isValidPlacement`, `isValidShot`) belong in ticket 003.
- **`isRevealMessage` should validate structure, not semantics.** Check that ships is an array of 5 objects with the right shape. Do not check for fleet composition correctness (e.g., one of each type) — that is `isValidPlacement()`'s job.
- **`parseIncomingMessage` must never throw.** Wrap `JSON.parse` in a try-catch. This function is called on every incoming WebSocket message, so robustness is critical.
- **The `isRelayErrorMessage` guard checks for `type: 'error'`**, not `type: 'relay_error'`. This matches `docs/05-PROTOCOL-SPEC.md` Section 2.2.
- **Validate `SHIP_TYPES` values at runtime** by checking against `Object.values(SHIP_TYPES)`. Do not hardcode the string array `['carrier', 'battleship', ...]`.
- Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: "Sending raw JSON without validation" — these guards are the solution. They must be thorough.
