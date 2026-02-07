# Phase 13 — Ticket 003: Reconnection Overlay Component

## Summary

Create the `ReconnectionOverlay.vue` component that displays a "Reconnecting..." spinner during reconnection attempts and a "Connection Lost" banner with a "Retry" button after max retries are exhausted. This delivers the reconnection UI feedback described in `docs/phases/phase-13-polish-deploy.md` Section 6 and fulfills US-12 from `docs/01-PRD.md`. When done, the agent should have a self-contained overlay component that handles both reconnecting and disconnected states, with a full unit test suite.

## Prerequisites

- **Phases 1–12 complete.** The full game is playable in local development.
- **Phase 4/6 complete.** `app/src/stores/connection.ts` exists and exports `useConnectionStore` with `status` and `reconnectAttempts`.
- **Phase 6 complete.** `app/src/composables/useRelay.ts` implements reconnection with exponential backoff.

Specific file dependencies:
- `app/src/stores/connection.ts` — exports `useConnectionStore` with `status`, `reconnectAttempts`

## Scope

**In scope:**

- Create `app/src/components/shared/ReconnectionOverlay.vue` with:
  - Store access via `storeToRefs(useConnectionStore())`
  - Reconnecting state: semi-transparent overlay with spinner and "Reconnecting..." text with attempt count
  - Disconnected state: banner with "Connection Lost" message and a "Retry" button
  - Connected state: overlay is not rendered at all
  - Retry button calls a store action or composable function to reset reconnection attempts
- Create `app/src/components/shared/ReconnectionOverlay.test.ts` with unit tests

**Out of scope:**

- Wiring into `GameView.vue` — Ticket 004
- ConnectionStatus indicator in header — Ticket 001/002
- Modifying reconnection logic in `useRelay.ts` — finalized in Phase 6
- Modifying the connection store — finalized in Phase 4/6

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/shared/ReconnectionOverlay.vue` | Create | Overlay/banner for reconnecting and disconnected states with retry functionality |
| `app/src/components/shared/ReconnectionOverlay.test.ts` | Create | Unit tests for overlay rendering states and retry interaction |

## Requirements

### Store Access

The component reads from `useConnectionStore`:

```typescript
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConnectionStore } from '../../stores/connection'

const connectionStore = useConnectionStore()
const { status, reconnectAttempts } = storeToRefs(connectionStore)
```

### Visibility Logic

The overlay renders only when the connection is disrupted:

```typescript
const isVisible = computed(() =>
  status.value === 'reconnecting' || status.value === 'disconnected'
)

const isReconnecting = computed(() => status.value === 'reconnecting')
const isDisconnected = computed(() => status.value === 'disconnected')
```

When `isVisible` is `false`, the component renders nothing (use `v-if` on the root element).

### Reconnecting State

When `isReconnecting` is `true`, show:
- A semi-transparent backdrop overlay covering the game area: `fixed inset-0 bg-black/50 flex items-center justify-center z-50`
- A centered card/panel with:
  - A CSS spinner animation (use Tailwind `animate-spin` on a circular element)
  - Text: "Reconnecting..."
  - Attempt count: "Attempt {N} of 10"
- Use `data-testid="reconnecting-overlay"` on the overlay container
- Use `data-testid="reconnect-attempt-count"` on the attempt text

### Disconnected State

When `isDisconnected` is `true`, show:
- The same overlay backdrop
- A centered card/panel with:
  - Text: "Connection Lost"
  - Subtext: "Unable to reach the game server."
  - A "Retry" button that triggers reconnection
- Use `data-testid="disconnected-overlay"` on the overlay container
- Use `data-testid="retry-button"` on the retry button

### Retry Button

The retry button should call a store action to reset reconnection and attempt to reconnect:

```typescript
function handleRetry(): void {
  connectionStore.resetReconnection()
}
```

**Important:** The agent must check whether `resetReconnection()` (or an equivalent action) exists on the connection store. If it does not exist, the agent should create a minimal action in the store that:
1. Sets `reconnectAttempts` to `0`
2. Sets `status` to `'reconnecting'`

This is the only store modification permitted in this ticket, and only if the action does not already exist. The actual WebSocket reconnection is triggered by the `useRelay` composable reacting to the status change.

### Spinner CSS

If `animate-spin` needs a circular element, use:

```html
<div class="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
```

This creates a standard loading spinner using only Tailwind utilities — no `<style>` block needed.

### Layout

- The overlay uses `fixed` positioning to cover the entire viewport
- Z-index should be high enough to sit above game UI (`z-50`)
- The centered card should have a dark background with rounded corners: `bg-gray-800 text-white rounded-lg p-8 flex flex-col items-center gap-4`
- Must be readable on mobile viewports (375px)

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.
- Follow component structure order: Imports → Store access → Computed → Functions → Template.
- Keep under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.

### Test Requirements

Tests must use Vitest and Vue Test Utils. Co-locate at `app/src/components/shared/ReconnectionOverlay.test.ts` per `docs/03-CODING-STANDARDS.md` Section 7.1.

#### Mocking Strategy

Create a real Pinia instance for each test and set the connection store state:

```typescript
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, it, expect } from 'vitest'
import { useConnectionStore } from '../../stores/connection'
import ReconnectionOverlay from './ReconnectionOverlay.vue'

