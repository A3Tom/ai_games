# Phase 12 — Ticket 003: GameView Game Over Integration

## Summary

Modify `GameView.vue` to render the `GameOver` component during the `reveal` and `gameover` phases. This wires store state to the GameOver props, handles the `requestRematch` event by calling `protocol.sendRematch()`, and manages local rematch state tracking. After this ticket, the full game-over flow is integrated: the game transitions from battle to reveal to gameover, showing the GameOver screen with verification and rematch controls, completing the game lifecycle described in `docs/phases/phase-12-ui-game-over.md`.

## Prerequisites

- **Ticket 001 and 002 complete.** `app/src/components/game/GameOver.vue` is feature-complete with all props consumed and emit wired.
- **Phase 10, Ticket 005 complete.** `GameView.vue` has phase-routing with SetupPhase rendering and placeholders for other phases.
- **Phase 11, Ticket 005 complete.** `GameView.vue` has battle phase rendering integrated.
- **Phase 4 complete.** `useGameStore` exports `winner`, `cheatDetected`, `opponentShips`, `myBoard`, `opponentBoard`, `myShips`, `mySalt`, `phase`, `resetForRematch()`.
- **Phase 8 complete.** `useGameProtocol` exports `sendRematch()`.

Specific file dependencies:
- `app/src/components/game/GameOver.vue` — the component to render (Tickets 001–002)
- `app/src/stores/game.ts` — `useGameStore` for all game state
- `app/src/composables/useGameProtocol.ts` — `sendRematch()`
- `app/src/types/game.ts` — `GAME_PHASES`

## Scope

**In scope:**

- Modify `app/src/views/GameView.vue`:
  - Import `GameOver` component
  - Replace reveal/gameover placeholder(s) with `GameOver` rendering
  - Map store state to `GameOver` props
  - Compute `opponentRevealed` from `opponentShips` length
  - Manage local `rematchRequested` and `opponentRematchRequested` state
  - Handle `requestRematch` event: call `protocol.sendRematch()` and set local `rematchRequested` to `true`
  - Reset rematch state when phase transitions away from GAMEOVER (e.g., on `resetForRematch`)
- Update `app/src/views/GameView.test.ts` with tests for game-over phase rendering

**Out of scope:**

- GameOver component internals — Tickets 001–002
- Battle phase integration — Phase 11, Ticket 005
- Lobby/setup phase rendering — Phase 9/10
- Verification logic (hash check, shot result check) — Phase 7 and Phase 8
- Protocol implementation (sendReveal, sendRematch) — Phase 8

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/views/GameView.vue` | Modify | Add game-over phase rendering with GameOver component |
| `app/src/views/GameView.test.ts` | Modify | Add tests for reveal/gameover phase rendering |

## Requirements

### New Imports

Add to the existing imports in `GameView.vue`:

```typescript
import { ref, watch } from 'vue'
import GameOver from '../components/game/GameOver.vue'
```

**Note:** `ref` and `watch` may already be imported from Phase 11. Check and add only what's missing.

### Store Access

Extend the existing `storeToRefs` destructuring (some of these may already be present from prior phases):

```typescript
const gameStore = useGameStore()
const {
  phase,
  myBoard,
  opponentBoard,
  myShips,
  opponentShips,
  winner,
  cheatDetected,
} = storeToRefs(gameStore)
```

### Protocol Access

Access the protocol composable (already initialized from Phase 8/11):

```typescript
const protocol = useGameProtocol()
```

**Note:** Check the actual Phase 8 implementation. The key requirement is access to `protocol.sendRematch()`.

### Computed: opponentRevealed

Derive whether the opponent has revealed from the store state:

```typescript
const opponentRevealed = computed<boolean>(
  () => opponentShips.value.length > 0
)
```

The opponent's ships array is empty until their reveal message is received and processed by `gameStore.receiveReveal()`. Once populated, `opponentRevealed` becomes `true`.

### Local Rematch State

The game store does not track per-player rematch requests — it only has `resetForRematch()` which transitions the phase. The UI needs local state to show the waiting message:

```typescript
const rematchRequested = ref<boolean>(false)
const opponentRematchRequested = ref<boolean>(false)
```

**Note:** Check if `useGameProtocol` from Phase 8 exposes rematch state (e.g., `protocol.opponentRematchRequested`). If it does, use that instead of a local ref. If it doesn't, set `opponentRematchRequested` via a callback or event from the protocol composable. Document the actual approach based on what Phase 8 provides.

If the protocol composable provides a way to register a callback for incoming rematch messages, use it:

```typescript
// Example — adapt to actual Phase 8 API:
protocol.onOpponentRematch(() => {
  opponentRematchRequested.value = true
})
```

If no such callback exists, the protocol composable likely calls `gameStore.resetForRematch()` directly when both players have sent rematch. In that case, `opponentRematchRequested` may never be `true` in isolation (both send → immediate reset). The agent should check Phase 8's implementation and adapt.

### Reset Rematch State on Phase Change

When the game resets (phase leaves GAMEOVER), clear the rematch state:

```typescript
watch(phase, (newPhase) => {
  if (newPhase !== GAME_PHASES.GAMEOVER && newPhase !== GAME_PHASES.REVEAL) {
    rematchRequested.value = false
    opponentRematchRequested.value = false
  }
})
```

This ensures that after a rematch (phase → SETUP), the rematch tracking is cleared for the next game.

### Request Rematch Handler

```typescript
function handleRequestRematch(): void {
  if (rematchRequested.value) return  // prevent double-send
  rematchRequested.value = true
  protocol.sendRematch()
}
```

### Compute Winner for Props

The store's `winner` is `'me' | 'opponent' | null`. During the REVEAL phase, `winner` may still be `null` (it's set by `finishGame()`). The GameOver component expects a non-nullable `winner` prop.

Compute the winner from battle state when the store's winner is null:

```typescript
const effectiveWinner = computed<'me' | 'opponent'>(() => {
  if (winner.value !== null) return winner.value

  // During reveal phase, determine winner from battle state
  // If my remaining ships is 0, opponent wins. Otherwise, I win.
  const myRemaining = gameStore.remainingShips.me
  return myRemaining === 0 ? 'opponent' : 'me'
})
```

### Template Changes

Replace the reveal/gameover placeholder(s) in the existing template. If Phase 10/11 left placeholder `<div>` elements for these phases, replace them:

```html
<GameOver
  v-else-if="phase === GAME_PHASES.REVEAL || phase === GAME_PHASES.GAMEOVER"
  :winner="effectiveWinner"
  :cheat-detected="cheatDetected"
  :my-board="myBoard"
  :my-ships="myShips"
  :opponent-board="opponentBoard"
  :opponent-ships="opponentShips"
  :opponent-revealed="opponentRevealed"
  :rematch-requested="rematchRequested"
  :opponent-rematch-requested="opponentRematchRequested"
  @request-rematch="handleRequestRematch"
