<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LogEntry } from '@ai-games/multiplayer'

const props = defineProps<{ events: LogEntry[] }>()
const query = ref('')
const direction = ref('all')
const hidden = ref<Set<string>>(new Set())
const filtered = computed(() => [...props.events].reverse().filter((event) => {
  if (hidden.value.has(`${event.id}:${event.at}`)) return false
  if (direction.value !== 'all' && event.direction !== direction.value) return false
  const search = query.value.trim().toLowerCase()
  return !search || `${event.type} ${event.detail} ${JSON.stringify(event.payload) ?? ''}`.toLowerCase().includes(search)
}))
function clear(): void {
  hidden.value = new Set(props.events.map((event) => `${event.id}:${event.at}`))
}
function time(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false }) + `.${String(at % 1000).padStart(3, '0')}`
}
</script>

<template>
  <section class="panel event-panel" aria-labelledby="events-heading">
    <div class="panel-heading event-heading">
      <div><span class="eyebrow">INSPECT / EVENT STREAM</span><h2 id="events-heading">What’s happening on the wire <span class="event-count">{{ filtered.length }}</span></h2></div>
      <div class="log-tools"><label class="sr-only" for="event-search">Search events</label><input id="event-search" v-model="query" type="search" placeholder="Filter events…" /><label class="sr-only" for="event-direction">Event direction</label><select id="event-direction" v-model="direction"><option value="all">All directions</option><option value="in">Incoming</option><option value="out">Outgoing</option><option value="system">System</option></select><button class="button compact" :disabled="!filtered.length" @click="clear">Clear view</button></div>
    </div>
    <div class="log-columns" aria-hidden="true"><span>TIME</span><span>DIRECTION</span><span>EVENT</span><span>DETAILS</span></div>
    <div v-if="!filtered.length" class="empty-state log-empty"><span class="empty-mark" aria-hidden="true">↔</span><p>{{ query || direction !== 'all' ? 'No matching events.' : 'Your connection story starts here.' }}<br /><span class="muted">Connect to a relay to inspect real messages.</span></p></div>
    <div v-else class="event-rows">
      <details v-for="event in filtered" :key="event.id" class="event-row">
        <summary><time :datetime="new Date(event.at).toISOString()">{{ time(event.at) }}</time><span class="direction" :class="event.direction">{{ event.direction === 'in' ? '↓ IN' : event.direction === 'out' ? '↑ OUT' : '• SYSTEM' }}</span><code>{{ event.type }}</code><span class="event-detail">{{ event.detail }}<span aria-hidden="true" class="expand-mark">+</span></span></summary>
        <pre>{{ event.payload === undefined ? event.detail : JSON.stringify(event.payload, null, 2) }}</pre>
      </details>
    </div>
    <div class="log-foot"><span>Latest 100 events · newest first · expand a row for payload</span><span><i class="live-dot"></i> Live session</span></div>
  </section>
</template>
