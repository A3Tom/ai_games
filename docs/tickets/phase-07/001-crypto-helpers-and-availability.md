# Phase 07 — Ticket 001: Crypto Helper Utilities and Availability Check

## Summary

Create the `useCrypto` module with the `CommitResult` interface, internal hex-encoding and SHA-256 helper functions, and the exported `isCryptoAvailable()` function. This ticket establishes the foundation files (`useCrypto.ts` and `useCrypto.test.ts`) that all subsequent tickets in this phase build upon. When done, the agent should have a compiling module with tested hex encoding, SHA-256 hashing, and Web Crypto API availability detection.

## Prerequisites

- **Phase 2 complete.** `PlacedShip`, `ShipType`, `BoardCommitment` types are defined.
  - `app/src/types/game.ts` — exports `PlacedShip`, `ShipType`

No other tickets are prerequisites. This is the first ticket in Phase 7.

## Scope

**In scope:**

- `CommitResult` interface (exported)
- `toHex(bytes: Uint8Array): string` — internal helper to convert byte arrays to lowercase hex strings
- `sha256(input: string): Promise<string>` — internal helper to compute SHA-256 and return as lowercase hex
- `isCryptoAvailable(): boolean` — exported function to check Web Crypto API availability
- Unit tests for `toHex`, `sha256`, and `isCryptoAvailable`

**Out of scope:**

