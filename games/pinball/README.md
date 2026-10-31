# Space Cadet Pinball

The supplied SpaceCadetPinball C++/SDL2 engine runs in the browser through Emscripten and WebAssembly. A TypeScript interface loads the game, provides controls, and connects completed games to the collection's server leaderboard. The engine source and MIT license are retained under [`vendor/`](./vendor/); browser adaptations live in [`engine/`](./engine/).

## Game resources

The engine repository does not include the original game data. The build and development commands download the same resource archive used by the Flatpak package, verify its SHA-256, and import its game data and audio files. A valid existing bundle is reused, including resources you imported yourself. Generated resources remain outside Git and are included in the built site and Docker image.

The engine recognizes `PINBALL.DAT` from Windows, or `CADET.DAT` / `DEMO.DAT` from Full Tilt. Include the corresponding WAV sound files when supplying your own resources. This browser build supports sound effects; MIDI music is disabled because it needs a separate synthesizer and soundfont.

To use your own resources instead of the default archive, import your resource folder before building:

```bash
node games/pinball/scripts/import-resources.mjs --from /path/to/game-resources
```

This creates `games/pinball/public/game-data/manifest.json` and copies supported files beside it. This generated directory is ignored by Git. Vite copies it into the built site, and Docker includes it when present in the build context. Serve only resources you intend to make available to everyone who can access the game URL.

The default resource source is the Flatpak package's [Pinball.zip archive](https://archive.org/download/pinball_202007/Pinball.zip). Its expected SHA-256 is `1078b6ec75a36b5585061d1ebdd3f27019d97c1ab7c5a4bb9f1159932aae3109`. The fetch script verifies this before extraction and excludes the Windows executable. After [setting up pnpm](../../README.md#local-development-and-checks), prepare this bundle from the repository root:

```bash
pnpm install --frozen-lockfile
node games/pinball/scripts/fetch-resources.mjs
```

Set `PINBALL_SKIP_RESOURCE_DOWNLOAD=1` for a source build without downloading resources. If no bundle is present, players can select a resource folder in the browser. Selected files are loaded into browser memory; the leaderboard server receives scores, not those files. Select the folder again after reloading the page. For the independent game image, pass `--build-arg PINBALL_SKIP_RESOURCE_DOWNLOAD=1` to `docker build -f games/pinball/Dockerfile`; the root collection Dockerfile consumes its prepared output. For hosted builds, set the repository Actions variable with the same name; [image-build.json](./image-build.json) passes it through the shared game image workflow. Skipping downloads preserves any existing imported bundle; remove `games/pinball/public/game-data/` before building if you also want to exclude a local bundle.

You can also mount an imported bundle into an existing container. Create a `docker-compose.pinball-data.yml` file beside the local Compose manifest:

```yaml
services:
  games:
    volumes:
      - ./games/pinball/public/game-data:/collection/pinball/game-data:ro
```

After importing the files, run:

```bash
docker compose -f docker-compose.local.yml -f docker-compose.pinball-data.yml up --build -d
```

The bind-mounted directory must contain the generated manifest and its resource files. This optional mount is separate from the named volume that stores leaderboard scores. For a remote host, copy the imported bundle to that host and adjust the bind mount's source directory.

## Run locally

The local collection build reuses the published Pinball artifact:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

Open <http://localhost:14650/pinball/> and start a game. The default artifact includes the verified resource bundle. To include local Pinball changes, build its independent image first, then rebuild the collection using BuildKit:

```bash
docker build -f games/pinball/Dockerfile -t ai-games-pinball:local .
PINBALL_IMAGE=ai-games-pinball:local docker compose -f docker-compose.local.yml up --build -d
```

The [game Dockerfile](./Dockerfile) supplies Emscripten 4.0.23 and caches engine compilation, dependency installation and resource preparation separately. Its final scratch image contains only the website at `/dist`; it is copied into the collection at build time. The runtime still has one Node service and the existing score volume. `PINBALL_IMAGE_TAG` chooses a published tag, `PINBALL_IMAGE` accepts an exact image or digest, and `PINBALL_PLATFORM` defaults to the published artifact's `linux/amd64` platform.

