# Phase 09 — Ticket 004: LobbyView Layout and Navigation Integration

## Summary

Replace the stub `LobbyView.vue` with the real lobby layout that composes `CreateRoom` and `JoinRoom` components and handles navigation to the game route. When a player creates or joins a room, `LobbyView` catches the emitted event and calls `router.push()` to navigate to `/#/game/<roomId>`. After this ticket, the full lobby flow is functional: users can create rooms, see shareable links, join rooms by ID, and be navigated to the game view.

## Prerequisites

- **Phase 1 complete.** Router with `/` (lobby) and `/game/:roomId` routes defined in `app/src/router/index.ts`.
- **Ticket 002 complete.** `app/src/components/lobby/CreateRoom.vue` — emits `roomCreated` with room ID.
- **Ticket 003 complete.** `app/src/components/lobby/JoinRoom.vue` — emits `roomJoined` with room ID.

## Scope

**In scope:**

- `app/src/views/LobbyView.vue` — modify existing stub to import and render `CreateRoom` and `JoinRoom`, handle navigation on emit events
- Unit/integration tests for the view

**Out of scope:**

- `AppHeader.vue` — ticket 001 (rendered in `App.vue`, not in `LobbyView`)
- Adding `AppHeader` to `App.vue` — ticket 005
- `CreateRoom.vue` internals — ticket 002
- `JoinRoom.vue` internals — ticket 003
- `GameView.vue` implementation — Phases 10–12
- Relay connection logic — happens in `GameView` on mount

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/views/LobbyView.vue` | Modify | Replace stub with real lobby layout composing CreateRoom and JoinRoom |
| `app/src/views/LobbyView.test.ts` | Create | Unit tests for LobbyView navigation and layout |

## Requirements

### Imports

```typescript
import { useRouter } from 'vue-router'
import CreateRoom from '../components/lobby/CreateRoom.vue'
import JoinRoom from '../components/lobby/JoinRoom.vue'
```

### Navigation Handlers

Define two handler functions:

#### `handleRoomCreated(roomId: string): void`

Called when `CreateRoom` emits `roomCreated`. Navigates to the game route:

```typescript
router.push({ name: 'game', params: { roomId } })
```

Reference: `docs/phases/phase-09-ui-lobby.md` Section 6, Navigation Flow.

#### `handleRoomJoined(roomId: string): void`

Called when `JoinRoom` emits `roomJoined`. Navigates to the game route:

```typescript
router.push({ name: 'game', params: { roomId } })
```

Both handlers do the same thing (navigate to game), but keeping them separate allows for future differentiation (e.g., setting `isHost` differently). The handler naming follows the `handle<Event>` convention from `docs/03-CODING-STANDARDS.md`.

### Template Structure

The `LobbyView` template should render:

1. A full-height centered layout container (e.g., `<div class="flex min-h-screen flex-col items-center justify-center">`).
2. A content area with appropriate max-width for readability (e.g., `max-w-md w-full px-4`).
3. A heading section with the page title — e.g., "Create or Join a Game" or similar descriptive text.
4. The `<CreateRoom>` component with `@roomCreated="handleRoomCreated"`.
5. A visual separator between create and join sections (e.g., a horizontal rule with "or" text, or just vertical spacing).
6. The `<JoinRoom>` component with `@roomJoined="handleRoomJoined"`.

### Layout Design

- The lobby should be vertically centered on the page.
- Create and Join sections should be visually distinct but clearly part of the same flow.
- The layout should work on mobile (375px) — single column, stacked vertically.
- Use Tailwind utility classes exclusively (see `docs/03-CODING-STANDARDS.md` Section 3.4).

### Test Requirements

Create `app/src/views/LobbyView.test.ts`.

#### Mocking Strategy

Mock the router to capture navigation calls:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHashHistory } from 'vue-router'
import LobbyView from './LobbyView.vue'
```

Create a minimal router with the lobby and game routes for testing. Use `router.push` spy or check `router.currentRoute` after events.

Alternatively, mock `useRouter` to return a spy:

```typescript
const mockPush = vi.fn()
vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: mockPush,
    }),
  }
})
```

#### Required Test Cases (minimum)

1. **Renders CreateRoom and JoinRoom components:** Mount `LobbyView`. Assert that both `CreateRoom` and `JoinRoom` components are present in the rendered output (check for their root elements or use `findComponent`).

2. **Navigates to game on roomCreated:** Mount `LobbyView`. Find the `CreateRoom` component and emit `roomCreated` with `'abc12345'`. Assert that `mockPush` was called with `{ name: 'game', params: { roomId: 'abc12345' } }`.

3. **Navigates to game on roomJoined:** Mount `LobbyView`. Find the `JoinRoom` component and emit `roomJoined` with `'k7m2x9pq'`. Assert that `mockPush` was called with `{ name: 'game', params: { roomId: 'k7m2x9pq' } }`.

4. **Page has descriptive heading:** Mount `LobbyView`. Assert that a heading element is present with text related to creating or joining a game.

## Acceptance Criteria

- [ ] `LobbyView.vue` renders both `CreateRoom` and `JoinRoom` components
- [ ] `roomCreated` event from `CreateRoom` navigates to `/#/game/<roomId>` via `router.push()`
- [ ] `roomJoined` event from `JoinRoom` navigates to `/#/game/<roomId>` via `router.push()`
- [ ] Lobby page is vertically centered with a responsive single-column layout
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **You are modifying an existing file.** `app/src/views/LobbyView.vue` already exists as a stub (see current content: a centered div with "Sea Strike" heading and "Lobby — Create or join a game" text). Replace the stub content entirely with the real implementation.
- **Do not render `AppHeader` inside `LobbyView`.** The `AppHeader` is added to `App.vue` in ticket 005 so it appears on all pages. `LobbyView` should only contain the lobby-specific content.
- **Remove the "Sea Strike" title from the view** if you're adding it to `AppHeader` (ticket 001/005). The view can have its own section heading like "Create or Join a Game" but should not duplicate the app title.
- **Follow the `handle<Event>` naming convention** from `docs/03-CODING-STANDARDS.md`: use `handleRoomCreated` and `handleRoomJoined`.
- **The router uses `name: 'game'`** (not a path string). Check `app/src/router/index.ts` — the game route has `name: 'game'` and accepts `params: { roomId }`.
- **For testing, you'll need to handle the `useCrypto` mock** that `CreateRoom` uses internally. Either mock it at the module level or use `shallowMount` to avoid rendering child internals. `shallowMount` is the simpler approach for a view-level test that focuses on integration.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not add relay connection logic in the lobby. The lobby only handles navigation. Connection happens when `GameView` mounts.
