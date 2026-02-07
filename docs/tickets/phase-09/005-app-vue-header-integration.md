# Phase 09 — Ticket 005: Add AppHeader to App.vue Root Layout

## Summary

Modify `App.vue` to import and render the `AppHeader` component above the `<RouterView>`. This ensures the header with the "Sea Strike" title appears on every page (lobby, game, not-found). After this ticket, the app has a persistent header across all routes, completing the Phase 9 lobby UI.

## Prerequisites

- **Phase 1 complete.** `app/src/App.vue` exists with `<RouterView />`.
- **Ticket 001 complete.** `app/src/components/shared/AppHeader.vue` exists and renders the app title.

## Scope

**In scope:**

- `app/src/App.vue` — add `AppHeader` import and render it above `<RouterView />`

**Out of scope:**

- `AppHeader.vue` implementation — ticket 001 (already complete)
- `ConnectionStatus.vue` inside the header — Phase 13
- `LobbyView.vue` layout — ticket 004
- Any page-specific content — handled by individual views

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/App.vue` | Modify | Import and render AppHeader above RouterView |

## Requirements

### Current State

The current `App.vue` is a minimal stub:

```vue
<script setup lang="ts"></script>

<template>
  <RouterView />
</template>
```

### Modified Structure

After this ticket, `App.vue` should:

1. Import `AppHeader` in the `<script setup>` block.
2. Render `<AppHeader />` above `<RouterView />` in the template.
3. Wrap both in a layout container if needed for proper full-height behavior.

### Import

```typescript
import AppHeader from './components/shared/AppHeader.vue'
```

### Template

The template should render the header and router view in a vertical layout:

```vue
<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
```

Key layout decisions:
- The outer `<div>` uses `min-h-screen flex flex-col` to ensure the layout fills the viewport height.
- `<AppHeader />` sits at the top and takes its natural height.
- The `<main>` element with `flex-1` expands to fill the remaining vertical space, allowing views like `LobbyView` to center content within the available area.
- The `<main>` tag provides semantic HTML structure.

### Styling

- Use Tailwind utility classes only.
- No `<style scoped>` block needed.
- The background color of the page body should remain consistent (set in `main.css` or Tailwind config — do not override here).

### Impact on Existing Views

After this change, `LobbyView` will render inside the `<main>` area below the header. The `LobbyView`'s `min-h-screen` centering from ticket 004 should be adjusted to work within the `flex-1` container rather than the full viewport. This means `LobbyView` should use `flex-1` or `min-h-full` instead of `min-h-screen` for vertical centering. Coordinate with ticket 004 — if ticket 004 uses `min-h-screen`, the agent implementing this ticket should update `LobbyView`'s outer container to use `flex flex-1 items-center justify-center` instead of `min-h-screen`.

## Acceptance Criteria

- [ ] `App.vue` imports and renders `AppHeader` above `<RouterView />`
- [ ] The header ("Sea Strike") is visible on the lobby page (`/#/`)
- [ ] The header is visible on the game page (`/#/game/test1234`)
- [ ] The header is visible on the not-found page (`/#/nonexistent`)
- [ ] Views render below the header in the remaining viewport space
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run build` produces no errors

## Notes for the Agent

- **You are modifying an existing file.** Read `app/src/App.vue` before editing. The current content is minimal (just `<RouterView />`), so the change is straightforward.
- **Coordinate with ticket 004 on vertical centering.** If `LobbyView` was written with `min-h-screen` for centering, it needs to be updated to work within the flex layout. The `<main class="flex-1">` container means views should center within `flex-1` space, not the full viewport. Update `LobbyView`'s container to `class="flex flex-1 flex-col items-center justify-center"` if needed.
- **Do not add `<RouterView>` import.** Vue Router's `<RouterView>` is globally registered by the router plugin and does not need an explicit import.
- **Keep the `<script setup lang="ts">` block.** Even though it only has one import now, maintain the TypeScript lang attribute for consistency (see `docs/03-CODING-STANDARDS.md` Section 3.2).
- **No tests required for this ticket.** The change is a simple template integration. The acceptance criteria can be verified by running the dev server and checking each route, or by running `npm run build` for a compilation check. The `AppHeader` component itself has no tests since it's purely presentational (ticket 001), and the layout integration is trivially verifiable.
