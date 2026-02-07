# Phase 10 — Ticket 005: GameView Phase Router

## Summary

Replace the current `GameView.vue` stub with a phase-routing container that initializes the game protocol connection and conditionally renders phase-specific components. In this phase, the only real child component is `SetupPhase` (for the `setup` and `commit` phases) — all other phases render placeholder elements to be replaced in Phases 11 and 12. After this ticket, navigating to `/game/:roomId` initializes the protocol, transitions to setup when both peers are connected, and renders the full ship placement UI.

## Prerequisites

- **Phase 6 complete.** `app/src/composables/useRelay.ts` or connection composable exists.
- **Phase 8 complete.** `app/src/composables/useGameProtocol.ts` exports `useGameProtocol()` which can be initialized with a room ID.
- **Phase 4 complete.** `app/src/stores/game.ts` exports `useGameStore` with `phase`, `startSetup()`.
- **Ticket 004 complete.** `app/src/components/game/SetupPhase.vue` exists with full placement and commit flow.
- **Phase 9 complete.** Router delivers player to `GameView` with `roomId` prop from route params.

## Scope

**In scope:**

- Modify `app/src/views/GameView.vue` — replace stub with protocol initialization and phase-conditional rendering
- `app/src/views/GameView.test.ts` — component tests for phase routing and protocol initialization

**Out of scope:**

- Battle phase components (`PlayerBoard`, `OpponentBoard`, `TurnIndicator`, `GameStatus`) — Phase 11
- Game over / reveal components — Phase 12
- `useGameProtocol` implementation — Phase 8 (already exists)
- `useRelay` implementation — Phase 6 (already exists)
- AppHeader integration — already handled in Phase 9

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/views/GameView.vue` | Modify | Phase-routing container with protocol initialization |
| `app/src/views/GameView.test.ts` | Create | Component tests for phase routing |

## Requirements

### Component Contract

As defined in `docs/phases/phase-10-ui-ship-setup.md`:

```typescript
const props = defineProps<{
  roomId: string
}>()
```

The `roomId` comes from the Vue Router route parameter, passed as a prop by the router configuration (set up in Phase 9).

### Imports

```typescript
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/game'
import { useGameProtocol } from '../composables/useGameProtocol'
import { GAME_PHASES } from '../types/game'
import SetupPhase from '../components/game/SetupPhase.vue'
```

### Store Access

```typescript
const gameStore = useGameStore()
const { phase } = storeToRefs(gameStore)
```

### Protocol Initialization

On mount, initialize the game protocol with the room ID:

```typescript
onMounted(() => {
  const protocol = useGameProtocol()
  protocol.initialize(props.roomId)
})
```

**Note:** The exact API for initializing the protocol depends on how `useGameProtocol` was implemented in Phase 8. It may be `useGameProtocol(props.roomId)` called at the top of setup, or it may have an `initialize()` method. The agent should check the actual Phase 8 implementation and adapt accordingly. The key requirement is:

1. The protocol connection to the relay is established when GameView mounts.
2. The room ID from the route is passed to the protocol.
3. When a peer connects (relay sends `peer_count: 2`), the game transitions to SETUP phase. This transition is handled by `useGameProtocol` or by the store — GameView does not need to watch for peer connections explicitly.

If `useGameProtocol` handles the `peer_count` → `startSetup()` transition internally, GameView just needs to initialize it. If not, GameView should watch for the peer connection and call `gameStore.startSetup()`:

```typescript
// Only if useGameProtocol does NOT handle this transition:
import { useConnectionStore } from '../stores/connection'
const connectionStore = useConnectionStore()
const { peerConnected } = storeToRefs(connectionStore)

watch(peerConnected, (connected) => {
  if (connected && phase.value === GAME_PHASES.LOBBY) {
    gameStore.startSetup()
  }
})
```

### Template Structure

The template uses conditional rendering based on `phase`:

```html
<template>
  <div class="flex min-h-screen flex-col">
    <!-- Phase-specific content -->
    <SetupPhase
      v-if="phase === GAME_PHASES.SETUP || phase === GAME_PHASES.COMMIT"
      @board-committed="handleBoardCommitted"
    />

    <div
      v-else-if="phase === GAME_PHASES.BATTLE"
      class="flex flex-1 items-center justify-center"
    >
      <p class="text-gray-400">Battle phase — coming in Phase 11</p>
    </div>

    <div
      v-else-if="phase === GAME_PHASES.GAMEOVER || phase === GAME_PHASES.REVEAL"
      class="flex flex-1 items-center justify-center"
    >
      <p class="text-gray-400">Game over — coming in Phase 12</p>
    </div>

    <div
      v-else
      class="flex flex-1 items-center justify-center"
    >
      <p class="text-gray-400">Connecting to room {{ roomId }}...</p>
    </div>
  </div>
