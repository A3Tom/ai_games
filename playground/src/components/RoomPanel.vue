<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ClientState } from '@ai-games/multiplayer'

const props = defineProps<{ state: ClientState; roomInput: string; copied: boolean; shareLink: string }>()
const emit = defineEmits<{
  'update:roomInput': [value: string]
  create: []
  join: []
  leave: []
  copy: []
  ready: [value: boolean]
}>()
const attemptedJoin = ref(false)
const roomError = computed((): string | null => {
  if (!props.roomInput.trim()) return 'Enter a room ID.'
  return /^[A-Za-z0-9_-]{1,64}$/.test(props.roomInput.trim()) ? null : 'Use up to 64 letters, numbers, dashes, or underscores.'
})
const me = computed(() => props.state.room?.players.find((player) => player.id === props.state.playerId))
function join(): void {
  attemptedJoin.value = true
  if (!roomError.value) emit('join')
}
</script>

<template>
  <section class="panel room-panel" aria-labelledby="room-heading">
    <div class="panel-heading">
      <div><span class="eyebrow">02 / MEMBERSHIP</span><h2 id="room-heading">Your room</h2></div>
      <span class="count-badge">{{ state.room?.players.length ?? 0 }}<span v-if="state.room"> / {{ state.room.capacity }}</span> players</span>
    </div>
    <div v-if="state.room" class="current-room">
      <div><span class="muted small">CONNECTED TO</span><strong class="room-id">{{ state.room.roomId }}</strong></div>
      <button class="button compact" @click="emit('leave')">Leave room</button>
    </div>
    <div v-else class="empty-state compact-empty">
      <span class="empty-mark" aria-hidden="true">⌘</span>
      <p>You’re not in a room yet.<br /><span class="muted">Create one, or join a friend.</span></p>
    </div>
    <ul v-if="state.room" class="member-list" aria-label="Players in this room">
      <li v-for="(player, index) in state.room.players" :key="player.id">
        <span class="avatar" :class="`avatar-${index % 4}`">{{ player.name.charAt(0).toUpperCase() }}</span>
        <div class="member-name"><strong>{{ player.name }}</strong><span class="muted small">{{ player.id === state.playerId ? 'This browser · you' : player.id.slice(0, 8) }}</span></div>
        <span class="ready-state" :class="{ ready: player.ready }"><span class="status-dot"></span>{{ player.ready ? 'Ready' : 'Waiting' }}</span>
      </li>
    </ul>
    <button v-if="state.room" class="button ready-button" :class="{ selected: me?.ready }" @click="emit('ready', !me?.ready)">{{ me?.ready ? '✓ You’re ready — undo' : 'Mark yourself ready' }}</button>
    <div v-if="state.room" class="share-row">
      <label for="share-link" class="sr-only">Room invite link</label>
      <input id="share-link" :value="shareLink" readonly @focus="($event.target as HTMLInputElement).select()" />
      <button class="button compact" @click="emit('copy')">{{ copied ? 'Copied!' : 'Copy invite' }}</button>
    </div>
    <div class="room-controls">
      <form @submit.prevent="join">
        <label for="room-id">{{ state.room ? 'Switch to another room' : 'Join a room by ID' }}</label>
        <div class="input-button-row">
          <input id="room-id" :value="roomInput" maxlength="64" placeholder="e.g. friday-test" spellcheck="false" autocomplete="off" @input="emit('update:roomInput', ($event.target as HTMLInputElement).value)" />
          <button class="button" :disabled="state.status !== 'connected'" type="submit">{{ state.room ? 'Switch' : 'Join' }} <span aria-hidden="true">→</span></button>
        </div>
        <p v-if="attemptedJoin && roomError" class="field-error" role="alert">{{ roomError }}</p>
      </form>
      <button class="text-button create-room" :disabled="state.status !== 'connected'" @click="emit('create')">+ Create a fresh room</button>
    </div>
    <p class="panel-note">Invite a second tab or device to test presence and room isolation. Switching rooms should stop messages from the previous room.</p>
  </section>
</template>
