# Phase 09 — Ticket 003: JoinRoom Lobby Component

## Summary

Create the `JoinRoom.vue` component that provides a text input for entering a room ID, validates the input, and emits a `roomJoined` event when the user clicks "Join". This component handles client-side validation of the room ID format (8-character lowercase alphanumeric) and displays inline error messages for invalid input. After this ticket, the join-room flow works in isolation and is ready to be integrated into `LobbyView` (ticket 004).

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind configured.
- `app/src/components/lobby/` directory exists (created in ticket 002, or create it if working on this ticket first).

## Scope

**In scope:**

- `app/src/components/lobby/JoinRoom.vue` — room ID text input, validation, "Join" button, error display
- Unit tests for component logic and validation

**Out of scope:**

- `CreateRoom.vue` — ticket 002
- `LobbyView.vue` integration — ticket 004
- Router navigation to `/game/:roomId` — handled by `LobbyView` listening to the `roomJoined` emit (ticket 004)
- Relay connection — happens when `GameView` mounts (Phases 10+)
- `AppHeader.vue` — ticket 001

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/lobby/JoinRoom.vue` | Create | Room ID input with validation and join button |
| `app/src/components/lobby/JoinRoom.test.ts` | Create | Unit tests for JoinRoom component |

## Requirements

### Component Contract

As defined in `docs/phases/phase-09-ui-lobby.md` Section 6:

```typescript
// No props — self-contained
const emit = defineEmits<{
  roomJoined: [roomId: string]
}>()
```

### Imports

```typescript
import { ref, computed } from 'vue'
```

No external dependencies are needed. Validation is done inline since the rules are simple (no need to import from `utils/validation.ts` — that file handles protocol message validation, not room ID format validation).

### Internal State

- `roomIdInput: Ref<string>` — bound to the text input via `v-model`. Initially empty string `''`.
- `hasAttemptedSubmit: Ref<boolean>` — initially `false`; set to `true` when the user clicks "Join". Used to control when validation errors are shown (don't show errors before the user tries to submit).

### Room ID Validation

Define a computed `validationError: ComputedRef<string | null>` that returns:

- `'Room ID is required'` — if `roomIdInput` is empty (after trimming).
- `'Room ID must be 8 characters'` — if the trimmed input length is not exactly 8.
- `'Room ID must contain only lowercase letters and numbers'` — if the trimmed input does not match `/^[0-9a-z]+$/`.
- `null` — if the input is valid.

Check conditions in the order above (most specific error first). The room ID format matches the output of `generateRoomId()` in `app/src/utils/room-id.ts`: 8 characters from the alphabet `0123456789abcdefghijklmnopqrstuvwxyz` (see `docs/05-PROTOCOL-SPEC.md` Section 3.1).

Define a computed `isValid: ComputedRef<boolean>` that is `true` when `validationError` is `null`.

### "Join" Button Behavior

When the user clicks "Join":

1. Set `hasAttemptedSubmit` to `true`.
2. If `isValid` is `true`:
   - Emit `roomJoined` with `roomIdInput.value.trim().toLowerCase()`.
3. If `isValid` is `false`:
   - Do nothing beyond showing the validation error (which becomes visible because `hasAttemptedSubmit` is now `true`).

### Input Normalization

- Trim whitespace from the input before validation and before emitting.
- Convert to lowercase before emitting (the user might paste an uppercase room ID from a URL).
- The validation regex checks lowercase only, so if the user types uppercase, they'll see the "lowercase letters and numbers" error. This is intentional — it guides them to the correct format. Alternatively, the component can auto-lowercase the input via a watcher or computed setter. Either approach is acceptable, but the simpler approach (validate lowercase, show error) is preferred to avoid surprising the user with auto-transformation.

### Template Structure

The component template should contain:

1. A `<form>` element with `@submit.prevent="handleJoin"` to handle Enter key submission.
2. A label (visible or sr-only) for the room ID input.
3. A text input (`<input type="text">`) bound to `roomIdInput` via `v-model`. Set `maxlength="8"`, `placeholder="Enter room ID"`, and `autocomplete="off"`.
4. A validation error message (conditionally rendered when `hasAttemptedSubmit && validationError !== null`).
5. A "Join" button of `type="submit"`.

### Styling

- Use Tailwind utility classes exclusively (see `docs/03-CODING-STANDARDS.md` Section 3.4).
- Mobile-first design — usable on 375px viewport.
- The input should have visible borders, appropriate padding, and focus ring (`focus:ring-2 focus:ring-blue-500` or similar).
- The error message should be visually distinct (e.g., `text-red-400 text-sm mt-1`).
- The "Join" button should look like a secondary action or equivalent prominence to "Create Game" (e.g., `bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold`).

### Test Requirements

Create `app/src/components/lobby/JoinRoom.test.ts`.

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import JoinRoom from './JoinRoom.vue'
```

#### Required Test Cases (minimum)

1. **Renders input and "Join" button:** Mount the component. Assert that an `<input>` element and a button with text "Join" are present.

2. **Does not show error before submission attempt:** Mount the component. Assert that no error message is visible initially.

3. **Shows error for empty input on submit:** Leave input empty. Click "Join". Assert that an error message containing "required" is displayed. Assert that `roomJoined` was NOT emitted.

4. **Shows error for wrong length:** Type `"abc"` into the input. Click "Join". Assert that an error message about "8 characters" is displayed. Assert that `roomJoined` was NOT emitted.

5. **Shows error for invalid characters:** Type `"ABCD1234"` into the input. Click "Join". Assert that an error message about "lowercase" is displayed. Assert that `roomJoined` was NOT emitted.

6. **Emits `roomJoined` for valid input:** Type `"k7m2x9pq"` into the input. Click "Join". Assert that `roomJoined` was emitted with `['k7m2x9pq']`.

7. **Trims whitespace from input:** Type `"  k7m2x9pq  "` (with spaces). Click "Join". Assert that `roomJoined` was emitted with `['k7m2x9pq']` (trimmed).

## Acceptance Criteria

- [ ] File exists at `app/src/components/lobby/JoinRoom.vue` with `<script setup lang="ts">`
- [ ] Room ID input validates: non-empty, exactly 8 characters, lowercase alphanumeric only
- [ ] Invalid input shows appropriate error message after submit attempt, does not emit event
- [ ] Valid input emits `roomJoined` with trimmed, lowercased room ID
- [ ] Form submission works via both button click and Enter key
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do not add router navigation in this component.** The `LobbyView` parent (ticket 004) listens to the `roomJoined` emit and handles `router.push()`. This keeps `JoinRoom` focused and testable without router mocking.
- **Use a `<form>` element with `@submit.prevent`.** This ensures the Enter key triggers submission without a page reload. The `handleJoin` function is the form's submit handler.
- **Do not import from `utils/validation.ts`.** That file contains protocol message type guards (e.g., `isShotMessage`), not room ID format validation. The room ID validation here is simple enough to inline.
- **The room ID format** matches the output of `generateRoomId()`: 8 characters from `0123456789abcdefghijklmnopqrstuvwxyz` (see `docs/05-PROTOCOL-SPEC.md` Section 3.1 and `app/src/utils/room-id.ts`).
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure: imports, emits, refs, computed, functions.
- **Boolean naming convention from `docs/03-CODING-STANDARDS.md`:** Use `is`, `has`, `can`, `should` prefixes — hence `hasAttemptedSubmit` and `isValid`.
- **Do not show validation errors before the user attempts to submit.** This follows standard UX practice — errors appear only after the first submit attempt, then update reactively as the user corrects the input.
