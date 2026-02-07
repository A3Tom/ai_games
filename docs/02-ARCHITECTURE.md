# Architecture Document: Sea Strike

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Pages                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Vue 3 SPA (Static Build)                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐ │  │
│  │  │  Router   │ │  Pinia   │ │Composables│ │ Components │ │  │
│  │  │(hash mode)│ │  Stores  │ │ usePeer   │ │  GameBoard │ │  │
│  │  │          │ │  game.ts │ │ useCrypto │ │  Lobby     │ │  │
│  │  │          │ │ conn.ts  │ │ useRelay  │ │  Setup     │ │  │
│  │  └──────────┘ └──────────┘ └─────┬─────┘ └────────────┘ │  │
│  └──────────────────────────────────┼───────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────┘
                                      │ WSS
┌─────────────────────────────────────┼──────────────────────────┐
│                          VPS (Docker)                          │
│  ┌──────────┐    ┌──────────────────┴───────────────────────┐  │
│  │  Caddy   │───▶│  Relay Container (Node/Bun)              │  │
│  │ :443 TLS │    │  - WebSocket upgrade                     │  │
│  │          │    │  - Room-based message routing             │  │
│  └──────────┘    │  - No game logic, no persistence         │  │
│                  │  - Health check endpoint                  │  │
│                  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 Frontend (Vue 3 SPA)

#### Layer Diagram

```
┌─────────────────────────────────────────────────┐
│                   Views / Pages                  │
│         LobbyView  │  GameView  │  NotFound      │
├─────────────────────────────────────────────────┤
│                 Components                       │
│   GameBoard │ OpponentBoard │ SetupPhase │ ...   │
├─────────────────────────────────────────────────┤
│              Stores (Pinia)                      │
│       useGameStore  │  useConnectionStore        │
├─────────────────────────────────────────────────┤
│             Composables                          │
│    useRelay  │  useCrypto  │  useGameProtocol    │
├─────────────────────────────────────────────────┤
│          Types / Utils / Constants               │
│   game.ts  │  protocol.ts  │  board.ts           │
└─────────────────────────────────────────────────┘
```

#### Directory Structure

```
app/
├── public/
│   └── favicon.svg
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── router/
│   │   └── index.ts
│   ├── views/
│   │   ├── LobbyView.vue
│   │   ├── GameView.vue
│   │   └── NotFoundView.vue
│   ├── components/
│   │   ├── lobby/
│   │   │   ├── CreateRoom.vue
│   │   │   └── JoinRoom.vue
│   │   ├── game/
│   │   │   ├── PlayerBoard.vue
│   │   │   ├── OpponentBoard.vue
│   │   │   ├── SetupPhase.vue
│   │   │   ├── GameStatus.vue
│   │   │   ├── TurnIndicator.vue
│   │   │   ├── ShipTray.vue
│   │   │   └── GameOver.vue
│   │   └── shared/
│   │       ├── ConnectionStatus.vue
│   │       ├── GridCell.vue
│   │       └── AppHeader.vue
│   ├── composables/
│   │   ├── useRelay.ts
│   │   ├── useCrypto.ts
│   │   └── useGameProtocol.ts
│   ├── stores/
│   │   ├── game.ts
│   │   └── connection.ts
│   ├── types/
│   │   ├── game.ts
│   │   ├── protocol.ts
│   │   └── ships.ts
│   ├── utils/
│   │   ├── board.ts
│   │   ├── validation.ts
│   │   └── room-id.ts
│   ├── constants/
│   │   ├── ships.ts
│   │   └── grid.ts
│   └── assets/
│       └── styles/
│           ├── main.css
│           └── variables.css
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── package.json
└── .env.example
```

### 2.2 Relay Server

