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

- **Built games:** provide `package.json`, a committed lockfile, and `npm run build` producing a self-contained static `dist/index.html` plus assets. Use relative asset URLs (`base: './'` in Vite) so the game works under both `/<path>/` and GitHub Pages' repository prefix.
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

Vite bundles that source import. A plain browser page deployed one level below the dashboard instead loads `../shared/game-shell.js` directly. Custom telemetry imports follow the same source-versus-deployed distinction. A game using the multiplayer client references it as `file:../../packages/multiplayer` in its dependencies.

## Native engines and builds

Keep native port details local to the game: `engine/` for browser adaptations, `vendor/` for upstream code and notices, `scripts/` for compilation and resource preparation, and `public/` for runtime assets. Record the toolchain version and resource provenance in the game's README. Ignore generated artifacts, and make the game build prepare or verify them before bundling. [Pinball](../games/pinball/README.md) is the reference.

Add a cached per-game build stage to the root [Dockerfile](../Dockerfile) and copy its output into the collection assembly stage. Install dependencies before copying frequently changing source; isolate native compilation from the browser UI build. For a different native toolchain, configure its setup in [Pages CI](../.github/workflows/deploy.yml) as well. For a plain browser game, add a source `COPY` to the collection assembly stage. Docker uses explicit copies to preserve cache isolation; the direct collection script and Pages build discover games through the registry.

## Check and package

Run from the repository root:

```bash
node scripts/build-collection.mjs --install --build
npm run test:games
```

The first command writes `deploy/`. It requires each native game's toolchain when valid generated artifacts are unavailable. After initial installation, use `npm run build:collection` to rebuild or `npm run package:collection` to package existing outputs. `npm test` also checks build tooling, the shared server and the multiplayer client. Registered npm games with a `test` script are discovered automatically.

Open the game through the local Docker stack, or serve the staged collection with `STATIC_DIR="$PWD/deploy" npm run dev:server`. Check its public route, assets, shell navigation and telemetry. For plain browser games, rerun `npm run package:collection` after source edits. Include game-specific setup and verification steps in its README.
