<script setup lang="ts">
import { computed } from 'vue'

import type { CellState, PlacedShip } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { getShipCells } from '../../utils/board'
import GridCell from '../shared/GridCell.vue'

const props = defineProps<{
  winner: 'me' | 'opponent'
  cheatDetected: boolean
  myBoard: CellState[][]
  myShips: PlacedShip[]
  opponentBoard: CellState[][]
  opponentShips: PlacedShip[]
  opponentRevealed: boolean
  rematchRequested: boolean
  opponentRematchRequested: boolean
}>()

const emit = defineEmits<{
  requestRematch: []
}>()

const revealedOpponentBoard = computed<CellState[][]>(() => {
  if (!props.opponentRevealed || props.opponentShips.length === 0) {
    return props.opponentBoard
  }

  const board = props.opponentBoard.map(row => [...row])
  for (const ship of props.opponentShips) {
    const cells = getShipCells(ship)
    for (const cell of cells) {
      if (board[cell.y]?.[cell.x] === CELL_STATES.EMPTY) {
        board[cell.y]![cell.x] = CELL_STATES.SHIP
      }
    }
  }
  return board
})

const flatMyBoard = computed(() => props.myBoard.flat())
const flatRevealedOpponentBoard = computed(() => revealedOpponentBoard.value.flat())

function handleRequestRematch(): void {
  emit('requestRematch')
}
</script>

<template>
  <div class="flex flex-col items-center gap-6 p-4">
    <h2
      data-testid="winner-text"
      class="text-3xl font-bold"
      :class="winner === 'me' ? 'text-green-400' : 'text-red-400'"
    >
      {{ winner === 'me' ? 'You Win!' : 'You Lose!' }}
    </h2>

    <div class="flex flex-col gap-6 md:flex-row md:gap-8">
      <div>
        <h3 class="mb-2 text-center text-sm font-semibold text-blue-300">Your Board</h3>
        <div data-testid="my-board" class="grid grid-cols-10 gap-0.5">
          <GridCell
            v-for="(cell, index) in flatMyBoard"
            :key="index"
            :x="index % 10"
            :y="Math.floor(index / 10)"
            :state="cell"
            :interactive="false"
            :highlighted="false"
            :highlight-valid="false"
          />
        </div>
      </div>

      <div>
        <h3 class="mb-2 text-center text-sm font-semibold text-blue-300">Opponent's Board</h3>
        <div v-if="opponentRevealed" data-testid="opponent-board" class="grid grid-cols-10 gap-0.5">
          <GridCell
            v-for="(cell, index) in flatRevealedOpponentBoard"
            :key="index"
            :x="index % 10"
            :y="Math.floor(index / 10)"
            :state="cell"
            :interactive="false"
            :highlighted="false"
            :highlight-valid="false"
          />
        </div>
        <p v-else data-testid="reveal-pending" class="text-gray-400">
          Waiting for opponent to reveal board...
        </p>
      </div>
    </div>

    <div
      v-if="opponentRevealed"
      data-testid="verification-badge"
      class="rounded-lg px-4 py-2 text-center font-semibold"
      :class="cheatDetected
        ? 'border border-red-700 bg-red-900/30 text-red-400'
        : 'border border-green-700 bg-green-900/30 text-green-400'"
    >
      {{ cheatDetected ? 'Cheat Detected' : 'Verified — Fair Game' }}
    </div>

    <div v-if="opponentRevealed" class="flex flex-col items-center gap-2">
      <p
        v-if="opponentRematchRequested && !rematchRequested"
        data-testid="opponent-rematch-notice"
        class="font-semibold text-yellow-400"
      >
        Opponent wants a rematch!
      </p>
      <button
        v-if="!rematchRequested"
        data-testid="rematch-button"
        class="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700"
        @click="handleRequestRematch"
      >
        Rematch
      </button>
      <p
        v-else
        data-testid="rematch-waiting"
        class="text-gray-400"
      >
        Waiting for opponent to accept rematch...
      </p>
    </div>
  </div>
</template>
