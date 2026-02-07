# AI Coding Assistant Guide: Sea Strike

This document provides explicit instructions for AI coding assistants working on this project. Follow these rules precisely.

---

## 1. Project Context

You are building a peer-to-peer Battleship game. Before writing any code, internalize these constraints:

- **The frontend is a static SPA.** No server-side rendering, no API routes, no backend in the app directory.
- **The relay is stateless.** It forwards WebSocket messages between peers in the same room. It has zero knowledge of game rules, board state, or turns. Never add game logic to the relay.
- **All game logic lives in the client.** Both clients independently track state. They communicate via messages through the relay.
- **Anti-cheat is cryptographic.** The commit-reveal protocol is not optional — it's a core feature.

---

## 2. Rules You Must Follow

### 2.1 TypeScript

- Never use `any`. Use `unknown` and narrow with type guards.
- Never use `enum`. Use `as const` objects.
- All function parameters and return types must be explicitly typed. Do not rely on inference for public-facing functions.
- All protocol messages must be typed as discriminated unions with a `type` field.
- Use `satisfies` when you want to validate a value matches a type without widening:
  ```typescript
  const config = { port: 8080, host: 'localhost' } satisfies RelayConfig
  ```

### 2.2 Vue

- Use `<script setup lang="ts">` exclusively. Never use Options API or `defineComponent`.
- Use `defineProps<T>()` and `defineEmits<T>()` — never runtime prop declarations.
- Components must be under 200 lines. If a component is growing, extract logic into a composable or split into child components.
- Never mutate props. Never mutate store state directly from components — always call a store action.
- Use `storeToRefs()` to destructure reactive store state in components.

### 2.3 State

- Game state lives in `useGameStore`. Connection state lives in `useConnectionStore`. Do not mix concerns.
- Stores communicate through actions, not by importing each other's state at module level.
- Never store derived data. If it can be computed from existing state, make it a getter.

### 2.4 Networking

- All messages between clients go through the relay. There are no direct peer-to-peer connections (no WebRTC).
- The relay receives JSON messages and forwards them to other WebSocket clients in the same room. That is its entire job.
- Never assume message order. Messages can arrive out of order due to network conditions. Use sequence numbers or state-based reconciliation.
- Always validate incoming messages before processing. Never trust the opponent's client.
- Handle disconnection gracefully. The game should survive brief network interruptions.

### 2.5 Crypto

- The Web Crypto API (`crypto.subtle`) is the only permitted crypto implementation. No external crypto libraries.
- Board commitment uses SHA-256 and a 32-byte random salt.
- Board serialization must be deterministic. Sort ships by type name before `JSON.stringify`.
- The salt must be generated with `crypto.getRandomValues`, not `Math.random`.

### 2.6 Styling

- Use Tailwind CSS utility classes in templates as the primary styling method.
- Use `<style scoped>` only for things Tailwind cannot express (complex animations, pseudo-elements with dynamic styles).
- Design mobile-first, then add `sm:`, `md:`, `lg:` breakpoints.
- The game board must be playable on a 375px wide viewport (iPhone SE).

---

## 3. Implementation Order

Build the project in this exact sequence. Each phase should result in working, testable code before moving to the next.

### Phase 1: Project Scaffolding

1. Initialize the Vue 3 + TypeScript + Vite project in `app/`.
2. Install dependencies: `vue-router`, `pinia`, `tailwindcss`, `nanoid`.
3. Configure `vite.config.ts` with `base: '/<repo-name>/'` for GitHub Pages.
4. Configure Vue Router with `createWebHashHistory`.
5. Set up Tailwind CSS.
6. Set up ESLint + Prettier.
7. Create the `.env.example` with `VITE_RELAY_URL`.
8. Create stub views: `LobbyView.vue`, `GameView.vue`, `NotFoundView.vue`.
9. Verify the app builds and runs locally.

**Checkpoint:** App runs, routes work, Tailwind renders.

### Phase 2: Type Foundation

1. Define all game types in `types/game.ts`: `CellState`, `ShipType`, `PlacedShip`, `Shot`, `GamePhase`.
2. Define all protocol message types in `types/protocol.ts`: discriminated union `GameMessage`.
3. Define ship constants in `constants/ships.ts`: fleet configuration with sizes.
4. Define grid constants in `constants/grid.ts`: `GRID_SIZE = 10`, axis labels.

**Checkpoint:** All types compile with no errors. No runtime code yet.

