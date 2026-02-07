# Phase 13 — Ticket 001: Connection Status Component

## Summary

Create the `ConnectionStatus.vue` component that displays the current WebSocket connection state, peer presence, and optional ping latency as a compact indicator. This delivers the persistent connection feedback described in `docs/phases/phase-13-polish-deploy.md` Section 6 and fulfills US-10 from `docs/01-PRD.md`. When done, the agent should have a self-contained Vue component with green/yellow/red status indicators, peer presence text, and a full unit test suite.

## Prerequisites

- **Phases 1–12 complete.** The full game is playable in local development.
- **Phase 4 complete.** `app/src/stores/connection.ts` exists and exports `useConnectionStore` with `status`, `peerConnected`, `lastPingMs`, and `reconnectAttempts` state.

Specific file dependencies:
- `app/src/stores/connection.ts` — exports `useConnectionStore` with the `ConnectionState` shape defined in `docs/02-ARCHITECTURE.md` Section 4.2.

## Scope

**In scope:**

- Create `app/src/components/shared/ConnectionStatus.vue` with:
  - Store access via `storeToRefs(useConnectionStore())`
  - Color-coded status dot: green (connected + peer), yellow (reconnecting or connected without peer), red (disconnected)
  - Status text: "Connected", "Reconnecting...", "Disconnected", "Waiting for opponent"
  - Peer presence indicator: "Opponent connected" vs "Waiting for opponent..."
  - Optional ping latency display when `lastPingMs` is available
  - Responsive layout that fits in a header bar
- Create `app/src/components/shared/ConnectionStatus.test.ts` with unit tests

**Out of scope:**

- Wiring into `AppHeader.vue` — Ticket 002
- Reconnection overlay/banner with retry button — Ticket 003
- Any modifications to the connection store itself — finalized in Phase 4/6
- Animations or transitions — not required for v1

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/shared/ConnectionStatus.vue` | Create | Persistent connection status indicator with color dot, status text, and peer presence |
| `app/src/components/shared/ConnectionStatus.test.ts` | Create | Unit tests for all connection status rendering states |

## Requirements

### Store Access

The component reads from `useConnectionStore` via `storeToRefs`. It does not accept props — it accesses the store directly as specified in `docs/phases/phase-13-polish-deploy.md` Section 6:

```typescript
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConnectionStore } from '../../stores/connection'

const connectionStore = useConnectionStore()
const { status, peerConnected, lastPingMs } = storeToRefs(connectionStore)
```

### Status Dot Color

Compute the dot color based on the connection state table from `docs/phases/phase-13-polish-deploy.md` Section 6:

```typescript
const dotColor = computed<'green' | 'yellow' | 'red'>(() => {
  if (status.value === 'connected' && peerConnected.value) return 'green'
  if (status.value === 'reconnecting') return 'yellow'
  if (status.value === 'connected' && !peerConnected.value) return 'yellow'
  return 'red' // 'disconnected' or 'connecting'
})
```

Render the dot as a small circle element using Tailwind classes:
- Green: `bg-green-500`
- Yellow: `bg-yellow-500`
- Red: `bg-red-500`

The dot should be a `<span>` with `class="inline-block w-2.5 h-2.5 rounded-full"` plus the color class. Use a `data-testid="status-dot"` attribute.

### Status Text

Compute human-readable status text:

```typescript
const statusText = computed<string>(() => {
  if (status.value === 'disconnected') return 'Disconnected'
  if (status.value === 'reconnecting') return 'Reconnecting...'
  if (status.value === 'connecting') return 'Connecting...'
  if (status.value === 'connected' && peerConnected.value) return 'Opponent connected'
  if (status.value === 'connected' && !peerConnected.value) return 'Waiting for opponent...'
  return 'Unknown'
})
```

Use a `data-testid="status-text"` attribute on the text element.

### Ping Latency

When `lastPingMs` is not null and `status` is `'connected'`, display the latency:

```typescript
const showPing = computed(() => status.value === 'connected' && lastPingMs.value !== null)
```

Display as `"{N}ms"` in a smaller, muted text style. Use a `data-testid="ping-latency"` attribute. When `showPing` is false, do not render the ping element.

### Layout

Use Tailwind utilities per `docs/03-CODING-STANDARDS.md` Section 3.4:

- Container: `flex items-center gap-2 text-sm`
- Status dot + text inline
- Ping latency as a separate muted span: `text-xs text-gray-400`
- The component must fit within a header bar without breaking layout on mobile

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.
- Follow component structure order: Imports → Store access → Computed → Template.
- Keep under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.
- No props. No emits. The component is a read-only observer of store state.

### Test Requirements

Tests must use Vitest and Vue Test Utils. Co-locate at `app/src/components/shared/ConnectionStatus.test.ts` per `docs/03-CODING-STANDARDS.md` Section 7.1.

#### Mocking Strategy

Create a real Pinia instance for each test and set the connection store state directly:

```typescript
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, it, expect } from 'vitest'
import { useConnectionStore } from '../../stores/connection'
import ConnectionStatus from './ConnectionStatus.vue'

