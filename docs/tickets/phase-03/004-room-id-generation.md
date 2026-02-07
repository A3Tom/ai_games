# Phase 03 — Ticket 004: Room ID Generation

## Summary

Implement the `generateRoomId()` function in `app/src/utils/room-id.ts` using `nanoid` with a custom lowercase alphanumeric alphabet. This utility produces the 8-character room identifiers embedded in shareable game URLs. When done, the agent should have a tested room ID generator that produces URL-safe, collision-resistant identifiers.

## Prerequisites

- **Phase 1 complete.** The project must have `nanoid` installed as a dependency (`app/package.json`).
- **No in-phase dependencies.** This ticket is independent of tickets 001, 002, and 003. It can be completed in parallel with any of them.

## Scope

**In scope:**

- `generateRoomId()` function
- `ROOM_ID_ALPHABET` constant (the allowed character set)
- `ROOM_ID_LENGTH` constant
- Unit tests

**Out of scope:**

- URL construction or routing logic that uses the room ID — Phase 9
- Relay-side room ID validation — Phase 5
- Room creation UI (`CreateRoom.vue`) — Phase 9
- Any other utility functions

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/utils/room-id.ts` | Create | `generateRoomId()` using nanoid with custom alphabet |
| `app/src/utils/room-id.test.ts` | Create | Unit tests for room ID generation |

## Requirements

Follow `docs/03-CODING-STANDARDS.md` Section 2 (TypeScript rules) and `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.1.

### Constants

```typescript
const ROOM_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const ROOM_ID_LENGTH = 8
```

These are **not exported** — they are internal implementation details. The alphabet and length are defined by `docs/05-PROTOCOL-SPEC.md` Section 3.1:
- Alphabet: `0123456789abcdefghijklmnopqrstuvwxyz` (36 characters)
- Length: 8 characters
- Yields ~36^8 ≈ 2.8 trillion possible IDs

### `generateRoomId()`

```typescript
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet(ROOM_ID_ALPHABET, ROOM_ID_LENGTH)

export function generateRoomId(): string {
  return nanoid()
}
```

- Uses `nanoid`'s `customAlphabet` factory to create a generator with the specified alphabet and length.
- Returns an 8-character string containing only characters from `ROOM_ID_ALPHABET`.
- Each call produces a new, unique (with high probability) ID.
- The `customAlphabet` call should happen at module scope (once), not inside the function body (avoid re-creating the generator on every call).

**Source of truth:** `docs/05-PROTOCOL-SPEC.md` Section 3.1, `docs/04-AI-ASSISTANT-GUIDE.md` Section 4 (use `nanoid`, not `Math.random()`).

### Test Requirements

Tests must use Vitest. Co-locate at `app/src/utils/room-id.test.ts`.

Required test cases:

1. **Length:** `generateRoomId()` returns a string of exactly 8 characters.
2. **Alphabet:** Every character in the returned ID matches the regex `/^[0-9a-z]+$/`.
3. **Uniqueness:** Two consecutive calls return different values. (This is probabilistic but with 36^8 possibilities, a collision in two tries is vanishingly unlikely.)
4. **Type:** The return value is a `string`.

## Acceptance Criteria

- [ ] File exists at `app/src/utils/room-id.ts` with `generateRoomId` exported
- [ ] File exists at `app/src/utils/room-id.test.ts`
- [ ] `npm run type-check` passes with no errors
- [ ] `generateRoomId()` returns an 8-character string containing only `[0-9a-z]`
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Use `customAlphabet` from `nanoid`**, not the default `nanoid()` export. The default uses a different alphabet (includes uppercase and special characters like `_` and `-`) which does not match the protocol spec.
- **Do not use `Math.random()`** for room ID generation. `nanoid` uses `crypto.getRandomValues` internally, which is cryptographically secure. See `docs/04-AI-ASSISTANT-GUIDE.md` Section 4 common mistakes table.
- **The `ROOM_ID_ALPHABET` and `ROOM_ID_LENGTH` constants are not exported.** They are implementation details. If future code needs to validate a room ID format, it can use a regex pattern. Export only the `generateRoomId` function.
- **This is the simplest ticket in Phase 3.** It should take under 15 minutes.
- **Do not add room ID validation functions** (like `isValidRoomId()`). If needed, they can be added later. The phase overview does not specify one.
- **Verify `nanoid` is already installed** by checking `app/package.json` dependencies. It should have been installed in Phase 1. If not, `npm install nanoid` in the `app/` directory before proceeding.
