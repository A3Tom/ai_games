# Phase 13 — Ticket 007: Caddyfile Reverse Proxy Configuration

## Summary

Create the Caddyfile for the VPS that reverse-proxies HTTPS traffic to the relay container with automatic TLS certificate provisioning via Let's Encrypt. This follows the specification from `docs/02-ARCHITECTURE.md` Section 6.2 and fulfills the VPS deployment requirement from `docs/phases/phase-13-polish-deploy.md` Section 3. When done, the agent should have a production-ready Caddyfile and verified that `docker-compose up` starts the relay with a passing health check.

## Prerequisites

- **Phase 5 complete.** `relay/Dockerfile`, `relay/src/server.ts`, `relay/src/health.ts`, and `docker-compose.yml` exist.
- **Phase 5 complete.** The relay server responds to `/health` checks.

Specific file dependencies:
- `docker-compose.yml` — defines the relay service on port 8080 and `caddy_network` (Phase 5)
- `relay/Dockerfile` — multi-stage build for the relay container (Phase 5)

## Scope

**In scope:**

- Create `Caddyfile` at the repository root with reverse proxy configuration for the relay
- Verify `docker-compose up` starts the relay container successfully
- Verify the relay's `/health` endpoint responds correctly

**Out of scope:**

- Modifying `docker-compose.yml` — finalized in Phase 5
- Modifying the relay server code — finalized in Phase 5
- Adding Caddy to docker-compose — Caddy runs separately on the VPS per `docs/phases/phase-13-polish-deploy.md` Section 6 ("Caddy is expected to be running separately on the VPS")
- GitHub Actions workflow — Ticket 006
- Rate limiting Caddy plugin — optional per `docs/02-ARCHITECTURE.md` Section 6.2 (commented out)
- Actual TLS provisioning — requires a real domain and VPS; this ticket creates the config

## Files

| File | Action | Description |
|------|--------|-------------|
| `Caddyfile` | Create | Caddy reverse proxy config for relay with automatic TLS |

## Requirements

### Caddyfile Content

Follow the exact specification from `docs/02-ARCHITECTURE.md` Section 6.2:

```
relay.yourdomain.com {
    reverse_proxy relay:8080
}
```

This is the minimal production Caddyfile. Key behaviors:

- **Automatic TLS:** Caddy automatically provisions and renews TLS certificates via Let's Encrypt for the specified domain. No manual certificate management is needed.
- **Reverse proxy:** All HTTPS traffic to `relay.yourdomain.com` is forwarded to the relay container at port 8080 over plain HTTP.
- **WebSocket support:** Caddy's `reverse_proxy` transparently handles WebSocket upgrade requests — no additional configuration is needed for WebSocket passthrough.
- **Domain placeholder:** `relay.yourdomain.com` is a placeholder. The deployer must replace it with their actual domain before deployment.

### Docker Compose Verification

The agent should verify that the existing `docker-compose.yml` is compatible with the Caddyfile:

1. Read `docker-compose.yml` and confirm:
   - The relay service is defined
   - It exposes port 8080 (internal, not published to host)
   - It uses the `caddy_network` network
   - The health check is configured

2. Run `docker-compose config` (or equivalent) to validate the compose file syntax, if Docker is available.

### Health Check Verification

If Docker is available in the development environment, verify:

1. `docker-compose up -d relay` starts the relay container
2. `curl http://localhost:8080/health` returns a JSON response with `{ "status": "ok", ... }`

If Docker is not available, verify by reading the relay source code that:
1. `relay/src/health.ts` handles GET `/health`
2. `relay/src/server.ts` registers the health endpoint

### Caddyfile Placement

The Caddyfile is placed at the repository root alongside `docker-compose.yml`, as indicated in `docs/02-ARCHITECTURE.md` Section 6.2. On the VPS, the deployer copies this file to Caddy's configuration directory or mounts it as a volume.

## Acceptance Criteria

- [ ] File exists at `Caddyfile` in the repository root
- [ ] Caddyfile contains a site block for `relay.yourdomain.com` with `reverse_proxy relay:8080`
- [ ] Caddyfile follows the exact structure from `docs/02-ARCHITECTURE.md` Section 6.2
- [ ] `docker-compose.yml` is confirmed to define the relay service with port 8080 and `caddy_network`
- [ ] Relay health endpoint is confirmed to exist (via code inspection or runtime test)

## Notes for the Agent

- **Read `docker-compose.yml` first** to understand the existing infrastructure setup. The relay service, network, and health check were configured in Phase 5.
- **Read `relay/src/health.ts` and `relay/src/server.ts`** to confirm the health endpoint works as expected.
- **The Caddyfile is intentionally simple.** Do not add rate limiting, logging directives, headers, or other enhancements. The minimal config from the architecture doc is sufficient for v1. The commented-out rate limiting in `docs/02-ARCHITECTURE.md` Section 6.2 is optional and requires a Caddy plugin — do not include it.
- **Do not modify `docker-compose.yml`.** If you notice issues, note them but do not change the file. It was finalized in Phase 5.
- **Do not add Caddy as a service to docker-compose.** Per `docs/phases/phase-13-polish-deploy.md` Section 6, Caddy is expected to run separately on the VPS. The deployer manages Caddy installation and configuration independently.
- **The domain is a placeholder.** `relay.yourdomain.com` must be replaced by the deployer with their actual domain. Add a comment in the Caddyfile noting this, or document it separately. Do not hardcode a real domain.
- **If Docker is available**, test that `docker-compose up -d relay` works and the health endpoint responds. If Docker is not available, verify through code inspection only — do not install Docker.