### Phase 3: Board Utilities

1. Implement `utils/board.ts`: `createEmptyBoard()`, `canPlaceShip()`, `placeShip()`, `isAllSunk()`.
2. Implement `utils/validation.ts`: `isValidPlacement()`, `isValidShot()`, message validation with type guards.
3. Implement `utils/room-id.ts`: `generateRoomId()` using nanoid.
4. Write unit tests for all utilities.

**Checkpoint:** All utility tests pass.

### Phase 4: Stores

1. Implement `stores/connection.ts`: WebSocket status, room ID, peer presence.
2. Implement `stores/game.ts`: Full game state machine — phase transitions, board management, shot processing, turn management.
3. Write unit tests for store actions and getters.

**Checkpoint:** Store tests pass. State machine transitions are verified.

### Phase 5: Relay Server

1. Initialize the Node/Bun project in `relay/`.
2. Implement `room-manager.ts`: room creation, join, leave, cleanup timer.
3. Implement `server.ts`: WebSocket upgrade, message forwarding, health endpoint.
4. Implement `health.ts`: `/health` route returning JSON status.
5. Create `Dockerfile` with multi-stage build.
6. Write unit tests for room manager logic.
7. Write integration tests with mock WebSocket clients.

**Checkpoint:** Relay starts, two mock clients can exchange messages.

### Phase 6: Connection Composable

1. Implement `composables/useRelay.ts`: WebSocket connection, reconnection with exponential backoff, message dispatch, cleanup on unmount.
2. Wire `useRelay` to `useConnectionStore` — status changes, peer presence, ping/pong.
3. Test manually with relay running locally.

**Checkpoint:** Two browser tabs connect to the same room. Console logs show message exchange.

### Phase 7: Crypto Composable

1. Implement `composables/useCrypto.ts`: `commitBoard()` (returns hash), `verifyBoard()` (checks hash against revealed board + salt).
2. Unit test the full commit-reveal cycle.
3. Test that any board modification after commit causes verification failure.

**Checkpoint:** Crypto tests pass with both honest and tampered boards.

### Phase 8: Game Protocol Composable

1. Implement `composables/useGameProtocol.ts`: Bridges `useRelay` and `useGameStore`. Sends typed messages, receives and validates messages, dispatches to store actions.
2. This composable owns the message send/receive loop. Components never call `useRelay.send()` directly.

**Checkpoint:** Two browser tabs can send and receive typed game messages.

### Phase 9: UI — Lobby

1. Build `LobbyView.vue` with `CreateRoom.vue` and `JoinRoom.vue`.
2. Create room generates a room ID, navigates to `/game/<roomId>`.
3. Join room accepts a room ID (or the user arrives via shared link) and navigates.
4. Show connection status.

**Checkpoint:** Two browsers can create and join a room.

### Phase 10: UI — Ship Setup

1. Build `SetupPhase.vue` with the ship placement grid.
2. Build `ShipTray.vue` showing unplaced ships.
3. Implement click-to-place with rotation (tap/click to rotate, click cell to place).
4. Validate placement in real time (highlight valid/invalid positions).
5. "Ready" button commits the board and sends the hash.

**Checkpoint:** Player can place all 5 ships and commit. Hash is exchanged.

### Phase 11: UI — Battle

1. Build `PlayerBoard.vue` showing your ships and incoming hits/misses.
2. Build `OpponentBoard.vue` as the targeting grid — clickable during your turn.
3. Build `TurnIndicator.vue` showing whose turn it is.
4. Build `GameStatus.vue` showing fleet status (ships remaining for both players).
5. Wire shot → result → board update cycle.

**Checkpoint:** Two browsers can play a full game.

### Phase 12: UI — Game Over & Reveal

1. Build `GameOver.vue` showing winner, full opponent board reveal.
2. Run verification: re-hash opponent's revealed board and compare to their committed hash.
3. Show "Verified — Fair Game" or "Cheat Detected" badge.
4. Add "Rematch" button.

**Checkpoint:** Full game plays to completion with verification.

### Phase 13: Polish & Deploy

1. Add `ConnectionStatus.vue` to the header — persistent across all views.
2. Add reconnection UI (reconnecting spinner, disconnected banner).
3. Responsive testing on mobile viewports.
4. Set up GitHub Actions deployment.
5. Set up Docker Compose and Caddyfile on VPS.
6. Test full flow in production.

---

## 4. Common Mistakes to Avoid

