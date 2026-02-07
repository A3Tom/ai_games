# Phase 09 — Ticket 002: CreateRoom Lobby Component

## Summary

Create the `CreateRoom.vue` component that provides a "Create Game" button, generates a room ID on click, displays a shareable link with copy-to-clipboard functionality, and emits a `roomCreated` event. This component also checks `crypto.subtle` availability and disables creation if the browser context is insecure. After this ticket, the create-room flow works in isolation and is ready to be integrated into `LobbyView` (ticket 004).

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind configured.
- **Phase 3 complete.** `app/src/utils/room-id.ts` — exports `generateRoomId()`.
- **Phase 7 complete.** `app/src/composables/useCrypto.ts` — exports `useCrypto()` which provides `isAvailable` for checking `crypto.subtle` availability.
- `app/src/components/lobby/` directory may not exist yet — create it.

## Scope

**In scope:**

- `app/src/components/lobby/CreateRoom.vue` — "Create Game" button, room ID generation, shareable link display, copy-to-clipboard, crypto availability check
- Unit tests for component logic

**Out of scope:**

- `JoinRoom.vue` — ticket 003
- `LobbyView.vue` integration — ticket 004
- Router navigation to `/game/:roomId` — handled by `LobbyView` listening to the `roomCreated` emit (ticket 004)
- Relay connection — happens when `GameView` mounts (Phases 10+)
- `AppHeader.vue` — ticket 001

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/lobby/CreateRoom.vue` | Create | Create game button with room ID generation and shareable link |
| `app/src/components/lobby/CreateRoom.test.ts` | Create | Unit tests for CreateRoom component |

## Requirements

### Component Contract

As defined in `docs/phases/phase-09-ui-lobby.md` Section 6:

```typescript
// No props — self-contained
const emit = defineEmits<{
  roomCreated: [roomId: string]
}>()
```

### Imports

```typescript
import { ref, computed } from 'vue'
import { generateRoomId } from '../../utils/room-id'
import { useCrypto } from '../../composables/useCrypto'
```

### Internal State

The component manages the following reactive state:

- `createdRoomId: Ref<string | null>` — initially `null`; set to the generated room ID after clicking "Create Game".
- `isCopied: Ref<boolean>` — initially `false`; temporarily set to `true` after a successful clipboard copy, used to show feedback (e.g., "Copied!" text).

### Crypto Availability Check

On component setup:

1. Call `useCrypto()` to get `isAvailable` (a boolean or ref indicating whether `crypto.subtle` is present).
2. Derive a computed `isCryptoUnavailable` that is `true` when `crypto.subtle` is not available.
3. If `isCryptoUnavailable` is `true`:
   - Display an error banner explaining that a secure connection (HTTPS or localhost) is required.
   - Disable the "Create Game" button (use the `disabled` HTML attribute).

Reference: `docs/phases/phase-09-ui-lobby.md` Section 5, Key Design Decision 4. Also see `docs/03-CODING-STANDARDS.md` Section 6 on crypto error handling.

### "Create Game" Button Behavior

When the user clicks "Create Game":

1. Call `generateRoomId()` to produce an 8-character alphanumeric room ID.
2. Set `createdRoomId` to the generated ID.
3. Emit `roomCreated` with the generated room ID.

The button should:
- Be disabled when `isCryptoUnavailable` is `true`.
- Use clear, accessible text ("Create Game").
- Use Tailwind utility classes for styling (prominent primary action button).

### Shareable Link Display

After a room is created (`createdRoomId !== null`):

1. Compute the shareable link as `${window.location.origin}${window.location.pathname}#/game/${createdRoomId}`.
2. Display the link in a read-only text field or styled text block.
3. Provide a "Copy" button next to the link.

Reference: `docs/phases/phase-09-ui-lobby.md` Section 5, Key Design Decision 2. The link format uses hash-mode routing for GitHub Pages compatibility.

### Copy-to-Clipboard

When the user clicks "Copy":