</template>
```

**Key rendering rules:**

1. **LOBBY phase:** Show a connecting/waiting message. The player is in this state briefly while the relay connection is established and the peer joins.
2. **SETUP and COMMIT phases:** Render `SetupPhase`. The COMMIT phase is included because SetupPhase handles the waiting state internally (ticket 004).
3. **BATTLE phase:** Placeholder `<div>` with text. Replaced by battle components in Phase 11.
4. **REVEAL and GAMEOVER phases:** Placeholder `<div>` with text. Replaced by game over/reveal components in Phase 12.

### Event Handlers

```typescript
function handleBoardCommitted(): void {
  // The store has already transitioned to COMMIT phase.
  // This handler exists for future use (e.g., logging, analytics).
  // No action needed in Phase 10.
}
```

### Styling

- The root `<div>` should fill the viewport height (`min-h-screen`).
- Use `flex flex-col` for vertical layout.
- Placeholder sections centered with `flex flex-1 items-center justify-center`.
- Connecting message styled as subtle text (e.g., `text-gray-400`).
- All styling via Tailwind per `docs/03-CODING-STANDARDS.md` Section 3.4.

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Keep component under 200 lines (it should be well under — mostly template conditional blocks).
- The view component is a thin shell — it routes phases and initializes the protocol. No game logic belongs here.

### Test Requirements

Create `app/src/views/GameView.test.ts` using Vitest and Vue Test Utils.

#### Mocking Strategy

Mock `useGameProtocol` and the child components:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GameView from './GameView.vue'
import { useGameStore } from '../stores/game'
import { GAME_PHASES } from '../types/game'

const mockInitialize = vi.fn()

vi.mock('../composables/useGameProtocol', () => ({
  useGameProtocol: () => ({
    initialize: mockInitialize,
    sendCommit: vi.fn(),
    sendReady: vi.fn(),
  }),
}))
```

#### Required Test Cases (minimum)

1. **Initializes protocol on mount:** Mount GameView with `roomId: 'test1234'`. Assert `mockInitialize` was called with `'test1234'`.

2. **Shows connecting message in LOBBY phase:** Mount GameView. Assert the component renders text containing the room ID and a connecting/waiting message.

3. **Renders SetupPhase in SETUP phase:** Set the store to SETUP phase (`gameStore.startSetup()`). Mount GameView. Assert that SetupPhase component is rendered.

4. **Renders SetupPhase in COMMIT phase:** Transition store to COMMIT phase. Mount GameView. Assert SetupPhase is still rendered (it handles the waiting state internally).

5. **Shows placeholder for BATTLE phase:** Set `phase` to BATTLE. Assert placeholder text "coming in Phase 11" (or similar) is visible and SetupPhase is NOT rendered.

## Acceptance Criteria

- [ ] `GameView.vue` initializes `useGameProtocol` with `roomId` on mount
- [ ] `SetupPhase` renders when `phase` is `'setup'` or `'commit'`
- [ ] Placeholder content renders for `'battle'`, `'reveal'`, and `'gameover'` phases
- [ ] Connecting/waiting message renders for `'lobby'` phase
- [ ] Component stays under 200 lines
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read the existing `GameView.vue` first.** It currently has a stub template per Phase 9. You are replacing this stub, not extending it — but preserve the `roomId` prop which is already defined.
- **Check how `useGameProtocol` is initialized** in Phase 8's implementation. The ticket describes two possible patterns (constructor argument vs. `initialize()` method). Match the actual implementation. If `useGameProtocol` needs to be called at setup time (not in `onMounted`), adjust accordingly — the key is that the protocol connection uses the `roomId`.
- **SetupPhase handles both SETUP and COMMIT phases.** Do not create separate conditional blocks for these — use a single `v-if` that matches both phases. SetupPhase switches between interactive placement and the "Waiting for opponent..." state internally.
- **The `handleBoardCommitted` handler is intentionally empty.** It's a hook point for future phases. Do not add logic to it unless the phase overview specifies something.
- **Placeholders for future phases must compile.** The placeholder `<div>` elements should be valid HTML with no imports of non-existent components. Phases 11 and 12 will replace these placeholders with real component imports.
- **Do not add `AppHeader` to GameView.** It's already rendered in `App.vue` (Phase 9, Ticket 005). GameView is a route-level view that sits below the header.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure.
- **Follow `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Keep views thin. GameView is a phase router, not a container for game logic. All game logic belongs in stores and composables.