For development without Docker, install and activate [Emscripten SDK 4.0.23](https://emscripten.org/docs/getting_started/downloads.html), then run these commands from the collection root:

```bash
pnpm install --frozen-lockfile
pnpm --filter space-cadet-pinball run build
pnpm --filter space-cadet-pinball run dev
```

Run the relay in a separate terminal:

```bash
pnpm --filter @ai-games/game-server run dev
```

Vite's `/api` and `/telemetry` proxies reach the relay at `http://127.0.0.1:14650`. The engine build emits `games/pinball/public/engine/space-cadet.js` and `space-cadet.wasm`; generated engine artifacts are ignored by Git. CMake builds from `games/pinball/engine/`, keeping the external workspace checkout independent of this application's build. Existing generated engine artifacts can be reused without a local Emscripten installation while their source fingerprint matches.

Use the page's controls to start a game, operate the flippers and plunger, pause, and save the final score. The browser interface translates input into the engine's controls. The original table's rules, physics, missions, and scoring run in the C++ engine.

Rendering follows the browser's display refresh rate, including 120, 144, 240, and 360 Hz displays. Physics uses fixed 360 Hz updates, independent of rendering, and the table is composed once per displayed frame. This improves motion above 120 FPS without speeding up the game. Actual FPS depends on the display, browser, and available CPU/GPU performance; a 60 Hz screen still displays up to 60 FPS. The original sprite artwork also limits how many distinct flipper animation frames are available.

```bash
pnpm --filter space-cadet-pinball test
pnpm --filter space-cadet-pinball run build
```

## Reuse the static artifact

The reusable/manual [game image workflow](../../.github/workflows/game-images.yml) discovers Pinball's Dockerfile alongside any other game Dockerfiles and publishes `ghcr.io/a3tom/ai_games-pinball`. Its fingerprint includes committed Pinball sources, `shared/`, `packages/`, the root package manifest and pnpm lockfile/workspace configuration, `.dockerignore`, the shared workflow/tooling and the resolved resource-download option from [image-build.json](./image-build.json). It compares the fingerprint with the current `latest` image and reuses matching artifacts, including historical source-fingerprint tags. Both collection publishing and Pages receive the immutable digest.

Run **Build game artifact images** manually with `force_rebuild` to refresh all game artifacts explicitly, including updated base images or external resources. Rebuild the collection or rerun Pages afterward to include the refreshed artifact. Only the current default-branch HEAD updates artifact `latest` tags.

To extract an image without running it:

```bash
pinball_image=ghcr.io/a3tom/ai_games-pinball:latest
docker pull --platform linux/amd64 "$pinball_image"
pinball_container="$(docker create "$pinball_image" /artifact-only)"
mkdir -p games/pinball/dist
docker cp "$pinball_container:/dist/." games/pinball/dist/
docker rm "$pinball_container"
node scripts/build-collection.mjs --install --build --skip-build=pinball
```

Use a digest in place of `latest` to select an exact artifact. This skips engine and frontend compilation while still installing dependencies for game tests. Access to the Pinball package is required when it is private; see [collection hosting](../../README.md#hosting).

## Server scores

The browser calls the same-origin `/api/pinball` API by default:

- `GET /scores` reads the top ten scores.
- `POST /runs` starts a score submission session and returns a `runId`.
- `POST /scores` submits `{runId, name, score}` once for that session.

Scores are calculated in the browser by the WebAssembly engine. The server validates submissions and session use, but this leaderboard is intended for casual play rather than verified competitive rankings. An unavailable API does not prevent playing with loaded resources; the UI reports that server scores are unavailable.

The relay writes scores atomically to `PINBALL_SCORES_FILE`, which defaults to `./data/pinball-scores.json` relative to the relay's working directory. The Docker image uses `/data/pinball-scores.json`; both Compose manifests mount the named `pinball-data` volume there. That volume survives ordinary restarts, rebuilds, and `docker compose down`. Removing the volume with `down -v` deletes scores. Mount `/data` yourself when using `docker run`; the collection README includes the command. The data file supports one relay instance and needs a writable parent directory.

## Separate static hosting

GitHub Pages serves the compiled engine and game interface but cannot run its score server. The same prebuilt game can use an external score API by replacing its served `runtime-config.js`:

```js
globalThis.AI_GAMES_PINBALL_CONFIG = { apiUrl: 'https://relay.example.com/api/pinball' }
```

This file loads before the game starts and can be changed without recompiling the browser interface or WASM engine. The default file has an empty URL: the client falls back to `VITE_PINBALL_API_URL` from the build, then same-origin `/api/pinball`. An explicit `LeaderboardApi` constructor URL takes precedence over all configuration. Keep runtime settings public; credentials belong on the server.

To configure an existing build safely from an environment variable, run:

```bash
VITE_PINBALL_API_URL=https://relay.example.com/api/pinball node games/pinball/scripts/configure-runtime.mjs
```

This updates `games/pinball/dist/runtime-config.js`; pass another built game directory as the final argument to configure an extracted artifact or staged copy. It checks that `index.html` exists before writing, and an unset variable writes the empty default.

For a direct Vite build, the existing build-time setting remains supported:

```bash
VITE_PINBALL_API_URL=https://relay.example.com/api/pinball pnpm --filter space-cadet-pinball run build
```

The Pages workflow takes this value from the repository Actions variable with the same name. It extracts the reusable image's `/dist`, runs the runtime configurator, then packages the collection without rebuilding Pinball. Set the Actions variable `PINBALL_SKIP_RESOURCE_DOWNLOAD=1` to select an artifact without a downloaded resource bundle; visitors can then select their local resource folder.

Configure the relay with `PINBALL_ALLOWED_ORIGINS=https://a3tom.github.io` (or your site's origin), and forward `/api/pinball/*` through its HTTPS proxy. Use comma-separated origins for multiple sites, without URL paths. The engine uses one browser thread and does not require cross-origin isolation headers.
