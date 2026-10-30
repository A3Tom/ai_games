# Multiplayer client

Framework-independent TypeScript client for the collection's WebSocket relay.
It exports source for Vite and other TypeScript-aware bundlers; no runtime
dependencies or framework are required.

```ts
import { createMultiplayerClient } from '@ai-games/multiplayer'

const client = createMultiplayerClient({
  url: 'ws://localhost:8080',
  appId: 'my-game',
  name: 'Player one',
})

const unsubscribe = client.subscribe((state) => {
  console.log(state.status, state.room?.players, state.latency.last)
  const received = state.events.at(-1)
  if (received?.type === 'relay:message') {
    // received.payload is the complete envelope; its payload field is game data.
    console.log(received.payload)
  }
})

client.join('room-one') // Connects automatically and waits for room confirmation.

// Call from a game control after membership has been confirmed:
function sendExampleAction(): void {
  if (!client.getState().room) return
  client.setReady(true)
  client.send({ kind: 'example-action', value: 1 })
}

// On teardown:
unsubscribe()
client.destroy()
```

Call ready/send after `state.room` confirms membership. `connect()` opens the
socket without joining. `join()` also switches rooms; the old membership stays
visible if the target rejects the switch. `leave()` waits for relay confirmation.
`disconnect()` stops automatic retry; `reconnect()` explicitly reconnects and
requests the last confirmed room. Unexpected drops retry up to ten times with
exponential backoff, from one to thirty seconds.

State snapshots include current room membership, relay counters, local message
and UTF-8 byte counts, the last sixty server round-trip samples, lost ping count,
and the last hundred events. The client requests stats and pings every five
seconds while connected. Latency is a browser-to-relay round trip, measured with
the browser's monotonic clock, and works without another player. `resetMetrics()`
clears local counters and history; relay counters remain process-wide.

`subscribe()` immediately supplies the current state and returns an unsubscribe
function. Notifications can occur for counters as well as protocol events, so
deduplicate action handling by event ID. A relay ACK reports the number of peers
to which the relay forwarded a message; it does not confirm game processing.

App IDs isolate rooms between games. IDs are 1–64 ASCII letters, digits,
underscores, or hyphens; names are 1–32 characters. Frames are limited to 4096
UTF-8 bytes. Player IDs are public, ephemeral presence identifiers, not accounts
or authentication. Room snapshots and player readiness are temporary, and the
client does not restore game state or replay actions after reconnecting.

Run checks from this directory:

```sh
npm ci
npm run type-check
npm test
```