```
relay/
├── src/
│   ├── server.ts           # Entry point
│   ├── room-manager.ts     # Room join/leave/cleanup logic
│   ├── types.ts            # Message types
│   └── health.ts           # HTTP health check endpoint
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 3. Data Flow

### 3.1 Connection Establishment

```
Player A (Browser)              Relay (VPS)              Player B (Browser)
      │                            │                            │
      │──── WS Connect ──────────▶│                            │
      │──── { type: "join",       │                            │
      │       roomId: "abc123" }──▶│                            │
      │                            │                            │
      │◀── { type: "peer_count",  │                            │
      │      count: 1 } ──────────│                            │
      │                            │                            │
      │                            │◀──── WS Connect ──────────│
      │                            │◀── { type: "join",        │
      │                            │      roomId: "abc123" } ──│
      │                            │                            │
      │◀── { type: "peer_count",  │── { type: "peer_count",  │
      │      count: 2 } ──────────│     count: 2 } ──────────▶│
      │                            │                            │
```

### 3.2 Game Phase Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  LOBBY   │────▶│  SETUP   │────▶│  COMMIT  │────▶│  BATTLE  │────▶│  REVEAL  │
│          │     │          │     │          │     │          │     │          │
│ Create/  │     │ Place    │     │ Exchange │     │ Turns:   │     │ Exchange │
│ Join     │     │ ships on │     │ SHA-256  │     │ shot →   │     │ boards + │
│ room     │     │ grid     │     │ hashes   │     │ result   │     │ salts    │
│          │     │          │     │          │     │          │     │ Verify   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### 3.3 Message Protocol

All messages are JSON over WebSocket. The relay forwards them verbatim.

```
Direction: Client → Relay → Opponent Client

SETUP PHASE:
  → { type: "ready" }                              // Ships placed, waiting for opponent
  → { type: "commit", hash: "<sha256hex>" }         // Board commitment

BATTLE PHASE:
  → { type: "shot", x: 0-9, y: 0-9 }
  ← { type: "result", x: 0-9, y: 0-9, hit: bool, sunk?: ShipType }

REVEAL PHASE:
  → { type: "reveal", board: Cell[][], salt: number[] }

META:
  → { type: "rematch" }
  → { type: "ping" }
  ← { type: "pong" }

RELAY-GENERATED (not forwarded, sent directly to client):
  ← { type: "peer_count", count: number }
  ← { type: "peer_left" }
  ← { type: "error", message: string }
```

---

## 4. State Management

### 4.1 Game Store (Pinia)

```typescript
interface GameState {
  phase: 'lobby' | 'setup' | 'commit' | 'battle' | 'reveal' | 'gameover'
  myBoard: CellState[][]          // 10x10 - my ships and opponent's shots
  opponentBoard: CellState[][]    // 10x10 - my shots and their results
  myShips: PlacedShip[]           // My fleet placement
  opponentShips: PlacedShip[]     // Revealed after game ends
  isMyTurn: boolean
  myCommitHash: string | null
  opponentCommitHash: string | null
  mySalt: Uint8Array | null
  winner: 'me' | 'opponent' | null
  cheatDetected: boolean
  shotHistory: Shot[]
}
```

### 4.2 Connection Store (Pinia)

```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  roomId: string | null
  isHost: boolean                 // true = created the room
  peerConnected: boolean          // opponent is in the room
  lastPingMs: number | null
  reconnectAttempts: number
}
```

---

## 5. Security Model

### 5.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Player moves ships mid-game | SHA-256 commit-reveal; board locked after commit exchange |
| Player lies about hit/miss | Revealed board is verified against all shot results post-game |
| Player refuses to reveal board | Treated as forfeit; opponent wins by default |
| Relay tampers with messages | Relay is under your control; messages could be signed client-side in future |
| Room ID guessing | Room IDs are 8+ character random strings (nanoid); 36^8 = ~2.8 trillion possibilities |
| DoS on relay | Rate limiting per IP at Caddy level; room cap in relay |

### 5.2 Commit-Reveal Implementation

```
Setup:
  board_json = JSON.stringify(board)     // deterministic: sorted keys
  salt = crypto.getRandomValues(32)      // 32 random bytes
  payload = board_json + ":" + hex(salt)
  hash = SHA-256(payload)
  → send hash to opponent
  → store board_json + salt locally

Reveal:
  → send board_json + salt to opponent
  opponent recomputes: SHA-256(board_json + ":" + hex(salt))
  compare with stored hash → match = honest, mismatch = cheat
