<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import BoardView from "./Board.vue";
import { createMatch, getBoard } from "./game";
import type { BoardSize } from "./game";
import { useGameSession } from "./session";

const {
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
} = useGameSession();
const setupMode = ref<"local" | "online">(
  new URL(location.href).searchParams.has("room") ? "online" : "local",
);
const size = ref<BoardSize>(4);
const playerCount = ref(2);
const copied = ref(false);
const copyHint = ref("");
const sizes: BoardSize[] = [3, 4, 5];
const sizeLabels = { 3: "A quick round", 4: "The classic", 5: "Room to think" };
const previewMatch = computed(() =>
  createMatch(
    size.value,
    Array.from({ length: playerCount.value }, (_, i) => ({
      id: `preview-${i}`,
      name: `Player ${i + 1}`,
    })),
    "preview",
  ),
);
const displayMatch = computed(() => match.value ?? previewMatch.value);
const board = computed(() => getBoard(displayMatch.value));
const room = computed(() => connection.value.room);
const everyoneReady = computed(
  () =>
    !!room.value &&
    room.value.players.length >= 2 &&
    room.value.players.length <= 4 &&
    room.value.players.every((player) => player.ready),
);
const spectator = computed(
  () =>
    mode.value === "online" &&
    match.value &&
    !match.value.players.some((p) => p.id === connection.value.playerId),
);
const playable = computed(
  () =>
    !!match.value &&
    !board.value.finished &&
    !syncing.value &&
    !pending.value &&
    !cooldown.value &&
    !paused.value &&
    (mode.value === "local" ||
      (connection.value.status === "connected" &&
        !!room.value &&
        match.value.players[board.value.turn]?.id ===
          connection.value.playerId)),
);
const turnPlayer = computed(
  () => displayMatch.value.players[board.value.turn]!,
);
const claimed = computed(() =>
  board.value.scores.reduce((sum, score) => sum + score, 0),
);
const winners = computed(() =>
  displayMatch.value.players.filter(
    (_, index) => board.value.scores[index] === Math.max(...board.value.scores),
  ),
);
const heading = computed(() => {
  if (!match.value)
    return mode.value === "online" && room.value
      ? "Your table is coming together."
      : "A good game starts with a dot.";
  if (board.value.finished)
    return winners.value.length === 1
      ? `${winners.value[0]!.name} wins!`
      : "A well-played draw.";
  if (
    mode.value === "online" &&
    (connection.value.status !== "connected" || syncing.value)
  )
    return "Getting everyone back to the table…";
  if (paused.value) return "A seat is empty. Game paused.";
  if (spectator.value) return `${turnPlayer.value.name} is drawing.`;
  if (
    mode.value === "online" &&
    turnPlayer.value.id === connection.value.playerId
  )
    return "Your line. Make it count.";
  return `${turnPlayer.value.name}’s turn.`;
});
const subheading = computed(() => {
  if (!match.value)
    return mode.value === "online" && room.value
      ? "Invite your friends and ready up for the first line."
      : "Choose your table, then connect the dots.";
  if (board.value.finished)
    return `${claimed.value} boxes claimed. Ready for another round?`;
  if (syncing.value) return "Recovering the latest board from the room.";
  if (paused.value)
    return "Wait for your friend to reconnect, or ready up for a fresh game.";
  if (spectator.value)
    return "You’re watching this round. Join the next one when it finishes.";
  if (pending.value) return "Your line is on its way…";
  if (cooldown.value) return "Let the ink dry…";
  return "Complete a box to score a point and take another turn.";
});
const onlineRoundActive = computed(
  () =>
    mode.value === "online" &&
    !!match.value &&
    !board.value.finished &&
    !paused.value,
);
const recentEvents = computed(() =>
  connection.value.events
    .filter(
      (event) => event.direction === "system" || event.type === "relay:error",
    )
    .slice(-5)
    .reverse(),
);
const hostName = computed(
  () => room.value?.players.find((p) => p.id === hostId.value)?.name ?? "—",
);
watch(mode, (value) => {
  setupMode.value = value;
});
watch(shareLink, () => {
  copied.value = false;
  copyHint.value = "";
});
watch(
  () => match.value?.id,
  (next, previous) => {
    if (!next || next === previous) return;
    void nextTick(() => {
      const table = document.querySelector<HTMLElement>(".table-card");
      table?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 700px)").matches) {
        table?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    });
  },
);

async function copyInvite(): Promise<void> {
  copied.value = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareLink.value);
      copied.value = true;
    }
  } catch {
    /* The selected field also supports manual copying. */
  }
  if (!copied.value) {
    const field = document.querySelector<HTMLInputElement>("#invite-link");
    field?.focus();
    field?.select();
    try {
      copied.value = document.execCommand("copy");
    } catch {
      /* Manual copy remains available. */
    }
  }
  copyHint.value = copied.value
    ? "Invite copied. Send it to your friends."
    : "Select the link above and copy it to invite a friend.";
}
</script>

