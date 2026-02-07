# Phase 01 — Ticket 002: Tailwind CSS and Global Styles

## Summary

Configures Tailwind CSS for the Vue 3 + Vite project. Creates the PostCSS configuration (or Vite plugin setup), the global stylesheet with Tailwind directives, and a CSS custom properties file for theme values. Imports the stylesheet into the app entry point. After this ticket, Tailwind utility classes render correctly in the browser.

## Prerequisites

- **Ticket 001** must be complete. The project must be initialized with all dependencies installed (Tailwind packages are already in `package.json` from Ticket 001).

## Scope

**In scope:**

- Tailwind CSS configuration file (`tailwind.config.ts`)
- PostCSS configuration (`postcss.config.js`)
- Global stylesheet (`src/assets/styles/main.css`) with Tailwind directives
- CSS custom properties file (`src/assets/styles/variables.css`) for theme values
- Import the global stylesheet in `src/main.ts`
- Add a Tailwind utility class to `src/App.vue` to verify rendering

**Out of scope:**

- Component-specific styles — Phases 9–12
- Responsive breakpoint testing — Phase 13
- Full theme design or color palette — future phases decide this
- ESLint configuration — Ticket 003

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/tailwind.config.ts` | Create | Tailwind configuration with content paths |
| `app/postcss.config.js` | Create | PostCSS configuration with Tailwind plugin |
| `app/src/assets/styles/main.css` | Create | Tailwind directives, base resets, variables import |
| `app/src/assets/styles/variables.css` | Create | CSS custom properties for theme values |
| `app/src/main.ts` | Modify | Add `import './assets/styles/main.css'` |
| `app/src/App.vue` | Modify | Add a Tailwind utility class for visual verification |

## Requirements

### Tailwind CSS Version Note

The project specifies Tailwind CSS 4.x (`docs/03-CODING-STANDARDS.md` Section 1). Tailwind v4 changed its configuration approach:

- **Tailwind v4 with Vite:** Use `@tailwindcss/vite` plugin (preferred for Vite projects) OR `@tailwindcss/postcss` as a PostCSS plugin.
- **Tailwind v4 CSS-first config:** Configuration uses `@theme` directives in CSS instead of a JavaScript/TypeScript config file.

The phase overview (`docs/phases/phase-01-project-scaffolding.md` Section 3) specifies creating `tailwind.config.ts` and `postcss.config.js`. The agent should follow the Tailwind v4 configuration approach appropriate for the installed version. If Tailwind v4 does not use a `tailwind.config.ts`, create the equivalent CSS-based configuration and note the deviation.

### `tailwind.config.ts` (if Tailwind v3-style config is used)

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

### `postcss.config.js` (if PostCSS approach is used)

For Tailwind v4 with PostCSS:

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

For Tailwind v3 (fallback):

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Alternative — Vite plugin approach (Tailwind v4):**

If using `@tailwindcss/vite` instead of PostCSS, add the plugin to `vite.config.ts` and `postcss.config.js` may not be needed. In this case, modify `vite.config.ts` to include the Tailwind Vite plugin.

### `src/assets/styles/main.css`

For Tailwind v4:

```css
@import 'tailwindcss';
@import './variables.css';

/* Base resets and global styles */
/* Per docs/03-CODING-STANDARDS.md Section 3.4: No global styles except in main.css */
```

For Tailwind v3 (fallback):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import './variables.css';
```

Requirements:
- Must import Tailwind layers (base, components, utilities — however the installed version expresses this).
- Must import `variables.css`.
- May include minimal base resets (e.g., box-sizing, font smoothing) if Tailwind's preflight does not cover them.
- Per `docs/03-CODING-STANDARDS.md` Section 3.4: This is the only file where global styles are allowed.

### `src/assets/styles/variables.css`

CSS custom properties for theme values. For now, define the structure with placeholder values:

```css
:root {
  /* Colors — will be refined in UI phases */
  --color-ocean: #0a1628;
  --color-water: #1e3a5f;
  --color-hit: #ef4444;
  --color-miss: #94a3b8;
  --color-ship: #475569;

  /* Grid */
  --grid-cell-size: 2.5rem;
  --grid-gap: 1px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}
```

These are placeholder values. Future UI phases will refine them. The important thing is that the file exists and is imported, establishing the pattern for theme customization.

### `src/main.ts` modification

Add the style import before the app mount. The import must come before the Vue app creation so styles are available immediately:

```typescript
import './assets/styles/main.css'  // Add this line

import { createApp } from 'vue'
// ... rest of main.ts
```

### `src/App.vue` modification

Add at least one Tailwind utility class to the template to verify that Tailwind is rendering correctly:

```vue
<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <h1 class="text-2xl font-bold p-4">Sea Strike</h1>
    <p class="px-4 text-gray-400">App shell loaded.</p>
  </div>
</template>
```

The specific classes don't matter — they will be replaced by Ticket 004. The point is to have a visible confirmation that Tailwind is processing classes.

## Acceptance Criteria

- [ ] A Tailwind utility class (e.g., `text-2xl`, `bg-gray-900`) renders correctly in the browser when running `npm run dev`
- [ ] `npm run build` passes with no errors
- [ ] `src/assets/styles/main.css` exists and contains Tailwind imports/directives
- [ ] `src/assets/styles/variables.css` exists and defines CSS custom properties
- [ ] `main.ts` imports `main.css`
- [ ] Custom properties from `variables.css` are accessible in the browser (inspectable via DevTools on the `:root` element)

## Notes for the Agent

1. **Check the installed Tailwind version first.** Run `npm ls tailwindcss` in the `app/` directory to see which version was installed by Ticket 001. This determines whether to use v3-style or v4-style configuration.
2. **Tailwind v4 does not use `tailwind.config.ts` by default.** If using Tailwind v4, configure via CSS `@theme` directives instead. The phase overview's file list assumes a config file, but the agent should follow the actual version's documentation. If the config file approach differs, note it in a comment at the top of the relevant file.
3. **If using the `@tailwindcss/vite` plugin approach,** the agent needs to also modify `vite.config.ts` to add the Tailwind plugin. This is acceptable even though `vite.config.ts` was created in Ticket 001 — adding a plugin is a minimal, focused change.
4. **Do not add component-specific styles.** The styles in `App.vue` are purely for verification and will be replaced.
5. **`postcss.config.js` uses `.js` extension** (not `.ts`) because PostCSS config is typically plain JS. Use `export default` (ESM) since `package.json` has `"type": "module"`.
6. Per `docs/03-CODING-STANDARDS.md` Section 3.4: No `!important`. No global styles except in `main.css`.
7. Per `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6: Design mobile-first. The game board must be playable on 375px width. This ticket just sets up infrastructure — mobile-first responsive design is implemented in UI phases.