```

### 5.3 Board Serialization (Deterministic)

To ensure hash consistency, boards must be serialized deterministically:

```typescript
// Board is always serialized as a flat array of ship placements, sorted by ship type
interface BoardCommitment {
  ships: {
    type: ShipType       // 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer'
    x: number            // origin column (0-9)
    y: number            // origin row (0-9)
    orientation: 'h' | 'v'
  }[]
}
// Ships are sorted alphabetically by type before serialization
```

---

## 6. Infrastructure

### 6.1 VPS — Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  relay:
    build: ./relay
    restart: unless-stopped
    expose:
      - "8080"
    environment:
      - PORT=8080
      - MAX_ROOMS=100
      - MAX_CLIENTS_PER_ROOM=2
      - ROOM_TIMEOUT_MS=3600000    # 1 hour
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.25"
    networks:
      - caddy_network

networks:
  caddy_network:
    external: true
```

### 6.2 VPS — Caddyfile

```
relay.yourdomain.com {
    reverse_proxy relay:8080

    # Rate limiting (optional, requires caddy-ratelimit plugin)
    # rate_limit {remote.ip} 30r/m
}
```

Caddy automatically provisions and renews TLS certificates via Let's Encrypt. No manual cert management needed.

### 6.3 Relay Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8080
HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1
USER node
CMD ["node", "dist/server.js"]
```

### 6.4 GitHub Pages — Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 6.5 Environment Configuration

```bash
# app/.env.example
VITE_RELAY_URL=wss://relay.yourdomain.com
VITE_ROOM_ID_LENGTH=8

# relay/.env.example
PORT=8080
MAX_ROOMS=100
MAX_CLIENTS_PER_ROOM=2
ROOM_TIMEOUT_MS=3600000
LOG_LEVEL=info
```

---

## 7. Reconnection Strategy

```
Connection lost
      │
      ▼
  Set status: "reconnecting"
      │
      ▼
  Attempt reconnect (exponential backoff: 1s, 2s, 4s, 8s, max 30s)
      │
      ├── Success ──▶ Re-send { type: "join", roomId }
      │                    │
      │                    ├── Peer still there ──▶ Exchange current game state
      │                    │                        Resume from last known state
      │                    │
      │                    └── Peer gone ──▶ Show "waiting for opponent"
      │
      └── Max retries (10) ──▶ Show "connection lost" with manual retry button
```

### 7.1 State Recovery

On reconnect, the reconnecting client sends a `sync_request` message. The peer responds with `sync_response` containing the current game phase, turn number, and shot history. The reconnecting client validates this against its own Pinia state (which persists in memory) and reconciles.

If both players disconnect and reconnect, the first one to return waits. When the second arrives, both exchange sync messages. Since the relay is stateless, no game state is stored server-side.

---

## 8. Performance Budget

| Asset | Target |
|-------|--------|
| Initial JS bundle (gzipped) | < 150 KB |
| CSS (gzipped) | < 20 KB |
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 2.5s |
| WebSocket message size | < 1 KB per message |
| Relay memory per room | < 1 KB (just WebSocket references) |

---

## 9. Monitoring & Observability

### 9.1 Relay

- `/health` endpoint returns `{ status: "ok", rooms: <count>, connections: <count> }`.
- Structured JSON logging to stdout (consumed by Docker logs / any log aggregator).
- Log room creation, room deletion, peer join, peer leave, errors.

### 9.2 Client

- Connection state changes logged to browser console in development.
- `ConnectionStatus.vue` component provides real-time visual feedback.

---

## 10. Repository Structure

```
sea-strike/
├── app/                        # Vue 3 SPA (→ GitHub Pages)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── .env.example
├── relay/                      # WebSocket relay (→ Docker on VPS)
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── deploy.yml
├── docs/
│   ├── 01-PRD.md
│   ├── 02-ARCHITECTURE.md
│   ├── 03-CODING-STANDARDS.md
│   ├── 04-AI-ASSISTANT-GUIDE.md
│   └── 05-PROTOCOL-SPEC.md
├── .gitignore
├── README.md
└── LICENSE
```
