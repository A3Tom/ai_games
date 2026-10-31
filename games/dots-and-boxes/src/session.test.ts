import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMultiplayerClient } from "@ai-games/multiplayer";
import type {
  ClientState,
  MultiplayerClient,
  RoomPlayer,
  RoomSnapshot,
} from "@ai-games/multiplayer";
import { telemetry } from "../../../shared/telemetry.js";
import { createMatch } from "./game";
import { useGameSession } from "./session";

vi.mock("@ai-games/multiplayer", () => ({ createMultiplayerClient: vi.fn() }));
vi.mock("../../../shared/telemetry.js", () => ({
  telemetry: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    captureError: vi.fn(),
  },
}));

function member(id: string, joinedAt: number, ready = true): RoomPlayer {
  return { id, name: id === "me" ? "Ada" : id, joinedAt, ready };
}

function harness(reentrant = false) {
  let state: ClientState = {
    status: "disconnected",
    playerId: "me",
    room: null,
    server: null,
    latency: {
      last: null,
      min: null,
      max: null,
      average: null,
      samples: [],
      lost: 0,
    },
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    reconnectAttempts: 0,
    lastError: null,
    events: [],
  };
  let sequence = 0;
  let listener: ((state: ClientState) => void) | undefined;
  const client: MultiplayerClient = {
    getState: () => state,
    subscribe: (callback) => {
      listener = callback;
      callback(state);
      return () => {
        listener = undefined;
      };
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    setReady: vi.fn(),
    send: vi.fn((payload: unknown) => {
      if (!reentrant) return;
      emit({
        events: [
          ...state.events,
          {
            id: `event-${++sequence}`,
            type: "relay:message",
            direction: "out",
            at: Date.now(),
            detail: "",
            payload,
          },
        ],
      });
    }),
    ping: vi.fn(),
    requestStats: vi.fn(),
    resetMetrics: vi.fn(),
    destroy: vi.fn(),
  };
  function emit(patch: Partial<ClientState>): void {
    state = { ...state, ...patch };
    listener?.(state);
  }
  function room(players: RoomPlayer[]): void {
    const snapshot: RoomSnapshot = {
      appId: "dots-and-boxes",
      roomId: "test-room",
      capacity: 4,
      players,
    };
    emit({ status: "connected", room: snapshot });
  }
  function receive(payload: unknown, senderId = "other"): void {
    const envelope = {
      type: "relay:message",
      appId: "dots-and-boxes",
      roomId: "test-room",
      senderId,
      messageId: `message-${++sequence}`,
      payload,
    };
    emit({
      events: [
        ...state.events,
        {
          id: `event-${sequence}`,
          type: "relay:message",
          direction: "in",
          at: Date.now(),
          detail: "",
          payload: envelope,
        },
      ],
    });
  }
  function relayError(message = "RATE_LIMITED: Rate limit exceeded"): void {
    emit({
      lastError: message,
      events: [
        ...state.events,
        {
          id: `event-${++sequence}`,
          type: "relay:error",
          direction: "in",
          at: Date.now(),
          detail: message,
        },
      ],
    });
  }
  vi.mocked(createMultiplayerClient).mockReturnValue(client);
  return { client, emit, room, receive, relayError };
}

const sessions: ReturnType<typeof useGameSession>[] = [];
let browserListeners: Map<string, EventListenerOrEventListenerObject>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  browserListeners = new Map();
  vi.stubGlobal("window", {
    location: { href: "http://localhost:5173/" },
    history: { replaceState: vi.fn() },
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) =>
        browserListeners.set(type, listener),
    ),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  });
});

