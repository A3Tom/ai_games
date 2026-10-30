<script setup lang="ts">
import type { ClientState } from '@ai-games/multiplayer'

import { bytes, number, uptime } from '../format'

defineProps<{ state: ClientState }>()
const emit = defineEmits<{ refresh: []; reset: [] }>()
</script>

<template>
  <section class="panel server-panel" aria-labelledby="server-heading">
    <div class="panel-heading">
      <div><span class="eyebrow">OBSERVE / TRAFFIC</span><h2 id="server-heading">Relay & browser metrics</h2></div>
      <button class="icon-button" :disabled="state.status !== 'connected'" title="Refresh relay metrics" aria-label="Refresh relay metrics" @click="emit('refresh')">↻</button>
    </div>
    <div class="server-summary">
      <div><span>ROOMS</span><strong>{{ number(state.server?.rooms) }}</strong></div>
      <div><span>PLAYERS</span><strong>{{ number(state.server?.players) }}</strong></div>
      <div><span>SOCKETS</span><strong>{{ number(state.server?.connections) }}</strong></div>
      <div><span>UPTIME</span><strong class="uptime">{{ state.server ? uptime(state.server.uptimeSeconds) : '—' }}</strong></div>
    </div>
    <dl class="metric-list">
      <div><dt>Relay messages received</dt><dd>{{ number(state.server?.messagesReceived) }}</dd></div>
      <div><dt>Relay messages forwarded</dt><dd>{{ number(state.server?.messagesForwarded) }}</dd></div>
      <div><dt>Relay messages rejected</dt><dd :class="{ amber: (state.server?.rejectedMessages ?? 0) > 0 }">{{ number(state.server?.rejectedMessages) }}</dd></div>
      <div><dt>Relay bytes received / sent</dt><dd>{{ state.server ? `${bytes(state.server.bytesReceived)} / ${bytes(state.server.bytesSent)}` : '—' }}</dd></div>
    </dl>
    <div class="browser-metrics">
      <div class="subheading"><span>THIS BROWSER SESSION</span><button class="text-button" @click="emit('reset')">Reset counters</button></div>
      <div class="browser-traffic"><div><span>Sent</span><strong>{{ number(state.messagesSent) }} <small>messages</small></strong><span>{{ bytes(state.bytesSent) }}</span></div><div><span>Received</span><strong>{{ number(state.messagesReceived) }} <small>messages</small></strong><span>{{ bytes(state.bytesReceived) }}</span></div></div>
    </div>
    <p class="panel-note">Relay metrics cover every app on this relay and reset on restart. Browser counters include control messages. Live diagnostics only; no historical analytics.</p>
  </section>
</template>
