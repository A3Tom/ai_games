# Architecture Document: Sea Strike

## 1. System Overview

This document covers Sea Strike's browser application in [`app/`](../app/). See [Repository Architecture](./REPOSITORY_ARCHITECTURE.md) for the collection diagram, shared services, and observability flow.

Sea Strike is a Vue SPA: each browser owns its game rules, board state, and cryptographic verification. Its `useRelay` composable uses the relay's legacy two-player WebSocket protocol to exchange messages. In the collection deployment, one Node service on port **14650** serves all game files and hosts the shared relay, telemetry collector, metrics exporter, and Pinball API. Sea Strike rooms and membership live in memory; game state stays in the browsers.

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
| DoS on relay | Per-connection message rate and size limits; room cap in relay |

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

The root [Dockerfile](../Dockerfile) packages the registered games and dashboard with the relay in one image. [docker-compose.yml](../docker-compose.yml) runs that image; [docker-compose.local.yml](../docker-compose.local.yml) builds it from source. Sea Strike connects to same-origin `/relay`, using `ws://` over HTTP or `wss://` over HTTPS. Playing from another device requires trusted HTTPS for Web Crypto.

For the deployment diagram and shared service boundaries, see [Repository Architecture](./REPOSITORY_ARCHITECTURE.md). Run commands, environment settings, and static hosting options are in the [README](../README.md#hosting).

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

The shared game shell initializes browser telemetry with `appId: "sea-strike"`. Page loads, load duration, browser errors, and custom game logs are batched to HTTP `/telemetry`, separately from WebSocket gameplay. The relay combines browser and server logs as structured JSON on stdout and exposes metrics at `/metrics`.

The optional observability overlay adds VictoriaLogs for searchable logs and VictoriaMetrics for stored metrics. See [Repository Architecture](./REPOSITORY_ARCHITECTURE.md) for the flow and the [README](../README.md#observability) for configuration. `ConnectionStatus.vue` also shows connection state inside the game.

---

## 10. Repository Structure

Sea Strike's frontend lives in [`app/`](../app/); its component layout is shown in section 2. The relay in [`relay/`](../relay/) and browser shell in [`shared/`](../shared/) serve the whole collection. See [Repository Architecture](./REPOSITORY_ARCHITECTURE.md) for the repository-wide boundaries.
