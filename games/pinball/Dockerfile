# syntax=docker/dockerfile:1

# Build from the repository root: docker build -f games/pinball/Dockerfile .
# The final image is an artifact containing only the static website at /dist.
FROM emscripten/emsdk:4.0.23 AS pinball-engine-builder
WORKDIR /workspace
COPY games/pinball/engine/ ./games/pinball/engine/
COPY games/pinball/vendor/ ./games/pinball/vendor/
COPY games/pinball/scripts/build-engine.mjs ./games/pinball/scripts/build-engine.mjs
RUN emcmake cmake -S games/pinball/engine -B /tmp/pinball-engine \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_RUNTIME_OUTPUT_DIRECTORY=/out \
    && cmake --build /tmp/pinball-engine --parallel 2 \
    && node games/pinball/scripts/build-engine.mjs --stamp /out

FROM node:24-alpine AS pinball-dependencies
WORKDIR /workspace/games/pinball
COPY games/pinball/package*.json ./
RUN npm ci --no-audit --no-fund

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
ARG VITE_PINBALL_API_URL
RUN npm run build

FROM scratch AS artifact
COPY --from=pinball-builder /workspace/games/pinball/dist/ /dist/