- `commitBoard()` function — ticket 002
- `verifyBoard()` function — ticket 003
- `useCrypto()` composable wrapper — ticket 004
- Any Vue imports or reactive state — ticket 004

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/composables/useCrypto.ts` | Create | CommitResult interface, toHex, sha256, isCryptoAvailable |
| `app/src/composables/useCrypto.test.ts` | Create | Unit tests for helpers and availability |

## Requirements

### Import

```typescript
import type { PlacedShip } from '../types/game'
```

This import is needed for the `commitBoard` signature in ticket 002, but the type should be imported here so that the file already references its dependency. If the linter flags an unused import, defer this import to ticket 002 and omit it here.

### `CommitResult` Interface

```typescript
export interface CommitResult {
  hash: string         // 64-character lowercase hex SHA-256
  salt: Uint8Array     // 32 random bytes
  saltHex: string      // 64-character lowercase hex encoding of salt
}
```

This is the return type of `commitBoard()` (ticket 002). Define and export it here so the type is available before the implementation.

Per `docs/03-CODING-STANDARDS.md` Section 2: use `interface` for object shapes. No `I` prefix. Export with `export interface`.

### `toHex(bytes: Uint8Array): string`

Converts a `Uint8Array` to a lowercase hexadecimal string.

```typescript
function toHex(bytes: Uint8Array): string
```

- Each byte maps to a 2-character hex string, zero-padded: `byte.toString(16).padStart(2, '0')`.
- Concatenate all hex pairs into a single string.
- Output must be lowercase.
- For an empty `Uint8Array`, return `''`.
- For a 32-byte input, the output must be exactly 64 characters.

This function is **not exported** from the module — it is internal. However, for testability, export it as a named export. Future tickets may remove the export if it becomes unnecessary, but for this phase it enables direct unit testing.

Algorithm (per `docs/05-PROTOCOL-SPEC.md` Section 7.1):

```
Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
```

### `sha256(input: string): Promise<string>`

Computes the SHA-256 digest of a UTF-8 string and returns it as a 64-character lowercase hex string.

```typescript
function sha256(input: string): Promise<string>
```

- Encode the input string to bytes using `new TextEncoder().encode(input)`.
- Compute the digest: `await crypto.subtle.digest('SHA-256', encodedBytes)`.
- Convert the resulting `ArrayBuffer` to a `Uint8Array`, then to hex using `toHex`.
- The output is always exactly 64 lowercase hex characters (256 bits = 32 bytes = 64 hex chars).
- If `crypto.subtle` is unavailable, this function will throw. Callers (future tickets) are responsible for checking `isCryptoAvailable()` first.

Export this function as a named export for testability (same rationale as `toHex`).

Algorithm (per `docs/05-PROTOCOL-SPEC.md` Section 7.1):

```
hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
hash = toHex(new Uint8Array(hashBuffer))
```

### `isCryptoAvailable(): boolean`

Checks whether the Web Crypto API is available in the current context.

```typescript
export function isCryptoAvailable(): boolean
```

- Returns `true` if `globalThis.crypto?.subtle` is truthy.
- Returns `false` otherwise.
- This is a synchronous function — no async needed.
- Use `globalThis.crypto` rather than `window.crypto` for compatibility with test environments (Vitest runs in a Node-like environment where `window` may not exist but `globalThis.crypto` may be polyfilled).

Per `docs/03-CODING-STANDARDS.md` Section 6: `crypto.subtle` is only available in secure contexts (HTTPS or localhost). If unavailable, the application must show a user-facing error. This function enables that check; the UI error itself is out of scope (Phase 9).

### Test Requirements

Create `app/src/composables/useCrypto.test.ts` with the following test cases:

1. **`toHex` converts bytes to hex:** `toHex(new Uint8Array([0x0a, 0xff, 0x00]))` returns `'0aff00'`.
2. **`toHex` handles empty input:** `toHex(new Uint8Array([]))` returns `''`.
3. **`toHex` handles 32-byte input:** `toHex(new Uint8Array(32))` returns a 64-character string of `'0'`s.
4. **`sha256` produces known hash:** `sha256('hello')` returns `'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'` (the well-known SHA-256 of "hello").
5. **`sha256` output is 64-char lowercase hex:** Verify length is 64 and matches `/^[0-9a-f]{64}$/`.
6. **`sha256` is deterministic:** Calling `sha256` twice with the same input returns the same output.
7. **`isCryptoAvailable` returns boolean:** Verify it returns `true` in the test environment (Vitest with `jsdom` or `happy-dom` environment should have `crypto.subtle` available).

Import the functions under test directly:

```typescript
import { toHex, sha256, isCryptoAvailable } from './useCrypto'
```

Use `describe` blocks to group tests logically (e.g., `describe('toHex', ...)`, `describe('sha256', ...)`, `describe('isCryptoAvailable', ...)`).

## Acceptance Criteria

- [ ] `app/src/composables/useCrypto.ts` exists and exports `CommitResult`, `toHex`, `sha256`, and `isCryptoAvailable`
- [ ] `toHex(new Uint8Array([0x0a, 0xff]))` returns `'0aff'`
- [ ] `sha256('hello')` returns `'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'`
- [ ] `isCryptoAvailable()` returns `true` in the test environment
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do not use external crypto libraries.** `crypto.subtle.digest('SHA-256', ...)` is the only permitted hashing mechanism (`docs/04-AI-ASSISTANT-GUIDE.md` Section 2.5, `docs/03-CODING-STANDARDS.md` Section 9).
- **Use `globalThis.crypto` not `window.crypto`** for the availability check. The test environment (Vitest) may not have `window` but will have `globalThis.crypto`.
- **The `composables/` directory does not exist yet.** The agent must create it when writing the first file.
- **Do not import Vue in this ticket.** The helpers and `isCryptoAvailable` are pure functions with no framework dependency. Vue imports come in ticket 004.
- **Keep `toHex` and `sha256` as simple, single-purpose functions.** They will be used by both `commitBoard` and `verifyBoard` in later tickets. Do not add extra functionality like input validation or error wrapping — keep them minimal.
- **Naming conventions** from `docs/03-CODING-STANDARDS.md` Section 2.3: file is kebab-case (`useCrypto.ts` — composable naming exception), interface is PascalCase (`CommitResult`), boolean returns use `is` prefix (`isCryptoAvailable`).
