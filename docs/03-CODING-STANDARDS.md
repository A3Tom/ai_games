# Coding Standards: Sea Strike

## 1. Language & Tooling

| Tool | Version | Notes |
|------|---------|-------|
| TypeScript | 5.x | Strict mode enabled. No `any` unless explicitly justified. |
| Vue | 3.5+ | Composition API only. No Options API. |
| Vite | 6.x | Build tool and dev server. |
| Pinia | 2.x | State management. |
| Vue Router | 4.x | Hash mode for GitHub Pages. |
| Tailwind CSS | 4.x | Utility-first styling. |
| Node.js | 20 LTS | Relay server runtime. |
| ESLint | 9.x | Flat config format. |
| Prettier | 3.x | Code formatting. |

---

## 2. TypeScript Rules

### 2.1 Strict Configuration

```jsonc
// tsconfig.json — key settings
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 2.2 Type Conventions

- **Prefer `interface` over `type` for object shapes.** Use `type` for unions, intersections, and utility types.
- **No `enum`.** Use `as const` objects with derived types instead:

```typescript
// ✅ Correct
export const SHIP_TYPES = {
  CARRIER: 'carrier',
  BATTLESHIP: 'battleship',
  CRUISER: 'cruiser',
  SUBMARINE: 'submarine',
  DESTROYER: 'destroyer',
} as const

export type ShipType = (typeof SHIP_TYPES)[keyof typeof SHIP_TYPES]

// ❌ Wrong — do not use enums
enum ShipType { Carrier, Battleship }
```

- **No `any`.** Use `unknown` and narrow, or define a proper type. If `any` is truly unavoidable, add a `// eslint-disable-next-line` with a comment explaining why.
- **Export types explicitly** using `export type` or `export interface`. Do not rely on type inference for public APIs.
- **Discriminated unions for messages.** Every protocol message must use a `type` literal discriminant:

```typescript
interface ShotMessage {
  type: 'shot'
  x: number
  y: number
}

interface ResultMessage {
  type: 'result'
  x: number
  y: number
  hit: boolean
  sunk?: ShipType
}

type GameMessage = ShotMessage | ResultMessage | CommitMessage | RevealMessage
```

### 2.3 Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files (components) | PascalCase.vue | `GameBoard.vue` |
| Files (non-component) | kebab-case.ts | `room-id.ts` |
| Interfaces | PascalCase, no `I` prefix | `GameState`, not `IGameState` |
| Types | PascalCase | `ShipType` |
| Constants | UPPER_SNAKE_CASE | `MAX_BOARD_SIZE` |
| Composables | camelCase with `use` prefix | `useRelay()` |
| Stores | camelCase with `use` prefix + `Store` suffix | `useGameStore()` |
| Event handlers | `handle` + event | `handleCellClick` |
| Booleans | `is`, `has`, `can`, `should` prefix | `isMyTurn`, `hasConnected` |
| Pinia actions | verb-first | `fireShot()`, `placeShip()` |
| Pinia getters | noun or adjective | `remainingShips`, `isGameOver` |

---

## 3. Vue Conventions

### 3.1 Component Structure

Every `.vue` file follows this order:

```vue
<script setup lang="ts">
// 1. Imports (Vue, libraries, composables, stores, components, types, utils)
// 2. Props & emits
// 3. Store access
// 4. Refs & reactive state
// 5. Computed properties
// 6. Watchers
// 7. Functions (event handlers, helpers)
// 8. Lifecycle hooks
</script>

<template>
  <!-- Single root element preferred but not required (Vue 3 supports fragments) -->
</template>

<style scoped>
/* Component-specific styles — use Tailwind utilities in template when possible */
</style>
```

### 3.2 Component Rules

- **Composition API only.** No `Options API`, no `<script>` without `setup`.
- **`<script setup>` is mandatory.** Never use `defineComponent()` in SFC files.
- **Props are readonly.** Never mutate props. Emit events or call store actions to change parent state.
- **One component per file.** No inline component definitions.
- **Keep components under 200 lines.** Extract composables or child components if they grow beyond this.
- **Use `defineProps` with TypeScript generics,** not the runtime declaration:

```typescript
// ✅ Correct
const props = defineProps<{
  x: number
  y: number
  state: CellState
}>()

// ❌ Wrong
const props = defineProps({
  x: { type: Number, required: true }
})
```

- **Use `defineEmits` with TypeScript:**

```typescript
const emit = defineEmits<{
  cellClick: [x: number, y: number]
  shipPlaced: [ship: PlacedShip]
}>()
```

### 3.3 Template Rules

- **Use `v-bind` shorthand** (`:prop`) and **`v-on` shorthand** (`@event`).
- **Always use `:key` on `v-for`.** Keys must be unique and stable (not array index unless the list is static).
- **Prefer `<component>` or named slots** over deeply nested `v-if` chains.
- **No complex logic in templates.** Move anything beyond simple ternaries into computed properties.
- **Self-close components with no children:** `<ConnectionStatus />` not `<ConnectionStatus></ConnectionStatus>`.

### 3.4 Styling

- **Tailwind utilities in templates** are the default styling approach.
- **`<style scoped>`** for anything Tailwind can't express (animations, complex selectors).
- **No global styles** except in `main.css` for CSS custom properties and base resets.
- **No `!important`.** Fix specificity issues properly.
- **Responsive design:** Mobile-first. Use Tailwind breakpoints (`sm:`, `md:`, `lg:`).

