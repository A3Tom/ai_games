# Phase 13 — Ticket 005: Responsive Layout Fixes

## Summary

Audit and fix responsive layout issues across all game screens to ensure the game is fully playable on a 375px-wide viewport (iPhone SE) without horizontal scrolling or broken layouts. This fulfills US-18 from `docs/01-PRD.md` ("the game is fully playable on mobile viewports") and the responsive testing requirement from `docs/phases/phase-13-polish-deploy.md` Section 3. When done, the agent should have verified and fixed responsive behavior on lobby, setup, battle, and game over screens, with GridCell sizing that works across all viewports.

## Prerequisites

- **Phases 1–12 complete.** All game screens exist and are functional.
- **Phase 10 complete.** `app/src/components/shared/GridCell.vue` exists.

Specific file dependencies:
- `app/src/components/shared/GridCell.vue` — may need responsive sizing adjustments (Phase 10)
- `app/src/components/game/SetupPhase.vue` — ship setup screen (Phase 10)
- `app/src/components/game/GameOver.vue` — game over screen with two boards (Phase 12)

## Scope

**In scope:**

- Audit `GridCell.vue` for responsive sizing — cells must scale to fit a 375px viewport when rendered in a 10×10 grid. Use relative units (`vmin`, `%`, or `aspect-ratio`) rather than fixed pixel sizes per `docs/04-AI-ASSISTANT-GUIDE.md` Section 4.
- Audit and fix `SetupPhase.vue` for mobile layout — the ship placement grid and ship tray must be usable at 375px. If they are side-by-side on desktop, they should stack on mobile.
- Audit and fix `GameOver.vue` for mobile layout — two board grids should stack vertically on mobile per the existing `flex flex-col gap-6 md:flex-row md:gap-8` pattern from Ticket 12-001.
- Verify that no game screen has horizontal overflow at 375px.

**Out of scope:**

- Adding drag-and-drop ship placement — US-16, deferred
- Animations or transitions — US-17, deferred
- Reconnection overlay responsive — already responsive by design (Ticket 003)
- Creating new components — only modify existing ones
- Refactoring component architecture — per `docs/phases/phase-13-polish-deploy.md` Section 8 ("fix responsively issues minimally — do not refactor component architecture")

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/src/components/shared/GridCell.vue` | Modify | Ensure responsive cell sizing using relative units |
| `app/src/components/game/SetupPhase.vue` | Modify | Ensure mobile-first stacking layout for grid + ship tray |
| `app/src/components/game/GameOver.vue` | Modify | Verify/fix mobile stacking for dual board display |

## Requirements

### GridCell Responsive Sizing

Read `GridCell.vue` and verify that cells use responsive sizing. The 10×10 grid must fit within a 375px viewport with padding. Accounting for `px-4` padding (16px each side), the available width is ~343px. Each cell in a 10-column grid with `gap-0.5` (2px gaps, 9 gaps = 18px) has ~32.5px available.

The cell should not use a fixed `width` and `height` in pixels. Instead, use one of:

1. **`aspect-square` with no explicit width** — let the CSS Grid column sizing determine width, then use `aspect-ratio: 1` to make height match:
   ```html
   <div class="aspect-square w-full ..."></div>
   ```

2. **`w-full` within the grid** — if the parent grid uses `grid-cols-10` with equal columns, each cell gets 1/10th of the grid width. Adding `aspect-square` ensures square cells.

If GridCell currently uses fixed pixel dimensions (e.g., `w-8 h-8`), replace them with responsive units. If it already uses `aspect-square` or relative sizing, no change is needed.

### SetupPhase Mobile Layout

Read `SetupPhase.vue` and verify the layout at 375px:

- The board grid and ship tray should stack vertically on mobile and sit side-by-side on desktop.
- If not already using responsive flex/grid:
  ```html
  <div class="flex flex-col lg:flex-row gap-4">
    <div><!-- Board grid --></div>
    <div><!-- Ship tray --></div>
  </div>
  ```
- The "Ready" button should be full-width on mobile: `w-full sm:w-auto`
- Ship tray items should be readable and tappable (minimum touch target 44×44px per accessibility guidelines)

### GameOver Mobile Layout

Read `GameOver.vue` and verify the dual-board layout at 375px:

- The two boards ("Your Board" and "Opponent's Board") should stack vertically on mobile. Ticket 12-001 specifies `flex flex-col gap-6 md:flex-row md:gap-8` — verify this is in place.
- If the boards already stack on mobile, no change is needed.
- Each board grid should fit within the available width without overflow.

### General Responsive Rules

Per `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6 and `docs/03-CODING-STANDARDS.md` Section 3.4:

- Design mobile-first, then add `sm:`, `md:`, `lg:` breakpoints
- Use Tailwind responsive utilities, not media queries in `<style>` blocks
- No fixed pixel dimensions for the grid — use CSS Grid with relative units
- No horizontal scrolling at 375px on any screen

### Verification Approach

For each file modified, the agent should mentally verify the layout at 375px by calculating available widths:

- Viewport: 375px
- Typical padding: `px-4` = 32px → content width: 343px
- 10-column grid with `gap-0.5` (2px): 9 × 2px = 18px → 325px for cells → ~32.5px per cell
- This is sufficient for a playable grid (32.5px × 32.5px touch targets)

### Testing

No new test file is required for this ticket. Responsive layout is verified visually, not through unit tests. However, existing tests must continue to pass after modifications.

## Acceptance Criteria

- [ ] `GridCell.vue` uses relative sizing (no fixed pixel width/height) and cells are square
- [ ] The 10×10 game grid fits within a 375px viewport without horizontal overflow
- [ ] `SetupPhase.vue` stacks board and ship tray vertically on mobile
- [ ] `GameOver.vue` stacks both boards vertically on mobile
- [ ] No horizontal scrollbar appears on any game screen at 375px width
- [ ] `npm run type-check` passes with no errors
- [ ] All existing tests pass via `npm run test`

## Notes for the Agent

- **Read each file before modifying it.** Do not assume what the current implementation looks like. Each file was built in a different phase and may already have responsive styles.
- **Make minimal changes.** Per `docs/phases/phase-13-polish-deploy.md` Section 8: "If responsive issues are found in earlier components, fix them minimally — do not refactor component architecture." Only change what is needed for 375px usability.
- **Do not change functionality.** This ticket is purely about layout and sizing. Do not modify event handlers, store interactions, props, or emits.
- **The grid cell size is the critical responsive element.** If the cells are too large, the board overflows. If they're too small, they're untappable. The sweet spot on a 375px screen is ~30-35px per cell with minimal gaps.
- **Common mistake from `docs/04-AI-ASSISTANT-GUIDE.md` Section 4:** "Making the grid a fixed pixel size — Breaks on mobile. Use CSS Grid with relative units (`vmin`, `%`, `fr`)."
- **If a file needs no changes, skip it.** Only modify files that actually have responsive issues. Note in your output which files were already responsive and needed no changes.
- **Test with the browser dev tools** if possible. After making changes, verify at 375px that the layout is correct. The grid should be square, centered, and tappable.