describe('ConnectionStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountWithState(overrides: Partial<{
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    peerConnected: boolean
    lastPingMs: number | null
  }>) {
    const store = useConnectionStore()
    if (overrides.status !== undefined) store.status = overrides.status
    if (overrides.peerConnected !== undefined) store.peerConnected = overrides.peerConnected
    if (overrides.lastPingMs !== undefined) store.lastPingMs = overrides.lastPingMs
    return mount(ConnectionStatus)
  }
})
```

**Note:** Adjust the `mountWithState` helper to match how the store's state is actually set. If the store uses `ref()` (setup store pattern), direct property assignment works. If it exposes actions for state changes, use those instead. The agent should read `app/src/stores/connection.ts` first to determine the correct approach.

#### Required Test Cases (minimum)

1. **Green dot when connected with peer:** Mount with `status: 'connected'`, `peerConnected: true`. Assert `data-testid="status-dot"` has `bg-green-500` class.

2. **Yellow dot when reconnecting:** Mount with `status: 'reconnecting'`. Assert `data-testid="status-dot"` has `bg-yellow-500` class.

3. **Yellow dot when connected without peer:** Mount with `status: 'connected'`, `peerConnected: false`. Assert `data-testid="status-dot"` has `bg-yellow-500` class.

4. **Red dot when disconnected:** Mount with `status: 'disconnected'`. Assert `data-testid="status-dot"` has `bg-red-500` class.

5. **Status text shows "Opponent connected":** Mount with `status: 'connected'`, `peerConnected: true`. Assert `data-testid="status-text"` contains "Opponent connected".

6. **Status text shows "Waiting for opponent...":** Mount with `status: 'connected'`, `peerConnected: false`. Assert `data-testid="status-text"` contains "Waiting for opponent...".

7. **Ping latency shown when connected with value:** Mount with `status: 'connected'`, `lastPingMs: 42`. Assert `data-testid="ping-latency"` contains "42ms".

8. **Ping latency hidden when disconnected:** Mount with `status: 'disconnected'`, `lastPingMs: 42`. Assert `data-testid="ping-latency"` does not exist.

## Acceptance Criteria

- [ ] File exists at `app/src/components/shared/ConnectionStatus.vue` with `<script setup lang="ts">`
- [ ] File exists at `app/src/components/shared/ConnectionStatus.test.ts`
- [ ] Green dot renders when `status === 'connected'` and `peerConnected === true`
- [ ] Yellow dot renders when `status === 'reconnecting'`
- [ ] Red dot renders when `status === 'disconnected'`
- [ ] Status text displays correct string for each connection state
- [ ] Ping latency displays only when connected and `lastPingMs` is not null
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read `app/src/stores/connection.ts` first** to understand the actual store shape. The store was implemented in Phase 4/6 — verify that `status`, `peerConnected`, `lastPingMs`, and `reconnectAttempts` are available as expected. Adjust the `storeToRefs` destructuring to match the actual exports.
- **This component has no props.** It reads directly from the Pinia store. This is intentional — the connection status is global state, not something passed down from a parent. See `docs/phases/phase-13-polish-deploy.md` Section 6.
- **Do not add a retry button or reconnection overlay** — those belong in Ticket 003 (ReconnectionOverlay component). This component only shows status.
- **Do not modify the connection store.** If the store is missing fields you need, stub them with comments and note the gap — do not change store code.
- **Use `storeToRefs`** to destructure reactive state from the store per `docs/03-CODING-STANDARDS.md` Section 4.1. Do not access `store.status` directly in the template without destructuring.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. This component only reads state and computes display values. It does not trigger reconnection, send messages, or modify store state.
- **Keep Tailwind classes in the template** per `docs/03-CODING-STANDARDS.md` Section 3.4. No `<style>` block needed for this component.
