# Phase 01 — Ticket 004: Vue Router with Hash History and Stub Views

## Summary

Creates the Vue Router configuration using `createWebHashHistory` for GitHub Pages compatibility, defines three routes (lobby, game, catch-all 404), and implements stub view components for each. Wires the router into the Vue app and adds `<RouterView />` to the root component. After this ticket, navigating to `/#/`, `/#/game/<roomId>`, and any unmatched path renders the correct stub view with the proper props.

## Prerequisites

- **Ticket 001** must be complete (Vue app with Pinia must be running).
- **Ticket 002** is recommended so Tailwind classes are available for stub views, but not required.
- **Ticket 003** is recommended so the new files pass lint, but not required.

## Scope

**In scope:**

- `src/router/index.ts` — Router configuration with hash history and three route definitions
- `src/views/LobbyView.vue` — Stub lobby page
- `src/views/GameView.vue` — Stub game page that accepts and displays a `roomId` route param as a prop
- `src/views/NotFoundView.vue` — Stub 404 page with link to lobby
- Modify `src/main.ts` to install the router plugin
- Modify `src/App.vue` to render `<RouterView />`

**Out of scope:**

- Real lobby UI (Create/Join room components) — Phase 9
- Real game UI (board, setup, battle) — Phases 10–12
- Navigation guards or route middleware — Phase 6+
- Connection logic or WebSocket integration — Phase 6
- Any game types, stores, or business logic — Phases 2–4

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/router/index.ts` | Create | Vue Router with hash history, three route definitions |
| `app/src/views/LobbyView.vue` | Create | Stub lobby page |
| `app/src/views/GameView.vue` | Create | Stub game page with `roomId` prop |
| `app/src/views/NotFoundView.vue` | Create | Stub 404 page |
| `app/src/main.ts` | Modify | Import and install router |
| `app/src/App.vue` | Modify | Replace placeholder with `<RouterView />` |

## Requirements

### `src/router/index.ts`

Must match the contract defined in the phase overview (`docs/phases/phase-01-project-scaffolding.md` Section 6):

```typescript
import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'lobby',
    component: () => import('../views/LobbyView.vue'),
  },
  {
    path: '/game/:roomId',
    name: 'game',
    component: () => import('../views/GameView.vue'),
    props: true,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
```

Key requirements:
- **Hash history is mandatory.** GitHub Pages does not support SPA fallback, so `createWebHashHistory` is required (see `docs/04-AI-ASSISTANT-GUIDE.md` Decision Log, `docs/02-ARCHITECTURE.md` Section 6.4).
- **All views use lazy loading** via `() => import(...)` for route-level code splitting (see `docs/03-CODING-STANDARDS.md` Section 10).
- **The game route uses `props: true`** to pass the `roomId` param as a component prop.
- **The catch-all route** uses `/:pathMatch(.*)*` syntax (Vue Router 4 pattern) to match all unmatched paths.
- **Route names** must be `'lobby'`, `'game'`, and `'not-found'` — these will be referenced by programmatic navigation in later phases.
- The `createWebHashHistory()` call must not pass a `base` argument — the Vite `base` config handles asset paths, and hash history operates on the fragment.

### `src/views/LobbyView.vue`

Stub component per `docs/03-CODING-STANDARDS.md` Section 3.1 (component structure) and `docs/04-AI-ASSISTANT-GUIDE.md` Section 5.1 (component template):

```vue
<script setup lang="ts">
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <h1 class="text-3xl font-bold mb-4">Sea Strike</h1>
    <p class="text-gray-400">Lobby — Create or join a game</p>
  </div>
</template>
```

Requirements:
- Must use `<script setup lang="ts">`.
- Content is placeholder only — the real lobby UI is Phase 9.
- If Tailwind is not yet configured (Ticket 002 incomplete), plain HTML without classes is acceptable.

### `src/views/GameView.vue`

Must accept the `roomId` route param as a prop, per the phase overview contract:

```vue
<script setup lang="ts">
const props = defineProps<{
  roomId: string
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <h1 class="text-3xl font-bold mb-4">Sea Strike</h1>
    <p class="text-gray-400">Game Room: {{ roomId }}</p>
  </div>
</template>
```

Requirements:
- **Must use `defineProps<{ roomId: string }>()`** with TypeScript generics, not runtime prop declaration (see `docs/03-CODING-STANDARDS.md` Section 3.2, `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.2).
- The `roomId` value must come from the route parameter via `props: true` on the route definition.
- Must display the `roomId` somewhere in the template so it can be visually verified.
- Content is placeholder only — the real game UI spans Phases 10–12.

### `src/views/NotFoundView.vue`

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <h1 class="text-3xl font-bold mb-4">Page Not Found</h1>
    <RouterLink to="/" class="text-blue-400 hover:underline">
      Back to Lobby
    </RouterLink>
  </div>
</template>
```

Requirements:
- Must include a `<RouterLink>` back to the lobby (`/`).
- Must use `<script setup lang="ts">`.

### `src/main.ts` modification

Import and install the router alongside the existing Pinia setup:

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
```

The CSS import from Ticket 002 (if present) should remain. The router import is added alongside it.

### `src/App.vue` modification

Replace the placeholder content with `<RouterView />`:

```vue
<script setup lang="ts">
</script>

<template>
  <RouterView />
</template>
```

This is the final form of `App.vue` for Phase 1. Future phases may add a persistent `<AppHeader />` or `<ConnectionStatus />` wrapper around the `<RouterView />`.

## Acceptance Criteria

- [ ] Navigating to `/#/` in the browser renders the LobbyView stub content (e.g., "Sea Strike" and "Lobby")
- [ ] Navigating to `/#/game/test123` renders the GameView stub content showing `roomId` as `"test123"`
- [ ] Navigating to `/#/game/abc` renders the GameView stub content showing `roomId` as `"abc"`
- [ ] Navigating to `/#/nonexistent` renders the NotFoundView with a "Back to Lobby" link
- [ ] Clicking the "Back to Lobby" link on the 404 page navigates to `/#/`
- [ ] All three view components use lazy loading (`() => import(...)`) in the route definitions
- [ ] `npm run build` passes with no errors
- [ ] `npm run type-check` passes with no errors

## Notes for the Agent

1. **Do not pass a `base` argument to `createWebHashHistory()`.** With hash mode, all routing is in the URL fragment (`#/path`). The Vite `base` config only affects asset paths, not routing.
2. **`props: true` on the game route** is critical — it passes the `:roomId` route parameter as a component prop. Without this, the `roomId` prop would be `undefined` in `GameView.vue`.
3. **Test route navigation manually** after implementation by visiting each URL in the browser. The routes should work with direct navigation (typing the URL), not just programmatic navigation.
4. **The route names (`'lobby'`, `'game'`, `'not-found'`)** will be used in later phases for programmatic navigation (`router.push({ name: 'game', params: { roomId } })`). Do not change them.
5. **Route-level code splitting:** Using `() => import(...)` instead of static imports ensures each view is a separate chunk. This is required per `docs/03-CODING-STANDARDS.md` Section 10 ("Lazy-load the GameView route").
6. Per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4: Do not put business logic in components. These stubs should contain zero logic — they are pure templates. Logic comes in Phases 4+ (stores, composables).
7. **If Ticket 003 (ESLint) is complete,** run `npm run lint` after creating all files and fix any issues. If Ticket 003 is not complete, proceed — lint fixes can happen when Ticket 003 is done.
8. Refer to `docs/05-PROTOCOL-SPEC.md` Section 3.1 for the URL format that will eventually use this route: `https://<user>.github.io/<repo>/#/game/k7m2x9pq`.