1. Call `navigator.clipboard.writeText(shareableLink)`.
2. On success, set `isCopied` to `true`.
3. After 2 seconds, reset `isCopied` to `false` (use `setTimeout`).
4. While `isCopied` is `true`, show visual feedback (e.g., button text changes to "Copied!" or a checkmark appears).
5. If `navigator.clipboard` is unavailable, fail silently (the link is still visible and can be manually copied).

### Template Structure

The component template should contain, in order:

1. An error banner (conditionally rendered when `isCryptoUnavailable`) explaining the HTTPS requirement.
2. The "Create Game" button.
3. A shareable link section (conditionally rendered when `createdRoomId !== null`) containing the link text and a "Copy" button.

### Styling

- Use Tailwind utility classes exclusively (see `docs/03-CODING-STANDARDS.md` Section 3.4).
- Mobile-first design — usable on 375px viewport.
- The "Create Game" button should look like a prominent primary action (e.g., `bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold`).
- The error banner should be visually distinct (e.g., `bg-red-900/50 text-red-200 border border-red-700 rounded-lg p-4`).

### Test Requirements

Create `app/src/components/lobby/CreateRoom.test.ts`.

#### Mocking Strategy

Mock `useCrypto` and `generateRoomId`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../../composables/useCrypto', () => ({
  useCrypto: vi.fn(() => ({
    isAvailable: true,
    commitBoard: vi.fn(),
    verifyBoard: vi.fn(),
  })),
}))

vi.mock('../../utils/room-id', () => ({
  generateRoomId: vi.fn(() => 'abc12345'),
}))
```

#### Required Test Cases (minimum)

1. **Renders "Create Game" button:** Mount the component. Assert that a button with text "Create Game" is present.

2. **Generates room ID and emits event on click:** Click the "Create Game" button. Assert that `generateRoomId` was called. Assert that the `roomCreated` event was emitted with `['abc12345']`.

3. **Displays shareable link after creation:** Click the "Create Game" button. Assert that the component now renders a link containing `#/game/abc12345`.

4. **Disables button when crypto unavailable:** Re-mock `useCrypto` to return `{ isAvailable: false, ... }`. Mount the component. Assert the "Create Game" button has the `disabled` attribute. Assert an error banner is visible.

5. **Copy button calls clipboard API:** Mock `navigator.clipboard.writeText` as a resolved promise. Click "Create Game", then click the "Copy" button. Assert `navigator.clipboard.writeText` was called with the shareable link.

## Acceptance Criteria

- [ ] File exists at `app/src/components/lobby/CreateRoom.vue` with `<script setup lang="ts">`
- [ ] Clicking "Create Game" calls `generateRoomId()` and emits `roomCreated` with the room ID
- [ ] Shareable link is displayed after room creation in format `.../#/game/<roomId>`
- [ ] Copy button copies the link to clipboard with visual feedback
- [ ] "Create Game" button is disabled and error banner is shown when `crypto.subtle` is unavailable
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Do not add router navigation in this component.** The `LobbyView` parent (ticket 004) listens to the `roomCreated` emit and handles `router.push()`. This keeps `CreateRoom` focused and testable without router mocking.
- **Use `window.location.origin` and `window.location.pathname`** to build the shareable URL. Do not hardcode the domain. The hash `#/game/<roomId>` is appended because the project uses hash-mode routing (`createWebHashHistory` — see `app/src/router/index.ts`).
- **The `useCrypto` composable** from Phase 7 returns an `isAvailable` property. Check whether it's a plain boolean or a ref and handle accordingly. If it's a ref, use `.value` in the script and unwrap in the template.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure: imports, emits, state, computed, functions.
- **Do not use `@click.prevent`** on the button — it's not inside a form, so no default to prevent.
- **`navigator.clipboard` may not exist in test environments.** Mock it in the clipboard test case. Use `Object.assign(navigator, { clipboard: { writeText: vi.fn() } })` or similar.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not use `Math.random()` for room IDs. Always use `generateRoomId()` which uses nanoid with a secure alphabet.
