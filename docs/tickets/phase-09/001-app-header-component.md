# Phase 09 — Ticket 001: AppHeader Shared Component

## Summary

Create the `AppHeader.vue` shared component that renders the app title "Sea Strike" in a header bar. This is a simple, self-contained presentational component with no props and no store dependencies. After this ticket, the header component exists and compiles cleanly, ready to be placed in `App.vue` (ticket 005) and extended with `ConnectionStatus` in Phase 13.

## Prerequisites

- **Phase 1 complete.** Tailwind CSS configured, Vue 3 project scaffolded.
- `app/src/components/shared/` directory may not exist yet — create it.

## Scope

**In scope:**

- `app/src/components/shared/AppHeader.vue` — header component displaying "Sea Strike" title
- Tailwind-styled responsive header bar
- `<script setup lang="ts">` with no props, no emits, no store access

**Out of scope:**

- `ConnectionStatus.vue` widget inside the header — Phase 13
- Adding `AppHeader` to `App.vue` root layout — ticket 005
- Navigation links or routing — not needed in v1

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/shared/AppHeader.vue` | Create | App header component with title |

## Requirements

### Component Contract

```typescript
// No props needed for v1
// No emits
// Phase 13 will add ConnectionStatus as a child
```

As specified in `docs/phases/phase-09-ui-lobby.md` Section 6.

### Template Structure

The component renders a `<header>` element containing:

1. The app title text "Sea Strike" in a prominent heading element (`<h1>`).
2. The header should be styled as a horizontal bar at the top of the page.
3. Use Tailwind utility classes for all styling (see `docs/03-CODING-STANDARDS.md` Section 3.4).
4. Mobile-first design — text should be readable on a 375px viewport (iPhone SE).

### Styling Requirements

- Background: use a dark or themed background that contrasts with the page body (e.g., `bg-gray-800` or similar dark tone consistent with a naval/ocean theme).
- Text: white or light-colored, bold, appropriately sized (`text-xl` or `text-2xl`).
- Padding: sufficient horizontal and vertical padding for comfortable spacing (`px-4 py-3` or similar).
- The header should span the full width of the viewport.
- No `<style scoped>` block needed — Tailwind utilities in the template are sufficient.

### Vue Conventions

- Use `<script setup lang="ts">` (see `docs/03-CODING-STANDARDS.md` Section 3.2).
- The script block will be empty since there are no props, emits, state, or logic.
- Single root element in the template (the `<header>`).

## Acceptance Criteria

- [ ] File exists at `app/src/components/shared/AppHeader.vue`
- [ ] Component uses `<script setup lang="ts">`
- [ ] Template renders a `<header>` element containing the text "Sea Strike"
- [ ] All styling uses Tailwind utility classes (no `<style>` block required)
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run build` produces no errors

## Notes for the Agent

- **Keep it simple.** This is a presentational-only component with zero logic. Do not add props, emits, store access, or any interactivity. Phase 13 will extend this component to include `ConnectionStatus`.
- **Do not add navigation links.** The header is just a title bar for now.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for component structure: `<script setup lang="ts">`, then `<template>`, then optionally `<style scoped>` (not needed here).
- **Create the `shared/` directory** if it doesn't exist. The architecture doc (`docs/02-ARCHITECTURE.md`) specifies `app/src/components/shared/` as the location for shared components.
- **Mobile-first:** Ensure the header looks good on small screens. Use responsive Tailwind classes if needed, but a simple centered or left-aligned title with appropriate padding is sufficient.
