# Phase 12 — Ticket 002: Verification Badge and Rematch Controls

## Summary

Add the verification badge and rematch controls to `GameOver.vue`. The verification badge shows "Verified — Fair Game" when the opponent's board and shot results pass both verification checks, or "Cheat Detected" when either check fails (see `docs/05-PROTOCOL-SPEC.md` Sections 7.2–7.3). The rematch controls include a "Rematch" button that emits `requestRematch`, and a waiting state shown after the button is clicked. When done, the GameOver component is feature-complete per `docs/phases/phase-12-ui-game-over.md` Section 6.

## Prerequisites

- **Ticket 001 complete.** `app/src/components/game/GameOver.vue` exists with the full props/emits contract, winner announcement, and board grids.
- **Ticket 001 complete.** `app/src/components/game/GameOver.test.ts` exists with baseline tests.

## Scope

**In scope:**

- Modify `app/src/components/game/GameOver.vue` to add:
  - Verification badge section that shows "Verified — Fair Game" or "Cheat Detected" based on `cheatDetected` prop, only displayed when `opponentRevealed` is `true`
  - "Rematch" button that emits `requestRematch` on click
  - Button disabled state or replacement text when `rematchRequested` is `true` ("Waiting for opponent to accept rematch...")
  - Informational text when `opponentRematchRequested` is `true` but player hasn't requested yet ("Opponent wants a rematch!")
- Update `app/src/components/game/GameOver.test.ts` with tests for verification and rematch states

**Out of scope:**

