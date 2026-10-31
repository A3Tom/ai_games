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

The default resource source is the Flatpak package's [Pinball.zip archive](https://archive.org/download/pinball_202007/Pinball.zip). Its expected SHA-256 is `1078b6ec75a36b5585061d1ebdd3f27019d97c1ab7c5a4bb9f1159932aae3109`. The fetch script verifies this before extraction and excludes the Windows executable. To prepare this bundle directly:

```bash
npm ci --prefix games/pinball
node games/pinball/scripts/fetch-resources.mjs
```

Set `PINBALL_SKIP_RESOURCE_DOWNLOAD=1` to build without downloading resources. If no bundle is present, players can select a resource folder in the browser. Selected files are loaded into browser memory; the leaderboard server receives scores, not those files. Select the folder again after reloading the page. For Docker, pass `--build-arg PINBALL_SKIP_RESOURCE_DOWNLOAD=1` to `docker build`; for Pages, set the repository Actions variable with the same name. This skips downloading and preserves any existing imported bundle; remove `games/pinball/public/game-data/` before building if you also want to exclude a local bundle.

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

Docker compiles the engine using Emscripten 4.0.23 and builds the complete collection:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

Open <http://localhost:14650/pinball/> and start a game. The default build includes the verified resource bundle.

For development without Docker, install and activate [Emscripten SDK 4.0.23](https://emscripten.org/docs/getting_started/downloads.html), then run these commands from the collection root:

```bash
npm ci --prefix games/pinball
npm run build --prefix games/pinball
npm run dev --prefix games/pinball
```

Run the relay in a separate terminal:

```bash
npm ci --prefix services/game-server
npm run dev --prefix services/game-server
```

Vite's `/api` and `/telemetry` proxies reach the relay at `http://127.0.0.1:14650`. The engine build emits `games/pinball/public/engine/space-cadet.js` and `space-cadet.wasm`; generated engine artifacts are ignored by Git. CMake builds from `games/pinball/engine/`, keeping the external workspace checkout independent of this application's build. Existing generated engine artifacts can be reused without a local Emscripten installation while their source fingerprint matches.

Use the page's controls to start a game, operate the flippers and plunger, pause, and save the final score. The browser interface translates input into the engine's controls. The original table's rules, physics, missions, and scoring run in the C++ engine.

Rendering follows the browser's display refresh rate, including 120, 144, 240, and 360 Hz displays. Physics uses fixed 360 Hz updates, independent of rendering, and the table is composed once per displayed frame. This improves motion above 120 FPS without speeding up the game. Actual FPS depends on the display, browser, and available CPU/GPU performance; a 60 Hz screen still displays up to 60 FPS. The original sprite artwork also limits how many distinct flipper animation frames are available.

```bash
npm test --prefix games/pinball
npm run build --prefix games/pinball
```

## Server scores

The browser calls the same-origin `/api/pinball` API by default:

- `GET /scores` reads the top ten scores.
- `POST /runs` starts a score submission session and returns a `runId`.
- `POST /scores` submits `{runId, name, score}` once for that session.

Scores are calculated in the browser by the WebAssembly engine. The server validates submissions and session use, but this leaderboard is intended for casual play rather than verified competitive rankings. An unavailable API does not prevent playing with loaded resources; the UI reports that server scores are unavailable.

The relay writes scores atomically to `PINBALL_SCORES_FILE`, which defaults to `./data/pinball-scores.json` relative to the relay's working directory. The Docker image uses `/data/pinball-scores.json`; both Compose manifests mount the named `pinball-data` volume there. That volume survives ordinary restarts, rebuilds, and `docker compose down`. Removing the volume with `down -v` deletes scores. Mount `/data` yourself when using `docker run`; the collection README includes the command. The data file supports one relay instance and needs a writable parent directory.

## Separate static hosting

GitHub Pages serves the compiled engine and game interface but cannot run its score server. Before building, set `VITE_PINBALL_API_URL` to a full HTTPS API base:

```bash
VITE_PINBALL_API_URL=https://relay.example.com/api/pinball npm run build --prefix games/pinball
```

The Pages workflow takes this value from the repository Actions variable with the same name and installs Emscripten 4.0.23 for the engine build. It downloads and verifies the default game resources during the build. Set the Actions variable `PINBALL_SKIP_RESOURCE_DOWNLOAD=1` to deploy without downloading a resource bundle; visitors can then select their local resource folder.

Configure the relay with `PINBALL_ALLOWED_ORIGINS=https://a3tom.github.io` (or your site's origin), and forward `/api/pinball/*` through its HTTPS proxy. Use comma-separated origins for multiple sites, without URL paths. The engine uses one browser thread and does not require cross-origin isolation headers.
