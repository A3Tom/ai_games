# Dots & Boxes

A browser game for 2–4 players, built with Vue, TypeScript and the collection's shared multiplayer client. Play online from separate desktop/mobile browsers or pass one device between players.

## Rules

Choose a 3×3, 4×4 or 5×5 board of boxes. On your turn, select an empty line between neighboring dots. Completing a box scores one point and gives you another turn; a single line can complete two boxes. The game ends when every box is claimed. The highest score wins, including shared wins when scores tie.

The board supports taps, mouse clicks and keyboard navigation. Local pass-and-play needs no relay connection.

## Run with the collection

From the repository root:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

Open <http://localhost:14650/dots-and-boxes/>. On a phone connected to the same reachable network, replace `localhost` with your computer's LAN address. Create the online room from that address so its invite link works on other devices. Dots & Boxes works over HTTP on a LAN; it does not require secure-context Web Crypto.

Everyone joins the same room and marks themselves ready. The host chooses the board size and starts the game. Players who join during a game watch until the next game.

## Develop

Install the game and relay dependencies:

```bash
npm ci --prefix dots-and-boxes
npm ci --prefix relay
```

Start the relay from the repository root, then start the game in another terminal:

```bash
MAX_CLIENTS_PER_ROOM=4 npm run dev --prefix relay
```

```bash
npm run dev --prefix dots-and-boxes
```

The Vite server listens on the network and proxies `/relay` and `/telemetry` to the relay at `http://127.0.0.1:14650`. Open the printed Vite URL; use the computer's LAN address when playing from a phone.

To use a separate relay, set `VITE_RELAY_URL` to an absolute `ws://` or `wss://` URL, or enter its endpoint in the game. An HTTPS page requires `wss://`. For a static host such as GitHub Pages, configure this at build time and host the relay separately. The shared telemetry endpoint has its own configuration; see [the collection's observability instructions](../README.md#observability).

Checks:

```bash
npm test --prefix dots-and-boxes
npm run build --prefix dots-and-boxes
```

The collection build reads the entry in [`games.json`](../games.json), includes this app in the Docker image and GitHub Pages output, and uses relative asset paths.

## Multiplayer behavior

The relay owns room membership and transports messages. A browser host validates moves and broadcasts compact snapshots containing the match's players, board size and move history. Every receiver validates and replays the history to reconstruct scores, box owners and turn order.

The relay stores no match state. A surviving peer can supply a snapshot after a connection interruption. An automatic reconnect keeps the same in-memory player identity; refreshing the page creates a new identity, which watches the current game until the next game starts. Games pause while a match player is absent; the host can start a new game with the current ready players if someone has left permanently. When the host disconnects, the remaining room member with the earliest join time becomes host and can continue with its retained state. If every browser loses the match state, start a new game.

This is a game for trusted peers. Browser-host validation is not an authenticated, authoritative game server. Online moves have a short 2.2-second "ink drying" pause and diagnostics update every fifteen seconds to leave headroom within the relay's existing 60-message-per-minute limit. Local moves are immediate. The game sends moves and compact snapshots; pointer movement stays on the device.

## Observability

The shared shell initializes telemetry with `appId: "dots-and-boxes"`, capturing page loads, load duration and browser errors. The game adds gameplay and recovery events; the connection panel also exposes shared-client latency and traffic measurements.

Gameplay events include `game_started`, `move_applied`, `move_rejected`, `game_completed`, `host_changed`, `state_mismatch`, `state_sync_timeout` and `state_resynced`. Recovery events include `recovery_ms`; gameplay context includes board size, player count, move count and captured boxes without player names or room codes.

Run the optional observability services with the collection:

```bash
docker compose -f docker-compose.local.yml -f docker-compose.observability.yml up --build -d
```

In [VictoriaLogs](http://localhost:9428/select/vmui/), query:

```text
service:="ai-games" appId:="dots-and-boxes"
```

In [VictoriaMetrics](http://localhost:8428/vmui/), query:

```promql
ai_games_page_loads_total{app_id="dots-and-boxes"}
```

```promql
ai_games_browser_logs_total{app_id="dots-and-boxes",level="error"}
```

Log fields use `appId`; metric labels use `app_id`. Gameplay events become searchable logs and contribute to severity counts. They do not automatically create dedicated gameplay metrics. Relay traffic counters are global, and the client latency panel measures browser-to-relay round trips.

For an integration check, join from a desktop and a phone, ready both players, complete boxes and rematch. Interrupt the phone's connection, make sure play pauses, then reconnect and compare the board and scores. Test a host departure, a mid-game spectator and separate rooms. Look for the corresponding game and recovery events alongside relay traffic and rejection counters. Telemetry is best effort and does not store room codes, player names or game payloads in custom gameplay logs.
