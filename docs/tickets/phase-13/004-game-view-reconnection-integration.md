# Phase 13 — Ticket 004: GameView Reconnection Overlay Integration

## Summary

Wire the `ReconnectionOverlay.vue` component into `GameView.vue` so that disconnection and reconnection feedback appears during active gameplay. This fulfills the requirement from `docs/phases/phase-13-polish-deploy.md` Section 4 (modifying GameView.vue to add the reconnection overlay/banner) and completes the reconnection UI story from US-12 in `docs/01-PRD.md`. When done, the agent should have a GameView that shows the reconnection overlay on top of the game when the WebSocket connection is disrupted.

## Prerequisites

- **Ticket 003 complete.** `app/src/components/shared/ReconnectionOverlay.vue` exists and is functional.
- **Phase 10 complete.** `app/src/views/GameView.vue` exists with phase-based rendering (setup, battle, game over).

Specific file dependencies:
- `app/src/components/shared/ReconnectionOverlay.vue` — the overlay component (Ticket 003)
- `app/src/views/GameView.vue` — the view to modify (Phase 10/11/12)

## Scope

**In scope:**

- Modify `app/src/views/GameView.vue` to:
  - Import and render `ReconnectionOverlay` component
  - Position it so it overlays the game content (the overlay handles its own `fixed` positioning)
  - Ensure the game UI remains visible beneath the semi-transparent overlay
- Update `app/src/views/GameView.test.ts` (if it exists) to verify ReconnectionOverlay is rendered

**Out of scope:**

- Creating ReconnectionOverlay itself — Ticket 003
- ConnectionStatus in header — Tickets 001/002
- Modifying reconnection logic — finalized in Phase 6
- Adding overlay to LobbyView — the lobby already shows connection status; overlay is only needed during active games
- Responsive layout fixes — Ticket 005

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/views/GameView.vue` | Modify | Add ReconnectionOverlay component import and render |
| `app/src/views/GameView.test.ts` | Modify | Add test verifying ReconnectionOverlay is rendered (if test file exists; create if not) |

## Requirements

### Import and Render ReconnectionOverlay

Add the import to GameView's script section:

```typescript
import ReconnectionOverlay from '../components/shared/ReconnectionOverlay.vue'
```

Render the component inside the GameView template. Since the overlay uses `fixed` positioning and manages its own visibility via `v-if`, it can be placed anywhere in the template — the simplest approach is at the end of the template root:

```html
<template>
  <div>
    <!-- Existing game phase content (setup, battle, game over) -->
    ...
    <ReconnectionOverlay />
  </div>
</template>
```

### No Props Required

ReconnectionOverlay reads from the connection store directly — no props need to be passed. Simply render the component tag.

### No Conditional Rendering Needed in GameView

The overlay component handles its own visibility (`v-if` on its root element based on connection status). Do not add `v-if` logic in GameView to control overlay visibility — that is the overlay's responsibility.

### GameView Behavior During Reconnection

When the overlay appears:
- The game UI beneath remains visible through the semi-transparent backdrop
- The game UI should not accept user interactions (clicks on the board, etc.) while the overlay is shown — the `fixed inset-0` overlay naturally blocks pointer events
- If the connection is restored, the overlay disappears and the game resumes from the last known state (Pinia state persists in memory per `docs/02-ARCHITECTURE.md` Section 7)

### Vue Conventions

- Maintain the existing `<script setup lang="ts">` structure per `docs/03-CODING-STANDARDS.md` Section 3.
- Add the import in the imports section, following the existing import order (components grouped together).
- Do not restructure existing GameView code.

### Test Requirements

If `app/src/views/GameView.test.ts` exists, add a test. If it does not exist, create it. Use Vitest and Vue Test Utils.

#### Mocking Strategy

Stub ReconnectionOverlay and other child components to isolate the test:

```typescript
const ReconnectionOverlayStub = {
  name: 'ReconnectionOverlay',
  template: '<div data-testid="reconnection-overlay-stub"></div>',
}
```

Also stub other game phase components (SetupPhase, PlayerBoard, etc.) to keep tests focused on the overlay integration.

#### Required Test Cases (minimum)

1. **ReconnectionOverlay is rendered in GameView:** Mount GameView with all child components stubbed. Assert that the ReconnectionOverlay stub is present in the rendered output.

2. **Overlay coexists with game content:** Mount GameView with a game phase active (e.g., `gameStore.phase = 'battle'`). Assert both the game phase content and the overlay stub are in the DOM.

## Acceptance Criteria

- [ ] `ReconnectionOverlay` component is imported and rendered in `GameView.vue`
- [ ] No props are passed to ReconnectionOverlay (it reads from store directly)
- [ ] Existing GameView functionality (phase routing, game components) is unchanged
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read `GameView.vue` first** to understand its current structure. It was built incrementally across Phases 10, 11, and 12. It likely has conditional rendering for different game phases (setup, battle, game over). Do not change any of that — only add the overlay.
- **The overlay is minimal to integrate.** Since it reads from the store directly and manages its own visibility, adding it is a single import + single component tag. Do not over-engineer this.
- **Do not add reconnection logic to GameView.** The component is purely a rendering host. The overlay reads store state, and the `useRelay` composable manages the WebSocket lifecycle. GameView just renders children.
- **The overlay intentionally blocks interaction** when visible. The `fixed inset-0` overlay with a backdrop naturally prevents clicks from reaching the game board beneath. This is the intended behavior per `docs/phases/phase-13-polish-deploy.md` Section 5 (Decision 2).
- **Do not add the overlay to LobbyView.** During the lobby phase, the player is not in an active game. Connection issues in the lobby are already surfaced through the ConnectionStatus indicator in the header (Tickets 001/002).
- **Provide a test Pinia instance and mock Vue Router** when mounting GameView in tests, as it likely depends on route params for the room ID.
