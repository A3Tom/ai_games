import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  shallowRef,
} from "vue";
import { createMultiplayerClient } from "@ai-games/multiplayer";
import type {
  ClientState,
  LogEntry,
  RoomSnapshot,
} from "@ai-games/multiplayer";
import { telemetry } from "../../shared/telemetry.js";
import { createMatch, getBoard, playMove, readMatch } from "./game";
import type { BoardSize, Match } from "./game";

const APP_ID = "dots-and-boxes";
const identifier = /^[a-zA-Z0-9_-]{1,64}$/;
const MOVE_INTERVAL = 2_200;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  );
}

function savedName(): string {
  try {
    return localStorage.getItem("dots-and-boxes.name") || "Player";
  } catch {
    return "Player";
  }
}

function resolveEndpoint(value: string): string {
  const page = new URL(window.location.href);
  const url =
    value.trim().startsWith("/") && !value.trim().startsWith("//")
      ? new URL(value.trim(), page.origin)
      : new URL(value.trim());
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.hash ||
    url.username ||
    url.password ||
    (page.protocol === "https:" && url.protocol !== "wss:")
  ) {
    throw new Error(
      "Use a ws:// or wss:// relay address. HTTPS pages need wss://.",
    );
  }
  return url.toString();
}

function leader(room: RoomSnapshot | null): string | null {
  return room
    ? ([...room.players].sort(
        (a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id),
      )[0]?.id ?? null)
    : null;
}

function sameSetup(a: Match, b: Match): boolean {
  return (
    a.id === b.id &&
    a.size === b.size &&
    JSON.stringify(a.players) === JSON.stringify(b.players)
  );
}

function extendsHistory(candidate: Match, previous: Match): boolean {
  return (
    sameSetup(candidate, previous) &&
    candidate.moves.length >= previous.moves.length &&
    previous.moves.every((edge, i) => candidate.moves[i] === edge)
  );
}

