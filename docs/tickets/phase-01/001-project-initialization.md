# Phase 01 — Ticket 001: Vite + Vue 3 + TypeScript Project Initialization

## Summary

Initializes the `app/` directory with a Vue 3 + TypeScript + Vite project. Creates `package.json` with all runtime and dev dependencies, Vite configuration with the GitHub Pages base path, strict TypeScript configuration, the app entry point with Pinia registered, a minimal root component, the environment variable template, and a favicon. After this ticket, `npm install && npm run dev` starts a working dev server and `npm run build` produces an error-free production build.

## Prerequisites

None. This is the first ticket in Phase 1 and the first ticket in the project.

## Scope

**In scope:**

- `app/package.json` with all runtime and dev dependencies and npm scripts (`dev`, `build`, `preview`, `type-check`)
- `app/index.html` — HTML entry point with Vite script tag and `<div id="app">`
- `app/vite.config.ts` — Vite config with `@vitejs/plugin-vue` plugin and `base` path for GitHub Pages
- `app/tsconfig.json` — Strict TypeScript configuration per `docs/03-CODING-STANDARDS.md` Section 2.1
- `app/tsconfig.app.json` — TypeScript config for `src/` application code
- `app/tsconfig.node.json` — TypeScript config for `vite.config.ts`
- `app/src/vite-env.d.ts` — Vite client types and `ImportMetaEnv` interface declaration
- `app/src/main.ts` — Creates Vue app and installs Pinia
- `app/src/App.vue` — Minimal root component with placeholder content
- `app/.env.example` — Environment variable template
- `app/public/favicon.svg` — Application favicon

**Out of scope:**

- Tailwind CSS configuration — Ticket 002
- ESLint and Prettier configuration files — Ticket 003
- Vue Router setup and stub views — Ticket 004
- `lint` and `format` npm scripts — Ticket 003 adds these to `package.json`
- Any game types, constants, or logic — Phase 2+

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/package.json` | Create | Project metadata, npm scripts, all runtime and dev dependencies |
| `app/index.html` | Create | HTML entry point referencing `src/main.ts` |
| `app/vite.config.ts` | Create | Vite config with Vue plugin and `base` path |
| `app/tsconfig.json` | Create | Root TypeScript config with project references |
| `app/tsconfig.app.json` | Create | TypeScript config for application source code |
| `app/tsconfig.node.json` | Create | TypeScript config for Vite/Node config files |
| `app/src/vite-env.d.ts` | Create | Vite client type declarations and `ImportMetaEnv` |
| `app/src/main.ts` | Create | App entry point — creates Vue app, installs Pinia |
| `app/src/App.vue` | Create | Root component with placeholder content |
| `app/.env.example` | Create | Environment variable template |
| `app/public/favicon.svg` | Create | Application favicon (simple ship/anchor icon) |

Note: All files are trivially small configuration or boilerplate. They form an indivisible unit — the minimum set required for the project to compile and run.

## Requirements

### `package.json`

- `name`: `"sea-strike"`
- `private`: `true`
- `type`: `"module"`
- Scripts:
  - `"dev"`: `"vite"`
  - `"build"`: `"vue-tsc -b && vite build"`
  - `"preview"`: `"vite preview"`
  - `"type-check"`: `"vue-tsc -b --noEmit"`
- Runtime dependencies (per `docs/03-CODING-STANDARDS.md` Section 9):
  - `vue` (^3.5)
  - `vue-router` (^4)
  - `pinia` (^2)
  - `nanoid` (^5)
- Dev dependencies (minimum required set):
  - `typescript` (^5)
  - `vite` (^6)
  - `@vitejs/plugin-vue`
  - `vue-tsc`
  - `@vue/tsconfig`
  - Tailwind CSS packages (installed now, configured in Ticket 002)
  - ESLint and Prettier packages (installed now, configured in Ticket 003)

The agent must run `npm install` after creating `package.json` to generate `package-lock.json`.

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sea Strike</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### `vite.config.ts`

```typescript
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/sea-strike/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

