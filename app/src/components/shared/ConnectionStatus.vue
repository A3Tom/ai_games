<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useConnectionStore } from '../../stores/connection'

const connectionStore = useConnectionStore()
const { status, peerConnected, lastPingMs } = storeToRefs(connectionStore)

const dotColor = computed<'green' | 'yellow' | 'red'>(() => {
  if (status.value === 'connected' && peerConnected.value) return 'green'
  if (status.value === 'reconnecting') return 'yellow'
  if (status.value === 'connected' && !peerConnected.value) return 'yellow'
  return 'red' // 'disconnected' or 'connecting'
})

const dotClass = computed<string>(() => {
  const colorMap: Record<'green' | 'yellow' | 'red', string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }
  return colorMap[dotColor.value]
})

const statusText = computed<string>(() => {
  if (status.value === 'disconnected') return 'Disconnected'
  if (status.value === 'reconnecting') return 'Reconnecting...'
  if (status.value === 'connecting') return 'Connecting...'
  if (status.value === 'connected' && peerConnected.value) return 'Opponent connected'
  if (status.value === 'connected' && !peerConnected.value) return 'Waiting for opponent...'
  return 'Unknown'
})

const showPing = computed(() => status.value === 'connected' && lastPingMs.value !== null)
</script>

<template>
  <div class="flex items-center gap-2 text-sm">
    <span
      data-testid="status-dot"
      class="inline-block h-2.5 w-2.5 rounded-full"
      :class="dotClass"
    />
    <span data-testid="status-text" class="text-gray-300">{{ statusText }}</span>
    <span
      v-if="showPing"
      data-testid="ping-latency"
      class="text-xs text-gray-400"
    >{{ lastPingMs }}ms</span>
  </div>
</template>