/** Peer-hosted game authority; the relay continues to own transport and presence. */
export function useGameSession() {
  const mode = ref<"local" | "online">("local");
  const match = shallowRef<Match | null>(null);
  const configuredEndpoint = import.meta.env.VITE_RELAY_URL || "/relay";
  let initialEndpoint: string;
  try {
    initialEndpoint = resolveEndpoint(configuredEndpoint);
  } catch {
    initialEndpoint = configuredEndpoint;
  }
  const endpoint = ref(initialEndpoint);
  const name = ref(savedName());
  const roomInput = ref(
    new URL(window.location.href).searchParams.get("room") ?? "",
  );
  const error = ref<string | null>(null);
  const syncing = ref(false);
  const pending = ref(false);
  const cooldown = ref(false);
  const lastRecoveryMs = ref<number | null>(null);
  const desynced = ref(false);
  let client = createMultiplayerClient({
    url: endpoint.value,
    appId: APP_ID,
    name: name.value,
    diagnosticsIntervalMs: 15_000,
  });
  const connection = shallowRef<ClientState>(client.getState());
  let currentEndpoint = endpoint.value;
  let unsubscribe: () => void = () => {};
  let lastRoom: string | null = null;
  let lastMembership = "";
  let previousHost: string | null = null;
  let recoveryStarted: number | null = null;
  let recoveryConflict = false;
  let pendingRequest: string | null = null;
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let hostTimer: ReturnType<typeof setTimeout> | undefined;
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const seen = new Set<string>();

  const hostId = computed(() =>
    mode.value === "online" ? leader(connection.value.room) : null,
  );
  const isHost = computed(
    () => hostId.value !== null && hostId.value === connection.value.playerId,
  );
  const ready = computed(
    () =>
      connection.value.room?.players.find(
        (player) => player.id === connection.value.playerId,
      )?.ready ?? false,
  );
  const paused = computed(
    () =>
      mode.value === "online" &&
      match.value !== null &&
      (desynced.value ||
        connection.value.status !== "connected" ||
        match.value.players.some(
          (player) =>
            !connection.value.room?.players.some(
              (member) => member.id === player.id,
            ),
        )),
  );
  const canStart = computed(() => {
    const players = connection.value.room?.players ?? [];
    return (
      mode.value === "online" &&
      isHost.value &&
      !syncing.value &&
      !pending.value &&
      players.length >= 2 &&
      players.length <= 4 &&
      players.every((player) => player.ready) &&
      (match.value === null || getBoard(match.value).finished || paused.value)
    );
  });
  const shareLink = computed(() => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    if (connection.value.room)
      url.searchParams.set("room", connection.value.room.roomId);
    return url.toString();
  });

  function clearPending(): void {
    clearTimeout(moveTimer);
    moveTimer = undefined;
    pending.value = false;
    pendingRequest = null;
  }

  function clearTimers(): void {
    clearPending();
    clearTimeout(syncTimer);
    clearTimeout(hostTimer);
    clearTimeout(cooldownTimer);
    syncTimer = hostTimer = cooldownTimer = undefined;
    syncing.value = false;
    cooldown.value = false;
  }

  function markCooldown(): void {
    clearTimeout(cooldownTimer);
    cooldown.value = true;
    cooldownTimer = setTimeout(() => {
      cooldown.value = false;
    }, MOVE_INTERVAL);
  }

  function beginRecovery(): void {
    syncing.value = true;
    recoveryConflict = false;
    if (recoveryStarted === null) recoveryStarted = performance.now();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncing.value = false;
      error.value =
        "No game snapshot arrived. Try Resync board or reconnect to the room.";
      telemetry.warn("state_sync_timeout", "Game state recovery timed out");
    }, 7_000);
  }

  function finishRecovery(succeeded = true): void {
    clearTimeout(syncTimer);
    syncTimer = undefined;
    syncing.value = false;
    if (recoveryStarted !== null && succeeded) {
      lastRecoveryMs.value = Math.max(
        0,
        Math.round(performance.now() - recoveryStarted),
      );
      telemetry.info("state_resynced", "Game state synchronized", {
        recovery_ms: lastRecoveryMs.value,
        moves: match.value?.moves.length ?? 0,
      });
    }
    recoveryStarted = null;
  }

  function logMatchChange(
    previous: Match | null,
    next: Match,
    claimed = 0,
  ): void {
    if (previous?.id !== next.id) {
      telemetry.info("game_started", "Dots and Boxes round started", {
        mode: mode.value,
        board_size: next.size,
        players: next.players.length,
      });
    } else if (previous.moves.length < next.moves.length) {
      telemetry.info("move_applied", "Edge added to the board", {
        moves: next.moves.length,
        boxes_claimed: claimed,
      });
    }
    if (
      getBoard(next).finished &&
      (previous?.id !== next.id || !getBoard(previous).finished)
    ) {
      const scores = getBoard(next).scores;
      const maximum = Math.max(...scores);
      telemetry.info("game_completed", "Dots and Boxes round completed", {
        mode: mode.value,
        board_size: next.size,
        players: next.players.length,
        moves: next.moves.length,
        tied: scores.filter((score) => score === maximum).length > 1,
      });
    }
  }

  function setMatch(next: Match, claimed = 0): void {
    const previous = match.value;
    match.value = next;
    const captured =
      previous?.id === next.id
        ? Math.max(
            0,
            getBoard(next).scores.reduce((sum, score) => sum + score, 0) -
              getBoard(previous).scores.reduce((sum, score) => sum + score, 0),
          )
        : 0;
    logMatchChange(previous, next, claimed || captured);
    if (
      mode.value === "online" &&
      previous?.id === next.id &&
      next.moves.length > previous.moves.length
    )
      markCooldown();
    clearPending();
    desynced.value = false;
    error.value = null;
  }

  function broadcastState(target?: string, requestId?: string): void {
    if (
      !isHost.value ||
      connection.value.status !== "connected" ||
      !connection.value.room
    )
      return;
    client.send({
      kind: "dots:state",
      match: match.value,
      ...(target ? { target } : {}),
      ...(requestId ? { requestId } : {}),
    });
  }

  function reject(reason: string, target?: string, requestId?: string): void {
    telemetry.warn("move_rejected", "Game action rejected", { reason });
    if (!target || target === connection.value.playerId) {
      clearPending();
      error.value = reason;
    } else {
      client.send({ kind: "dots:reject", target, requestId, reason });
    }
  }

  // Only merge an existing participant's strictly extending history. Unrelated
  // rounds can never replace a running round during a host handover.
  function mergeOffer(value: unknown, sender: string): void {
    const offered = readMatch(value);
    if (!offered || !offered.players.some((player) => player.id === sender))
      return;
    const current = match.value;
    if (
      current &&
      sameSetup(offered, current) &&
      !extendsHistory(offered, current) &&
      !extendsHistory(current, offered)
    ) {
      desynced.value = true;
      recoveryConflict = true;
      error.value = "Game histories differ. Ready up for a fresh round.";
      telemetry.warn(
        "state_mismatch",
        "Conflicting game histories detected by host",
      );
      return;
    }
    // Ordinary sync requests can read the host's state, but cannot advance it.
    // A validated extension is considered only during deliberate recovery.
    if (!syncing.value || recoveryConflict) return;
    if (current && !extendsHistory(offered, current)) return;
    if (!current || offered.moves.length > current.moves.length) {
      setMatch(offered);
      if (!syncing.value) broadcastState();
    }
  }

  function requestSync(): void {
    if (
      mode.value !== "online" ||
      connection.value.status !== "connected" ||
      !connection.value.room
    ) {
      error.value = "Connect to a room before syncing the game.";
      return;
    }
    error.value = null;
    clearPending();
    beginRecovery();
    const requestId = newId();
    client.send({ kind: "dots:sync", requestId, match: match.value });
    if (isHost.value) {
      clearTimeout(hostTimer);
      // Give surviving peers a chance to offer a snapshot before accepting moves.
      hostTimer = setTimeout(() => {
        if (!recoveryConflict) desynced.value = false;
        finishRecovery(!recoveryConflict);
        broadcastState();
      }, 500);
    }
  }

  function acceptMove(
    sender: string,
    edge: number,
    revision: number,
    matchId: string,
    requestId: string,
  ): void {
    if (
      !match.value ||
      match.value.id !== matchId ||
      match.value.moves.length !== revision
    ) {
      reject(
        "The board changed. Use Resync board and try again.",
        sender,
        requestId,
      );
      broadcastState(sender);
      return;
    }
    if (paused.value || syncing.value) {
      reject("The game is paused while players reconnect.", sender, requestId);
      return;
    }
    if (cooldown.value) {
      reject(
        "Let the ink dry for a moment before the next move.",
        sender,
        requestId,
      );
      return;
    }
    const result = playMove(match.value, sender, edge);
    if ("error" in result) {
      reject(result.error, sender, requestId);
      return;
    }
    setMatch(result.match, result.claimed);
    broadcastState();
  }

  function handleMessage(entry: LogEntry): void {
    const envelope = entry.payload;
    const room = connection.value.room;
    if (
      !record(envelope) ||
      envelope.type !== "relay:message" ||
      typeof envelope.senderId !== "string" ||
      envelope.appId !== APP_ID ||
      !room ||
      envelope.roomId !== room.roomId ||
      !record(envelope.payload)
    )
      return;
    const sender = envelope.senderId;
    if (!room.players.some((player) => player.id === sender)) return;
    const payload = envelope.payload;
    if (
      payload.kind === "dots:sync" &&
      typeof payload.requestId === "string" &&
      identifier.test(payload.requestId)
    ) {
      if (isHost.value) {
        mergeOffer(payload.match, sender);
        broadcastState(sender, payload.requestId);
      } else if (sender === hostId.value) {
        client.send({
          kind: "dots:offer",
          target: sender,
          requestId: payload.requestId,
          match: match.value,
        });
      }
    } else if (
      payload.kind === "dots:offer" &&
      isHost.value &&
      payload.target === connection.value.playerId
    ) {
      mergeOffer(payload.match, sender);
    } else if (
      payload.kind === "dots:state" &&
      sender === hostId.value &&
      (payload.target === undefined ||
        payload.target === connection.value.playerId)
    ) {
      if (payload.match === null) {
        if (match.value !== null) {
          client.send({
            kind: "dots:offer",
            target: sender,
            match: match.value,
          });
        } else finishRecovery();
        return;
      }
      const next = readMatch(payload.match);
      if (!next) {
        telemetry.warn(
          "state_mismatch",
          "An invalid game snapshot was ignored",
        );
        error.value = "An invalid game snapshot was ignored. Try Resync board.";
        return;
      }
      const current = match.value;
      if (current?.id === next.id && !extendsHistory(next, current)) {
        if (extendsHistory(current, next)) {
          client.send({ kind: "dots:offer", target: sender, match: current });
        } else {
          desynced.value = true;
          error.value =
            "Game histories differ. The host can start a fresh round.";
          telemetry.warn(
            "state_mismatch",
            "Conflicting game histories detected",
          );
          client.send({ kind: "dots:offer", target: sender, match: current });
        }
        return;
      }
      setMatch(next);
      finishRecovery();
    } else if (
      payload.kind === "dots:move" &&
      isHost.value &&
      typeof payload.edge === "number" &&
      typeof payload.revision === "number" &&
      Number.isInteger(payload.revision) &&
      typeof payload.matchId === "string" &&
      typeof payload.requestId === "string" &&
      identifier.test(payload.requestId)
    ) {
      acceptMove(
        sender,
        payload.edge,
        payload.revision,
        payload.matchId,
        payload.requestId,
      );
    } else if (
      payload.kind === "dots:reject" &&
      sender === hostId.value &&
      payload.target === connection.value.playerId &&
      payload.requestId === pendingRequest &&
      typeof payload.reason === "string"
    ) {
      clearPending();
      error.value = payload.reason.slice(0, 200);
    }
  }

  function updateAddress(roomId: string | null): void {
    const url = new URL(window.location.href);
    if (roomId) url.searchParams.set("room", roomId);
    else url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }

  function onState(next: ClientState): void {
    if (destroyed) return;
    const previousError = connection.value.lastError;
    connection.value = next;
    if (mode.value !== "online") return;
    if (next.lastError && next.lastError !== previousError) {
      error.value = next.lastError;
      clearPending();
      // A rejected host broadcast may have left peers on the previous board.
      // Pause until a deliberate recovery has shared the current history again.
      if (isHost.value && match.value) desynced.value = true;
    }
    if (!next.room) {
      lastMembership = "";
      if (match.value && next.status !== "connected") {
        clearPending();
        if (recoveryStarted === null) recoveryStarted = performance.now();
        syncing.value = true;
      }
    } else {
      if (next.room.roomId !== lastRoom) {
        lastRoom = next.room.roomId;
        match.value = null;
        previousHost = null;
        desynced.value = false;
        error.value = null;
        updateAddress(lastRoom);
      }
      const membership = next.room.players
        .map((player) => `${player.id}:${player.joinedAt}`)
        .sort()
        .join("|");
      if (membership !== lastMembership) {
        lastMembership = membership;
        const elected = leader(next.room);
        const changedHost = previousHost !== elected;
        if (previousHost && changedHost)
          telemetry.info("host_changed", "Game host changed");
        previousHost = elected;
        // One host-led exchange covers the whole membership change. Followers
        // wait for its sync request instead of all querying the host at once.
        // Returning participants can still offer a lost final snapshot during
        // this deliberate recovery window.
        if (isHost.value) requestSync();
        else {
          clearPending();
          beginRecovery();
        }
      }
    }
    for (const entry of next.events) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (entry.direction === "in" && entry.type === "relay:message")
        handleMessage(entry);
      else if (
        (entry.direction === "in" && entry.type === "relay:error") ||
        (entry.direction === "system" && entry.type === "client:error")
      ) {
        clearPending();
        error.value =
          next.lastError ||
          "The relay could not accept the update. Try Resync board.";
        if (isHost.value && match.value) desynced.value = true;
      }
    }
    if (seen.size > 500) {
      const keep = [...seen].slice(-200);
      seen.clear();
      for (const id of keep) seen.add(id);
    }
  }

  function prepare(): boolean {
    error.value = null;
    let resolved: string;
    try {
      resolved = resolveEndpoint(endpoint.value);
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "Enter a valid relay address.";
      return false;
    }
    if (!name.value.trim() || name.value.trim().length > 32) {
      error.value = "Choose a display name with 1–32 characters.";
      return false;
    }
    endpoint.value = resolved;
    name.value = name.value.trim();
    try {
      localStorage.setItem("dots-and-boxes.name", name.value);
    } catch {
      /* Storage is optional. */
    }
    if (currentEndpoint !== resolved) {
      const playerId = connection.value.playerId;
      unsubscribe();
      client.destroy();
      client = createMultiplayerClient({
        url: resolved,
        appId: APP_ID,
        playerId,
        name: name.value,
        diagnosticsIntervalMs: 15_000,
      });
      currentEndpoint = resolved;
      lastRoom = null;
      lastMembership = "";
      previousHost = null;
      match.value = null;
      seen.clear();
      unsubscribe = client.subscribe(onState);
    }
    return true;
  }

  function joinRoom(): void {
    if (!identifier.test(roomInput.value.trim())) {
      error.value =
        "Enter a room code using 1–64 letters, numbers, hyphens or underscores.";
      return;
    }
    if (!prepare()) return;
    if (mode.value === "local") match.value = null;
    mode.value = "online";
    clearTimers();
    client.join(roomInput.value.trim(), name.value);
  }

  function createRoom(): void {
    roomInput.value = `dots-${newId().slice(0, 12)}`;
    joinRoom();
  }

  function leaveRoom(): void {
    clearTimers();
    client.leave();
    client.disconnect();
    match.value = null;
    lastRoom = null;
    lastMembership = "";
    previousHost = null;
    recoveryStarted = null;
    desynced.value = false;
    error.value = null;
    updateAddress(null);
  }

  function startLocal(size: BoardSize, count: number): void {
    if (!Number.isInteger(count) || count < 2 || count > 4) {
      error.value = "Choose two to four players.";
      return;
    }
    mode.value = "local";
    clearTimers();
    client.leave();
    client.disconnect();
    lastRoom = null;
    lastMembership = "";
    previousHost = null;
    recoveryStarted = null;
    updateAddress(null);
    setMatch(
      createMatch(
        size,
        Array.from({ length: count }, (_, i) => ({
          id: `local-${i + 1}`,
          name: `Player ${i + 1}`,
        })),
        newId(),
      ),
    );
  }

  function toggleReady(): void {
    if (
      mode.value === "online" &&
      connection.value.room &&
      connection.value.status === "connected"
    )
      client.setReady(!ready.value);
  }

  function startOnline(size: BoardSize): void {
    if (!canStart.value || !connection.value.room) {
      error.value = "The host can start when two to four players are ready.";
      return;
    }
    setMatch(
      createMatch(
        size,
        connection.value.room.players.map(({ id, name: playerName }) => ({
          id,
          name: playerName,
        })),
        newId(),
      ),
    );
    clearTimeout(cooldownTimer);
    cooldown.value = false;
    broadcastState();
  }

  function play(edge: number): void {
    const current = match.value;
    if (!current) return;
    if (mode.value === "local") {
      const result = playMove(
        current,
        current.players[getBoard(current).turn]!.id,
        edge,
      );
      if ("error" in result) reject(result.error);
      else setMatch(result.match, result.claimed);
      return;
    }
    if (pending.value || cooldown.value) return;
    if (
      connection.value.status !== "connected" ||
      !connection.value.room ||
      syncing.value ||
      paused.value
    ) {
      reject("The game is paused while players reconnect.");
      return;
    }
    const check = playMove(current, connection.value.playerId, edge);
    if ("error" in check) {
      reject(check.error);
      return;
    }
    const requestId = newId();
    if (isHost.value)
      acceptMove(
        connection.value.playerId,
        edge,
        current.moves.length,
        current.id,
        requestId,
      );
    else {
      pending.value = true;
      pendingRequest = requestId;
      moveTimer = setTimeout(() => {
        clearPending();
        error.value =
          "The host did not confirm your move. Use Resync board before trying again.";
        requestSync();
      }, 5_000);
      client.send({
        kind: "dots:move",
        matchId: current.id,
        revision: current.moves.length,
        edge,
        requestId,
      });
    }
  }

  function reconnect(): void {
    if (!prepare()) return;
    mode.value = "online";
    clearPending();
    if (match.value) beginRecovery();
    client.reconnect();
    if (!lastRoom && identifier.test(roomInput.value.trim()))
      client.join(roomInput.value.trim(), name.value);
  }

  function onVisible(): void {
    if (
      document.visibilityState === "visible" &&
      mode.value === "online" &&
      connection.value.room
    )
      requestSync();
  }

  function destroy(): void {
    destroyed = true;
    clearTimers();
    unsubscribe();
    client.destroy();
    document.removeEventListener("visibilitychange", onVisible);
  }

  unsubscribe = client.subscribe(onState);
  document.addEventListener("visibilitychange", onVisible);
  if (getCurrentScope()) onScopeDispose(destroy);

  return {
    mode,
    match,
    connection,
    endpoint,
    name,
    roomInput,
    error,
    syncing,
    pending,
    cooldown,
    isHost,
    canStart,
    ready,
    paused,
    hostId,
    shareLink,
    lastRecoveryMs,
    startLocal,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    startOnline,
    play,
    requestSync,
    reconnect,
    destroy,
  };
}
