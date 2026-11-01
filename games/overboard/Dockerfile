# syntax=docker/dockerfile:1

# Build from the repository root: docker build -f games/overboard/Dockerfile .
# The final image provides the static game at /dist for the collection image.
FROM node:24-alpine AS overboard-dependencies
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY games/overboard/package.json ./games/overboard/package.json
RUN pnpm --filter overboard install --frozen-lockfile
WORKDIR /workspace/games/overboard

# Cache verified runtime downloads independently of browser source changes.
# public/ includes a locally imported disc when one is present in the context.
FROM overboard-dependencies AS overboard-resources
COPY games/overboard/emulator-lock.json ./
COPY games/overboard/scripts/ ./scripts/
COPY games/overboard/public/ ./public/
RUN node scripts/fetch-emulator.mjs && node scripts/prepare-media.mjs

FROM overboard-dependencies AS overboard-builder
COPY shared/ /workspace/shared/
COPY games/overboard/ ./
COPY --from=overboard-resources /workspace/games/overboard/public/ ./public/
RUN pnpm run build

FROM scratch AS artifact
COPY --from=overboard-builder /workspace/games/overboard/dist/ /dist/
