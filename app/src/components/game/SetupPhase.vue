<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useGameStore } from '../../stores/game'
import { useCrypto } from '../../composables/useCrypto'
import { canPlaceShip, getShipCells } from '../../utils/board'
import { FLEET_CONFIG } from '../../constants/ships'
import { GRID_SIZE, COLUMN_LABELS, ROW_LABELS } from '../../constants/grid'
import { GAME_PHASES } from '../../types/game'
import type { ShipType, Orientation, PlacedShip } from '../../types/game'

import GridCell from '../shared/GridCell.vue'
import ShipTray from './ShipTray.vue'

const emit = defineEmits<{
  boardCommitted: []
}>()

const gameStore = useGameStore()
const { myBoard, myShips, phase } = storeToRefs(gameStore)
const { commitBoard: cryptoCommitBoard } = useCrypto()

const selectedShip = ref<ShipType | null>(null)
const currentOrientation = ref<Orientation>('h')
const hoveredCell = ref<{ x: number; y: number } | null>(null)
const isCommitting = ref<boolean>(false)

const previewCells = computed<Array<{ x: number; y: number; valid: boolean }>>(() => {
  if (selectedShip.value === null || hoveredCell.value === null) return []
  const ship: PlacedShip = {
    type: selectedShip.value,
    x: hoveredCell.value.x,
    y: hoveredCell.value.y,
    orientation: currentOrientation.value,
  }
  const cells = getShipCells(ship)
  const isValid = canPlaceShip(myBoard.value, ship)
  return cells.map((cell) => ({ x: cell.x, y: cell.y, valid: isValid }))
})

const allShipsPlaced = computed<boolean>(() => myShips.value.length === FLEET_CONFIG.length)
const isSetupPhase = computed<boolean>(() => phase.value === GAME_PHASES.SETUP)
const isWaitingForOpponent = computed<boolean>(() => phase.value === GAME_PHASES.COMMIT)

function isCellHighlighted(x: number, y: number): boolean {
  return previewCells.value.some((c) => c.x === x && c.y === y)
}

function isCellHighlightValid(x: number, y: number): boolean {
  const cell = previewCells.value.find((c) => c.x === x && c.y === y)
  return cell?.valid ?? false
}

function handleShipSelected(shipType: ShipType): void {
  selectedShip.value = shipType
}

function handleCellHover(x: number, y: number): void {
  hoveredCell.value = { x, y }
}

function handleCellClick(x: number, y: number): void {
  if (selectedShip.value !== null) {
    const ship: PlacedShip = {
      type: selectedShip.value,
      x,
      y,
      orientation: currentOrientation.value,
    }
    const placed = gameStore.placeShip(ship)
    if (placed) {
      selectedShip.value = null
      hoveredCell.value = null
    }
    return
  }
  const placedShip = myShips.value.find((s) => {
    const cells = getShipCells(s)
    return cells.some((c) => c.x === x && c.y === y)
  })
  if (placedShip) {
    gameStore.removeShip(placedShip.type)
  }
}

function handleRotate(): void {
  currentOrientation.value = currentOrientation.value === 'h' ? 'v' : 'h'
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'r' || event.key === 'R') {
    handleRotate()
  }
}

async function handleReady(): Promise<void> {
  if (!allShipsPlaced.value || isCommitting.value) return
  isCommitting.value = true
  try {
    const { hash, salt } = await cryptoCommitBoard(myShips.value)
    gameStore.commitBoard(hash, salt)
    // TODO: TICKET CONFLICT — useGameProtocol requires (options: UseGameProtocolOptions) and cannot
    // be called from SetupPhase. The commit hash relay send is handled by GameView via protocol.
    emit('boardCommitted')
  } finally {
    isCommitting.value = false
  }
}

function handleGridMouseLeave(): void {
  hoveredCell.value = null
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="flex flex-col items-center gap-6 p-4 sm:flex-row sm:items-start sm:justify-center">
    <!-- Board section -->
    <div class="w-full max-w-[min(90vw,24rem)]">
      <!-- Column labels -->
      <div class="mb-1 grid grid-cols-[2rem_repeat(10,1fr)] gap-0">
        <div />
        <div
          v-for="label in COLUMN_LABELS"
          :key="label"
          class="text-center text-xs text-gray-400"
        >{{ label }}</div>
      </div>
      <!-- Grid rows -->
      <div @mouseleave="handleGridMouseLeave">
        <div
          v-for="(_row, y) in GRID_SIZE"
          :key="y"
          class="grid grid-cols-[2rem_repeat(10,1fr)] gap-0"
        >
          <div class="flex items-center justify-center text-xs text-gray-400">
            {{ ROW_LABELS[y] }}
          </div>
          <GridCell
            v-for="(_col, x) in GRID_SIZE"
            :key="x"
            :x="x"
            :y="y"
            :state="myBoard[y]![x]!"
            :interactive="isSetupPhase"
            :highlighted="isCellHighlighted(x, y)"
            :highlight-valid="isCellHighlightValid(x, y)"
            @cell-click="handleCellClick"
            @cell-hover="handleCellHover"
          />
        </div>
      </div>
    </div>
    <!-- Controls section -->
    <div v-if="isSetupPhase" class="flex w-full max-w-xs flex-col gap-4">
      <ShipTray
        :ships="[...FLEET_CONFIG]"
        :placed-ships="myShips"
        @ship-selected="handleShipSelected"
      />
      <div v-if="selectedShip !== null" class="flex items-center gap-2">
        <span class="text-sm text-gray-300">Placing: {{ selectedShip }}</span>
        <button
          type="button"
          class="rounded bg-gray-700 px-3 py-1 text-sm text-white hover:bg-gray-600"
          @click="handleRotate"
        >
          {{ currentOrientation === 'h' ? 'Horizontal' : 'Vertical' }}
        </button>
      </div>
      <button
        type="button"
        :disabled="!allShipsPlaced || isCommitting"
        class="rounded-lg bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        @click="handleReady"
      >
        {{ isCommitting ? 'Committing...' : 'Ready' }}
      </button>
    </div>
    <!-- Waiting state -->
    <div v-if="isWaitingForOpponent" class="flex w-full max-w-xs items-center justify-center">
      <p class="animate-pulse text-lg text-gray-300">Waiting for opponent...</p>
    </div>
  </div>
</template>
