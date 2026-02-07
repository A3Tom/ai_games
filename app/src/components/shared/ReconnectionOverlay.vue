<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useConnectionStore } from '../../stores/connection'

const connectionStore = useConnectionStore()
const { status, reconnectAttempts } = storeToRefs(connectionStore)

const isReconnecting = computed(() => status.value === 'reconnecting')
const isDisconnected = computed(() => status.value === 'disconnected')

function handleRetry(): void {
  connectionStore.resetReconnection()
}
</script>

<template>
  <div
    v-if="isReconnecting"
    data-testid="reconnecting-overlay"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  >
    <div class="flex flex-col items-center gap-4 rounded-lg bg-gray-800 p-8 text-white">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      <p class="text-lg font-semibold">Reconnecting...</p>
      <p data-testid="reconnect-attempt-count" class="text-sm text-gray-400">
        Attempt {{ reconnectAttempts }} of 10
      </p>
    </div>
  </div>

  <div
    v-else-if="isDisconnected"
    data-testid="disconnected-overlay"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  >
    <div class="flex flex-col items-center gap-4 rounded-lg bg-gray-800 p-8 text-white">
      <p class="text-lg font-semibold">Connection Lost</p>
      <p class="text-sm text-gray-400">Unable to reach the game server.</p>
      <button
        data-testid="retry-button"
        type="button"
        class="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        @click="handleRetry"
      >
        Retry
      </button>
    </div>
  </div>
</template>