| Mistake | Why It's Wrong | What To Do Instead |
|---------|---------------|-------------------|
| Adding game logic to the relay | Defeats the P2P architecture. Makes the relay stateful. | All game logic in client stores/composables. |
| Using `Math.random()` for room IDs or crypto | Not cryptographically secure. | Use `nanoid` for room IDs, `crypto.getRandomValues` for salts. |
| Storing the board as a 2D array of strings | Stringly-typed, error-prone. | Use typed `CellState` enum-like const objects. |
| Sending raw JSON without validation | Opponent could send malformed data. | Validate every incoming message with type guards before processing. |
| Using `watch` on the entire game store | Triggers on every state change, tanks performance. | Watch specific refs or use store `$subscribe` with granular filters. |
| Putting business logic in components | Components become untestable monoliths. | Logic in stores and composables; components only dispatch actions and render. |
| Using `localStorage` for game state | Data persists across sessions, causing stale state bugs. | In-memory Pinia stores. State resets on page refresh (which is correct). |
| Hardcoding the relay URL | Breaks across environments. | Use `import.meta.env.VITE_RELAY_URL`. |
| Not handling WebSocket `close` and `error` events | Silent failures, frozen UI. | Always handle both. Trigger reconnection. Update ConnectionStore. |
| Making the grid a fixed pixel size | Breaks on mobile. | Use CSS Grid with relative units (`vmin`, `%`, `fr`). |

---

## 5. File Templates

### 5.1 New Component Template

```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  // Define props here
}

const props = defineProps<Props>()

const emit = defineEmits<{
  // Define events here
}>()
</script>

<template>
  <div>
    <!-- Component template -->
  </div>
</template>

<style scoped>
/* Only if Tailwind can't handle it */
</style>
```

### 5.2 New Composable Template

```typescript
import { ref, onUnmounted } from 'vue'

export function useExample() {
  // Reactive state
  const state = ref<string>('')

  // Methods
  function doSomething(): void {
    // ...
  }

  // Cleanup
  onUnmounted(() => {
    // Clean up subscriptions, connections, timers
  })

  return {
    state,
    doSomething,
  }
}
```

### 5.3 New Store Template

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useExampleStore = defineStore('example', () => {
  // State
  const items = ref<string[]>([])

  // Getters
  const count = computed(() => items.value.length)

  // Actions
  function addItem(item: string): void {
    items.value.push(item)
  }

  function reset(): void {
    items.value = []
  }

  return {
    items,
    count,
    addItem,
    reset,
  }
})
```

---

## 6. Testing Patterns

### 6.1 Store Test

```typescript
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, it, expect } from 'vitest'
import { useGameStore } from './game'

describe('useGameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('transitions from setup to commit when board is committed', () => {
    const store = useGameStore()
    store.phase = 'setup'
    store.commitBoard(/* mock board */)
    expect(store.phase).toBe('commit')
  })
})
```

### 6.2 Utility Test

```typescript
import { describe, it, expect } from 'vitest'
import { canPlaceShip, createEmptyBoard } from './board'

describe('canPlaceShip', () => {
  it('rejects ships that extend beyond the grid', () => {
    const board = createEmptyBoard()
    expect(canPlaceShip(board, { type: 'carrier', x: 8, y: 0, orientation: 'h' })).toBe(false)
  })
})
```

### 6.3 WebSocket Mock for Relay Tests

```typescript
import { WebSocket, WebSocketServer } from 'ws'

function createMockClient(url: string, roomId: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId }))
      resolve(ws)
    })
  })
}
```

---

## 7. Decision Log

Record architectural decisions here as the project evolves.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-07 | Use WebSocket relay instead of WebRTC | Simpler, more reliable, runs through Caddy/Docker easily. WebRTC NAT traversal is fragile. |
| 2026-02-07 | Use hash-mode routing for Vue Router | GitHub Pages doesn't support SPA fallback. Hash mode avoids 404s on direct navigation. |
| 2026-02-07 | No external crypto libraries | Web Crypto API covers SHA-256 and random bytes. No need for a dependency. |
| 2026-02-07 | Pinia with Composition API stores | Consistent with Vue 3 Composition API. Better TypeScript support than Options-style stores. |
| 2026-02-07 | Tailwind CSS, no component library | Game UI is custom (grids, boards). A component library adds weight without value. |
| 2026-02-07 | Monorepo with app/ and relay/ directories | Keeps both projects in one repo for easy cross-referencing, but they deploy independently. |
