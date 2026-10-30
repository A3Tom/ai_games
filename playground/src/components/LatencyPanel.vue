<script setup lang="ts">
import { computed } from 'vue'
import type { ClientState } from '@ai-games/multiplayer'

import { milliseconds } from '../format'

const props = defineProps<{ state: ClientState }>()
const emit = defineEmits<{ ping: [] }>()
const points = computed((): string => {
  const samples = props.state.latency.samples
  const ceiling = Math.max(50, ...samples) * 1.15
  return samples.map((sample, index) => `${samples.length < 2 ? 0 : index / (samples.length - 1) * 600},${82 - Math.min(sample / ceiling, 1) * 72}`).join(' ')
})
</script>

<template>
  <section class="panel latency-panel" aria-labelledby="latency-heading">
    <div class="panel-heading">
      <div><span class="eyebrow">LIVE / ROUND TRIP</span><h2 id="latency-heading">Browser ↔ relay</h2></div>
      <button class="button compact" :disabled="state.status !== 'connected'" @click="emit('ping')">Ping now <span aria-hidden="true">↗</span></button>
    </div>
    <div class="latency-reading"><strong>{{ milliseconds(state.latency.last) }}</strong><span>ms <span class="muted">/ latest</span></span></div>
    <div class="sparkline-wrap">
      <svg v-if="state.latency.samples.length" viewBox="0 0 600 92" preserveAspectRatio="none" role="img" aria-label="Recent browser to relay round-trip times in milliseconds">
        <line x1="0" y1="82" x2="600" y2="82" class="chart-grid" />
        <line x1="0" y1="46" x2="600" y2="46" class="chart-grid" />
        <line x1="0" y1="10" x2="600" y2="10" class="chart-grid" />
        <polyline :points="points" class="chart-line" />
        <circle v-if="state.latency.samples.length === 1" :cx="0" :cy="Number(points.split(',')[1])" r="3" fill="currentColor" />
      </svg>
      <div v-else class="chart-empty"><span class="status-dot"></span>Waiting for a relay pong</div>
    </div>
    <div class="latency-stats">
      <div><span>MIN</span><strong>{{ milliseconds(state.latency.min) }} <small>ms</small></strong></div>
      <div><span>AVERAGE</span><strong>{{ milliseconds(state.latency.average) }} <small>ms</small></strong></div>
      <div><span>MAX</span><strong>{{ milliseconds(state.latency.max) }} <small>ms</small></strong></div>
      <div><span>MISSING REPLIES</span><strong>{{ state.latency.lost }} <small>pings</small></strong></div>
    </div>
    <p class="panel-note">Sampled every 5 seconds. Includes the trip to the relay and back; this does not measure peer-to-peer latency.</p>
  </section>
</template>
