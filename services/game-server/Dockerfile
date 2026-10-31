# Build from the repository root: docker build -f services/game-server/Dockerfile .
FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/game-server/package.json ./services/game-server/package.json
RUN pnpm --filter @ai-games/game-server install --frozen-lockfile
WORKDIR /workspace/services/game-server
COPY services/game-server/ ./
RUN pnpm run build \
    && pnpm --filter @ai-games/game-server deploy --prod --legacy /server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=14650 PINBALL_SCORES_FILE=/data/pinball-scores.json
COPY --from=builder /workspace/services/game-server/dist ./dist
COPY --from=builder /server/node_modules ./node_modules
COPY --from=builder /server/package.json ./
RUN mkdir -p /data && chown node:node /data
EXPOSE 14650
HEALTHCHECK CMD node -e "fetch('http://localhost:' + (process.env.PORT || '14650') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
USER node
CMD ["node", "dist/server.js"]
