# Phase 1: Project Scaffolding

## 1. Objective

Initialize the Vue 3 + TypeScript + Vite project with all essential tooling, configuration, and stub views in place. Before this phase, the `app/` directory does not exist. After this phase, a fully configured frontend skeleton compiles, runs a dev server, renders Tailwind styles, and routes between stub views — ready for types and logic to be layered on.

## 2. Prerequisites

None. This is the first phase.

## 3. Scope

### In Scope

- Scaffold the Vue 3 + TypeScript + Vite project inside `app/`.
- Install all allowed frontend dependencies: `vue`, `vue-router`, `pinia`, `tailwindcss`, `nanoid` (see `docs/03-CODING-STANDARDS.md` Section 9).
- Configure `vite.config.ts` with `base: '/<repo-name>/'` for GitHub Pages deployment (see `docs/04-AI-ASSISTANT-GUIDE.md` Phase 1 step 3).
- Configure Vue Router with `createWebHashHistory` for GitHub Pages compatibility (see `docs/04-AI-ASSISTANT-GUIDE.md` Decision Log).
- Set up Tailwind CSS 4.x with `postcss.config.js` and `tailwind.config.ts`.
- Set up ESLint 9.x (flat config) + Prettier 3.x.
- Create `.env.example` with `VITE_RELAY_URL` and `VITE_ROOM_ID_LENGTH` (see `docs/02-ARCHITECTURE.md` Section 6.5).
- Create stub views: `LobbyView.vue`, `GameView.vue`, `NotFoundView.vue` with minimal placeholder content.
- Create `App.vue` with `<RouterView />` and `main.ts` entry point.
- Create `main.css` and `variables.css` in `assets/styles/`.
- Create `public/favicon.svg`.

### Out of Scope

- Game types and constants — Phase 2.
- Board utility functions — Phase 3.
- Pinia store implementations — Phase 4.
- Relay server setup — Phase 5.
- Any real component UI — Phases 9–12.
- GitHub Actions deployment workflow — Phase 13.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/package.json` | Create | Project metadata, scripts (`dev`, `build`, `lint`, `type-check`), and dependencies |
| `app/index.html` | Create | HTML entry point with Vite script tag |
| `app/vite.config.ts` | Create | Vite config with `base` path for GitHub Pages and Vue plugin |
| `app/tsconfig.json` | Create | Strict TypeScript configuration per `docs/03-CODING-STANDARDS.md` Section 2.1 |
| `app/tailwind.config.ts` | Create | Tailwind CSS configuration with content paths |
| `app/postcss.config.js` | Create | PostCSS config for Tailwind |
| `app/.env.example` | Create | Environment variable template (`VITE_RELAY_URL`, `VITE_ROOM_ID_LENGTH`) |
| `app/public/favicon.svg` | Create | Application favicon |
| `app/src/main.ts` | Create | App entry point — creates Vue app, installs Router and Pinia |
| `app/src/App.vue` | Create | Root component with `<RouterView />` |
| `app/src/router/index.ts` | Create | Vue Router setup with hash history and route definitions |
| `app/src/views/LobbyView.vue` | Create | Stub lobby page |
| `app/src/views/GameView.vue` | Create | Stub game page (accepts `roomId` route param) |
| `app/src/views/NotFoundView.vue` | Create | Stub 404 page |
| `app/src/assets/styles/main.css` | Create | Global styles, Tailwind directives, CSS custom properties |
| `app/src/assets/styles/variables.css` | Create | CSS custom properties for theme values |

## 5. Key Design Decisions

1. **Hash-mode routing:** Vue Router must use `createWebHashHistory` because GitHub Pages does not support SPA fallback routing. Direct navigation to `/#/game/abc123` must work without a 404 (see `docs/04-AI-ASSISTANT-GUIDE.md` Decision Log, `docs/02-ARCHITECTURE.md` Section 6.4).

2. **`base` path configuration:** `vite.config.ts` must set `base: '/<repo-name>/'` so that all asset paths are correct when deployed to `https://<user>.github.io/<repo>/` (see `docs/04-AI-ASSISTANT-GUIDE.md` Phase 1 step 3).

3. **Strict TypeScript:** `tsconfig.json` must enable `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, and `forceConsistentCasingInFileNames: true` (see `docs/03-CODING-STANDARDS.md` Section 2.1).

4. **Tailwind as sole styling approach:** No component libraries. Tailwind utility classes in templates are the primary styling method (see `docs/03-CODING-STANDARDS.md` Section 3.4, `docs/04-AI-ASSISTANT-GUIDE.md` Decision Log).

5. **Minimal dependencies:** Only `vue`, `vue-router`, `pinia`, `tailwindcss`, and `nanoid` are allowed as frontend runtime dependencies (see `docs/03-CODING-STANDARDS.md` Section 9).

6. **`GameView` route parameter:** The router must define a route `/game/:roomId` so that shared links work. The `roomId` param is extracted in `GameView.vue` (see `docs/05-PROTOCOL-SPEC.md` Section 3.1 for URL format).

## 6. Interfaces & Contracts

### Router Route Definitions

```typescript
// app/src/router/index.ts
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
```

### GameView Props

```typescript
// app/src/views/GameView.vue
const props = defineProps<{
  roomId: string
}>()
```

### Environment Types

```typescript
// Vite env typing (in env.d.ts or vite-env.d.ts)
interface ImportMetaEnv {
  readonly VITE_RELAY_URL: string
  readonly VITE_ROOM_ID_LENGTH: string
}
```

## 7. Acceptance Criteria

1. Running `npm install` in `app/` completes without errors.
2. Running `npm run dev` starts the Vite dev server and the app loads in a browser without errors.
3. Running `npm run build` produces a production build with no TypeScript errors.
4. Navigating to `/#/` renders the `LobbyView` stub content.
5. Navigating to `/#/game/test123` renders the `GameView` stub content and the `roomId` prop is `"test123"`.
6. Navigating to `/#/nonexistent` renders the `NotFoundView` stub content.
7. A Tailwind utility class (e.g., `class="text-blue-500"`) renders correctly in the browser.
8. Running `npm run lint` produces no ESLint errors.
9. The `.env.example` file contains `VITE_RELAY_URL` and `VITE_ROOM_ID_LENGTH`.
10. `GameView` uses lazy loading (`() => import(...)`) for route-level code splitting (see `docs/03-CODING-STANDARDS.md` Section 10).

## 8. Dependencies Between Phases

### Provides to Future Phases

- **Project structure and tooling** used by all subsequent phases.
- **Router with `/game/:roomId`** route used by Phase 9 (Lobby UI) for navigation and Phase 6 (Connection Composable) for room ID extraction.
- **Pinia installed and registered** — Phases 4+ define stores.
- **Tailwind configured** — Phases 9–13 use it for all UI styling.
- **`.env.example` with `VITE_RELAY_URL`** — Phase 6 reads this to connect to the relay.

### Boundaries

- Future phases should NOT modify `vite.config.ts`, `tsconfig.json`, or `tailwind.config.ts` unless strictly necessary and documented.
- The stub views created here will be replaced with real implementations in Phases 9–12. Do not add any game logic or real UI to stubs in this phase.
