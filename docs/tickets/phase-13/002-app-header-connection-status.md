# Phase 13 — Ticket 002: AppHeader Connection Status Integration

## Summary

Wire the `ConnectionStatus.vue` component into the existing `AppHeader.vue` so the connection indicator is persistently visible on every page. This fulfills the requirement from `docs/phases/phase-13-polish-deploy.md` Section 5 (Decision 1) and US-10 from `docs/01-PRD.md` that the connection status is "always visible regardless of which view/phase the player is in." When done, the agent should have an updated AppHeader that renders ConnectionStatus, verified by tests.

## Prerequisites

- **Ticket 001 complete.** `app/src/components/shared/ConnectionStatus.vue` exists and is functional.
- **Phase 9 complete.** `app/src/components/shared/AppHeader.vue` exists (created in Phase 9).

Specific file dependencies:
- `app/src/components/shared/ConnectionStatus.vue` — the component to integrate (Ticket 001)
- `app/src/components/shared/AppHeader.vue` — the header component to modify (Phase 9)

## Scope

**In scope:**

- Modify `app/src/components/shared/AppHeader.vue` to:
  - Import and render `ConnectionStatus` component
  - Position it on the right side of the header bar
  - Ensure it doesn't break existing header layout or navigation
- Update `app/src/components/shared/AppHeader.test.ts` (if it exists) to verify ConnectionStatus is rendered

**Out of scope:**

- Creating ConnectionStatus itself — Ticket 001
- Reconnection overlay — Ticket 003
- Modifying `App.vue` or header mounting — already done in Phase 9 (Ticket 005)
- Any changes to the connection store — finalized in Phase 4/6

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/shared/AppHeader.vue` | Modify | Add ConnectionStatus component import and render |
| `app/src/components/shared/AppHeader.test.ts` | Modify | Add test verifying ConnectionStatus is rendered (if test file exists; create if not) |

## Requirements

### Import and Render ConnectionStatus

Add the import and render the component in the header's template:

```typescript
import ConnectionStatus from './ConnectionStatus.vue'
```

Position `ConnectionStatus` on the right side of the header using Tailwind flex utilities. The header should use `flex items-center justify-between` (or similar) to space the title/logo on the left and the connection indicator on the right.

Example structure:

```html
<header class="flex items-center justify-between px-4 py-2 ...existing-classes">
  <!-- Existing header content (title, nav, etc.) -->
  <ConnectionStatus />
</header>
```

### Layout Constraints

- The ConnectionStatus must not wrap to a new line on mobile viewports (375px). If the header is too cramped, the ConnectionStatus should show only the dot and hide the text on very small screens using Tailwind responsive utilities (e.g., `hidden sm:inline` on the text span).
- The header must remain a single horizontal bar. Do not stack elements vertically.
- Do not change existing header content (title, navigation links, etc.). Only add the ConnectionStatus component.

### Vue Conventions

- Maintain the existing `<script setup lang="ts">` structure per `docs/03-CODING-STANDARDS.md` Section 3.
- Add the import in the imports section, following the existing import order.
- Keep the component under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1.

### Test Requirements

If `app/src/components/shared/AppHeader.test.ts` exists, add a test. If it does not exist, create it. Use Vitest and Vue Test Utils.

#### Mocking Strategy

Stub ConnectionStatus to avoid testing its internals (it has its own tests in Ticket 001):

```typescript
const ConnectionStatusStub = {
  name: 'ConnectionStatus',
  template: '<div data-testid="connection-status-stub"></div>',
}
```

Mount AppHeader with the stub and a test Pinia instance (ConnectionStatus accesses a store internally).

#### Required Test Cases (minimum)

1. **ConnectionStatus is rendered in the header:** Mount AppHeader with ConnectionStatus stubbed. Assert that the stub element (`data-testid="connection-status-stub"`) is present in the rendered output.

2. **Header maintains existing content:** Mount AppHeader. Assert that existing header elements (title or logo) are still present alongside the ConnectionStatus stub.

## Acceptance Criteria

- [ ] `ConnectionStatus` component is imported and rendered in `AppHeader.vue`
- [ ] ConnectionStatus appears on the right side of the header
- [ ] Header layout does not break on 375px viewport (no horizontal overflow)
- [ ] Existing header content (title, navigation) is unchanged
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **Read `AppHeader.vue` first** to understand its current structure and layout. Do not assume — the header was created in Phase 9 and may have specific Tailwind classes and structure.
- **Read `ConnectionStatus.vue`** (Ticket 001) to confirm it has no props and accesses the store directly. You only need to import and render it — no props to pass.
- **Do not modify ConnectionStatus.vue.** If it needs changes, note them but do not make them. This ticket only modifies AppHeader.
- **Mobile responsiveness matters.** Test mentally that the header with ConnectionStatus fits at 375px. If the status text makes the header too wide, consider using `hidden sm:inline` on the status text part within ConnectionStatus. If that requires modifying ConnectionStatus, note it in a comment but keep this ticket focused on AppHeader.
- **Provide a test Pinia instance** when mounting AppHeader in tests. Since ConnectionStatus reads from the connection store, the test environment needs an active Pinia instance. Use `setActivePinia(createPinia())` in `beforeEach`.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** Do not put business logic in components. AppHeader is a layout component — it renders children, it doesn't manage connection state.
