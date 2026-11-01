# Overboard!

The original European PlayStation game runs in the browser through EmulatorJS 4.2.3 and the PCSX ReARMed WebAssembly core. The full disc, including its 31 data/audio tracks, is preserved. This is the original game running in an emulator; it retains the original levels, menus, physics, music, and local multiplayer rules.

## Run locally

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter overboard run dev
```

Open the URL printed by Vite and choose **Set sail**. The dev/build commands fetch a checksum-verified emulator runtime and import `reference-games/Overboard!` when present. Both outputs are reused on subsequent runs. The supplied disc boots with the core's built-in replacement BIOS; no Sony BIOS download is required.

The collection registers the page at `/overboard/`. After building the game, `pnpm run package:collection` includes it with the other games. Docker builds reuse its independent game image, as described below.

```bash
pnpm --filter overboard run build
pnpm --filter overboard test
```

## Run with Docker

Build the Overboard artifact from the repository root, then start the collection with it:

```bash
docker build -f games/overboard/Dockerfile -t ai-games-overboard:local .
OVERBOARD_IMAGE=ai-games-overboard:local docker compose -f docker-compose.local.yml up --build -d
```

Open <http://localhost:14650/overboard/>. The artifact contains the complete static game at `/dist`; the collection copies it into its existing shared Node server, so no extra runtime service is needed. Rebuild the artifact and collection after changing Overboard's source.

An existing `games/overboard/public/game-data/` import is included in the local artifact. If you have not prepared the disc yet, run `node games/overboard/scripts/prepare-media.mjs` from the repository root before building. The original reference folder is excluded from Docker's context. Without an import, the image still works and prompts players to select a local disc ZIP.

Local Compose defaults to `ghcr.io/${GHCR_REPOSITORY:-a3tom/ai_games}-overboard:latest`. `OVERBOARD_IMAGE_TAG` selects a published tag, `OVERBOARD_IMAGE` accepts an exact image or digest, and `OVERBOARD_PLATFORM` defaults to `linux/amd64`. Published Pinball and Overboard artifacts must be accessible when building the collection; see [registry authentication](../../README.md#hosting).

The shared [game image workflow](../../.github/workflows/game-images.yml) discovers this [Dockerfile](./Dockerfile) and publishes `ghcr.io/a3tom/ai_games-overboard`. Collection publishing uses its immutable digest; Pages automatically extracts `/dist` and skips rebuilding the game. Published artifacts contain the pinned emulator but no commercial disc because the media stays outside Git. Run the workflow with `force_rebuild` to refresh artifacts explicitly, then rebuild the hosting image or Pages.

## Controls and saves

Connect a USB or Bluetooth controller and press a button to expose it to the browser. The first player's face buttons follow their PlayStation positions: south is Cross, east is Circle, west is Square, north is Triangle. Use the D-pad by default; Control Settings in the player toolbar can remap controls, including the left stick. Gamepad access requires a browser that supports the Gamepad API and generally HTTPS or localhost. Keyboard input works when gamepad access is unavailable.

Click inside the player before using the keyboard:

| PlayStation input | Keyboard |
| --- | --- |
| D-pad | Arrow keys |
| Cross / Square / Circle / Triangle | X / Z / C / S |
| Start / Select | Enter / Shift |
| L1 / R1 | Q / E |
| L2 / R2 | A / D |

The original game explains actions through its menus. The player toolbar provides pause, restart, control remapping, volume, save/load states, and save-file export/import. In-game memory cards persist in this browser's IndexedDB; the core flushes them every 30 seconds. Save states use browser storage by default. Export backups before clearing browser data. Saves are local to the browser profile and origin; switching hostname, port, or device uses different storage.

**Expand** fills the display, keeping the page's exit control available. Escape exits native fullscreen. The player runs in a separate same-origin frame so its input listeners and styles remain isolated. Keyboard buttons are released when the frame loses focus.

## Disc preparation and hosting

Original disc files and generated assets stay outside Git. The default import produces an approximately **640 MiB ZIP** under `public/game-data/` containing the CUE and every referenced BIN, plus `manifest.json`. The original source files are never modified. The importer normalizes the supplied CUE's escaped line endings in the generated archive, checks all tracks, rejects paths outside the source folder, and streams the archive without loading the CD into Node memory.

To import another copy explicitly:

```bash
pnpm --filter overboard run resources:import --from '/path/to/Overboard!'
```

For an optional BIOS from your own console, import a 512 KiB dump alongside the disc:

```bash
pnpm --filter overboard run resources:import --from '/path/to/Overboard!' --bios /path/to/scph5502.bin
```

A previously imported BIOS is preserved when the disc is refreshed. The page also accepts a local disc ZIP or optional BIOS before starting. These selected files stay in browser memory and must be selected again after a reload. A disc ZIP must contain the CUE sheet and all referenced BIN tracks together; a single BIN loses the audio tracks. This pinned core does not advertise CHD support.

Source builds without the reference folder or an existing import still produce the complete player. It prompts for a local disc ZIP. CI and remote builds use that mode because the commercial disc is not committed. To bundle media in a local Docker image, run the importer before building the Overboard artifact; `.dockerignore` excludes the reference folder but permits the generated `public/game-data/` bundle. Serve that bundle only to the audience you intend to give access to the disc.

To supply an imported disc to the published artifact at runtime instead, create `docker-compose.overboard-data.yml` beside the local Compose manifest:

```yaml
services:
  games:
    volumes:
      - ./games/overboard/public/game-data:/collection/overboard/game-data:ro
```

```bash
docker compose -f docker-compose.local.yml -f docker-compose.overboard-data.yml up --build -d
```

Run the importer before using this mount so the folder contains `manifest.json` and the complete disc archive. Saves continue to live in the browser; no container save volume is needed for Overboard.

Runtime files are downloaded at build time from the pinned upstream distribution, checked against `emulator-lock.json`, and served locally. Normal deployed gameplay needs no external emulator CDN. Refresh them explicitly with `pnpm --filter overboard run emulator:fetch`. The emulator and its embedded core retain their licenses; see [runtime provenance](./EMULATOR_PROVENANCE.md). Single-threaded WebAssembly runs without COOP/COEP headers.

## Verification and mobile follow-up

Automated tests cover complete media imports, track validation, source preservation, runtime checksum verification, controller mappings, browser file selection, loading races, frame message validation, failure recovery, and held-key release. Browser QA boots the supplied disc with the replacement BIOS, enters gameplay, checks keyboard and simulated standard-gamepad input, and saves/restores a state. Physical hardware and every level still need play testing.

This version targets desktop. The responsive page and isolated emulator player allow a later mobile control layout without rewriting game rules. Mobile work remains: memory/download reduction for the full disc, real-device performance and audio testing, touch controls, and landscape/fullscreen behavior. Touch gameplay is not part of this iteration.
