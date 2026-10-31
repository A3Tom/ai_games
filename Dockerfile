# syntax=docker/dockerfile:1

# Pinball is built and published independently. Its static artifact can be copied
# into a collection targeting any runtime platform; no artifact code runs here.
ARG PINBALL_IMAGE=ghcr.io/a3tom/ai_games-pinball:latest
ARG PINBALL_PLATFORM=linux/amd64
FROM --platform=${PINBALL_PLATFORM} ${PINBALL_IMAGE} AS pinball-assets

# Each game's dependencies and build have their own cache. Changes to another
# game or the dashboard do not reinstall dependencies or rebuild this game.
# Use standard RUN instructions so builds also work without BuildKit.
FROM node:24-alpine AS playground-builder
WORKDIR /workspace/games/playground
COPY packages/multiplayer/package.json /workspace/packages/multiplayer/package.json
COPY games/playground/package*.json ./
RUN npm ci --no-audit --no-fund
COPY packages/multiplayer/src/ /workspace/packages/multiplayer/src/
COPY shared/ /workspace/shared/
COPY games/playground/ ./
ARG VITE_RELAY_URL=/relay
RUN npm run build

FROM node:24-alpine AS dots-and-boxes-builder
WORKDIR /workspace/games/dots-and-boxes
COPY packages/multiplayer/package.json /workspace/packages/multiplayer/package.json
COPY games/dots-and-boxes/package*.json ./
RUN npm ci --no-audit --no-fund
COPY packages/multiplayer/src/ /workspace/packages/multiplayer/src/
COPY shared/ /workspace/shared/
COPY games/dots-and-boxes/ ./
ARG VITE_RELAY_URL=/relay
RUN npm run build

FROM node:24-alpine AS minesweeper-builder
WORKDIR /workspace/games/minesweeper
COPY games/minesweeper/package*.json ./
RUN npm ci --no-audit --no-fund
COPY shared/ /workspace/shared/
COPY games/minesweeper/ ./
RUN npm run build

FROM node:24-alpine AS sea-strike-builder
WORKDIR /workspace/games/sea-strike
COPY games/sea-strike/package*.json ./
RUN npm ci --no-audit --no-fund
COPY shared/ /workspace/shared/
COPY games/sea-strike/ ./
ARG VITE_RELAY_URL=/relay
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
COPY --from=pinball-assets /dist/ ./games/pinball/dist/
RUN node scripts/build-collection.mjs /collection

FROM node:24-alpine AS server-builder
WORKDIR /server
COPY services/game-server/package*.json ./
RUN npm ci --no-audit --no-fund
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
