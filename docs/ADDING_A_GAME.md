# Adding a game

Put each game in `games/<id>/` and add its entry to [`games.json`](../games.json):

```json
{
  "id": "my-game",
  "title": "My Game",
  "description": "A short description.",
  "icon": "🎮",
  "tags": ["Solo"],
  "path": "my-game",
  "source": "games/my-game",
  "build": true
}
```

`source` is a repository-relative directory; `path` is the published URL segment. Keep IDs and routes unique. Changing a source folder does not require changing its URL.

## Integration contract

- **Built games:** provide a uniquely named `package.json` and `pnpm run build` producing a self-contained static `dist/index.html` plus assets. The `games/*` workspace pattern includes the package automatically; run `pnpm install` at the repository root and commit the updated root `pnpm-lock.yaml`. Use relative asset URLs (`base: './'` in Vite) so the game works under both `/<path>/` and GitHub Pages' repository prefix.
- **Plain browser games:** set `build: false`; the packager copies the source directory as-is. Keep deployed shell imports relative to the public route, as in [Snow Drift](../games/snow-drift/index.html).
- **Shell and telemetry:** use the catalogue ID for `game-id`, telemetry and multiplayer `appId`. The shell initializes automatic page-load and error reporting. Keep game content inside the wrapper.
- **Optional services:** use [`packages/multiplayer`](../packages/multiplayer/) for room transport and implement game rules and synchronization in the browser. Proxy `/relay`, `/telemetry`, and any required API during development. Scores currently use Pinball's dedicated API; add shared leaderboard behavior when another game needs it.

For a Vite game at `games/my-game/`, use this in `index.html`:

```html
<game-shell game-id="my-game" page-title="My Game" home-href="../">
  <div id="app"></div>
</game-shell>
<script type="module">import '../../shared/game-shell.js'</script>
```

Vite bundles that source import. A plain browser page deployed one level below the dashboard instead loads `../shared/game-shell.js` directly. Custom telemetry imports follow the same source-versus-deployed distinction. A game using the multiplayer client references `@ai-games/multiplayer` as `workspace:*` in its dependencies.

## Native engines and builds

Keep native port details local to the game: `engine/` for browser adaptations, `vendor/` for upstream code and notices, `scripts/` for compilation and resource preparation, and `public/` for runtime assets. Record the toolchain version and resource provenance in the game's README. Ignore generated artifacts, and make the game build prepare or verify them before bundling. [Pinball](../games/pinball/README.md) is the reference.

For ordinary web apps, add a cached build stage and output `COPY` to the root [Dockerfile](../Dockerfile). Copy the root manifest, lockfile, workspace configuration, and required package manifests before running `pnpm --filter '<package-name>...' install --frozen-lockfile`; then copy frequently changing source. The filter includes local package dependencies. For a plain browser game, add a source `COPY` to the collection assembly stage. The direct collection script discovers both through the registry.

Any game can use an independent artifact image, including expensive native ports:

1. Add `games/<id>/Dockerfile`, built with the repository root as context. Compile the engine separately from the interface and resources; its final artifact image exposes the complete static site at `/dist`.
2. The shared [game image workflow](../.github/workflows/game-images.yml) discovers the Dockerfile automatically and publishes `ghcr.io/<owner>/<repository>-<id>`. No per-game workflow is needed. It fingerprints committed game files, `shared/`, `packages/`, the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.dockerignore`, the shared build workflow/tooling, and resolved build arguments. If the Dockerfile copies other repository inputs, declare them in the optional `games/<id>/image-build.json` below.
3. Copy `/dist` from the artifact into the root collection Dockerfile and pass its digest from the GHCR workflow's returned image map, following Pinball's `PINBALL_IMAGE` argument. Pages automatically extracts registered artifact games before packaging and skips their source builds. Keep hosting-specific settings in a small runtime configuration file so both consumers can reuse one frontend build.

For example, an optional `image-build.json` can declare extra repository-relative inputs and Docker build arguments:

```json
{
  "inputs": ["scripts/my-game-assets.mjs"],
  "buildArgs": {
    "ASSET_FORMAT": "webp",
    "SKIP_RESOURCE_DOWNLOAD": {
      "variable": "MY_GAME_SKIP_RESOURCE_DOWNLOAD",
      "default": "0"
    }
  }
}
```

`variable` names a repository Actions variable; its value, or the fallback `default`, becomes the build argument and part of the fingerprint. Pinball's [configuration](../games/pinball/image-build.json) preserves the existing `PINBALL_SKIP_RESOURCE_DOWNLOAD` variable. Do not put secrets in build arguments.

The workflow compares the fingerprint with a label on each current GHCR `latest` image. Matching images and identical historical `source-<fingerprint>` tags are reused by digest; missing or changed inputs are built in parallel. Only the current default-branch HEAD advances `latest`. Run **Build game artifact images** manually with `force_rebuild` to rebuild all discovered games when base images or external resources change without source changes.

Artifact images are build inputs. The runtime remains one shared game server, with the existing observability and data volume. A forced artifact rebuild takes effect when the collection or Pages is rebuilt.

## Check and package

Run from the repository root:

```bash
node scripts/build-collection.mjs --install --build
pnpm run test:games
```

The first command installs the workspace once with the frozen root lockfile, builds all games from source, and writes `deploy/`; it requires native toolchains when valid generated artifacts are unavailable. After initial installation, use `pnpm run build:collection` for source builds or `pnpm run package:collection` to package existing outputs. `pnpm test` also checks build tooling, the shared server and the multiplayer client. Registered games with a `test` script are discovered automatically.

To reuse Pinball's artifact, first [extract its `/dist` output](../games/pinball/README.md#reuse-the-static-artifact) into `games/pinball/dist/`, then run `node scripts/build-collection.mjs --install --build --skip-build=pinball`. The skip flag preserves its prebuilt output while still installing dependencies for tests. Future independent games use the same flag with their registered ID.

Open the game through the local Docker stack, or serve the staged collection with `STATIC_DIR="$PWD/deploy" pnpm run dev:server`. Check its public route, assets, shell navigation and telemetry. For plain browser games, rerun `pnpm run package:collection` after source edits. Include game-specific setup and verification steps in its README.
