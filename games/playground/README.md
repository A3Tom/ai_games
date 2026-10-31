# Multiplayer Lab

A browser workbench for testing the shared multiplayer client and WebSocket relay before building a game.

It is part of the central game collection, with the same build and hosting path as the other games.

## Run with the collection

The collection and relay run together in one image. After it has been published, start it with Docker (see [collection hosting](../../README.md#hosting) for registry authentication):

```bash
docker run -d --name ai-games --restart unless-stopped --pull always -p 14650:14650 ghcr.io/a3tom/ai_games:latest
```

Alternatively, run `docker compose up -d --pull always --wait` from the repository root. To build and test your current source code locally, use the standalone local file:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

Open <http://localhost:14650> and choose **Multiplayer Lab**. On another device on your network, use `http://<your-computer-LAN-IP>:14650` instead. Press **Connect to relay**; the endpoint is automatically configured to use that same address. Create the room using the LAN address before sharing its invite link.

Allow incoming TCP 14650 through the host firewall and use a network that permits devices to reach each other. See the [collection README](../../README.md) for networking and port configuration.

## Develop with hot reload

Start the relay:

```bash
npm --prefix services/game-server ci
MAX_CLIENTS_PER_ROOM=4 npm --prefix services/game-server run dev
```

In another terminal:

```bash
npm --prefix games/playground ci
npm --prefix games/playground run dev
```

Standalone Vite defaults to `ws://localhost:14650`. You can edit the endpoint in the connection panel. If using `docker compose -f docker-compose.local.yml up --build -d` instead of the standalone Node relay, connect to the same container on port 14650: run `VITE_RELAY_URL=ws://localhost:14650/relay npm --prefix games/playground run dev`.

## Try the mechanisms

1. Connect, create a room, and copy its invite link into another tab or browser.
2. Give each browser a different name. Check the player count, member list, and ready state.
3. Send pulses or messages. Expand their event-log rows to inspect payloads and acknowledgements.
4. Switch one browser to a different room. Confirm it disappears from the old room and no longer receives that room’s actions.
5. Disconnect and reconnect. Check membership, status, and fresh latency readings. Restart the relay to exercise automatic reconnection.
6. Fill a room to capacity and attempt to switch into it from another room. The rejected switch should preserve the original membership.

The lab uses `@ai-games/multiplayer` from `../../packages/multiplayer`. It owns the diagnostic UI; the shared client owns WebSocket lifecycle, room membership, validation, reconnects, ping sampling, counters, and bounded event history.

## Metrics

- **Browser ↔ relay:** application-level round-trip time, measured with the browser’s monotonic clock. This works with one browser connected and does not measure peer-to-peer latency.
- **Missing replies:** pings with no response before the timeout; these are not a measurement of network packet loss.
- **Browser traffic:** messages and bytes sent or received by this client, including control messages. Resetting these counters does not reset relay totals.
- **Relay metrics:** active rooms, room members, open sockets, uptime, forwarded messages, rejections, and traffic across all apps on this relay. Totals reset when the relay process restarts.
- **Acknowledgements:** the number of peer sockets the relay forwarded an action to. Acknowledgements do not guarantee that a peer processed the action.

These are live diagnostics. There is no historical analytics storage or durable game state. Each page load gets a fresh player ID; reconnecting within a page attempts to rejoin its last confirmed room.

## Hosted builds

```bash
VITE_RELAY_URL=wss://relay.example.com npm --prefix games/playground run build
```

The build in `games/playground/dist/` uses relative asset paths and can be hosted under a collection subdirectory. An HTTPS page requires a `wss://` relay. Set `VITE_RELAY_URL=/relay` for same-origin hosting, as the combined Docker image does. Relative endpoints automatically use the current host and select `ws://` or `wss://` from the page protocol. If no endpoint is configured at build time, a hosted lab asks the user to enter one.

```bash
npm --prefix games/playground run type-check
npm --prefix games/playground run build
npm --prefix games/playground run preview
```
