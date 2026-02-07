<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useGameStore } from '../stores/game'
import { useConnectionStore } from '../stores/connection'
import { useGameProtocol } from '../composables/useGameProtocol'
import { GAME_PHASES } from '../types/game'

import SetupPhase from '../components/game/SetupPhase.vue'

const props = defineProps<{
  roomId: string
}>()

const gameStore = useGameStore()
const connectionStore = useConnectionStore()
const { phase } = storeToRefs(gameStore)
const { peerConnected } = storeToRefs(connectionStore)

// Initialize protocol connection — useGameProtocol creates the relay internally
const protocol = useGameProtocol({
  roomId: props.roomId,
  isHost: true,
})

// Watch for peer connection to transition from LOBBY → SETUP
watch(peerConnected, (connected) => {
  if (connected && phase.value === GAME_PHASES.LOBBY) {
    gameStore.startSetup()
  }
})

function handleBoardCommitted(): void {
  // The store has already transitioned to COMMIT phase.
  // This handler exists for future use (e.g., logging, analytics).
  // No action needed in Phase 10.
}

onUnmounted(() => {
  protocol.disconnect()
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SetupPhase
      v-if="phase === GAME_PHASES.SETUP || phase === GAME_PHASES.COMMIT"
      @board-committed="handleBoardCommitted"
    />

    <div
      v-else-if="phase === GAME_PHASES.BATTLE"
      class="flex flex-1 items-center justify-center"
    >
      <p class="text-gray-400">Battle phase — coming in Phase 11</p>
    </div>

    <div
      v-else-if="phase === GAME_PHASES.GAMEOVER || phase === GAME_PHASES.REVEAL"
      class="flex flex-1 items-center justify-center"
    >
      <p class="text-gray-400">Game over — coming in Phase 12</p>
    </div>

    <div
      v-else
      class="flex flex-1 items-center justify-center"
    >
      <p class="text-gray-400">Connecting to room {{ roomId }}...</p>
    </div>
  </div>
</template>
