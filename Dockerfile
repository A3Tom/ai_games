FROM emscripten/emsdk:4.0.23 AS pinball-engine-builder
WORKDIR /workspace
COPY pinball/engine/ ./pinball/engine/
COPY pinball/vendor/ ./pinball/vendor/
COPY pinball/scripts/ ./pinball/scripts/
RUN emcmake cmake -S pinball/engine -B /tmp/pinball-engine \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_RUNTIME_OUTPUT_DIRECTORY=/out \
    && cmake --build /tmp/pinball-engine --parallel 2 \
    && node pinball/scripts/build-engine.mjs --stamp /out

FROM node:24-alpine AS collection-builder
WORKDIR /workspace

COPY . .
COPY --from=pinball-engine-builder /out/ ./pinball/public/engine/
ARG VITE_RELAY_URL=/relay
ENV VITE_RELAY_URL=${VITE_RELAY_URL}
ARG PINBALL_SKIP_RESOURCE_DOWNLOAD=0
ENV PINBALL_SKIP_RESOURCE_DOWNLOAD=${PINBALL_SKIP_RESOURCE_DOWNLOAD}
# The registry drives dependency installation, builds and collection staging.
RUN node scripts/build-collection.mjs --install --build /collection

FROM node:24-alpine AS relay-builder
WORKDIR /relay
COPY relay/package*.json ./
RUN npm ci --no-audit --no-fund
COPY relay/ ./
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=14650 STATIC_DIR=/collection MAX_CLIENTS_PER_ROOM=4 PINBALL_SCORES_FILE=/data/pinball-scores.json
COPY --from=relay-builder /relay/dist ./dist
COPY --from=relay-builder /relay/node_modules ./node_modules
COPY --from=relay-builder /relay/package.json ./
COPY --from=collection-builder /collection/ /collection/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 14650
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '14650') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
