# Phase 10 — Ticket 004: SetupPhase Ready Button and Commit Flow

## Summary

Extend `SetupPhase.vue` to add the "Ready" button that triggers the board commitment flow and a waiting state displayed after the player commits. When all 5 ships are placed, the "Ready" button becomes enabled. Clicking it invokes `useCrypto.commitBoard()` to generate a SHA-256 hash, stores the commitment via `gameStore.commitBoard()`, sends the hash to the opponent via `useGameProtocol.sendCommit()`, and transitions the UI to a "Waiting for opponent..." state. After this ticket, the full setup-to-commit flow works end-to-end.

## Prerequisites

- **Phase 7 complete.** `app/src/composables/useCrypto.ts` exports `useCrypto()` which provides `commitBoard(ships)` returning `{ hash: string; salt: Uint8Array }`.
- **Phase 8 complete.** `app/src/composables/useGameProtocol.ts` exports `useGameProtocol()` which provides `sendCommit(hash)`.
- **Ticket 003 complete.** `app/src/components/game/SetupPhase.vue` exists with the board grid, ship placement interaction, and `allShipsPlaced` computed property.

## Scope

**In scope:**

- Modify `app/src/components/game/SetupPhase.vue` — add "Ready" button, commit flow logic, waiting state UI, `boardCommitted` emit
- Update `app/src/components/game/SetupPhase.test.ts` — add tests for ready button and commit flow

**Out of scope:**

- Crypto implementation — Phase 7 (useCrypto already exists)
- Protocol messaging implementation — Phase 8 (useGameProtocol already exists)
- Battle phase transition logic — ticket 005 (GameView handles phase routing)
- Battle UI — Phase 11
- The `gameStore.startBattle()` call — triggered by GameView or useGameProtocol when both commits are received, not by SetupPhase

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/SetupPhase.vue` | Modify | Add "Ready" button, commit flow, waiting state, boardCommitted emit |
| `app/src/components/game/SetupPhase.test.ts` | Modify | Add tests for ready/commit behavior |

## Requirements

### Updated Component Contract

Add the `boardCommitted` emit as specified in `docs/phases/phase-10-ui-ship-setup.md`:

```typescript
const emit = defineEmits<{
  boardCommitted: []
}>()
```

### Additional Imports

Add to the existing imports in SetupPhase.vue:

```typescript
import { useCrypto } from '../../composables/useCrypto'
import { useGameProtocol } from '../../composables/useGameProtocol'
import { GAME_PHASES } from '../../types/game'
```

### Additional Store Access

The component already has access to `phase` from `storeToRefs(gameStore)` (ticket 003). Additionally read `myShips` (already available from ticket 003).

### Additional Internal State

```typescript
const isCommitting = ref<boolean>(false)
```

This flag prevents double-clicks on the "Ready" button while the async commit operation is in progress.

### Computed Properties

The `allShipsPlaced` computed from ticket 003 is reused here. Additionally:

```typescript
const isWaitingForOpponent = computed<boolean>(() =>
  phase.value === GAME_PHASES.COMMIT
)
```

This becomes `true` after the player commits their board (store transitions to COMMIT phase) and remains `true` until the opponent also commits and the game transitions to BATTLE.

### Ready Button Handler

```typescript
async function handleReady(): Promise<void> {
  if (!allShipsPlaced.value || isCommitting.value) return

  isCommitting.value = true
  try {
    const crypto = useCrypto()
    const protocol = useGameProtocol()

    // 1. Generate cryptographic commitment
    const { hash, salt } = await crypto.commitBoard(myShips.value)

    // 2. Store commitment in game state (transitions phase to COMMIT)
    gameStore.commitBoard(hash, salt)

    // 3. Send commit hash to opponent via protocol
    protocol.sendCommit(hash)

    // 4. Notify parent
    emit('boardCommitted')
  } finally {
    isCommitting.value = false
  }
}
```

**Flow reference:** `docs/phases/phase-10-ui-ship-setup.md` Section "Key Design Decisions", item 5: "Ready" button → `useCrypto.commitBoard(ships)` → `gameStore.commitBoard(hash, salt)` → `useGameProtocol.sendCommit(hash)`.

**Important:** The `useCrypto()` and `useGameProtocol()` composables should be called at the top of the `<script setup>` block (not inside the handler) if they need to be initialized once. Check how these composables are structured in Phase 7 and Phase 8. If they return stable function references, calling them at the top level is preferred. If they need a setup context, they must be called at the top level. Adjust the handler accordingly — the key logic (commitBoard → store → send) remains the same.

### Template Additions

Add the following to the controls section of the existing template (below the ShipTray and rotation button):

1. **"Ready" button:**
   - Visible when `phase` is `GAME_PHASES.SETUP` (not yet committed).
   - Disabled when `!allShipsPlaced` or `isCommitting` is `true`.
   - Text: "Ready" (or "Committing..." when `isCommitting` is `true`).
   - Styled as a prominent primary action button (e.g., `bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-lg`).
   - Disabled styling: `disabled:opacity-50 disabled:cursor-not-allowed`.
   - Binds `@click="handleReady"`.

2. **Waiting state:**
   - Rendered when `isWaitingForOpponent` is `true` (phase is COMMIT).
   - Replaces or overlays the ship placement grid and controls.
   - Displays "Waiting for opponent..." text, centered.
   - Optionally show a simple loading indicator (e.g., a pulsing dot or text with `animate-pulse` Tailwind class).
   - The board should still be visible (read-only) but ship placement controls (tray, rotation, ready button) should be hidden or disabled.

### Conditional Rendering

The template should handle two visual states based on the game phase:

1. **Setup mode** (`phase === GAME_PHASES.SETUP`): Show the full placement UI — grid (interactive), ship tray, rotation button, ready button.
2. **Commit/waiting mode** (`phase === GAME_PHASES.COMMIT`): Show the grid (non-interactive, as a read-only display of the player's board), hide the ship tray and rotation button, hide the ready button, show "Waiting for opponent..." message.

Use `v-if` / `v-else` or conditional classes to switch between these states. The grid can use `:interactive="phase === GAME_PHASES.SETUP"` on GridCell to disable interaction during the waiting state.

### Styling

- "Ready" button: prominent green, large enough to tap on mobile (minimum 44×44px touch target per accessibility guidelines).
- Waiting state text: centered, with `animate-pulse` for visual feedback.
- All styling via Tailwind per `docs/03-CODING-STANDARDS.md` Section 3.4.

### Test Requirements

Update `app/src/components/game/SetupPhase.test.ts`.

#### Mocking Strategy

Mock `useCrypto` and `useGameProtocol`:

```typescript
import { vi } from 'vitest'

