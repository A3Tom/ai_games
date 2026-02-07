# Phase 13: Polish & Deploy

## 1. Objective

Add final UX polish, persistent connection status UI, reconnection feedback, responsive refinements, and deploy the full application — the Vue SPA to GitHub Pages and the relay server to the VPS via Docker behind Caddy. Before this phase, the game is fully playable but lacks polish and deployment infrastructure. After this phase, Sea Strike is production-ready: deployed, responsive, resilient to disconnections, and providing clear user feedback at all times.

## 2. Prerequisites

- **All Phases 1–12** must be complete: the full game is playable end-to-end in a local development environment.

Specific dependencies:
- `app/src/components/shared/AppHeader.vue` — Phase 9 created this; this phase adds `ConnectionStatus.vue` inside it.
- `app/src/stores/connection.ts` — provides status, peerConnected, reconnectAttempts.
- `app/src/composables/useRelay.ts` — reconnection logic is already implemented; this phase adds UI feedback.
- `docker-compose.yml` — Phase 5 created this; this phase ensures VPS deployment.
- `docs/02-ARCHITECTURE.md` Sections 6.1–6.4 — Docker Compose, Caddyfile, Dockerfile, GitHub Actions workflow.

## 3. Scope

### In Scope

- `app/src/components/shared/ConnectionStatus.vue`: Persistent connection status indicator in the header. Shows connected/disconnected/reconnecting state, peer presence, and latency (see `docs/01-PRD.md` US-10).
- Reconnection UI: "Reconnecting..." spinner overlay during reconnection attempts. "Connection Lost" banner with manual retry button after max retries (see `docs/01-PRD.md` US-12, `docs/02-ARCHITECTURE.md` Section 7).
- Responsive testing and fixes: verify all screens (lobby, setup, battle, game over) work on 375px viewport (iPhone SE) and up (see `docs/01-PRD.md` US-18, `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.6).
- Mobile-first layout adjustments where needed.
- GitHub Actions deployment workflow: `.github/workflows/deploy.yml` for automated deployment to GitHub Pages on push to `main` (see `docs/02-ARCHITECTURE.md` Section 6.4).
- Caddyfile for the VPS: reverse proxy to the relay container with automatic TLS (see `docs/02-ARCHITECTURE.md` Section 6.2).
- VPS deployment verification: ensure `docker-compose up` starts the relay, Caddy provisions TLS, and clients can connect.
- End-to-end production test: full game flow through production deployment.

### Out of Scope

- Shot/hit/sinking animations — Nice to Have (US-17). May be partially addressed here with CSS transitions if time allows, but not required for v1.
- Turn timer — Nice to Have (US-19). Deferred to post-v1.
- Sound effects — post-v1 (see `docs/01-PRD.md` Section 7).
- Drag-and-drop ship placement — Should Have (US-16). Only if click-to-place was sufficient in Phase 10.
- PWA support — post-v1.

## 4. Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/src/components/shared/ConnectionStatus.vue` | Create | Persistent connection status indicator with connected/reconnecting/disconnected states |
| `app/src/components/shared/AppHeader.vue` | Modify | Add `ConnectionStatus` component |
| `.github/workflows/deploy.yml` | Create | GitHub Actions workflow for deploying SPA to GitHub Pages |
| `Caddyfile` | Create | Caddy reverse proxy config for relay with automatic TLS (placed alongside `docker-compose.yml` on VPS) |
| `app/src/views/GameView.vue` | Modify | Add reconnection overlay/banner |
| `app/src/components/shared/GridCell.vue` | Modify | Responsive size adjustments if needed |
| Various component files | Modify | Responsive layout fixes, mobile breakpoints |

## 5. Key Design Decisions

1. **`ConnectionStatus.vue` in the header:** The connection indicator is always visible regardless of which view/phase the player is in. It shows a green/yellow/red dot (or similar) based on `connectionStore.status` and whether the peer is connected (see `docs/01-PRD.md` US-10, `docs/02-ARCHITECTURE.md` Section 9.2).

2. **Reconnection overlay, not page replacement:** During reconnection, show an overlay or banner on top of the existing game UI — not a full page replacement. The game state persists in memory and the UI should reflect the last known state (see `docs/02-ARCHITECTURE.md` Section 7).

3. **Caddy for TLS and reverse proxy:** The Caddyfile defines a single site block that reverse-proxies to the relay container. Caddy handles automatic Let's Encrypt certificate provisioning and renewal — no manual TLS management (see `docs/02-ARCHITECTURE.md` Section 6.2).

4. **GitHub Actions deployment:** The workflow runs on push to `main`: checks out code, installs dependencies, runs type-check + lint + build, then deploys the `app/dist` directory to GitHub Pages (see `docs/02-ARCHITECTURE.md` Section 6.4).

5. **Docker network:** The relay container and Caddy share a Docker network (`caddy_network`). The relay is not exposed to the host directly — only Caddy is (see `docs/02-ARCHITECTURE.md` Section 6.1).

6. **Performance budget validation:** Before declaring production-ready, verify:
   - Initial JS bundle < 150 KB gzipped (see `docs/02-ARCHITECTURE.md` Section 8).
   - First Contentful Paint < 1.5s.
   - Lighthouse performance score > 90 (see `docs/01-PRD.md` Section 6).

## 6. Interfaces & Contracts

### `app/src/components/shared/ConnectionStatus.vue`

```typescript
// Reads from useConnectionStore via storeToRefs
// No props — accesses store directly

// Displays:
// - Connection state: connected (green) / reconnecting (yellow) / disconnected (red)
// - Peer presence: "Opponent connected" / "Waiting for opponent"
// - Optional: ping latency in ms
```

### `.github/workflows/deploy.yml`

Follows the exact structure from `docs/02-ARCHITECTURE.md` Section 6.4:
- Trigger: push to `main` and `workflow_dispatch`
- Steps: checkout → setup Node 20 → `npm ci` → `npm run type-check` → `npm run lint` → `npm run build` → upload artifact → deploy to Pages

### Caddyfile

```
relay.yourdomain.com {
    reverse_proxy relay:8080
}
```

Caddy is expected to be running separately on the VPS (not in the same Docker Compose file as the relay, unless the user's infrastructure combines them). The Caddyfile is placed per `docs/02-ARCHITECTURE.md` Section 6.2.

### Reconnection UI States

| `connectionStore.status` | UI Behavior |
|--------------------------|-------------|
| `connected` + `peerConnected` | Green indicator, no overlay |
| `connected` + `!peerConnected` | Yellow indicator, "Waiting for opponent..." in game view |
| `reconnecting` | Yellow indicator, reconnecting overlay with spinner and attempt count |
| `disconnected` | Red indicator, "Connection Lost" banner with "Retry" button |

## 7. Acceptance Criteria

1. `ConnectionStatus.vue` renders in the header on every page (lobby, game).
2. The connection indicator shows green when connected with a peer, yellow when reconnecting, and red when disconnected.
3. When the WebSocket disconnects mid-game, a "Reconnecting..." overlay appears with a spinner.
4. After 10 failed reconnection attempts, a "Connection Lost" banner with a "Retry" button replaces the spinner.
5. Clicking "Retry" resets reconnection attempts and tries again.
6. All game screens (lobby, setup, battle, game over) are usable on a 375px-wide viewport without horizontal scrolling or broken layouts.
7. The GitHub Actions workflow file exists at `.github/workflows/deploy.yml` and follows the structure in `docs/02-ARCHITECTURE.md` Section 6.4.
8. Running `npm run build` in `app/` produces a production build with no errors.
9. The production JS bundle is under 150 KB gzipped.
10. The Caddyfile exists and correctly reverse-proxies to the relay container.
11. `docker-compose up` starts the relay container, and it responds to `/health` checks.
12. A full game can be played through the production deployment: create room → share link → join → setup → battle → game over → verify → rematch.
13. Lighthouse performance score is > 90 on the deployed site.
14. Running `npm run lint` and `npm run type-check` produce no errors.

## 8. Dependencies Between Phases

### Provides to Future Phases

- This is the final phase. It provides:
  - **Deployed, production-ready application.**
  - **CI/CD pipeline** for future pushes to `main`.
  - **VPS deployment** for the relay server.

### Boundaries

- This phase must NOT modify core game logic, store state machines, protocol handling, or crypto verification. Those are finalized in Phases 1–12.
- Post-v1 enhancements (sound effects, spectator mode, PWA, Trystero fallback) are explicitly deferred (see `docs/01-PRD.md` Section 7).
- If responsive issues are found in earlier components, fix them minimally — do not refactor component architecture.