- Winner announcement and board grids — already implemented in Ticket 001
- Wiring into `GameView.vue` — Ticket 003
- The actual verification logic (hash check, shot result check) — Phase 7 (`useCrypto`) and Phase 8 (`useGameProtocol`). This component only displays the result via the `cheatDetected` prop.
- Animations or transitions — Phase 13

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/GameOver.vue` | Modify | Add verification badge and rematch controls |
| `app/src/components/game/GameOver.test.ts` | Modify | Add tests for verification display and rematch states |

## Requirements

### Verification Badge

Add a verification badge section between the board grids and the rematch controls:

- **Condition:** Only display the badge when `props.opponentRevealed` is `true`. Before reveal, verification has not occurred yet — do not show any badge.
- **Verified state:** When `props.cheatDetected` is `false` and `props.opponentRevealed` is `true`, display: **"Verified — Fair Game"**
  - Use a green/success color scheme (e.g., `text-green-400 bg-green-900/30 border border-green-700`)
  - Use a `data-testid="verification-badge"` attribute
- **Cheat detected state:** When `props.cheatDetected` is `true`, display: **"Cheat Detected"**
  - Use a red/danger color scheme (e.g., `text-red-400 bg-red-900/30 border border-red-700`)
  - Use the same `data-testid="verification-badge"` attribute
- The badge should be visually prominent — a bordered pill or card that stands out. Use Tailwind classes: `rounded-lg px-4 py-2 text-center font-semibold`.
- Reference: `docs/01-PRD.md` US-14 (verify opponent's board) and US-15 (cheat detected warning).

### Rematch Button

Add a rematch controls section below the verification badge:

- **Default state** (`rematchRequested === false` and `opponentRematchRequested === false`):
  - Render a "Rematch" button
  - On click, emit `requestRematch` with no payload: `emit('requestRematch')`
  - Use a `data-testid="rematch-button"` attribute
  - Button styling: `bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg`

- **Rematch requested state** (`rematchRequested === true`):
  - Replace the button with the text: **"Waiting for opponent to accept rematch..."**
  - Use a `data-testid="rematch-waiting"` attribute
  - The button must not be rendered — do not use `disabled`, remove it entirely and show the waiting text instead

- **Opponent wants rematch state** (`opponentRematchRequested === true` and `rematchRequested === false`):
  - Show informational text above the button: **"Opponent wants a rematch!"**
  - The "Rematch" button remains visible and clickable
  - Use a `data-testid="opponent-rematch-notice"` attribute on the informational text

- **Both requested:** This state is transient — when both players request rematch, `gameStore.resetForRematch()` transitions to SETUP immediately. The component will unmount before this state is visible for more than a frame. No special handling needed.

### Conditional Rendering Logic

The rematch section should only appear during the GAMEOVER phase (when `opponentRevealed` is `true`). During the REVEAL phase (`opponentRevealed` is `false`), the rematch section is hidden — the player is still waiting for the reveal.

The rendering order in the template should be:
1. Winner announcement (from Ticket 001)
2. Board grids (from Ticket 001)
3. Verification badge (this ticket)
4. Rematch controls (this ticket)

### Vue Conventions

- Use `<script setup lang="ts">` — already established in Ticket 001.
- Event handler naming: the template should use `@click="emit('requestRematch')"` or define a `handleRequestRematch` function that calls `emit('requestRematch')`. Prefer the handler function pattern per `docs/03-CODING-STANDARDS.md` (event handlers prefixed with `handle`).
- Keep the component under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1. After this ticket, the component should be approximately 80–120 lines of `<script>` + `<template>`.

### Test Requirements

Update `app/src/components/game/GameOver.test.ts`. Continue using the same Vitest + Vue Test Utils setup and GridCellStub from Ticket 001.

#### Required Test Cases (minimum — add to existing tests)

1. **Shows "Verified — Fair Game" when cheatDetected is false and opponentRevealed is true:** Mount with `cheatDetected: false, opponentRevealed: true`. Assert `data-testid="verification-badge"` contains text "Verified — Fair Game".

2. **Shows "Cheat Detected" when cheatDetected is true:** Mount with `cheatDetected: true, opponentRevealed: true`. Assert `data-testid="verification-badge"` contains text "Cheat Detected".

3. **Does not show verification badge when opponentRevealed is false:** Mount with `opponentRevealed: false`. Assert `data-testid="verification-badge"` does NOT exist.

4. **Renders "Rematch" button in default state:** Mount with `rematchRequested: false, opponentRematchRequested: false, opponentRevealed: true`. Assert `data-testid="rematch-button"` exists.

5. **Emits requestRematch on button click:** Mount in default state. Find `data-testid="rematch-button"` and trigger click. Assert `wrapper.emitted('requestRematch')` has length 1.

6. **Shows waiting text when rematchRequested is true:** Mount with `rematchRequested: true`. Assert `data-testid="rematch-waiting"` exists with text "Waiting for opponent to accept rematch...". Assert `data-testid="rematch-button"` does NOT exist.

7. **Shows opponent rematch notice when opponentRematchRequested is true:** Mount with `opponentRematchRequested: true, rematchRequested: false, opponentRevealed: true`. Assert `data-testid="opponent-rematch-notice"` exists with text "Opponent wants a rematch!". Assert `data-testid="rematch-button"` still exists.

## Acceptance Criteria

- [ ] Verification badge shows "Verified — Fair Game" when `cheatDetected` is `false` and `opponentRevealed` is `true`
- [ ] Verification badge shows "Cheat Detected" when `cheatDetected` is `true`
- [ ] Verification badge is hidden when `opponentRevealed` is `false`
- [ ] "Rematch" button is visible and emits `requestRematch` on click
- [ ] "Waiting for opponent to accept rematch..." replaces the button when `rematchRequested` is `true`
- [ ] "Opponent wants a rematch!" notice appears when `opponentRematchRequested` is `true`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read the existing `GameOver.vue` from Ticket 001 first.** You are adding to the existing component, not rewriting it. Add the verification badge and rematch controls below the board grids section.
- **The `cheatDetected` prop is already declared** in the props contract from Ticket 001. You do not need to add it — just use it in the template.
- **The `requestRematch` emit is already declared** in the emits contract from Ticket 001. You do not need to add it — just wire it to the button click.
- **Do not implement verification logic.** This component does NOT call `useCrypto.verifyBoard()` or check shot results. It receives `cheatDetected` as a boolean prop. The verification happens in the protocol composable (Phase 8) and the result is stored in `gameStore.cheatDetected`. The GameView integration (Ticket 003) passes this as a prop.
- **Do not modify the winner announcement or board grids** from Ticket 001. Only add the new sections below the existing content.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Never put business logic in components. The rematch button emits an event — it does not call `useGameProtocol.sendRematch()` directly. That wiring happens in GameView (Ticket 003).
- **Use `v-if` / `v-else` for mutually exclusive states.** The rematch button and the waiting text are mutually exclusive — use `v-if="!rematchRequested"` and `v-else` for clean conditional rendering.
