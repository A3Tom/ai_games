# Repository Architecture

AI Games is a collection of browser games backed by one shared Node service. In the default [Compose deployment](../docker-compose.yml), that service serves the dashboard and games, runs the multiplayer relay, and collects telemetry—all on port **14650**.

```mermaid
flowchart LR
  subgraph Browser["Player's browser"]
    Games["Dashboard + games<br/>Rendering and game rules"]
    MP["Multiplayer clients"]
    Shell["Shared game shell<br/>+ browser telemetry"]
    Pinball["Pinball leaderboard client"]

    Games -->|"Multiplayer games"| MP
    Games -->|"All games"| Shell
    Games -->|"Pinball"| Pinball
  end

  subgraph Server["games container — one Node process :14650"]
    Static["Static file hosting"]
    Relay["WebSocket relay<br/>Rooms, membership, forwarding"]
    API["Pinball score API"]
    Obs["Telemetry collector<br/>Logs + metrics exporter"]
  end

  Static -->|"HTML, JS, CSS, WASM"| Games
  MP <-->|"WebSocket /relay"| Relay
  Pinball <-->|"HTTP /api/pinball/*"| API
  Shell -->|"HTTP POST /telemetry"| Obs
  Relay -->|"Events + counters"| Obs

  API --> Scores[("pinball-data volume")]
  Obs --> Stdout["JSON stdout / Docker logs"]

  subgraph Optional["Optional observability containers"]
    VL[("VictoriaLogs<br/>Searchable logs — 7 days")]
    VM[("VictoriaMetrics<br/>Stored metrics — 14 days")]
  end

  Obs -->|"Push log batches"| VL
  VM -->|"Pull GET /metrics every 15s"| Obs
```

Games connect to the service as follows:

| Games | Integration |
| --- | --- |
| Multiplayer Lab (`games/playground/`), Dots & Boxes (`games/dots-and-boxes/`) | Use [`packages/multiplayer`](../packages/multiplayer/) for connections, rooms, readiness, reconnects and latency measurements. |
| Sea Strike (`games/sea-strike/`) | Uses its own [`useRelay`](../games/sea-strike/src/composables/useRelay.ts) client and the relay's legacy two-player protocol. See its [game architecture](02-ARCHITECTURE.md). |
| Space Cadet Pinball (`games/pinball/`) | Runs its WASM engine in the browser; uses the HTTP API for persistent leaderboard scores. |
| Minesweeper (`games/minesweeper/`), Snow Drift (`games/snow-drift/`) | Run locally in the browser and use the shared shell for telemetry. |

**The relay handles transport; each game owns its rules and synchronization.** Modern rooms are isolated by `appId` and room ID. Rooms, membership and relay counters live in memory and reset on restart. Pinball's top-ten leaderboard persists in `/data/pinball-scores.json`, backed by the Compose volume. The shared server is wired in [`services/game-server/src/server.ts`](../services/game-server/src/server.ts); see the [multiplayer reference](MULTIPLAYER.md) for protocol details.

**Observability is shared across all games and the dashboard.** [`shared/game-shell.js`](../shared/game-shell.js) initializes [`shared/telemetry.js`](../shared/telemetry.js) for page loads, load duration, browser errors and custom game logs. Browser telemetry uses separate HTTP requests from multiplayer messages. [`services/game-server/src/observability.ts`](../services/game-server/src/observability.ts) combines browser and server logs into structured JSON identified by `appId`, source, instance and environment, and exposes Prometheus-format metrics. Browser telemetry delivery is best effort.

The base Compose file runs only `games`; [`docker-compose.observability.yml`](../docker-compose.observability.yml) adds VictoriaLogs and VictoriaMetrics. The relay pushes logs to VictoriaLogs; VictoriaMetrics pulls metrics using [`observability/prometheus.yml`](../observability/prometheus.yml). Without the overlay, logs still appear on stdout and `/metrics` remains available. See the [observability setup](../README.md#observability) for configuration.

Sources are grouped by responsibility:

```text
games/<id>/              Game UI, rules, assets and optional native engine
services/game-server/    Shared HTTP hosting, relay, scores and observability
packages/multiplayer/    Framework-independent multiplayer client
shared/                 Browser shell and telemetry
scripts/                Collection build and validation
observability/          Optional log and metrics service configuration
games.json              Catalogue: game identity, source and public route
index.html              Collection dashboard
```

[`games.json`](../games.json) drives [`scripts/build-collection.mjs`](../scripts/build-collection.mjs): built games supply static `dist/` outputs; plain browser games supply their source files. The root [`Dockerfile`](../Dockerfile) builds games in separate cached stages, then packages their outputs with the server in one image. [`docker-compose.local.yml`](../docker-compose.local.yml) builds this deployment from source. Source folders and public routes are independent, so Snow Drift still uses `/snow_drift/`. See [Adding a game](ADDING_A_GAME.md) for the integration contract.

Sea Strike's historical phase and ticket documents use `app/` and `relay/`; these now map to `games/sea-strike/` and `services/game-server/` respectively.