const mockCommitBoard = vi.fn().mockResolvedValue({
  hash: 'a'.repeat(64),
  salt: new Uint8Array(32),
})
const mockSendCommit = vi.fn()

vi.mock('../../composables/useCrypto', () => ({
  useCrypto: () => ({
    isAvailable: true,
    commitBoard: mockCommitBoard,
    verifyBoard: vi.fn(),
  }),
}))

vi.mock('../../composables/useGameProtocol', () => ({
  useGameProtocol: () => ({
    sendCommit: mockSendCommit,
    sendReady: vi.fn(),
  }),
}))
```

#### Additional Required Test Cases (minimum, in addition to ticket 003 tests)

1. **"Ready" button disabled when not all ships placed:** Mount SetupPhase with an empty board. Assert the "Ready" button exists and has the `disabled` attribute.

2. **"Ready" button enabled when all ships placed:** Place all 5 ships via the store before mounting (or after mounting and awaiting reactivity). Assert the "Ready" button does NOT have the `disabled` attribute.

3. **Clicking "Ready" calls commit flow:** Place all 5 ships. Click the "Ready" button. Assert `mockCommitBoard` was called. Assert `mockSendCommit` was called with the hash. Assert `boardCommitted` event was emitted.

4. **Waiting state shown after commit:** Place all 5 ships. Click "Ready". Wait for the async operation. Assert the component now shows "Waiting for opponent..." text. Assert the ship tray is no longer visible (or non-interactive).

## Acceptance Criteria

- [ ] "Ready" button is disabled when fewer than 5 ships are placed
- [ ] "Ready" button is enabled when all 5 ships are placed
- [ ] Clicking "Ready" calls `useCrypto.commitBoard()` with the player's ships
- [ ] Clicking "Ready" calls `gameStore.commitBoard()` with the hash and salt
- [ ] Clicking "Ready" calls `useGameProtocol.sendCommit()` with the hash
- [ ] After committing, the UI shows "Waiting for opponent..." and the grid becomes non-interactive
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Check how `useCrypto` and `useGameProtocol` are structured** before integrating. If they are composables that must be called inside `setup()`, call them at the top of `<script setup>` and store the returned functions. If they return plain objects with methods, you can call them inside the handler. The signatures described in this ticket match the phase overview — adjust import patterns to match the actual implementation from Phases 7 and 8.
- **The `commitBoard` function is async** (it uses `crypto.subtle.digest()` which returns a Promise). The handler must be `async` and `await` the result. Handle the `isCommitting` flag to prevent double-clicks.
- **Do not call `gameStore.startBattle()` from this component.** The transition from COMMIT to BATTLE happens when both players have committed. This is handled by `useGameProtocol` or `GameView` — not by SetupPhase. SetupPhase only handles the local player's commit flow.
- **The `boardCommitted` emit** is a signal to the parent (GameView). It's not strictly necessary for the phase transition (the store handles that), but the phase overview specifies it, so include it.
- **Board locking:** Once the player commits, the board is locked. Per the phase overview: "Players can click a placed ship to remove it and re-place before committing. Once committed, board is locked." Ensure the grid's `interactive` prop is `false` when the phase is COMMIT.
- **Keep the component under 200 lines.** After adding the commit flow, the component may be approaching the limit. Keep the template concise — avoid unnecessary wrapper divs.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not use `Math.random()` for crypto. `useCrypto` handles all crypto operations using the Web Crypto API.
- **Follow `docs/05-PROTOCOL-SPEC.md` Section 7** for the commitment protocol. Ships must be sorted alphabetically by type before hashing. However, `useCrypto.commitBoard()` should handle the sorting internally — do not sort in the component.