/>
```

**Important:** Vue uses kebab-case for props and events in templates. The prop `opponentRevealed` becomes `:opponent-revealed`, and the event `requestRematch` becomes `@request-rematch`.

This `v-else-if` must be part of the existing phase-routing chain in GameView (after `BATTLE`, before any fallback).

### Vue Conventions

- Keep `GameView.vue` under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.
- Use `storeToRefs` for reactive store state destructuring.
- Do not call store actions directly from the template — use handler functions.
- Follow `docs/03-CODING-STANDARDS.md` Section 3.2 for import ordering.

### Test Requirements

Update `app/src/views/GameView.test.ts` (modified in Phase 10/11 tickets). Continue using the same Vitest + Vue Test Utils setup.

#### Mocking Strategy

Add a stub for the GameOver component:

```typescript
const GameOverStub = {
  name: 'GameOver',
  template: '<div class="game-over-stub"></div>',
  props: [
    'winner',
    'cheatDetected',
    'myBoard',
    'myShips',
    'opponentBoard',
    'opponentShips',
    'opponentRevealed',
    'rematchRequested',
    'opponentRematchRequested',
  ],
  emits: ['requestRematch'],
}
```

#### Required Test Cases (minimum — add to existing tests)

1. **Reveal phase renders GameOver component:** Set store phase to `GAME_PHASES.REVEAL`. Mount GameView with stubs. Assert GameOverStub is present in the rendered output.

2. **Gameover phase renders GameOver component:** Set store phase to `GAME_PHASES.GAMEOVER`, set `winner` to `'me'`. Assert GameOverStub is present.

3. **Battle components NOT rendered during gameover:** Set store phase to `GAME_PHASES.GAMEOVER`. Assert battle components (PlayerBoard, OpponentBoard, etc.) are NOT rendered.

4. **GameOver receives correct winner prop:** Set store phase to `GAME_PHASES.GAMEOVER`, set `winner` to `'opponent'`. Assert GameOverStub receives `winner: 'opponent'` prop.

5. **GameOver receives opponentRevealed as false when opponentShips is empty:** Set store phase to `GAME_PHASES.REVEAL`, `opponentShips` empty. Assert GameOverStub receives `opponentRevealed: false`.

6. **GameOver receives opponentRevealed as true when opponentShips is populated:** Set store phase to `GAME_PHASES.GAMEOVER`, populate `opponentShips`. Assert GameOverStub receives `opponentRevealed: true`.

## Acceptance Criteria

- [ ] `GameOver` component renders when `phase` is `'reveal'`
- [ ] `GameOver` component renders when `phase` is `'gameover'`
- [ ] Battle phase components are NOT rendered during reveal/gameover phases
- [ ] Store state is correctly wired to all GameOver props
- [ ] `opponentRevealed` correctly derived from `opponentShips` length
- [ ] `requestRematch` event triggers `protocol.sendRematch()` and sets `rematchRequested` to `true`
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read the existing `GameView.vue` first.** It has been modified by Phase 10 (Ticket 005) and Phase 11 (Ticket 005). You are adding game-over rendering to the existing phase router. Do not touch lobby, setup, or battle sections.
- **Check how `useGameProtocol` exposes `sendRematch`.** The exact API depends on Phase 8's implementation. It might be `protocol.sendRematch()` or destructured as `sendRematch()`. Adapt the handler to match.
- **Check if `useGameProtocol` exposes opponent rematch state.** If it provides `opponentRematchRequested` as a reactive ref, use it directly instead of maintaining local state. If it doesn't, use the local ref approach and document how `opponentRematchRequested` gets set (either via a callback, watcher, or direct mutation from the protocol composable).
- **The `effectiveWinner` computed handles the null case** during REVEAL phase. The store's `winner` is null until `finishGame()` is called. During REVEAL, the winner is determined from `remainingShips`. If `gameStore.remainingShips` doesn't give the right answer (e.g., both have remaining ships due to forfeit), default to `'me'` and let `finishGame()` correct it when called.
- **Reset rematch state on phase change.** Without this reset, after a rematch, the next game-over would still show "Waiting for opponent..." from the previous game.
- **Do not add verification logic.** The protocol composable (Phase 8) handles calling `useCrypto.verifyBoard()` and `gameStore.setCheatDetected()`. GameView just reads `cheatDetected` from the store and passes it as a prop.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. The `handleRequestRematch` function delegates to the protocol — it does not validate, check phase, or modify the store directly (beyond local UI state).
- **Keep GameView thin.** It's a phase router with wiring. All game logic lives in stores and composables.
