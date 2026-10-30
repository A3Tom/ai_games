<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import type { ClientState, LogEntry } from '@ai-games/multiplayer'

const props = defineProps<{ state: ClientState }>()
const emit = defineEmits<{ send: [payload: unknown] }>()
const text = ref('')
const roomBoundary = shallowRef<LogEntry | undefined>()
watch(() => props.state.room ? `${props.state.room.appId}:${props.state.room.roomId}` : null, () => {
  roomBoundary.value = props.state.events.at(-1)
}, { immediate: true, flush: 'sync' })
const latestPulse = computed(() => {
  if (!props.state.room) return null
  const boundaryIndex = roomBoundary.value ? props.state.events.indexOf(roomBoundary.value) : -1
  for (const event of props.state.events.slice(boundaryIndex + 1).reverse()) {
    if (event.type !== 'relay:message' || typeof event.payload !== 'object' || event.payload === null) continue
    const envelope = event.payload as Record<string, unknown>
    if (event.direction === 'in' && (envelope.roomId !== props.state.room.roomId || envelope.appId !== props.state.room.appId)) continue
    if (typeof envelope.payload !== 'object' || envelope.payload === null) continue
    const payload = envelope.payload as Record<string, unknown>
    if (payload.kind === 'pulse') return { id: event.id, outgoing: event.direction === 'out', at: event.at }
  }
  return null
})
const peerCount = computed(() => Math.max(0, (props.state.room?.players.length ?? 0) - 1))
function sendMessage(): void {
  const message = text.value.trim()
  if (!message) return
  emit('send', { kind: 'message', text: message })
  text.value = ''
}
</script>

<template>
  <section class="panel actions-panel" aria-labelledby="actions-heading">
    <div class="panel-heading"><div><span class="eyebrow">03 / EXERCISE</span><h2 id="actions-heading">Send a test action</h2></div><span class="muted small">{{ peerCount }} {{ peerCount === 1 ? 'recipient' : 'recipients' }}</span></div>
    <div class="pulse-test">
      <div :key="latestPulse?.id ?? 'waiting'" class="pulse-indicator" :class="{ active: latestPulse }" aria-hidden="true"><span></span><span></span><span></span><i></i></div>
      <div class="pulse-copy"><strong>{{ latestPulse ? (latestPulse.outgoing ? 'Pulse sent from this tab' : 'Pulse received from a peer') : 'A tiny stand-in for a game action' }}</strong><p>{{ latestPulse ? `Last signal at ${new Date(latestPulse.at).toLocaleTimeString()}` : 'Watch it arrive in every other browser in your room.' }}</p></div>
      <button class="button primary" :disabled="!state.room || state.status !== 'connected'" @click="emit('send', { kind: 'pulse', color: '#6ee7c2' })">Send pulse <span aria-hidden="true">↗</span></button>
    </div>
    <form class="message-form" @submit.prevent="sendMessage">
      <label for="test-message">Or send a message</label>
      <div class="input-button-row"><input id="test-message" v-model="text" maxlength="500" placeholder="Hello from this browser…" autocomplete="off" /><button class="button" :disabled="!state.room || state.status !== 'connected' || !text.trim()" type="submit">Send <span aria-hidden="true">→</span></button></div>
    </form>
    <p class="panel-note">Actions stay inside the room. Acknowledgements report how many peer sockets the relay forwarded to; they don’t confirm that a peer processed the action.</p>
  </section>
</template>
