# AI Games Collection

A workshop for small browser games built with coding agents. Keep each game focused on its idea, and reuse multiplayer and diagnostics where they help.

Every app, including **Multiplayer Lab**, is listed on one dashboard. One Docker image runs the whole collection and the multiplayer relay together.

## Run the collection

After the [GHCR workflow](./.github/workflows/ghcr.yml) has published the image, run this command on any Linux AMD64 host with Docker (see [Hosting](#hosting) for registry authentication):

```bash
docker run -d --name ai-games --restart unless-stopped --pull always -p 14650:14650 ghcr.io/a3tom/ai_games:latest
```

Open <http://localhost:14650>. The dashboard links to Multiplayer Lab, Minesweeper, Snow Drift, and Sea Strike. No local Node installation or separate Vite process is needed.

To share it with another device on your network, open `http://<your-computer-LAN-IP>:14650` on that device, for example `http://192.168.1.20:14650`. On Linux, `hostname -I` lists your machine's addresses; choose the one for your Ethernet or Wi-Fi network. On Windows, use `ipconfig`; on macOS, look in Network settings.

The web port listens on all host interfaces. Both devices must be on the same reachable network, your firewall must allow incoming TCP 14650, and guest Wi-Fi/client isolation must permit access to your computer. Docker Desktop may require allowing incoming connections. No router port forwarding is needed for LAN access.

The lab automatically uses the relay at the address you opened: `ws://<host>:14650/relay` over HTTP, or `wss://<host>/relay` behind HTTPS. Create rooms from the LAN URL so invite links point to an address other devices can reach. A link containing `localhost` only works on the computer that opened it.

**Sea Strike has an existing browser requirement:** creating a game and committing a board need Web Crypto, available on localhost or HTTPS. Its page is included in the dashboard, but playing from another device requires serving this stack behind a trusted HTTPS reverse proxy. The lab's multiplayer tests work over HTTP on your LAN. Snow Drift currently loads Three.js from a CDN, so it needs Internet access.

Useful commands:

```bash
docker logs -f ai-games
docker stop ai-games
docker start ai-games
```

Use `-p 14651:14650` in the run command if host port 14650 is occupied. The dashboard, games, and WebSocket relay all share the published port. Lab rooms allow four players by default; legacy Sea Strike rooms remain limited to two. Pass `-e MAX_CLIENTS_PER_ROOM=8`, `-e MAX_ROOMS=50`, or `-e ROOM_TIMEOUT_MS=60000` to `docker run` to override relay limits. Room state and counters reset when the container restarts.

If you prefer Compose, copy [`docker-compose.yml`](./docker-compose.yml) to your host and run `docker compose up -d --pull always --wait`. It runs the same single image. Use `docker compose logs -f` and `docker compose down` to view logs and stop it. Configure `HOST_PORT`, relay limits, and `IMAGE_TAG` through a `.env` file beside the manifest.

To build and test your current source code, use the standalone [`docker-compose.local.yml`](./docker-compose.local.yml):

```bash
docker compose -f docker-compose.local.yml up --build -d
# With the local stack running, connect a separate Vite development server:
VITE_RELAY_URL=ws://localhost:14650/relay npm run dev --prefix playground
```

The local dashboard, games, and relay share port 14650. Browser files in the container are production builds; rerun `docker compose -f docker-compose.local.yml up --build -d` after changing source files.

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

The games share a page header and footer through [`shared/game-shell.js`](./shared/game-shell.js), a small browser component that works with Vue, React, or plain JavaScript. Each game owns the content inside it. Sea Strike's design documents under `docs/01-*` through `docs/05-*`, phases, and tickets describe that game specifically.

## Add a game

[`games.json`](./games.json) is the shared catalogue for the dashboard, Docker image, and Pages build. Add one entry with an ID, title, description, icon, tags, public path, source directory, and `build` flag.

- For a Vite app, set `build: true`, provide a lockfile and `npm run build` producing `dist/`, and use relative asset paths (`base: './'`).
- For plain browser files, set `build: false`; the source directory is copied as-is.
- For multiplayer, use a unique `appId` with the shared client. Resolve the configured `/relay` endpoint against the page origin for a Compose build.

Wrap the game's mount point in the shared shell in its `index.html`:

```html
<game-shell page-title="My Game" home-href="../">
  <div id="app"></div>
</game-shell>
<script type="module">import '../shared/game-shell.js'</script>
```

Vite bundles the shell automatically; the collection build copies it for plain browser games. Keep the game layout inside this wrapper rather than sizing it to the whole browser window. The shell has an empty `shared` slot for future collection features. Shared features can be added centrally in `shared/game-shell.js`, or supplied as a direct child with `slot="shared"`.

For a plain browser game that imports the shell, serve the repository root and open its subdirectory, for example `python3 -m http.server 8000` then `http://localhost:8000/snow_drift/`.

The collection script installs/builds registered apps and packages them at their declared paths:

```bash
node scripts/build-collection.mjs --install --build
```

This writes `deploy/`. With dependencies installed, omit `--install`; with app builds already present, omit both flags to package them. Adding a catalogue entry includes the game in both hosting paths without editing the dashboard or Dockerfile.

## Hosting

### Pull and run from GHCR

The [GHCR workflow](./.github/workflows/ghcr.yml) publishes one image, `ghcr.io/a3tom/ai_games`, containing the dashboard, every registered game, and the multiplayer relay. A single Node process serves the collection and WebSocket connections on port 14650.

The workflow builds natively for Linux AMD64 with a 20-minute timeout. Pushes to `master` publish `latest`; `v*` Git tags publish matching image tags, such as `v1.2.3`. Every run also publishes `sha-<full-commit-sha>`. You can run **Publish image to GHCR** manually from the repository's Actions tab; only builds from `master` update `latest`.

Publishing uses the workflow's automatic `GITHUB_TOKEN` with `packages: write`; no additional registry secret is needed. After the first successful run, the package appears under the repository owner's **Packages**. [GHCR packages start private](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). Make the package public for anonymous pulls, or log in on the deployment host with a personal access token (classic) that has `read:packages` and access to the package:

```bash
# For a private package, enter your GitHub username and use the token as the password:
docker login ghcr.io
```

Use the `docker run` command above to pull and start the image without a source checkout or Compose file. To replace an existing container with a new image version, stop and remove it with `docker stop ai-games` and `docker rm ai-games`, then repeat the run command. Rooms and relay counters are ephemeral and reset on replacement.

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

Pages hosts static files, so deploy the relay separately as a long-running WebSocket service. Set the GitHub repository Actions variable `VITE_RELAY_URL` to its `wss://` endpoint before building; this configures both multiplayer apps. Alternatively, enter the endpoint in the lab. No relay is provisioned by the Pages workflow.

For HTTPS hosting of the container, place your TLS reverse proxy in front of port 14650 and pass WebSocket upgrades. The browser automatically selects `wss://` on HTTPS pages.

## Local development and checks

For hot reload without Docker, run the relay and lab in separate terminals after installing dependencies:

```bash
npm ci --prefix relay
MAX_CLIENTS_PER_ROOM=4 npm run dev --prefix relay

npm ci --prefix playground
npm run dev --prefix playground
```

The standalone lab defaults to `ws://localhost:14650`. Its connection panel accepts another endpoint.

```bash
npm test --prefix relay
npm run build --prefix relay

npm ci --prefix packages/multiplayer
npm test --prefix packages/multiplayer
npm run type-check --prefix packages/multiplayer

npm run build --prefix playground
```

To work on the older games, run `npm ci` and `npm run dev` inside `minesweeper/` or `app/`. For Snow Drift, serve the repository root with a local HTTP server and open `/snow_drift/`.