<template>
  <div class="game-page">
    <header class="game-intro">
      <div>
        <p class="eyebrow">
          <span class="tiny-grid" aria-hidden="true">⠿</span> THE PEN & PAPER
          CLASSIC
        </p>
        <h1>Dots <span>&</span> Boxes<span class="title-dot">.</span></h1>
        <p class="intro-copy">
          A little strategy. A little rivalry. One line at a time.
        </p>
      </div>
      <div class="intro-label">
        <span class="mini-dots" aria-hidden="true"
          >● ━ ●<br />┃ &nbsp; ┃<br />● ━ ●</span
        ><span>2–4 players<br /><strong>Every box counts.</strong></span>
      </div>
    </header>

    <div v-if="error" class="notice error-notice" role="alert">
      <span>{{ error }}</span
      ><button
        class="text-button"
        type="button"
        aria-label="Dismiss message"
        @click="error = null"
      >
        Dismiss
      </button>
    </div>

    <div class="game-layout" :class="{ 'awaiting-game': !match }">
      <section class="table-card" aria-label="Game table" tabindex="-1">
        <div class="table-topline">
          <span class="eyebrow">{{
            match
              ? `${displayMatch.size} × ${displayMatch.size} BOXES`
              : "YOUR NEXT GOOD GAME"
          }}</span
          ><span class="table-badge"
            ><span
              class="small-dot"
              :class="{ live: mode === 'online' && room }"
            ></span
            >{{
              match
                ? mode === "online"
                  ? "Online table"
                  : "Pass & play"
                : "Pull up a seat"
            }}</span
          >
        </div>
        <div class="turn-banner" aria-live="polite" aria-atomic="true">
          <span
            v-if="match && !board.finished"
            class="turn-marker"
            :class="`player-${board.turn}`"
            >{{ board.turn + 1 }}</span
          >
          <div>
            <h2>{{ heading }}</h2>
            <p>{{ subheading }}</p>
          </div>
        </div>
        <div v-if="match" class="scoreboard" aria-label="Scores">
          <div
            v-for="(player, index) in match.players"
            :key="player.id"
            class="score-card"
            :class="[
              `player-${index}`,
              {
                active: !board.finished && board.turn === index,
                winner:
                  board.finished && winners.some((p) => p.id === player.id),
              },
            ]"
          >
            <div class="score-name">
              <span class="player-token">{{ index + 1 }}</span
              ><span
                >{{ player.name
                }}<small
                  v-if="mode === 'online' && player.id === connection.playerId"
                >
                  · you</small
                ></span
              >
            </div>
            <strong :data-score="index"
              >{{ board.scores[index]
              }}<small>
                {{ board.scores[index] === 1 ? "box" : "boxes" }}</small
              ></strong
            >
            <span
              v-if="
                mode === 'online' &&
                !room?.players.some((p) => p.id === player.id)
              "
              class="away-label"
              >Away</span
            >
          </div>
        </div>
        <BoardView
          :match="displayMatch"
          :playable="playable"
          :preview="!match"
          @play="play"
        />
        <div class="board-caption">
          <span>{{
            match
              ? `${displayMatch.size ** 2 - claimed} boxes left to claim`
              : "Tap or click between two dots to draw a line."
          }}</span
          ><span v-if="match"
            >{{ match.moves.length }} / {{ board.edges.length }} lines</span
          >
        </div>
        <div v-if="match && board.finished" class="result-banner" role="status">
          <span class="result-symbol" aria-hidden="true">✦</span>
          <div>
            <strong>{{
              winners.length === 1 ? "Nicely boxed." : "Honours even."
            }}</strong>
            <p>
              {{ winners.map((p) => p.name).join(" & ") }}
              {{ winners.length === 1 ? "takes the table" : "share the win" }}
              with {{ Math.max(...board.scores) }} boxes.
            </p>
          </div>
          <button
            v-if="mode === 'local'"
            class="primary-button"
            type="button"
            @click="startLocal(match.size, match.players.length)"
          >
            Play again <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>

      <aside class="sidebar" aria-label="Game setup">
        <section class="setup-card">
          <div class="section-heading">
            <div>
              <p class="eyebrow">GOOD COMPANY, GOOD GAME</p>
              <h2>Your table</h2>
            </div>
            <span class="seat-icon" aria-hidden="true">↗</span>
          </div>
          <div class="mode-switch" role="group" aria-label="Play mode">
            <button
              type="button"
              :aria-pressed="setupMode === 'local'"
              :class="{ selected: setupMode === 'local' }"
              @click="setupMode = 'local'"
            >
              Pass & play</button
            ><button
              type="button"
              :aria-pressed="setupMode === 'online'"
              :class="{ selected: setupMode === 'online' }"
              @click="setupMode = 'online'"
            >
              Play online
            </button>
          </div>
          <template v-if="setupMode === 'local'">
            <p class="setup-description">
              One screen, a few friends. Pass the device when your turn is over.
            </p>
            <fieldset class="field-group">
              <legend>Seats at the table</legend>
              <div class="player-options">
                <button
                  v-for="count in [2, 3, 4]"
                  :key="count"
                  type="button"
                  :aria-pressed="playerCount === count"
                  :class="{ selected: playerCount === count }"
                  @click="playerCount = count"
                >
                  {{ count }} players
                </button>
              </div>
            </fieldset>
          </template>
          <template v-else>
            <p class="setup-description">
              A shared table, wherever you are. Create a room and invite your
              friends.
            </p>
            <label class="field-label" for="player-name">Your name</label
            ><input
              id="player-name"
              v-model="name"
              maxlength="32"
              autocomplete="nickname"
              :disabled="!!room"
              placeholder="What should we call you?"
            />
            <template v-if="!room"
              ><button
                class="primary-button full-width"
                type="button"
                :disabled="
                  connection.status === 'connecting' ||
                  connection.status === 'reconnecting'
                "
                @click="createRoom"
              >
                {{
                  connection.status === "connecting" ||
                  connection.status === "reconnecting"
                    ? "Connecting…"
                    : "Create a room"
                }}
                <span aria-hidden="true">↗</span>
              </button>
              <div class="divider"><span>or join your friends</span></div>
              <form class="join-form" @submit.prevent="joinRoom">
                <label class="field-label" for="room-code">Room code</label>
                <div class="input-row">
                  <input
                    id="room-code"
                    v-model="roomInput"
                    maxlength="64"
                    autocapitalize="none"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="Enter a room code"
                  /><button
                    class="secondary-button"
                    type="submit"
                    :disabled="
                      !roomInput.trim() || connection.status === 'connecting'
                    "
                  >
                    Join
                  </button>
                </div>
              </form></template
            >
            <template v-else>
              <div class="room-heading">
                <span class="connection-badge" :class="connection.status"
                  ><span class="small-dot live"></span
                  >{{ connection.status }}</span
                ><span
                  >{{ room.players.length }} /
                  {{ Math.min(room.capacity, 4) }} seats</span
                >
              </div>
              <div class="room-code-line">
                <span>Room code</span><strong>{{ room.roomId }}</strong>
              </div>
              <ul class="member-list">
                <li v-for="player in room.players" :key="player.id">
                  <span class="member-avatar">{{
                    player.name.slice(0, 1).toUpperCase()
                  }}</span
                  ><span class="member-name"
                    >{{ player.name
                    }}<small
                      >{{
                        player.id === connection.playerId
                          ? "You"
                          : player.id === hostId
                            ? "Host"
                            : "Player"
                      }}{{
                        player.id === connection.playerId && isHost
                          ? " · Host"
                          : ""
                      }}</small
                    ></span
                  ><span
                    class="ready-status"
                    :class="{ ready: player.ready }"
                    >{{ player.ready ? "Ready ✓" : "Not ready" }}</span
                  >
                </li>
              </ul>
              <label class="field-label" for="invite-link"
                >Invite a friend</label
              >
              <div class="input-row">
                <input
                  id="invite-link"
                  :value="shareLink"
                  readonly
                  @focus="($event.target as HTMLInputElement).select()"
                /><button
                  type="button"
                  class="secondary-button"
                  @click="copyInvite"
                >
                  {{ copied ? "Copied" : "Copy invite" }}
                </button>
              </div>
              <p v-if="copyHint" class="help-text" role="status">
                {{ copyHint }}
              </p>
              <button
                v-if="!onlineRoundActive"
                class="ready-button full-width"
                :class="{ 'is-ready': ready }"
                type="button"
                :aria-pressed="ready"
                :disabled="connection.status !== 'connected' || syncing"
                @click="toggleReady"
              >
                {{ ready ? "You’re ready ✓" : "I’m ready to play" }}
              </button>
              <p v-if="!onlineRoundActive && !everyoneReady" class="help-text">
                {{
                  room.players.length < 2
                    ? "Invite at least one friend to play."
                    : room.players.length > 4
                      ? "This game has four seats. Extra players need to leave before it starts."
                      : "Everyone at the table needs to be ready."
                }}
              </p>
              <p
                v-if="!onlineRoundActive && !isHost && everyoneReady"
                class="help-text"
              >
                All set. {{ hostName }} can start the game.
              </p>
              <p v-if="spectator" class="spectator-note">
                You have a seat for the next round. Enjoy this one from the
                sidelines.
              </p>
            </template>
          </template>

          <fieldset
            v-if="
              setupMode === 'local' || (room && isHost && !onlineRoundActive)
            "
            class="field-group board-options"
          >
            <legend>Make room for strategy</legend>
            <div class="size-options">
              <button
                v-for="option in sizes"
                :key="option"
                type="button"
                :aria-pressed="size === option"
                :class="{ selected: size === option }"
                @click="size = option"
              >
                <strong>{{ option }} × {{ option }}</strong
                ><span>{{ sizeLabels[option] }}</span>
              </button>
            </div>
          </fieldset>
          <button
            v-if="setupMode === 'local'"
            class="primary-button full-width"
            type="button"
            @click="startLocal(size, playerCount)"
          >
            {{ match ? "Start a fresh local game" : "Start a local game" }}
            <span aria-hidden="true">↗</span>
          </button>
          <button
            v-else-if="room && isHost && !onlineRoundActive"
            class="primary-button full-width"
            type="button"
            :disabled="
              !canStart || syncing || connection.status !== 'connected'
            "
            @click="startOnline(size)"
          >
            {{
              !match
                ? "Start online game"
                : board.finished
                  ? "Start next round"
                  : "Start a fresh game"
            }}
            <span aria-hidden="true">↗</span>
          </button>
          <div v-if="room && setupMode === 'online'" class="room-footer">
            <span>{{
              isHost ? "You’re hosting this table." : `Hosted by ${hostName}`
            }}</span
            ><button class="text-button" type="button" @click="leaveRoom">
              Leave room
            </button>
          </div>
          <p v-if="setupMode === 'local'" class="setup-footnote">
            No accounts. No downloads. Just one more game.
          </p>
        </section>

        <section class="rules-card">
          <p class="eyebrow">EASY TO LEARN. HARD TO LEAVE.</p>
          <h2>Three little rules.</h2>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Draw a line.</strong>
                <p>Connect any two neighbouring dots.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Close a box.</strong>
                <p>Draw its fourth side to claim a point.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Go again.</strong>
                <p>Claim a box, keep your turn. Most boxes wins.</p>
              </div>
            </li>
          </ol>
        </section>
        <details class="diagnostics">
          <summary>
            <span
              class="small-dot"
              :class="{ live: connection.status === 'connected' }"
            ></span
            >Connection & diagnostics <span aria-hidden="true">+</span>
          </summary>
          <div class="diagnostics-body">
            <p class="help-text">
              {{
                mode === "local"
                  ? "Local play stays on this device. Online play uses the shared collection relay."
                  : "Live browser-to-relay measurements for this table."
              }}
            </p>
            <label class="field-label" for="relay-endpoint"
              >Relay endpoint</label
            ><input
              id="relay-endpoint"
              v-model="endpoint"
              :disabled="!!room"
              spellcheck="false"
              autocapitalize="none"
            />
            <dl>
              <div>
                <dt>Connection</dt>
                <dd>{{ connection.status }}</dd>
              </div>
              <div>
                <dt>Round-trip latency</dt>
                <dd>
                  {{
                    connection.latency.last === null
                      ? "—"
                      : `${Math.round(connection.latency.last)} ms`
                  }}
                </dd>
              </div>
              <div>
                <dt>Messages sent / received</dt>
                <dd>
                  {{ connection.messagesSent }} /
                  {{ connection.messagesReceived }}
                </dd>
              </div>
              <div>
                <dt>Bytes sent / received</dt>
                <dd>
                  {{ connection.bytesSent }} / {{ connection.bytesReceived }}
                </dd>
              </div>
              <div>
                <dt>Missing ping replies</dt>
                <dd>{{ connection.latency.lost }}</dd>
              </div>
              <div>
                <dt>Last board recovery</dt>
                <dd>
                  {{ lastRecoveryMs === null ? "—" : `${lastRecoveryMs} ms` }}
                </dd>
              </div>
            </dl>
            <div v-if="mode === 'online'" class="diagnostic-actions">
              <button type="button" class="secondary-button" @click="reconnect">
                Reconnect</button
              ><button
                type="button"
                class="secondary-button"
                :disabled="
                  !room || syncing || connection.status !== 'connected'
                "
                @click="requestSync"
              >
                Resync board
              </button>
            </div>
            <ol v-if="recentEvents.length" class="event-list">
              <li v-for="event in recentEvents" :key="event.id">
                <time>{{ new Date(event.at).toLocaleTimeString() }}</time
                ><span>{{ event.type }}</span>
              </li>
            </ol>
            <p class="help-text">
              Game events appear in collection logs under
              <code>dots-and-boxes</code>.
            </p>
          </div>
        </details>
      </aside>
    </div>
    <footer class="game-footnote">
      <span>Small lines. Big plans.</span><span>A game for good company.</span>
    </footer>
  </div>
</template>