describe('ReconnectionOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
})
```

Adjust state setting to match the store's actual API (read `connection.ts` first).

#### Required Test Cases (minimum)

1. **Not rendered when connected:** Mount with `status: 'connected'`. Assert that no overlay element is present in the DOM.

2. **Shows reconnecting overlay:** Mount with `status: 'reconnecting'`, `reconnectAttempts: 3`. Assert `data-testid="reconnecting-overlay"` is present. Assert "Reconnecting..." text is present.

3. **Shows attempt count:** Mount with `status: 'reconnecting'`, `reconnectAttempts: 5`. Assert `data-testid="reconnect-attempt-count"` contains "5".

4. **Shows disconnected overlay:** Mount with `status: 'disconnected'`. Assert `data-testid="disconnected-overlay"` is present. Assert "Connection Lost" text is present.

5. **Retry button exists when disconnected:** Mount with `status: 'disconnected'`. Assert `data-testid="retry-button"` is present.

6. **Retry button triggers reconnection reset:** Mount with `status: 'disconnected'`. Click `data-testid="retry-button"`. Assert the store's `status` changed to `'reconnecting'` and `reconnectAttempts` reset to `0`.

## Acceptance Criteria

- [ ] File exists at `app/src/components/shared/ReconnectionOverlay.vue` with `<script setup lang="ts">`
- [ ] File exists at `app/src/components/shared/ReconnectionOverlay.test.ts`
- [ ] Overlay is not rendered when `status === 'connected'`
- [ ] "Reconnecting..." spinner and attempt count show when `status === 'reconnecting'`
- [ ] "Connection Lost" banner with "Retry" button shows when `status === 'disconnected'`
- [ ] Clicking "Retry" resets reconnection attempts and sets status to `'reconnecting'`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read `app/src/stores/connection.ts` first** to understand the actual store shape and available actions. The store was implemented in Phase 4 and wired in Phase 6. Check whether a `resetReconnection()` action already exists. If not, add one — this is the only store modification allowed.
- **Read `app/src/composables/useRelay.ts`** to understand how reconnection is triggered. The overlay only sets store state; the composable reacts to state changes to manage the WebSocket. Do not add WebSocket logic to this component.
- **The overlay uses `fixed` positioning** to cover the viewport. This means it sits on top of the game UI. The game state remains in memory underneath — per `docs/phases/phase-13-polish-deploy.md` Section 5 (Decision 2), "show an overlay or banner on top of the existing game UI — not a full page replacement."
- **Do not render both overlays simultaneously.** The reconnecting and disconnected states are mutually exclusive. Use `v-if` / `v-else-if` to render only one at a time.
- **The max retries value (10) is defined in the useRelay composable** per `docs/05-PROTOCOL-SPEC.md` Section 9.1. For display purposes, hardcode the max as `10` in the attempt count text, or import it as a constant if one exists.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. This component only reads connection state and dispatches one store action (retry). It does not manage WebSocket connections directly.
