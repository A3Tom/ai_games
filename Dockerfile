# syntax=docker/dockerfile:1

# Pinball is built and published independently. Its static artifact can be copied
# into a collection targeting any runtime platform; no artifact code runs here.
ARG PINBALL_IMAGE=ghcr.io/a3tom/ai_games-pinball:latest
ARG PINBALL_PLATFORM=linux/amd64
FROM --platform=${PINBALL_PLATFORM} ${PINBALL_IMAGE} AS pinball-assets

# Each game's source and build have their own cache. Dependency layers share the
# workspace lockfile, so a dependency change can invalidate multiple game layers.
# Use standard RUN instructions so builds also work without BuildKit.
FROM node:24-alpine AS pnpm-base
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM pnpm-base AS playground-builder
COPY packages/multiplayer/package.json ./packages/multiplayer/package.json
COPY games/playground/package.json ./games/playground/package.json
RUN pnpm --filter 'multiplayer-lab...' install --frozen-lockfile
WORKDIR /workspace/games/playground
COPY packages/multiplayer/src/ /workspace/packages/multiplayer/src/
COPY shared/ /workspace/shared/
COPY games/playground/ ./
ARG VITE_RELAY_URL=/relay
RUN pnpm run build

FROM pnpm-base AS dots-and-boxes-builder
COPY packages/multiplayer/package.json ./packages/multiplayer/package.json
COPY games/dots-and-boxes/package.json ./games/dots-and-boxes/package.json
RUN pnpm --filter 'dots-and-boxes...' install --frozen-lockfile
WORKDIR /workspace/games/dots-and-boxes
COPY packages/multiplayer/src/ /workspace/packages/multiplayer/src/
COPY shared/ /workspace/shared/
COPY games/dots-and-boxes/ ./
ARG VITE_RELAY_URL=/relay
RUN pnpm run build

FROM pnpm-base AS minesweeper-builder
COPY games/minesweeper/package.json ./games/minesweeper/package.json
RUN pnpm --filter minesweeper-typescript install --frozen-lockfile
WORKDIR /workspace/games/minesweeper
COPY shared/ /workspace/shared/
COPY games/minesweeper/ ./
RUN pnpm run build

FROM pnpm-base AS sea-strike-builder
COPY games/sea-strike/package.json ./games/sea-strike/package.json
RUN pnpm --filter sea-strike install --frozen-lockfile
WORKDIR /workspace/games/sea-strike
COPY shared/ /workspace/shared/
COPY games/sea-strike/ ./
ARG VITE_RELAY_URL=/relay
RUN pnpm run build

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
COPY --from=pinball-assets /dist/ ./games/pinball/dist/
RUN node scripts/build-collection.mjs /collection

FROM pnpm-base AS server-builder
COPY services/game-server/package.json ./services/game-server/package.json
RUN pnpm --filter @ai-games/game-server install --frozen-lockfile
WORKDIR /workspace/services/game-server
COPY services/game-server/ ./
RUN pnpm run build \
    && pnpm --filter @ai-games/game-server deploy --prod --legacy /server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=14650 STATIC_DIR=/collection MAX_CLIENTS_PER_ROOM=4 PINBALL_SCORES_FILE=/data/pinball-scores.json
COPY --from=server-builder /workspace/services/game-server/dist ./dist
COPY --from=server-builder /server/node_modules ./node_modules
COPY --from=server-builder /server/package.json ./
COPY --from=collection-builder /collection/ /collection/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 14650
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '14650') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