---

## 4. State Management Rules

### 4.1 Pinia Store Guidelines

- **Stores own the state.** Components read via `storeToRefs()` and write via actions only.
- **Never mutate store state directly from components.** Always go through an action.
- **Actions can be async.** Use them for any operation that involves the relay or crypto.
- **Getters are for derived state.** They should be pure (no side effects).
- **Keep stores focused.** `useGameStore` handles game logic. `useConnectionStore` handles WebSocket state. They should not duplicate data.

```typescript
// ✅ Correct usage in a component
const gameStore = useGameStore()
const { myBoard, isMyTurn, phase } = storeToRefs(gameStore)

function handleClick(x: number, y: number) {
  gameStore.fireShot(x, y) // action
}

// ❌ Wrong — direct mutation
gameStore.isMyTurn = false
```

### 4.2 Cross-Store Communication

If `useGameStore` needs connection info, it imports `useConnectionStore` inside its actions — not at the module level. This avoids circular dependency issues.

---

## 5. Composable Rules

- **Composables encapsulate reusable logic**, not UI. They return refs, computed values, and functions.
- **Name pattern:** `use<Thing>.ts` → exports `function use<Thing>()`.
- **Composables should be framework-agnostic where possible.** `useRelay` wraps WebSocket logic. `useCrypto` wraps the Web Crypto API. Neither should import Vue components.
- **Cleanup:** Any composable that opens a connection or adds an event listener must clean up in `onUnmounted` or return a cleanup function.

```typescript
// ✅ Correct — cleanup on unmount
export function useRelay(roomId: string) {
  const ws = new WebSocket(url)

  onUnmounted(() => {
    ws.close()
  })

  return { send, on, connected }
}
```

---

## 6. Error Handling

- **Never silently swallow errors.** At minimum, log to console in development.
- **WebSocket errors:** Trigger reconnect logic in `useRelay`. Update `ConnectionStore` status.
- **Crypto errors:** If `subtle.crypto` is unavailable (e.g., non-HTTPS), show a user-facing error on the lobby screen. Do not attempt to play without anti-cheat.
- **Protocol errors (malformed messages):** Log and ignore. Do not crash the game. Show a warning if the opponent sends repeated malformed messages.
- **Validation errors (invalid shots, wrong phase):** Reject locally. Send an error message to the opponent if needed.

---

## 7. Testing Strategy

### 7.1 Unit Tests (Vitest)

- **Test all pure utility functions:** `board.ts`, `validation.ts`, `room-id.ts`.
- **Test store logic:** Create a test Pinia instance, call actions, assert state changes.
- **Test composable logic:** Mock WebSocket, assert message sending/receiving behavior.
- **Test crypto:** Verify commit-reveal round-trip (hash → reveal → verify).
- **Naming:** `<filename>.test.ts` co-located next to the source file.

### 7.2 Component Tests (Vitest + Vue Test Utils)

- **Test user interactions:** Ship placement, cell clicks, button states.
- **Test conditional rendering:** Correct phase shown, disabled states, error messages.
- **Mock stores and composables** — don't test through the real WebSocket.

### 7.3 Relay Tests (Vitest)

- **Test room creation, join, leave, cleanup.**
- **Test message forwarding:** Verify messages go to peers, not back to sender.
- **Test room limits:** Max 2 clients per room.
- **Test timeout/cleanup:** Rooms are cleaned up after inactivity.

### 7.4 E2E Tests (Playwright — future)

- **Full game flow:** Create room → join → setup → play → reveal → verify.
- **Two browser contexts simulating two players.**

---

## 8. Git Conventions

### 8.1 Branch Strategy

- `main` — production. Deploys to GitHub Pages on push.
- `develop` — integration branch for features.
- `feat/<name>` — feature branches off `develop`.
- `fix/<name>` — bugfix branches.

### 8.2 Commit Messages

Follow Conventional Commits:

```
feat: add ship placement drag-and-drop
fix: correct hit detection for vertical ships
refactor: extract board validation into utility
chore: update dependencies
docs: add protocol specification
```

### 8.3 Pull Request Rules

- All PRs target `develop` unless hotfixing production.
- PRs must pass lint, type-check, and all tests.
- PRs should be focused — one feature or fix per PR.

---

## 9. Dependency Policy

- **Minimize dependencies.** This is a small project; every dependency is a maintenance burden.
- **Frontend allowed:** Vue, Vue Router, Pinia, Tailwind CSS, nanoid (room IDs).
- **Relay allowed:** ws (or use Bun's built-in WebSocket).
- **No UI component libraries** (Vuetify, PrimeVue, etc.). The game UI is custom.
- **No state management middleware.** Pinia is sufficient.
- **Vet before adding:** Check bundle size impact, maintenance status, and whether the functionality can be implemented in < 50 lines.

---

## 10. Performance Rules

- **No watchers on large objects.** Watch specific properties, not entire store state.
- **Use `shallowRef` for the 10×10 board arrays** if re-rendering becomes an issue. Mutate and trigger manually.
- **Avoid `v-for` without `key`.**
- **Lazy-load the `GameView`** route. The lobby should load instantly.
- **No polling.** All communication is event-driven via WebSocket push.
- **Debounce rapid user actions** (e.g., accidental double-clicks on cells).
