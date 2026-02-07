# Phase 05 — Ticket 006: Docker Configuration

## Summary

Create the `relay/Dockerfile` for multi-stage production builds and the `docker-compose.yml` at the project root for orchestrating the relay service. These files package the relay server for VPS deployment behind Caddy. When done, the agent should be able to run `docker build` on the relay and `docker compose config` to validate the Compose file.

## Prerequisites

- **Ticket 001** must be complete — `relay/package.json` exists with `build` and `start` scripts.
- **Ticket 005** must be complete — `relay/src/server.ts` exists so that `npm run build` produces `dist/server.js`.

## Scope

**In scope:**

- `relay/Dockerfile` — multi-stage build per `docs/02-ARCHITECTURE.md` Section 6.3
- `docker-compose.yml` at project root — relay service definition per `docs/02-ARCHITECTURE.md` Section 6.1
- `relay/.dockerignore` — to exclude unnecessary files from the Docker build context

**Out of scope:**

- Caddyfile — Phase 13 (deploy), per `docs/phases/phase-05-relay-server.md` Section 3
- VPS deployment steps — Phase 13
- GitHub Actions workflows — Phase 13
- TLS configuration — handled by Caddy, not the relay container
- Any relay source code modifications — tickets 002–005

## Files

| File | Action | Description |
|------|--------|-------------|
| `relay/Dockerfile` | Create | Multi-stage Docker build for production |
| `relay/.dockerignore` | Create | Exclude node_modules, dist, tests from build context |
| `docker-compose.yml` | Create | Docker Compose config at project root |

## Requirements

### `relay/Dockerfile`

Must match the specification from `docs/02-ARCHITECTURE.md` Section 6.3:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8080
HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1
USER node
CMD ["node", "dist/server.js"]
```

Key requirements per `docs/02-ARCHITECTURE.md` Section 6.3 and phase overview decision 8:

- **Multi-stage build:** Builder stage compiles TypeScript, runtime stage contains only production artifacts.
- **Base image:** `node:20-alpine` for both stages (small image size).
- **`npm ci`** in builder stage (not `npm install`) for reproducible builds.
- **Runtime copies:** Only `dist/`, `node_modules/`, and `package.json` — no source code in production image.
- **`EXPOSE 8080`:** Document the port the relay listens on.
- **`HEALTHCHECK`:** Uses `curl` to check `/health`. Note: `curl` is available in `node:20-alpine`.
- **`USER node`:** Run as non-root for security.
- **`CMD`:** Starts the compiled server.

### `relay/.dockerignore`

```
node_modules
dist
*.test.ts
.env
.env.*
!.env.example
```

This prevents large directories and test files from being copied into the build context, speeding up builds.

### `docker-compose.yml`

Must match the specification from `docs/02-ARCHITECTURE.md` Section 6.1:

```yaml
version: "3.8"

services:
  relay:
    build: ./relay
    restart: unless-stopped
    expose:
      - "8080"
    environment:
      - PORT=8080
      - MAX_ROOMS=100
      - MAX_CLIENTS_PER_ROOM=2
      - ROOM_TIMEOUT_MS=3600000
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.25"
    networks:
      - caddy_network

networks:
  caddy_network:
    external: true
```

Key requirements per `docs/02-ARCHITECTURE.md` Section 6.1 and phase overview acceptance criteria #12:

- **`build: ./relay`** — builds from the relay directory Dockerfile.
- **`restart: unless-stopped`** — auto-restart on failure.
- **`expose: "8080"`** — exposes port to the Docker network (not the host). Caddy connects via the internal network.
- **Environment variables:** All 5 from `.env.example` with their default values.
- **Health check:** Same curl command as the Dockerfile, with 30s interval, 5s timeout, 3 retries.
- **Resource limits:** 128M memory, 0.25 CPU — the relay is lightweight per `docs/02-ARCHITECTURE.md` Section 7 performance budget (< 1 KB memory per room).
- **Network:** `caddy_network` (external) — Caddy runs on this network and reverse-proxies to the relay. The network must be created externally (`docker network create caddy_network`) before running compose.

## Acceptance Criteria

- [ ] `relay/Dockerfile` exists with multi-stage build using `node:20-alpine`
- [ ] Dockerfile runs as `USER node` and exposes port 8080
- [ ] Dockerfile includes `HEALTHCHECK` directive
- [ ] `docker-compose.yml` exists at project root with relay service definition
- [ ] Docker Compose defines all 5 environment variables with correct defaults
- [ ] Docker Compose includes health check, resource limits (128M memory, 0.25 CPU), and `caddy_network`
- [ ] `docker build relay/` completes without errors (requires tickets 001–005 to be complete)

## Notes for the Agent

- **The Dockerfile must exactly match the architecture doc.** The Dockerfile specification in `docs/02-ARCHITECTURE.md` Section 6.3 is the source of truth. Do not deviate from it unless there is a clear technical reason (e.g., `curl` missing from the base image).
- **`npm ci` not `npm install`** in the builder stage. `npm ci` installs exact versions from `package-lock.json` and is required for reproducible Docker builds.
- **Do not use `ports:` in docker-compose.** Use `expose:` instead. The relay port is not published to the host — Caddy accesses it via the internal Docker network. Using `ports:` would expose the relay directly to the internet without TLS.
- **The `caddy_network` is external.** The compose file declares it with `external: true`, meaning it must exist before `docker compose up`. This is intentional — Phase 13 will document the network creation step.
- **`docker build` will only succeed after all source files exist** (tickets 001–005). If testing the Dockerfile in isolation, you can verify the syntax is correct without building by checking the file manually or using `docker build --check` if available.
- **Do not add a `.env` file.** The docker-compose.yml hardcodes the environment variables. A `.env` file would be used in production (Phase 13) but is not created in this phase. Only `.env.example` exists as documentation.
- Reference `docs/02-ARCHITECTURE.md` Section 6.1 (Docker Compose), Section 6.3 (Dockerfile).
