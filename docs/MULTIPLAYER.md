# Shared multiplayer and diagnostics

Multiplayer Lab is a small reference app for the mechanisms future games can reuse. It deliberately keeps test actions ephemeral: there is no game engine, account system, persisted match, or analytics database.

## Boundaries

- `relay/` owns WebSocket connections, room membership, presence, readiness, forwarding, and aggregate diagnostics.
- `packages/multiplayer/` owns the browser connection lifecycle, ping measurements, room operations, and observable client state.
- `playground/` renders controls and measurements using that client. Game payloads remain opaque to the relay.
- Existing Sea Strike clients retain their legacy message protocol in separate rooms.

Modern rooms are isolated by both `appId` and `roomId`. Player IDs are temporary connection identifiers, not authenticated identities. Share a room ID or invite URL to join; the service does not expose a public room directory.

Compose serves every app from one web port and proxies `/relay` to the internal relay. Browser builds use `VITE_RELAY_URL=/relay`, resolved against the page origin with `ws://` on HTTP and `wss://` on HTTPS. Modern room capacity is configurable (four in Compose); legacy Sea Strike rooms are capped at two.

## Protocol

Each frame is a JSON object with a `type` field. Types beginning with `relay:` belong to the transport. Applications send their own data inside `relay:message.payload`.

| Client request | Server response / effect |
| --- | --- |
| `relay:join` with `appId`, `roomId`, `playerId`, `name` | `relay:room` with the current room snapshot, broadcast to room members |
| `relay:leave` | `relay:room` with `room: null` to the leaver; updated snapshot to remaining members |
| `relay:ready` with boolean `ready` | Updated `relay:room` snapshot |
| `relay:message` with `messageId`, `payload` | Forwarded to other members with `appId`, `roomId`, and server-supplied `senderId`; `relay:ack` with `messageId` and `recipients` to sender |
| `relay:ping` with `id` | Direct `relay:pong` with matching `id`, even outside a room |
| `relay:stats` | `relay:stats` with aggregate process counters |

A snapshot has `appId`, `roomId`, `capacity`, and `players`. Each player has `id`, `name`, `ready`, and `joinedAt` (Unix milliseconds). Server rejections use `relay:error` with `code` and `message`.

Joining a second room is atomic: the server validates the destination before removing the player from the source room. A rejected switch leaves the source membership intact. Leaving the same room repeatedly is safe. Rooms disappear when empty; inactive rooms expire according to `ROOM_TIMEOUT_MS`.

IDs use 1–64 ASCII letters, digits, underscores, or hyphens. Display names are trimmed and bounded to 32 characters. The 4 KB frame limit and 60 messages per connection per minute also apply to diagnostic requests. The client requests ping and stats every five seconds by default; games can choose a longer `diagnosticsIntervalMs` to reserve more traffic for play. Dots & Boxes uses fifteen seconds.

## Metrics

| Measurement | Meaning |
| --- | --- |
| Latest / minimum / average / maximum latency | Browser-to-relay application-message round-trip time, measured with the browser's monotonic clock |
| Latency samples | Bounded recent history for the sparkline; not a long-term time series |
| Missing ping replies | Ping requests that timed out; this is not a network packet-loss measurement |
| Browser messages / bytes | Traffic observed by this client, including transport controls |
| `uptimeSeconds` | Elapsed time since this relay server instance started |
| `rooms` | Current occupied rooms across applications and legacy clients |
| `players` | Current joined room members |
| `connections` | Current open sockets, including sockets outside a room |
| `messagesReceived`, `messagesForwarded` | Process-lifetime message totals; forwarding counts each recipient |
| `bytesReceived`, `bytesSent` | Process-lifetime application payload bytes; excludes WebSocket and TLS overhead |
| `rejectedMessages` | Process-lifetime rejected requests, including validation and traffic-limit errors |

Relay totals are global live diagnostics. They are not per-game engagement analytics. There is no historical store, exporter, or collection of player behavior. The event log and latency history are bounded browser-session data.

A message acknowledgement means the relay sent the action to the stated number of open peer sockets. Applications that need confirmed processing must implement their own acknowledgement or synchronization inside the payload.

## Reconnection

The shared client retries accidental disconnections with exponential backoff. Manual disconnect cancels retries; reconnect can be triggered explicitly. After reconnection it rejoins the last confirmed room, if possible. Membership is re-established with the server rather than shown as if an offline player were still present.

This does not recover a match: the relay does not save actions or game state. A future game must choose its own peer synchronization or recovery behavior. Refreshing a page creates a new temporary player identity.

## Verification

Relay integration tests exercise room capacity, membership updates, isolated actions, rejected switches, direct server pings, and diagnostics alongside the existing legacy tests. Shared-client tests exercise reconnect behavior, validation, timing, and cleanup. Use multiple browser tabs for the interactive scenarios in the root README.
