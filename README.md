# AI Games Collection

A workshop for small browser games built with coding agents. Keep each game focused on its idea, and reuse multiplayer and diagnostics where they help.

Every app, including **Multiplayer Lab**, is listed on one dashboard. One Docker image runs the whole collection and the multiplayer relay together.

See the [repository architecture](./docs/REPOSITORY_ARCHITECTURE.md) for a high-level diagram of the games, relay, and observability.

## Run the collection

After the [GHCR workflow](./.github/workflows/ghcr.yml) has published the image, run this command on any Linux AMD64 host with Docker (see [Hosting](#hosting) for registry authentication):

```bash
docker run -d --name ai-games --restart unless-stopped --pull always -p 14650:14650 -v ai-games-data:/data ghcr.io/a3tom/ai_games:latest
```

Open <http://localhost:14650>. The dashboard links to Multiplayer Lab, Dots & Boxes, Minesweeper, Snow Drift, Space Cadet Pinball, and Sea Strike. No local Node installation or separate Vite process is needed.

Space Cadet Pinball runs the C++/SDL2 [SpaceCadetPinball engine](./games/pinball/vendor/) through WebAssembly and saves its top ten scores on the server. Its independent build downloads and verifies the same game resource archive used by the Flatpak package, then publishes the ready-to-serve game in `ghcr.io/a3tom/ai_games-pinball`. Collection builds copy that artifact into the main image. Resources stay outside Git; see the [pinball setup guide](./games/pinball/README.md) for provenance, custom resources, and builds without bundled data. The `ai-games-data` volume above preserves scores when the container is replaced. Compose configures its own named `pinball-data` volume; `docker compose down` keeps it, while `docker compose down -v` deletes it. Without a volume, scores survive a process restart but disappear when the container is removed. Scores are reported by the browser for casual play.

To share it with another device on your network, open `http://<your-computer-LAN-IP>:14650` on that device, for example `http://192.168.1.20:14650`. On Linux, `hostname -I` lists your machine's addresses; choose the one for your Ethernet or Wi-Fi network. On Windows, use `ipconfig`; on macOS, look in Network settings.

The web port listens on all host interfaces. Both devices must be on the same reachable network, your firewall must allow incoming TCP 14650, and guest Wi-Fi/client isolation must permit access to your computer. Docker Desktop may require allowing incoming connections. No router port forwarding is needed for LAN access.

The lab automatically uses the relay at the address you opened: `ws://<host>:14650/relay` over HTTP, or `wss://<host>/relay` behind HTTPS. Create rooms from the LAN URL so invite links point to an address other devices can reach. A link containing `localhost` only works on the computer that opened it.

**Sea Strike has an existing browser requirement:** creating a game and committing a board need Web Crypto, available on localhost or HTTPS. Its page is included in the dashboard, but playing from another device requires serving this stack behind a trusted HTTPS reverse proxy. Dots & Boxes and the lab's multiplayer tests work over HTTP on your LAN. Snow Drift currently loads Three.js from a CDN, so it needs Internet access.

Useful commands:

```bash
docker logs -f ai-games
docker stop ai-games
docker start ai-games
```

Use `-p 14651:14650` in the run command if host port 14650 is occupied. The dashboard, games, and WebSocket relay all share the published port. Dots & Boxes and lab rooms allow four players by default; legacy Sea Strike rooms remain limited to two. Pass `-e MAX_CLIENTS_PER_ROOM=8`, `-e MAX_ROOMS=50`, or `-e ROOM_TIMEOUT_MS=60000` to `docker run` to override relay limits. Room state and counters reset when the container restarts.

If you prefer Compose, copy [`docker-compose.yml`](./docker-compose.yml) to your host and run `docker compose up -d --pull always --wait`. It runs the same single image. Use `docker compose logs -f` and `docker compose down` to view logs and stop it. Configure `HOST_PORT`, relay limits, and `IMAGE_TAG` through a `.env` file beside the manifest.

To build the collection from local source with the published Pinball artifact, use [`docker-compose.local.yml`](./docker-compose.local.yml):

```bash
docker compose -f docker-compose.local.yml up --build -d
# After local dependency setup, connect a separate Vite development server:
VITE_RELAY_URL=ws://localhost:14650/relay pnpm --filter multiplayer-lab run dev
```

The local dashboard, games, and relay share port 14650. Browser files in the container are production builds; rerun `docker compose -f docker-compose.local.yml up --build -d` after changing source files. Pinball's image is only a build input; the running collection remains one service.

To include local Pinball changes, build its artifact first, then rebuild the collection using BuildKit:

```bash
docker build -f games/pinball/Dockerfile -t ai-games-pinball:local .
PINBALL_IMAGE=ai-games-pinball:local docker compose -f docker-compose.local.yml up --build -d
```

The default artifact is `ghcr.io/${GHCR_REPOSITORY:-a3tom/ai_games}-pinball:latest`. Set `PINBALL_IMAGE_TAG` to choose a tag, or `PINBALL_IMAGE` for an exact tag or digest. `PINBALL_PLATFORM` defaults to `linux/amd64`, the artifact's published platform. A local build needs access to the artifact package when it is private; see [Hosting](#hosting).

Use the same local file when checking logs or stopping the stack:

```bash
docker compose -f docker-compose.local.yml logs -f
docker compose -f docker-compose.local.yml down
```

## What to try

1. Connect with one browser. Server round-trip time should update even with nobody else in the room.
2. Create a room and join from another tab. Both should show the same members and ready states.
3. Send a pulse or test message. Other members should receive it, and the sender should see how many peers the relay forwarded it to.
4. Move one tab to another room. It should disappear from the first room and stop receiving its actions.
5. Fill a room, then try switching into it. The rejected player should keep their previous membership.
6. Disconnect and reconnect, or restart the relay. Watch the status, membership, and event log settle again. Rooms and test actions are ephemeral; there is no saved game state.

The lab shows browser-to-relay round-trip latency, recent latency samples and missing ping replies, browser message/byte counts, room membership, and aggregate relay counters. Browser measurements reset with the page or the reset control; relay counters reset when the process restarts. Message counts include protocol traffic such as pings and diagnostics. A forwarding acknowledgement reports peers sent to, rather than confirming that their application processed the action.

The relay currently limits each connection to 60 messages per minute and each message to 4 KB. Automatic ping and stats requests use part of that allowance. This app exercises low-frequency multiplayer mechanisms; continuous movement would need a different traffic budget and synchronization design.

## Observability

The shared shell reports page loads, load duration, uncaught errors, failed resources, and unhandled promise rejections for every game. The browser sends small batches to the relay's `/telemetry` endpoint. Browser and relay logs use the same structured JSON format and appear together in `docker compose logs -f games` (or the relay terminal when running without Docker). Each entry includes `appId`, `source`, `level`, `event`, `timestamp`, `instance`, and `environment`.

Prometheus metrics are available now at <http://localhost:14650/metrics> and `/relay/metrics`, without a metrics database. They include per-game page loads, load durations and log counts, relay rooms/connections/traffic, and telemetry forwarding failures/drops. Counters reset when the relay restarts. Browser logs are best effort: bounded queues have no disk spool, and unavailable backends can lose forwarded batches; the relay still writes JSON to stdout.

To run the full local collection with searchable logs and stored metrics:

```bash
docker compose -f docker-compose.local.yml -f docker-compose.observability.yml up --build -d
```

Open a few games, then use:

- [VictoriaLogs UI](http://localhost:9428/select/vmui/): query `service:="ai-games"`, optionally add `appId:="minesweeper"` or `level:="error"`.
- [VictoriaMetrics UI](http://localhost:8428/vmui/): query `ai_games_page_loads_total`, `ai_games_browser_logs_total{level="error"}`, or `up{job="ai-games"}`. Scraping happens every 15 seconds.

The optional overlay pins [VictoriaLogs v1.53.0](https://github.com/VictoriaMetrics/VictoriaLogs/releases/tag/v1.53.0) and [VictoriaMetrics v1.155.0](https://github.com/VictoriaMetrics/VictoriaMetrics/releases/tag/v1.155.0). Their ports bind to localhost; named volumes preserve seven days of logs and fourteen days of metrics across container restarts. Use the same pair of `-f` arguments for `logs` and `down`; `down` keeps the volumes. To use the published game image, replace `docker-compose.local.yml` with `docker-compose.yml` and omit `--build`. Keep the [`observability/prometheus.yml`](./observability/prometheus.yml) file beside the manifests in its directory.

Both base Compose files support these server settings through `.env`:

| Setting | Default / purpose |
| --- | --- |
| `VICTORIALOGS_URL` | Empty: stdout only. Set the base URL of the server; the relay appends `/insert/jsonline`. The optional overlay supplies `http://victorialogs:9428`. |
| `VICTORIALOGS_TOKEN` | Optional server-side bearer token for an authenticated logs endpoint. |
| `INSTANCE_ID` | Hostname; set a stable name such as `games-vps-01` for each VPS. |
| `OBSERVABILITY_ENVIRONMENT` | `development` locally, `production` in the published Compose file. |
| `LOG_LEVEL` | `info`; also accepts `debug`, `warn`, and `error`. |
| `TELEMETRY_ALLOWED_ORIGINS` | Empty: same-origin only. Comma-separated browser origins when collecting from a separately hosted site. |
| `PINBALL_ALLOWED_ORIGINS` | Empty: same-origin only. Comma-separated browser origins allowed to use the pinball API when the game is hosted separately. |

The Docker image sets `PINBALL_SCORES_FILE=/data/pinball-scores.json`, backed by the Compose volume. When running the relay directly, the default is `./data/pinball-scores.json` relative to its working directory; set `PINBALL_SCORES_FILE` to another writable file when needed. Keep this data with a single relay instance; it is a file-backed leaderboard rather than a shared database.

For a future VPS with existing Victoria services, run the base Compose file with `VICTORIALOGS_URL` pointing to its reachable logs service. Keep credentials on the relay. Add this target to the VPS's VictoriaMetrics [Prometheus scrape configuration](https://docs.victoriametrics.com/victoriametrics/single-server-victoriametrics/#how-to-scrape-prometheus-exporters-such-as-node-exporter), adjusting the address for its private network:

```yaml
scrape_configs:
  - job_name: ai-games
    metrics_path: /metrics
    static_configs:
      - targets: ['127.0.0.1:14650'] # VictoriaMetrics running on the VPS host
        labels:
          instance: games-vps-01
```

VictoriaMetrics pulls metrics, so the game server needs no VictoriaMetrics URL. Within the same Compose network, use `games:14650` as in the supplied scrape file. Keep database and metrics access on the host or private network.

Vite development servers proxy `/telemetry` to `http://127.0.0.1:14650`. Set `TELEMETRY_PROXY_TARGET=http://127.0.0.1:14651` when the server uses a different host port. For Snow Drift without Docker, package the collection and run `STATIC_DIR="$PWD/deploy" pnpm run dev:server` from the repository root. Open <http://localhost:14650/snow_drift/>; rerun `pnpm run package:collection` after editing its source files.

For static hosting such as GitHub Pages, add `<meta name="telemetry-endpoint" content="https://relay.example.com/telemetry">` to each page and allow its origin on the relay, or use `content="off"` to disable delivery. Browser code never receives Victoria credentials. Shared telemetry avoids recording invite URLs and game payloads automatically; do not put player details, room codes, or secrets in custom logs. To emit a game event from an inline module in a game's `index.html`:

```js
import { telemetry } from '../../shared/telemetry.js'

telemetry.info('game_started', 'New game started', { difficulty: 'easy' })
// Also: debug, warn, error, and captureError(event, error, context?).
```

Use the same `game-id` as the game's catalogue entry. The shell initializes telemetry once, so new games inherit the automatic reporting.

## Shared multiplayer client

[`packages/multiplayer`](./packages/multiplayer) contains a TypeScript client without a UI-framework dependency. The lab and Dots & Boxes depend on it through a `workspace:*` package reference. Future games can use the same connection lifecycle, room membership, ready state, messaging, and live metrics without copying the lab UI. This example assumes the game is served from the Compose collection:

```ts
import { createMultiplayerClient } from '@ai-games/multiplayer'

const client = createMultiplayerClient({
  url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/relay`,
  appId: 'my-game',
  name: 'Player',
})

const unsubscribe = client.subscribe((state) => {
  console.log(state.status, state.room, state.latency.last)
})

client.join('room-123')

// When the game closes:
unsubscribe()
client.destroy()
```

After the subscription reports a room, send game actions with `client.send({ action: 'example' })`. Use a stable `appId` for each game so its rooms are isolated from other games. The relay owns transport and membership; game rules and synchronization remain the game's responsibility. See the [protocol and metrics reference](./docs/MULTIPLAYER.md).

## Games

| App | Source | Technology |
| --- | --- | --- |
| Multiplayer Lab | [`games/playground/`](./games/playground) | Vue, TypeScript, Vite, shared multiplayer client |
| Dots & Boxes | [`games/dots-and-boxes/`](./games/dots-and-boxes) | Vue, TypeScript, Vite; 2–4 players online or pass-and-play |
| Minesweeper | [`games/minesweeper/`](./games/minesweeper) | React, TypeScript, Vite |
| Snow Drift | [`games/snow-drift/`](./games/snow-drift) | JavaScript, browser rendering |
| Space Cadet Pinball | [`games/pinball/`](./games/pinball) | C++/SDL2 compiled with Emscripten to WebAssembly; TypeScript wrapper and server leaderboard |
| Sea Strike | [`games/sea-strike/`](./games/sea-strike) | Vue, TypeScript, Vite; existing Battleship implementation |

The games share a page header and footer through [`shared/game-shell.js`](./shared/game-shell.js), a small browser component that works with Vue, React, or plain JavaScript. Each game owns the content inside it. The common Node service lives in [`services/game-server/`](./services/game-server/). Sea Strike's design documents under `docs/01-*` through `docs/05-*`, phases, and tickets describe that game specifically; historical phases and tickets use the former `app/` and `relay/` source paths.

## Add a game

Create the game under `games/<id>/` and register its source and public route in [`games.json`](./games.json). Built games produce a static `dist/`; plain browser games are copied as-is. Use the shared shell and the same game ID for telemetry. See [Adding a game](./docs/ADDING_A_GAME.md) for the integration contract, native engine layout, and Docker build steps.

After [setting up pnpm](#local-development-and-checks), install dependencies, build registered games, and package the collection from the repository root:

```bash
node scripts/build-collection.mjs --install --build
```

This builds every game from source and writes `deploy/`. Thereafter, use `pnpm run build:collection` to rebuild source or `pnpm run package:collection` to assemble existing outputs. The catalogue drives the dashboard and direct builds. Docker builds ordinary apps in cached stages and copies Pinball from its independently published image; [Adding a game](./docs/ADDING_A_GAME.md) describes both patterns.

An all-source build requires Emscripten 4.0.23 when Pinball's generated engine is absent or out of date. Its [game Dockerfile](./games/pinball/Dockerfile) provides this toolchain. To reuse an extracted artifact already staged in `games/pinball/dist/`, run `node scripts/build-collection.mjs --install --build --skip-build=pinball`; this still installs Pinball's dependencies for tests. See [`games/pinball/README.md`](./games/pinball/README.md) for artifact extraction, engine and game-data instructions.

## Hosting

### Pull and run from GHCR

The [GHCR workflow](./.github/workflows/ghcr.yml) publishes `ghcr.io/a3tom/ai_games`, containing the dashboard, every registered game, and the multiplayer relay. A single Node process serves the collection and WebSocket connections on port 14650.

GHCR publishing and Pages first call [Build game artifact images](./.github/workflows/game-images.yml). This single workflow discovers `games/*/Dockerfile` and publishes each artifact as `ghcr.io/<owner>/<repository>-<game>`. It compares a fingerprint of committed game sources, shared code and build options with the current `latest` image, reuses matching artifacts, and builds changed or missing versions in parallel. Both hosting builds receive immutable image digests; Pages automatically extracts registered artifact games before packaging. [Adding a game](./docs/ADDING_A_GAME.md) describes optional build inputs and arguments.

Run **Build game artifact images** manually with `force_rebuild` to refresh all artifacts, including updated base images or external resources whose changes do not affect the source fingerprint. Rebuild the collection or rerun Pages afterward to include refreshed artifacts. Only the current default-branch HEAD advances artifact `latest` tags; source-fingerprint tags also preserve reuse of identical earlier inputs.

The workflow builds natively for Linux AMD64 with a 15-minute timeout. Pushes to `master` publish `latest`; `v*` Git tags publish matching image tags, such as `v1.2.3`. Every run also publishes `sha-<full-commit-sha>`. You can run **Publish image to GHCR** manually from the repository's Actions tab; only builds from `master` update `latest`.

Publishing uses the workflow's automatic `GITHUB_TOKEN` with `packages: write`; no additional registry secret is needed. After the first successful run, the collection and Pinball artifact appear under the repository owner's **Packages**. [GHCR packages start private](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). Make each package public for anonymous pulls, or log in with a personal access token (classic) that has `read:packages` and access to the required packages. Pulling the ready-made collection needs only its package; building it locally also needs the Pinball package:

```bash
# For a private package, enter your GitHub username and use the token as the password:
docker login ghcr.io
```

Use the `docker run` command above to pull and start the image without a source checkout or Compose file. To replace an existing container with a new image version, stop and remove it with `docker stop ai-games` and `docker rm ai-games`, then repeat the run command. Rooms and relay counters are ephemeral and reset on replacement.

Reuse the same `ai-games-data` volume when replacing the container to retain pinball scores. Back up the score file or volume before removing it.

Alternatively, copy [`docker-compose.yml`](./docker-compose.yml) to a directory on any Linux AMD64 host with Docker Compose. After the image has been published, run from that directory:

```bash
docker compose up -d --pull always --wait
```

Open <http://localhost:14650>, or `http://<host-IP>:14650` from another device. Multiplayer uses `/relay` on that same server; health is available at `/health` and `/relay/health`.

Repeat `docker compose up -d --pull always --wait` to update the running container. To deploy a specific version or commit, put `IMAGE_TAG=v1.2.3` or `IMAGE_TAG=sha-<full-commit-sha>` in a `.env` file beside the manifest. You can also set `HOST_PORT=14651` and the relay environment variables described above in that file. For a fork, set `GHCR_REPOSITORY=owner/repository` using lowercase names to match the workflow's image name.

```bash
docker compose ps
docker compose logs -f
docker compose down
```

The workflow publishes the image; run Docker or Compose on your deployment host to start it.

### GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) builds the same collection and publishes it to GitHub Pages on a push to `master`.

The collection is configured for <https://a3tom.github.io/ai_games/>; the lab's path is `/ai_games/playground/`. Relative asset paths allow the apps to run under that subdirectory.

Pages hosts static files, so deploy the relay separately as a long-running WebSocket service. Set the GitHub repository Actions variable `VITE_RELAY_URL` to its `wss://` endpoint before building; this configures all multiplayer apps. Alternatively, enter the endpoint in the lab or Dots & Boxes. No relay is provisioned by the Pages workflow.

For pinball scores on Pages, set the Actions variable `VITE_PINBALL_API_URL` to the relay's HTTPS API base, such as `https://relay.example.com/api/pinball`, and set the relay's `PINBALL_ALLOWED_ORIGINS=https://a3tom.github.io`. An origin has no path, so omit `/ai_games/` from that allowlist. Pages extracts `/dist` from the Pinball image and writes this URL into `runtime-config.js` before packaging; the frontend and engine are reused without recompilation. Rerun Pages after changing the variable. The reverse proxy must forward `/api/pinball/*` to the relay. An unavailable score API does not prevent playing. Set the Actions variable `PINBALL_SKIP_RESOURCE_DOWNLOAD=1` to select an artifact where visitors supply their own resource folder.

For HTTPS hosting of the container, place your TLS reverse proxy in front of port 14650 and pass WebSocket upgrades. The browser automatically selects `wss://` on HTTPS pages.

## Local development and checks

Use Node.js 24 and the pinned pnpm 10.34.9 release. From the repository root, enable Corepack and install dependencies once for every game, the shared client, and the server:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
```

[`pnpm-workspace.yaml`](./pnpm-workspace.yaml) includes `games/*`, `packages/*`, and `services/*`. The workspace fits this collection because multiple games already share `@ai-games/multiplayer`: `workspace:*` links that dependency to the local package. Each app keeps its own scripts, framework, and dependency versions. Snow Drift remains a plain browser game without a package manifest.

Commit dependency changes in the single root [`pnpm-lock.yaml`](./pnpm-lock.yaml); use `pnpm install` to update it after editing manifests. Docker installs dependencies for each app separately, but a root lockfile change invalidates those dependency layers. Individual pnpm projects would retain separate lockfiles and those cache boundaries, at the cost of repeated installs and manual local-package coordination.

For hot reload without Docker, run the relay and lab in separate terminals:

```bash
# Terminal 1
MAX_CLIENTS_PER_ROOM=4 pnpm --filter @ai-games/game-server run dev
```

```bash
# Terminal 2
pnpm --filter multiplayer-lab run dev
```

The standalone lab defaults to `ws://localhost:14650`. Its connection panel accepts another endpoint. Root commands provide common checks after the workspace install:

```bash
pnpm test                     # Tooling, server, client and registered game tests
pnpm run build                # Server and collection builds
pnpm run test:games           # Games with a test script
pnpm run package:collection   # Assemble existing outputs into deploy/
```

For pinball hot reload, activate Emscripten 4.0.23, build the engine, and run `pnpm --filter space-cadet-pinball run dev` alongside the relay. Its Vite server proxies `/api` and `/telemetry` to port 14650; see [`games/pinball/README.md`](./games/pinball/README.md) for engine builds, game resources, API configuration, and storage details.

After the workspace install, run `pnpm run dev` inside a game’s `games/<id>/` directory, or select its package from the root with `pnpm --filter <package-name> run dev`. For Snow Drift, use the staged collection as described in [its README](./games/snow-drift/README.md#how-to-run).
