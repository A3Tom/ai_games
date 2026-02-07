# Product Requirements Document: P2P Battleship

## 1. Overview

**Product Name:** Sea Strike
**Version:** 1.0
**Last Updated:** 2026-02-07

Sea Strike is a browser-based, peer-to-peer implementation of the classic Battleship board game. The game runs entirely in the client with a stateless WebSocket relay hosted on a VPS for connection brokering. The frontend is a Vue 3 + TypeScript single-page application hosted on GitHub Pages.

### 1.1 Goals

- Deliver a fully playable two-player Battleship game with no server-side game logic.
- Provide cryptographic integrity guarantees so neither player can cheat.
- Require zero accounts, zero downloads — just share a link and play.
- Keep infrastructure costs near zero (static hosting + lightweight relay).

### 1.2 Non-Goals (v1)

- Matchmaking or lobby systems with multiple concurrent listed games.
- Spectator mode.
- More than two players per session.
- Persistent game history or player profiles.
- Mobile native apps.

---

## 2. Users & Personas

| Persona | Description |
|---------|-------------|
| **Casual Player** | Wants to quickly start a game with a friend via a shared link. Low tolerance for setup friction. |
| **Remote Friend Group** | Friends in different locations looking for a quick browser game during a call or chat. |
| **Developer/Tinkerer** | Interested in the P2P architecture; may fork or extend the project. |

---

## 3. User Stories

### 3.1 Core Gameplay

| ID | Story | Priority |
|----|-------|----------|
| US-01 | As a player, I can create a new game room and receive a shareable link so I can invite my opponent. | Must Have |
| US-02 | As a player, I can join an existing game room by clicking a shared link. | Must Have |
| US-03 | As a player, I can place my ships on a 10×10 grid during a setup phase before the game begins. | Must Have |
| US-04 | As a player, I can fire shots at my opponent's grid during my turn and see whether each shot is a hit or miss. | Must Have |
| US-05 | As a player, I am notified when I sink an opponent's ship and told which ship it was. | Must Have |
| US-06 | As a player, I see a game-over screen when all ships of one player are sunk, showing the winner. | Must Have |
| US-07 | As a player, I can see my own board with my ship placements and the hits/misses my opponent has made. | Must Have |
| US-08 | As a player, after the game ends I can see my opponent's full board to verify the game was fair. | Must Have |
| US-09 | As a player, I can request a rematch after a game ends without leaving the room. | Should Have |

### 3.2 Connection & Reliability

| ID | Story | Priority |
|----|-------|----------|
| US-10 | As a player, I see a clear connection status indicator so I know if my opponent is connected. | Must Have |
| US-11 | As a player, if my opponent disconnects mid-game, the game state is preserved so we can resume if they reconnect. | Should Have |
| US-12 | As a player, if the WebSocket connection drops, the client automatically attempts to reconnect. | Must Have |

### 3.3 Anti-Cheat

| ID | Story | Priority |
|----|-------|----------|
| US-13 | As a player, at game start both players exchange cryptographic commitments of their board layouts so neither can move ships mid-game. | Must Have |
| US-14 | As a player, after the game ends I can verify my opponent's board matched their commitment hash. | Must Have |
| US-15 | As a player, if my opponent's revealed board does not match their commitment, I see a clear "cheat detected" warning. | Must Have |

### 3.4 UX Polish

| ID | Story | Priority |
|----|-------|----------|
| US-16 | As a player, I can drag-and-drop or click to place and rotate ships during setup. | Should Have |
| US-17 | As a player, I see animations for shots, hits, misses, and sinking ships. | Nice to Have |
| US-18 | As a player, the game is fully playable on mobile viewports. | Should Have |
| US-19 | As a player, I can see a turn timer so the game keeps moving. | Nice to Have |

---

## 4. Game Rules

### 4.1 Fleet Composition

| Ship | Size (cells) |
|------|-------------|
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

### 4.2 Board

- 10×10 grid.
- Columns labeled A–J, rows labeled 1–10.
- Ships may be placed horizontally or vertically. Ships may not overlap or extend beyond the grid.

### 4.3 Turn Structure

1. Players alternate turns starting with the room creator (Player A).
2. On their turn, a player selects a cell on the opponent's grid to fire at.
3. The opponent responds with hit or miss (and ship identity if sunk).
4. The game ends when all five ships of one player are completely sunk.

### 4.4 Anti-Cheat Protocol

1. **Setup phase:** Each player places ships, then generates a SHA-256 hash of `JSON.stringify({ board, salt })` where `salt` is a cryptographically random 32-byte value.
2. **Commit phase:** Players exchange hashes. Neither can see the other's board.
3. **Gameplay:** Players take turns. The defending player self-reports hit/miss. (Same trust model as physical Battleship.)
4. **Reveal phase:** After the game ends, both players reveal their full board and salt. Each client re-hashes and compares against the committed hash. Any mismatch triggers a "cheat detected" alert.

---

## 5. Technical Constraints

| Constraint | Detail |
|------------|--------|
| **Frontend hosting** | GitHub Pages — static files only, no server-side execution. |
| **Relay hosting** | User's VPS, running Docker containers behind Caddy reverse proxy. |
| **Relay role** | Stateless WebSocket message forwarding. Zero game logic. Zero persistence. |
| **Framework** | Vue 3 with Composition API, TypeScript, Vite. |
| **Browser support** | Latest 2 versions of Chrome, Firefox, Safari, Edge. |
| **No accounts** | No authentication, no user database, no cookies. |
| **Room isolation** | Messages from one room must never leak to another room. |

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Time from page load to game start (both players ready) | < 30 seconds |
| Relay message latency (round-trip) | < 100ms for same-continent players |
| Client bundle size (gzipped) | < 200 KB |
| Lighthouse performance score | > 90 |
| Successful cheat detection rate | 100% (any tampered board is flagged) |

---

## 7. Future Considerations (Post v1)

- **Trystero fallback:** If the relay is down, attempt P2P via Trystero/Nostr as a degraded-but-functional backup.
- **Sound effects and haptics.**
- **Spectator mode:** Read-only connections that see both boards with a fog-of-war delay.
- **Custom fleet configurations.**
- **Tournament mode with bracket tracking.**
- **PWA support for offline ship placement / practice mode.**
