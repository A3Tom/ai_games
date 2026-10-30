# AI Games Collection

A workshop for small browser games built with coding agents. Keep each game focused on its idea, and reuse multiplayer and diagnostics where they help.

Every app, including **Multiplayer Lab**, is listed on one dashboard. Docker Compose runs the whole collection and the multiplayer relay together.

## Run the collection

The default Compose file runs published GHCR images. After the [GHCR workflow](./.github/workflows/ghcr.yml) has published them, run from the repository root (see [Hosting](#hosting) for registry authentication):

```bash
docker compose pull
docker compose up -d --wait
```

Open <http://localhost:8080>. The dashboard links to Multiplayer Lab, Minesweeper, Snow Drift, and Sea Strike. No local Node installation or separate Vite process is needed.

To share it with another device on your network, open `http://<your-computer-LAN-IP>:8080` on that device, for example `http://192.168.1.20:8080`. On Linux, `hostname -I` lists your machine's addresses; choose the one for your Ethernet or Wi-Fi network. On Windows, use `ipconfig`; on macOS, look in Network settings.

The web port listens on all host interfaces. Both devices must be on the same reachable network, your firewall must allow incoming TCP 8080, and guest Wi-Fi/client isolation must permit access to your computer. Docker Desktop may require allowing incoming connections. No router port forwarding is needed for LAN access.

The lab automatically uses the relay at the address you opened: `ws://<host>:8080/relay` over HTTP, or `wss://<host>/relay` behind HTTPS. Create rooms from the LAN URL so invite links point to an address other devices can reach. A link containing `localhost` only works on the computer that opened it.

**Sea Strike has an existing browser requirement:** creating a game and committing a board need Web Crypto, available on localhost or HTTPS. Its page is included in the dashboard, but playing from another device requires serving this stack behind a trusted HTTPS reverse proxy. The lab's multiplayer tests work over HTTP on your LAN. Snow Drift currently loads Three.js from a CDN, so it needs Internet access.

Useful commands:

```bash
docker compose logs -f
docker compose down
# Use a different web port if 8080 is occupied:
HOST_PORT=8090 docker compose up -d --wait
```

The default stack keeps the relay private inside Compose. Lab rooms allow four players by default; legacy Sea Strike rooms remain limited to two. Override `MAX_CLIENTS_PER_ROOM`, `MAX_ROOMS`, or `ROOM_TIMEOUT_MS` through environment variables or a root `.env` file. Room state and counters reset when the relay restarts. Repeat `docker compose pull` and `docker compose up -d --wait` to update published images.

To build and test your current source code, use the standalone [`docker-compose.local.yml`](./docker-compose.local.yml). It runs the whole collection and also exposes the raw relay on **127.0.0.1:8081** for a separate development server:

```bash
docker compose -f docker-compose.local.yml up --build -d
# With the local stack running, connect a separate Vite development server:
VITE_RELAY_URL=ws://localhost:8081 npm run dev --prefix playground
```

The local dashboard and games run on port 8080. Browser files in the containers are production builds; rerun `docker compose -f docker-compose.local.yml up --build -d` after changing source files. The raw relay development port stays bound to localhost.

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

## Shared multiplayer client

[`packages/multiplayer`](./packages/multiplayer) contains a TypeScript client without a UI-framework dependency. The lab depends on it through a local package reference. Future games can use the same connection lifecycle, room membership, ready state, messaging, and live metrics without copying the lab UI. This example assumes the game is served from the Compose collection:

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
| Multiplayer Lab | [`playground/`](./playground) | Vue, TypeScript, Vite, shared multiplayer client |
| Minesweeper | [`minesweeper/`](./minesweeper) | React, TypeScript, Vite |
| Snow Drift | [`snow_drift/`](./snow_drift) | JavaScript, browser rendering |
| Sea Strike | [`app/`](./app) | Vue, TypeScript, Vite; existing Battleship implementation |

The existing games keep their own structure. Sea Strike's design documents under `docs/01-*` through `docs/05-*`, phases, and tickets describe that game specifically.

## Add a game

[`games.json`](./games.json) is the shared catalogue for the dashboard, Docker image, and Pages build. Add one entry with an ID, title, description, icon, tags, public path, source directory, and `build` flag.

- For a Vite app, set `build: true`, provide a lockfile and `npm run build` producing `dist/`, and use relative asset paths (`base: './'`).
- For plain browser files, set `build: false`; the source directory is copied as-is.
- For multiplayer, use a unique `appId` with the shared client. Resolve the configured `/relay` endpoint against the page origin for a Compose build.

The collection script installs/builds registered apps and packages them at their declared paths:

```bash
node scripts/build-collection.mjs --install --build
```

This writes `deploy/`. With dependencies installed, omit `--install`; with app builds already present, omit both flags to package them. Adding a catalogue entry includes the game in both hosting paths without editing the dashboard or Dockerfile.

## Hosting

### Pull and run from GHCR

The [GHCR workflow](./.github/workflows/ghcr.yml) publishes the web collection and relay as `ghcr.io/a3tom/ai_games-web` and `ghcr.io/a3tom/ai_games-relay`, with images for Linux AMD64 and ARM64. Pushes to `master` publish `latest`; `v*` Git tags publish matching image tags, such as `v1.2.3`. Every run also publishes `sha-<full-commit-sha>`. You can run **Publish containers to GHCR** manually from the repository's Actions tab; only builds from `master` update `latest`.

Publishing uses the workflow's automatic `GITHUB_TOKEN` with `packages: write`; no additional registry secret is needed. After the first successful run, both packages appear under the repository owner's **Packages**. [GHCR packages start private](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). Make both packages public for anonymous pulls, or log in on the deployment host with a personal access token (classic) that has `read:packages` and access to both packages:

```bash
# For private packages, enter your GitHub username and use the token as the password:
docker login ghcr.io
```

Copy [`docker-compose.yml`](./docker-compose.yml) to a directory on any host with Docker Compose. This is the default deployment manifest; the host does not need the source code or Node. After the images have been published, run from that directory:

```bash
docker compose pull
docker compose up -d --wait
```

Open <http://localhost:8080>, or `http://<host-IP>:8080` from another device. The web image includes the dashboard and all registered games, and proxies multiplayer connections to the private relay at `/relay`.

Repeat `pull` and `up -d --wait` to update running containers. To deploy a specific version or commit, put `IMAGE_TAG=v1.2.3` or `IMAGE_TAG=sha-<full-commit-sha>` in a `.env` file beside the manifest; both services use the same tag. You can also set `HOST_PORT=8090` and the relay environment variables described above in that file. For a fork, set `GHCR_REPOSITORY=owner/repository` using lowercase names to match the workflow's image names.

```bash
docker compose ps
docker compose logs -f
docker compose down
```

The workflow publishes images; run the Compose commands on your deployment host to deploy them.

### GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) builds the same collection and publishes it to GitHub Pages on a push to `master`.

The collection is configured for <https://a3tom.github.io/ai_games/>; the lab's path is `/ai_games/playground/`. Relative asset paths allow the apps to run under that subdirectory.

Pages hosts static files, so deploy the relay separately as a long-running WebSocket service. Set the GitHub repository Actions variable `VITE_RELAY_URL` to its `wss://` endpoint before building; this configures both multiplayer apps. Alternatively, enter the endpoint in the lab. No relay is provisioned by the Pages workflow.

The Compose stack includes an Nginx web server with a same-origin WebSocket proxy at `/relay` and relay health at `/health`. For HTTPS hosting, place your TLS reverse proxy in front of the web service and pass WebSocket upgrades. The browser automatically selects `wss://` on HTTPS pages.

## Local development and checks

For hot reload without Docker, run the relay and lab in separate terminals after installing dependencies:

```bash
npm ci --prefix relay
MAX_CLIENTS_PER_ROOM=4 npm run dev --prefix relay

npm ci --prefix playground
npm run dev --prefix playground
```

The standalone lab defaults to `ws://localhost:8080`. Its connection panel accepts another endpoint.

```bash
npm test --prefix relay
npm run build --prefix relay

npm ci --prefix packages/multiplayer
npm test --prefix packages/multiplayer
npm run type-check --prefix packages/multiplayer

npm run build --prefix playground
```

To work on the older games, run `npm ci` and `npm run dev` inside `minesweeper/` or `app/`. Serve `snow_drift/` with a local HTTP server.
