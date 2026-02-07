# Phase 9: UI — Lobby

## 1. Objective

Build the lobby user interface where players create or join game rooms. Before this phase, the app has stub views, working stores, and full network/protocol plumbing, but no real UI. After this phase, a player can create a room (generating a shareable link), join an existing room via link or manual entry, see connection status, and both players arrive at the game view ready for ship setup.

## 2. Prerequisites

- **Phase 1** must be complete: router with `/` (lobby) and `/game/:roomId` routes, Tailwind configured.
- **Phase 2** must be complete: types available for component props.
- **Phase 4** must be complete: `useConnectionStore` for reading connection/peer status.
- **Phase 6** must be complete: `useRelay` for establishing connections.
- **Phase 7** must be complete: `useCrypto.isCryptoAvailable()` for checking secure context.
- **Phase 8** must be complete: `useGameProtocol` (though lobby only needs connection, not game messages).

Specific dependencies:
- `app/src/router/index.ts` — route definitions
- `app/src/stores/connection.ts` — `useConnectionStore`
- `app/src/composables/useRelay.ts` — connection establishment
- `app/src/composables/useCrypto.ts` — `isCryptoAvailable()`
- `app/src/utils/room-id.ts` — `generateRoomId()`

## 3. Scope

### In Scope

- `app/src/views/LobbyView.vue`: Replace stub with real lobby layout containing create and join room options.
- `app/src/components/lobby/CreateRoom.vue`: "Create Game" button that generates a room ID, navigates to `/game/<roomId>`.
- `app/src/components/lobby/JoinRoom.vue`: Text input for entering a room ID (for manual join), "Join" button that navigates to `/game/<roomId>`.
- `app/src/components/shared/AppHeader.vue`: Simple header component with app title.
- Handle arrival via shared link: if a user navigates directly to `/#/game/<roomId>`, the `GameView` (stub from Phase 1, to be wired in Phase 10+) handles it — lobby does not interfere.
- Show an error banner if `crypto.subtle` is unavailable (non-secure context).
- Copy-to-clipboard for the shareable room link.

### Out of Scope

- Ship setup UI — Phase 10.
- Battle UI — Phase 11.
- Game over UI — Phase 12.
- `ConnectionStatus.vue` persistent header widget — Phase 13.
- `GameView.vue` real implementation — Phases 10–12 progressively build it.
- Responsive polish — Phase 13 handles final mobile testing.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/views/LobbyView.vue` | Modify | Replace stub with real lobby layout |
| `app/src/components/lobby/CreateRoom.vue` | Create | "Create Game" button, room ID generation, shareable link display |
| `app/src/components/lobby/JoinRoom.vue` | Create | Room ID input field and "Join" button |
| `app/src/components/shared/AppHeader.vue` | Create | App header with title |
| `app/src/App.vue` | Modify | Add `AppHeader` to root layout |

## 5. Key Design Decisions

1. **Room ID generated client-side:** `CreateRoom.vue` calls `generateRoomId()` (from Phase 3) and navigates to the game route. The room is created implicitly on the relay when the first `join` message is sent (see `docs/05-PROTOCOL-SPEC.md` Section 3.2).

2. **Shareable link format:** The link is `<base_url>/#/game/<roomId>` — hash-mode routing ensures it works on GitHub Pages without server-side routing support (see `docs/05-PROTOCOL-SPEC.md` Section 3.1, `docs/04-AI-ASSISTANT-GUIDE.md` Decision Log).

3. **No authentication:** There are no accounts, no cookies, no login flow. Anyone with the link can join (see `docs/01-PRD.md` Section 5 constraints).

4. **Crypto availability check:** Before allowing game creation, check `isCryptoAvailable()`. If `false` (non-HTTPS, non-localhost), display a clear error message explaining that a secure connection is required (see `docs/03-CODING-STANDARDS.md` Section 6).

5. **`defineProps` with TypeScript generics:** All component props use `defineProps<T>()` syntax, not runtime declarations (see `docs/03-CODING-STANDARDS.md` Section 3.2).

6. **Tailwind for all styling:** Mobile-first layout with Tailwind utilities. No component libraries (see `docs/03-CODING-STANDARDS.md` Section 3.4, `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6).

## 6. Interfaces & Contracts

### `app/src/components/lobby/CreateRoom.vue`

```typescript
// No props — self-contained
const emit = defineEmits<{
  roomCreated: [roomId: string]
}>()
```

### `app/src/components/lobby/JoinRoom.vue`

```typescript
// No props — self-contained
const emit = defineEmits<{
  roomJoined: [roomId: string]
}>()
```

### `app/src/components/shared/AppHeader.vue`

```typescript
// No props needed for v1 — just renders the app title
// Phase 13 will add ConnectionStatus as a child
```

### Navigation Flow

```
CreateRoom "Create Game" click
  → generateRoomId() → "k7m2x9pq"
  → router.push({ name: 'game', params: { roomId: 'k7m2x9pq' } })
  → GameView mounts, useGameProtocol connects to relay

JoinRoom "Join" click
  → validate roomId input (non-empty, alphanumeric, 8 chars)
  → router.push({ name: 'game', params: { roomId: inputValue } })
  → GameView mounts, useGameProtocol connects to relay

Direct link: /#/game/k7m2x9pq
  → GameView mounts directly (bypass lobby)
  → useGameProtocol connects as joiner (isHost = false)
```

## 7. Acceptance Criteria

1. The lobby page renders at `/#/` with a "Create Game" button and a "Join" room ID input.
2. Clicking "Create Game" generates an 8-character room ID and navigates to `/#/game/<roomId>`.
3. A shareable link is displayed after room creation and can be copied to the clipboard.
4. Entering a valid room ID and clicking "Join" navigates to `/#/game/<roomId>`.
5. Entering an invalid room ID (empty, wrong format) shows a validation error and does not navigate.
6. If `crypto.subtle` is unavailable, an error banner is shown and the "Create Game" button is disabled.
7. Two browsers: Browser A creates a room, copies the link. Browser B pastes the link. Both arrive at the game view.
8. The `AppHeader` component renders the app title ("Sea Strike") on every page.
9. All components use `<script setup lang="ts">`, `defineProps<T>()`, and Tailwind classes.
10. Running `npm run build` produces no TypeScript errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- **`LobbyView` and lobby components** — complete; no further modification expected unless adding responsive polish in Phase 13.
- **Navigation to `/game/:roomId`** — this is the entry point for all subsequent game phases (10–12).
- **`AppHeader`** — Phase 13 adds `ConnectionStatus.vue` inside it.

### Boundaries

- The lobby does NOT start the game protocol connection. That happens when `GameView` mounts (Phases 10+).
- The lobby does NOT render any game UI (boards, ships, etc.). It only handles room creation and joining.
- Responsive mobile polish is basic here — final testing and adjustments happen in Phase 13.