Key requirements:
- `base` must be set to `'/sea-strike/'` for GitHub Pages deployment (see `docs/04-AI-ASSISTANT-GUIDE.md` Phase 1 step 3, `docs/02-ARCHITECTURE.md` Section 6.4).
- The `@` alias must resolve to `src/` for clean imports.
- Uses `@vitejs/plugin-vue`.

### `tsconfig.json`

Root config using project references pattern:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

### `tsconfig.app.json`

Must include these strict settings per `docs/03-CODING-STANDARDS.md` Section 2.1:

```json
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue", "src/vite-env.d.ts"],
  "exclude": ["src/**/__tests__/*"]
}
```

### `tsconfig.node.json`

```json
{
  "extends": "@tsconfig/node20/tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["vite.config.ts"]
}
```

Note: If `@tsconfig/node20` is not available, use `@vue/tsconfig/tsconfig.node.json` or set the options manually.

### `src/vite-env.d.ts`

Per the phase overview Interfaces & Contracts section:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_URL: string
  readonly VITE_ROOM_ID_LENGTH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### `src/main.ts`

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
```

Note: Vue Router will be added by Ticket 004. Style imports will be added by Ticket 002. For now, just Pinia.

### `src/App.vue`

Minimal root component. Must use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.1:

```vue
<script setup lang="ts">
</script>

<template>
  <div>
    <h1>Sea Strike</h1>
    <p>App shell loaded.</p>
  </div>
</template>
```

This content will be replaced by Ticket 004 (adds `<RouterView />`).

### `.env.example`

Per `docs/02-ARCHITECTURE.md` Section 6.5:

```
VITE_RELAY_URL=wss://relay.yourdomain.com
VITE_ROOM_ID_LENGTH=8
```

### `public/favicon.svg`

A simple SVG favicon. Can be a minimal ship, anchor, or crosshair icon. Keep it under 1 KB.

## Acceptance Criteria

- [ ] Running `npm install` in `app/` completes with no errors
- [ ] Running `npm run dev` starts the Vite dev server and the app loads at `http://localhost:5173` without console errors
- [ ] Running `npm run build` produces a `dist/` directory with no TypeScript errors
- [ ] Running `npm run type-check` passes with no errors
- [ ] `tsconfig.app.json` enables `strict: true` and `noUncheckedIndexedAccess: true` per `docs/03-CODING-STANDARDS.md` Section 2.1
- [ ] `vite.config.ts` sets `base: '/sea-strike/'`
- [ ] `.env.example` contains both `VITE_RELAY_URL` and `VITE_ROOM_ID_LENGTH`

## Notes for the Agent

1. **Do not use `create-vue` or any scaffolding CLI.** Create all files manually so every line is intentional and matches the specification.
2. **Install ALL dependencies** (including Tailwind, ESLint, Prettier packages) in this ticket's `package.json`. Tickets 002 and 003 only create configuration files — they do not modify `package.json` to add dependencies. This avoids multiple `npm install` cycles.
3. **Dev dependencies for Tailwind:** Include `tailwindcss`, `@tailwindcss/postcss` (or `@tailwindcss/vite` if using the Vite plugin approach), and `autoprefixer`.
4. **Dev dependencies for ESLint/Prettier:** Include `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-vue`, `eslint-config-prettier`, and `prettier`.
5. **The `base` path is hardcoded** to `/sea-strike/`. This is the expected repository name. It can be changed later if the repo name differs.
6. **Do not add a `<RouterView />`** to `App.vue` — that happens in Ticket 004. The app should render the static placeholder for now.
7. **Do not import any CSS files** in `main.ts` — that happens in Ticket 002.
8. **The `type-check` script uses `vue-tsc -b --noEmit`** to run a build-mode type check that also checks `.vue` files. This is distinct from `tsc --noEmit`.
9. Refer to `docs/03-CODING-STANDARDS.md` Section 2.1 for the full list of required `tsconfig` strict options.
10. Refer to `docs/02-ARCHITECTURE.md` Section 2.1 for the expected directory structure.