afterEach(() => {
  for (const session of sessions) session.destroy();
  sessions.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(host = true, reentrant = false) {
  const transport = harness(reentrant);
  const session = useGameSession();
  sessions.push(session);
  session.roomInput.value = "test-room";
  session.name.value = "Ada";
  session.joinRoom();
  transport.room(
    host
      ? [member("me", 1), member("other", 2)]
      : [member("other", 1), member("me", 2)],
  );
  if (host) vi.advanceTimersByTime(501);
  return { ...transport, session };
}

describe("game session", () => {
  it("uses one host-led exchange for each membership change instead of a sync storm", () => {
    const { session, room, client } = setup();
    vi.mocked(client.send).mockClear();
    room([member("me", 1), member("other", 2), member("third", 3)]);
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "dots:sync" }),
    );
    vi.advanceTimersByTime(501);
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "dots:state" }),
    );
    room([
      member("me", 1),
      member("other", 2),
      member("third", 3),
      member("fourth", 4),
    ]);
    vi.advanceTimersByTime(501);
    expect(client.send).toHaveBeenCalledTimes(4);
    room([
      member("me", 1),
      member("other", 2),
      member("third", 3),
      member("fourth", 4, false),
    ]);
    expect(client.send).toHaveBeenCalledTimes(4);
    expect(session.syncing.value).toBe(false);
    expect(createMultiplayerClient).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosticsIntervalMs: 15_000 }),
    );
  });

  it("lets followers answer the host recovery request without initiating redundant requests", () => {
    const { session, room, receive, client } = setup(false);
    expect(session.syncing.value).toBe(true);
    expect(client.send).not.toHaveBeenCalled();
    room([member("other", 1), member("me", 2), member("third", 3)]);
    expect(client.send).not.toHaveBeenCalled();
    receive({ kind: "dots:sync", requestId: "host-led-sync", match: null });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "dots:offer", target: "other" }),
    );
    receive({ kind: "dots:state", match: null });
    expect(session.syncing.value).toBe(false);
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("plays locally without relay traffic and follows the active player", () => {
    const transport = harness();
    const session = useGameSession();
    sessions.push(session);
    session.startLocal(3, 2);
    session.play(0);
    session.play(1);
    expect(session.mode.value).toBe("local");
    expect(session.match.value?.moves).toEqual([0, 1]);
    expect(transport.client.send).not.toHaveBeenCalled();
    expect(telemetry.info).toHaveBeenCalledWith(
      "game_started",
      expect.any(String),
      expect.objectContaining({ mode: "local" }),
    );
  });

  it("requires all players to be ready before the host starts", () => {
    const { session, room, client } = setup();
    room([member("me", 1), member("other", 2, false)]);
    expect(session.canStart.value).toBe(false);
    session.startOnline(3);
    expect(session.match.value).toBeNull();
    room([member("me", 1), member("other", 2)]);
    session.startOnline(3);
    expect(session.match.value?.players.map((player) => player.id)).toEqual([
      "me",
      "other",
    ]);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "dots:state" }),
    );
    expect(session.canStart.value).toBe(false);
  });

  it("validates remote turns and applies each received event once", () => {
    const { session, client, receive, emit } = setup();
    session.startOnline(3);
    const matchId = session.match.value!.id;
    receive({
      kind: "dots:move",
      edge: 1,
      revision: 0,
      matchId,
      requestId: "early",
    });
    expect(session.match.value?.moves).toEqual([]);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "dots:reject",
        target: "other",
        reason: "Wait for your turn.",
      }),
    );
    session.play(0);
    expect(session.cooldown.value).toBe(true);
    vi.advanceTimersByTime(2_201);
    receive({
      kind: "dots:move",
      edge: 1,
      revision: 1,
      matchId,
      requestId: "valid",
    });
    expect(session.match.value?.moves).toEqual([0, 1]);
    const sends = vi.mocked(client.send).mock.calls.length;
    emit({ messagesReceived: 20 });
    expect(session.match.value?.moves).toEqual([0, 1]);
    expect(client.send).toHaveBeenCalledTimes(sends);
  });

  it("accepts snapshots only from the elected host and rejects stale moves", () => {
    const { session, receive, client } = setup();
    session.startOnline(3);
    const current = session.match.value!;
    receive({ kind: "dots:state", match: { ...current, moves: [0] } });
    expect(session.match.value?.moves).toEqual([]);
    session.play(0);
    vi.advanceTimersByTime(2_201);
    receive({
      kind: "dots:move",
      edge: 1,
      revision: 0,
      matchId: current.id,
      requestId: "stale",
    });
    expect(session.match.value?.moves).toEqual([0]);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "dots:reject", requestId: "stale" }),
    );
  });

  it("waits for host confirmation and never rolls back a newer snapshot", () => {
    const { session, receive, client } = setup(false);
    const game = createMatch(
      3,
      [
        { id: "other", name: "other" },
        { id: "me", name: "Ada" },
      ],
      "round-one",
    );
    receive({ kind: "dots:state", match: { ...game, moves: [0] } });
    expect(session.syncing.value).toBe(false);
    session.play(1);
    expect(session.pending.value).toBe(true);
    expect(session.match.value?.moves).toEqual([0]);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "dots:move", revision: 1, edge: 1 }),
    );
    receive({ kind: "dots:state", match: { ...game, moves: [0, 1] } });
    expect(session.pending.value).toBe(false);
    expect(session.match.value?.moves).toEqual([0, 1]);
    receive({ kind: "dots:state", match: { ...game, moves: [0] } });
    expect(session.match.value?.moves).toEqual([0, 1]);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "dots:offer",
        match: expect.objectContaining({ moves: [0, 1] }),
      }),
    );
  });

  it("preserves a match through host loss, pauses missing players and allows a replacement round", () => {
    const { session, receive, room } = setup(false);
    const game = createMatch(
      3,
      [
        { id: "other", name: "other" },
        { id: "me", name: "Ada" },
      ],
      "round-one",
    );
    receive({ kind: "dots:state", match: { ...game, moves: [0] } });
    room([member("me", 2)]);
    vi.advanceTimersByTime(501);
    expect(session.isHost.value).toBe(true);
    expect(session.paused.value).toBe(true);
    expect(session.match.value?.moves).toEqual([0]);
    room([member("me", 2), member("third", 3)]);
    vi.advanceTimersByTime(501);
    expect(session.canStart.value).toBe(true);
    session.startOnline(4);
    const replacement = session.match.value!;
    expect(replacement.players.map((player) => player.id)).toEqual([
      "me",
      "third",
    ]);
    receive({ kind: "dots:offer", target: "me", match: game }, "third");
    expect(session.match.value?.id).toBe(replacement.id);
  });

  it("recovers a missing final move from an extending participant snapshot", () => {
    const { session, receive, room } = setup(false);
    const game = createMatch(
      3,
      [
        { id: "other", name: "other" },
        { id: "me", name: "Ada" },
      ],
      "round-one",
    );
    receive({ kind: "dots:state", match: { ...game, moves: [0] } });
    room([member("me", 2)]);
    vi.advanceTimersByTime(501);
    room([member("me", 2), member("other", 3)]);
    receive({
      kind: "dots:offer",
      target: "me",
      match: { ...game, moves: [0, 1] },
    });
    expect(session.match.value?.moves).toEqual([0, 1]);
    expect(session.paused.value).toBe(false);
    expect(session.cooldown.value).toBe(true);
  });

  it("requests state after a connection interruption and on returning to a visible page", () => {
    const { session, receive, room, emit, client } = setup(false);
    const game = createMatch(
      3,
      [
        { id: "other", name: "other" },
        { id: "me", name: "Ada" },
      ],
      "round-one",
    );
    receive({ kind: "dots:state", match: game });
    emit({ status: "reconnecting", room: null });
    expect(session.match.value?.id).toBe("round-one");
    expect(session.syncing.value).toBe(true);
    room([member("other", 1), member("me", 3)]);
    receive({ kind: "dots:state", match: game });
    expect(session.syncing.value).toBe(false);
    expect(session.lastRecoveryMs.value).not.toBeNull();
    const handler = browserListeners.get("visibilitychange") as EventListener;
    handler(new Event("visibilitychange"));
    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "dots:sync" }),
    );
  });

  it("clears a pending move on relay rejection without replaying an old error on each metric update", () => {
    const { session, receive, emit } = setup(false);
    const game = createMatch(
      3,
      [
        { id: "other", name: "other" },
        { id: "me", name: "Ada" },
      ],
      "round-one",
    );
    receive({ kind: "dots:state", match: { ...game, moves: [0] } });
    session.play(1);
    expect(session.pending.value).toBe(true);
    emit({ lastError: "RATE_LIMITED: Too many messages" });
    expect(session.pending.value).toBe(false);
    expect(session.error.value).toContain("RATE_LIMITED");
    receive({ kind: "dots:state", match: { ...game, moves: [0] } });
    expect(session.error.value).toBeNull();
    emit({ messagesReceived: 100 });
    expect(session.error.value).toBeNull();
  });

  it("handles synchronous send notifications without applying the same remote move twice", () => {
    const { session, receive, client } = setup(true, true);
    session.startOnline(3);
    session.play(0);
    vi.advanceTimersByTime(2_201);
    vi.mocked(client.send).mockClear();
    receive({
      kind: "dots:move",
      matchId: session.match.value!.id,
      revision: 1,
      edge: 1,
      requestId: "remote-move",
    });
    expect(session.match.value?.moves).toEqual([0, 1]);
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "dots:state" }),
    );
  });

  it("briefly throttles an extra turn after capturing a box without rejecting the valid next move", () => {
    const { session, receive, client } = setup(false);
    const game = createMatch(
      3,
      [
        { id: "other", name: "other" },
        { id: "me", name: "Ada" },
      ],
      "round-one",
    );
    receive({ kind: "dots:state", match: { ...game, moves: [0, 3, 12] } });
    session.play(13);
    receive({ kind: "dots:state", match: { ...game, moves: [0, 3, 12, 13] } });
    expect(session.cooldown.value).toBe(true);
    vi.mocked(client.send).mockClear();
    session.play(1);
    expect(client.send).not.toHaveBeenCalled();
    expect(session.error.value).toBeNull();
    vi.advanceTimersByTime(2_201);
    session.play(1);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "dots:move", edge: 1, revision: 4 }),
    );
  });

  it("pauses a host whose update was rejected until a deliberate resynchronization", () => {
    const { session, relayError, client } = setup();
    session.startOnline(3);
    session.play(0);
    relayError();
    expect(session.paused.value).toBe(true);
    vi.advanceTimersByTime(2_201);
    session.requestSync();
    vi.advanceTimersByTime(501);
    expect(session.paused.value).toBe(false);
    expect(client.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "dots:state",
        match: expect.objectContaining({ moves: [0] }),
      }),
    );
    relayError();
    expect(session.paused.value).toBe(true);
    expect(session.error.value).toContain("RATE_LIMITED");
  });

  it("never lets ordinary offers or follower sync requests bypass the host move authority", () => {
    const { session, receive } = setup();
    session.startOnline(3);
    const current = session.match.value!;
    const forged = { ...current, moves: [0, 1] };
    receive({ kind: "dots:offer", target: "me", match: forged });
    expect(session.match.value?.moves).toEqual([]);
    receive({ kind: "dots:sync", requestId: "read-only-sync", match: forged });
    expect(session.match.value?.moves).toEqual([]);
  });

  it("pauses conflicting host histories and enables a fresh ready round", () => {
    const { session, receive } = setup();
    session.startOnline(3);
    session.play(0);
    const current = session.match.value!;
    session.requestSync();
    receive({
      kind: "dots:offer",
      target: "me",
      match: { ...current, moves: [1] },
    });
    vi.advanceTimersByTime(501);
    expect(session.paused.value).toBe(true);
    expect(session.canStart.value).toBe(true);
    expect(session.error.value).toContain("histories differ");
    session.startOnline(3);
    expect(session.match.value?.id).not.toBe(current.id);
    expect(session.match.value?.moves).toEqual([]);
    expect(session.paused.value).toBe(false);
  });

  it("keeps local play available with an invalid configured relay and disposes all owned resources", () => {
    vi.stubEnv("VITE_RELAY_URL", "invalid relay");
    const { client } = harness();
    const session = useGameSession();
    session.startLocal(3, 2);
    session.play(0);
    expect(session.match.value?.moves).toEqual([0]);
    session.roomInput.value = "test-room";
    session.joinRoom();
    expect(session.error.value).not.toBeNull();
    expect(client.join).not.toHaveBeenCalled();
    session.destroy();
    expect(client.destroy).toHaveBeenCalledOnce();
    expect(document.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
