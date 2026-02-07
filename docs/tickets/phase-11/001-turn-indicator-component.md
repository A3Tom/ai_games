# Phase 11 — Ticket 001: TurnIndicator Component

## Summary

Create the `TurnIndicator.vue` component that displays whose turn it is during the battle phase. It accepts a single boolean prop and renders "Your Turn" or "Opponent's Turn" with distinct visual styling. After this ticket, the component exists with full prop contract, accessible markup, and a component test file.

## Prerequisites

- **Phase 1 complete.** Vue 3 project scaffolded, Tailwind CSS configured.
- **Phase 2 complete.** `app/src/types/game.ts` exports game types.
- `app/src/components/game/` directory exists (created in Phase 10).

## Scope

**In scope:**

- `app/src/components/game/TurnIndicator.vue` — turn state display with conditional styling
- `app/src/components/game/TurnIndicator.test.ts` — component tests for rendering and accessibility

**Out of scope:**

- Turn timer countdown — Phase 13 or post-v1 (US-19)
- Animations or transitions — Phase 13
- Integration into GameView layout — ticket 005

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/game/TurnIndicator.vue` | Create | Turn state display ("Your Turn" / "Opponent's Turn") |
| `app/src/components/game/TurnIndicator.test.ts` | Create | Component tests for TurnIndicator |

## Requirements

### Component Contract

As defined in `docs/phases/phase-11-ui-battle.md` Section 6 "Interfaces & Contracts":

```typescript
const props = defineProps<{
  isMyTurn: boolean
}>()
```

No emits — this is a display-only component.

### Template Structure

The component renders a container `<div>` with a text label. The element must:

1. Display the text **"Your Turn"** when `props.isMyTurn` is `true`.
2. Display the text **"Opponent's Turn"** when `props.isMyTurn` is `false`.
3. Use `aria-live="polite"` on the container so screen readers announce turn changes.
4. Include a `role="status"` attribute for accessibility.
5. Be a single root element.

### Styling Requirements

Use Tailwind utility classes exclusively. No `<style scoped>` block needed. Compute the CSS class dynamically based on `isMyTurn`.

**When `isMyTurn` is `true` (active turn):**
- Text color: `text-green-400`
- Font weight: `font-bold`
- Background: `bg-green-900/30`
- Border: `border border-green-500/50`

**When `isMyTurn` is `false` (opponent's turn):**
- Text color: `text-gray-400`
- Font weight: `font-normal`
- Background: `bg-gray-800/30`
- Border: `border border-gray-600/50`

**Common classes (always applied):**
- `rounded-lg` — rounded corners
- `px-4 py-2` — padding
- `text-center` — centered text
- `text-lg` — text size
- `select-none` — prevent text selection

Use a computed property to derive the CSS class string:

```typescript
const indicatorClass = computed(() => {
  if (props.isMyTurn) {
    return 'text-green-400 font-bold bg-green-900/30 border border-green-500/50'
  }
  return 'text-gray-400 font-normal bg-gray-800/30 border border-gray-600/50'
})
```

### Vue Conventions

- Use `<script setup lang="ts">` per `docs/03-CODING-STANDARDS.md` Section 3.2.
- Use `computed` for the class derivation — do not compute inline in the template.
- Single root element.
- Component must stay well under 200 lines per `docs/03-CODING-STANDARDS.md` Section 3.1 (expected: ~30 lines).

### Test Requirements

Create `app/src/components/game/TurnIndicator.test.ts` using Vitest and Vue Test Utils.

#### Required Test Cases (minimum)

1. **Renders "Your Turn" when isMyTurn is true:** Mount with `isMyTurn: true`. Assert the component text contains "Your Turn".

2. **Renders "Opponent's Turn" when isMyTurn is false:** Mount with `isMyTurn: false`. Assert the component text contains "Opponent's Turn".

3. **Applies active styling when isMyTurn is true:** Mount with `isMyTurn: true`. Assert the root element has class `text-green-400` and `font-bold`.

4. **Applies inactive styling when isMyTurn is false:** Mount with `isMyTurn: false`. Assert the root element has class `text-gray-400`.

5. **Has aria-live attribute for accessibility:** Mount the component. Assert the root element has `aria-live="polite"`.

6. **Has role="status" attribute:** Mount the component. Assert the root element has `role="status"`.

## Acceptance Criteria

- [ ] File exists at `app/src/components/game/TurnIndicator.vue` with `<script setup lang="ts">`
- [ ] Component accepts `isMyTurn` boolean prop
- [ ] Displays "Your Turn" with green emphasis when `isMyTurn` is `true`
- [ ] Displays "Opponent's Turn" with muted styling when `isMyTurn` is `false`
- [ ] Root element has `aria-live="polite"` and `role="status"` for accessibility
- [ ] `npm run type-check` passes with no errors
- [ ] All tests pass via `npm run test`

## Notes for the Agent

- **This is a very small component.** It should be under 40 lines total. Resist the temptation to add complexity — no animations, no icons, no turn timers. Those belong to Phase 13.
- **Use `computed` for class derivation** per `docs/03-CODING-STANDARDS.md` Section 3.2. Do not use `:class` with an inline object — use a single computed string.
- **The `aria-live="polite"` attribute is important.** When the turn changes, assistive technologies should announce the new state. The `polite` value ensures it doesn't interrupt the user.
- **Do not import any stores or composables.** This component receives all its data via props. It has no side effects and no state of its own.
- **Follow `docs/03-CODING-STANDARDS.md` Section 3.2** for Vue component structure: imports, props, computed, template.
