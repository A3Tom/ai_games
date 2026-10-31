# syntax=docker/dockerfile:1

# Native toolchains stay in build stages; the runtime only needs static output.
FROM emscripten/emsdk:4.0.23 AS pinball-engine-builder
WORKDIR /workspace
COPY games/pinball/engine/ ./games/pinball/engine/
COPY games/pinball/vendor/ ./games/pinball/vendor/
COPY games/pinball/scripts/build-engine.mjs ./games/pinball/scripts/build-engine.mjs
RUN emcmake cmake -S games/pinball/engine -B /tmp/pinball-engine \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_RUNTIME_OUTPUT_DIRECTORY=/out \
    && cmake --build /tmp/pinball-engine --parallel 2 \
    && node games/pinball/scripts/build-engine.mjs --stamp /out

# Each game's dependencies and build have their own cache. Changes to another
# game or the dashboard do not reinstall dependencies or rebuild this game.
FROM node:24-alpine AS playground-builder
WORKDIR /workspace/games/playground
COPY packages/multiplayer/package.json /workspace/packages/multiplayer/package.json
COPY games/playground/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY packages/multiplayer/src/ /workspace/packages/multiplayer/src/
COPY shared/ /workspace/shared/
COPY games/playground/ ./
ARG VITE_RELAY_URL=/relay
RUN npm run build

FROM node:24-alpine AS dots-and-boxes-builder
WORKDIR /workspace/games/dots-and-boxes
COPY packages/multiplayer/package.json /workspace/packages/multiplayer/package.json
COPY games/dots-and-boxes/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY packages/multiplayer/src/ /workspace/packages/multiplayer/src/
COPY shared/ /workspace/shared/
COPY games/dots-and-boxes/ ./
ARG VITE_RELAY_URL=/relay
RUN npm run build

FROM node:24-alpine AS minesweeper-builder
WORKDIR /workspace/games/minesweeper
COPY games/minesweeper/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY shared/ /workspace/shared/
COPY games/minesweeper/ ./
RUN npm run build

FROM node:24-alpine AS sea-strike-builder
WORKDIR /workspace/games/sea-strike
COPY games/sea-strike/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY shared/ /workspace/shared/
COPY games/sea-strike/ ./
ARG VITE_RELAY_URL=/relay
RUN npm run build

FROM node:24-alpine AS pinball-dependencies
WORKDIR /workspace/games/pinball
COPY games/pinball/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# Resource downloads are cached separately from the browser interface and engine.
# Locally imported public/game-data remains part of the build context.
FROM pinball-dependencies AS pinball-resources
COPY games/pinball/scripts/ ./scripts/
COPY games/pinball/public/ ./public/
ARG PINBALL_SKIP_RESOURCE_DOWNLOAD=0
RUN node scripts/fetch-resources.mjs

FROM pinball-dependencies AS pinball-builder
COPY shared/ /workspace/shared/
COPY games/pinball/ ./
COPY --from=pinball-resources /workspace/games/pinball/public/ ./public/
COPY --from=pinball-engine-builder /out/ ./public/engine/
ARG PINBALL_SKIP_RESOURCE_DOWNLOAD=0
RUN npm run build

# Assemble the catalogue from game artifacts; no game builds happen here.
FROM node:24-alpine AS collection-builder
WORKDIR /workspace
COPY scripts/ ./scripts/
COPY games.json index.html ./
COPY shared/ ./shared/
COPY games/snow-drift/ ./games/snow-drift/
COPY --from=playground-builder /workspace/games/playground/dist/ ./games/playground/dist/
COPY --from=dots-and-boxes-builder /workspace/games/dots-and-boxes/dist/ ./games/dots-and-boxes/dist/
COPY --from=minesweeper-builder /workspace/games/minesweeper/dist/ ./games/minesweeper/dist/
COPY --from=sea-strike-builder /workspace/games/sea-strike/dist/ ./games/sea-strike/dist/
COPY --from=pinball-builder /workspace/games/pinball/dist/ ./games/pinball/dist/
RUN node scripts/build-collection.mjs /collection

FROM node:24-alpine AS server-builder
WORKDIR /server
COPY services/game-server/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY services/game-server/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=14650 STATIC_DIR=/collection MAX_CLIENTS_PER_ROOM=4 PINBALL_SCORES_FILE=/data/pinball-scores.json
COPY --from=server-builder /server/dist ./dist
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=server-builder /server/package.json ./
COPY --from=collection-builder /collection/ /collection/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 14650
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '14650') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
