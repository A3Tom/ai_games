<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useGameStore } from '../stores/game'
import { useConnectionStore } from '../stores/connection'
import { useGameProtocol } from '../composables/useGameProtocol'
import type { ShipType } from '../types/game'
import { GAME_PHASES, CELL_STATES } from '../types/game'
import { getShipCells } from '../utils/board'

import SetupPhase from '../components/game/SetupPhase.vue'
import PlayerBoard from '../components/game/PlayerBoard.vue'
import OpponentBoard from '../components/game/OpponentBoard.vue'
import TurnIndicator from '../components/game/TurnIndicator.vue'
import GameStatus from '../components/game/GameStatus.vue'

const props = defineProps<{
  roomId: string
}>()

const gameStore = useGameStore()
const connectionStore = useConnectionStore()
const { phase, myBoard, opponentBoard, myShips, isMyTurn, canFire, shotHistory } =
  storeToRefs(gameStore)
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

// --- Battle phase logic ---

const mySunkShips = computed<ShipType[]>(() => {
  return myShips.value
    .filter((ship) => {
      const cells = getShipCells(ship)
      return cells.every((cell) => {
        const state = myBoard.value[cell.y]?.[cell.x]
        return state === CELL_STATES.SUNK
      })
    })
    .map((ship) => ship.type)
})

const opponentSunkShips = computed<ShipType[]>(() => {
  const localPlayer: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'
  return shotHistory.value
    .filter(
      (shot): shot is typeof shot & { sunk: ShipType } =>
        shot.player === localPlayer && shot.sunk !== null,
    )
    .map((shot) => shot.sunk)
})

function handleFire(x: number, y: number): void {
  gameStore.fireShot(x, y)
  protocol.sendShot(x, y)
}

// End-of-game detection
watch([myBoard, shotHistory], () => {
  if (phase.value !== GAME_PHASES.BATTLE) return

  // Check if all of player's ships are sunk
  const myAllSunk =
    myShips.value.length > 0 &&
    myShips.value.every((ship) => {
      const cells = getShipCells(ship)
      return cells.every((cell) => {
        const state = myBoard.value[cell.y]?.[cell.x]
        return state === CELL_STATES.SUNK
      })
    })

  // Check if all opponent ships are sunk (5 unique sunk types in shot history)
  const localPlayer: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'
  const opponentSunkCount = new Set(
    shotHistory.value
      .filter((shot) => shot.player === localPlayer && shot.sunk !== null)
      .map((shot) => shot.sunk),
  ).size
  const opponentAllSunk = opponentSunkCount === 5

  if (myAllSunk || opponentAllSunk) {
    gameStore.startReveal()
  }
})

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
      class="flex flex-1 flex-col items-center gap-4 p-4"
    >
      <TurnIndicator :is-my-turn="isMyTurn" />

      <div class="flex w-full flex-col items-center gap-6 md:flex-row md:justify-center md:gap-8">
        <PlayerBoard :board="myBoard" :ships="myShips" />
        <OpponentBoard
          :board="opponentBoard"
          :is-my-turn="isMyTurn"
          :can-fire="canFire"
          @fire="handleFire"
        />
      </div>

      <GameStatus
        :my-ships="myShips"
        :my-sunk-ships="mySunkShips"
        :opponent-sunk-ships="opponentSunkShips"
      />
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
