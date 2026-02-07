# Phase 06 — Connection Composable: Ticket Summary

## Ticket Index

| Ticket | Title | Files | Prerequisites |
|--------|-------|-------|---------------|
| [001](001-relay-connection-lifecycle.md) | Core WebSocket Connection Lifecycle | 2 (`useRelay.ts`, `useRelay.test.ts`) | Phases 1, 2, 4, 5 |
| [002](002-message-dispatch.md) | Incoming Message Dispatch | 2 (`useRelay.ts`, `useRelay.test.ts`) | Ticket 001 |
| [003](003-reconnection-backoff.md) | Exponential Backoff Reconnection | 2 (`useRelay.ts`, `useRelay.test.ts`) | Tickets 001, 002 |
| [004](004-ping-pong-cleanup.md) | Ping/Pong Latency and Unmount Cleanup | 2 (`useRelay.ts`, `useRelay.test.ts`) | Tickets 001, 002, 003 |

## Dependency Graph

```
Phases 1, 2, 4, 5 (complete)
  │
  └──► 001 Core WebSocket Connection Lifecycle
        │
        └──► 002 Incoming Message Dispatch
              │
              └──► 003 Exponential Backoff Reconnection
                    │
                    └──► 004 Ping/Pong Latency and Unmount Cleanup
```

**Key observations:**

- This phase has a **strictly linear** dependency chain. All four tickets modify the same two files (`useRelay.ts` and `useRelay.test.ts`), so parallel execution is not possible.
- Each ticket incrementally adds a layer of functionality to the composable: connection → message handling → reconnection → ping/pong + cleanup.
- The linear ordering matches the natural build-up: you can't dispatch messages without a connection, can't reconnect without dispatch (to handle post-reconnect messages), and can't do ping/pong without all of the above.

## Suggested Execution Order

```
Step 1:  001 Core WebSocket Connection Lifecycle
Step 2:  002 Incoming Message Dispatch
Step 3:  003 Exponential Backoff Reconnection
Step 4:  004 Ping/Pong Latency and Unmount Cleanup
```

**Minimum sequential steps:** 4

No parallel execution is possible within this phase since all tickets operate on the same files. Execute strictly in order.

## Estimated Total

**4 tickets.** This matches the four logical concerns of the `useRelay` composable: connect, dispatch, reconnect, and maintain.

Sizing assessment:

- **Ticket 001** (connection lifecycle — 2 files): Moderate. Creates the composable from scratch with interfaces, WebSocket setup, event handlers, and 10 test cases. ~30–40 minutes.
- **Ticket 002** (message dispatch — 2 files): Moderate. Adds the `onmessage` handler with parsing, routing logic, and 9 test cases. ~25–35 minutes.
- **Ticket 003** (reconnection — 2 files): The most complex ticket. Exponential backoff state machine, timer management, reconnection lifecycle, and 10 test cases with fake timers. ~35–45 minutes.
- **Ticket 004** (ping/pong + cleanup — 2 files): Moderate. Periodic ping, pong interception, `onUnmounted` cleanup, and 10 test cases. ~30–40 minutes.

**Splitting assessment:** Ticket 003 is the heaviest due to the state machine complexity and fake timer testing. It could theoretically be split into "reconnection logic" and "manual reconnect + edge cases," but both halves would modify the same two files and the reconnection logic is tightly coupled — splitting would increase context-switching overhead without meaningful benefit. All tickets are within the 45-minute guideline, so no further splitting is recommended.
