<script setup lang="ts">
import { computed } from 'vue'

import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { GRID_SIZE, COLUMN_LABELS, ROW_LABELS } from '../../constants/grid'
import GridCell from '../shared/GridCell.vue'

const props = defineProps<{
  board: CellState[][]
  isMyTurn: boolean
  canFire: boolean
}>()

const emit = defineEmits<{
  fire: [x: number, y: number]
}>()

function isCellInteractive(x: number, y: number): boolean {
  return props.canFire && props.board[y]?.[x] === CELL_STATES.EMPTY
}

function handleCellClick(x: number, y: number): void {
  if (!props.canFire) return
  if (props.board[y]?.[x] !== CELL_STATES.EMPTY) return
  emit('fire', x, y)
}

const boardClass = computed<string>(() => {
  return props.canFire ? '' : 'opacity-60 cursor-not-allowed'
})
</script>

<template>
  <div class="mx-auto w-full max-w-sm">
    <h3 class="mb-1 text-sm font-semibold text-red-300">
      Enemy Fleet
    </h3>
    <div
      :class="['grid gap-0', boardClass]"
      :style="{ gridTemplateColumns: `auto repeat(${GRID_SIZE}, 1fr)` }"
    >
      <!-- Column labels -->
      <div />
      <div
        v-for="label in COLUMN_LABELS"
        :key="label"
        class="text-center text-xs text-gray-400"
      >
        {{ label }}
      </div>

      <!-- Grid rows -->
      <template v-for="(row, y) in board" :key="y">
        <div class="flex items-center justify-center text-xs text-gray-400">
          {{ ROW_LABELS[y] }}
        </div>
        <GridCell
          v-for="(cell, x) in row"
          :key="`${x}-${y}`"
          :x="x"
          :y="y"
          :state="cell"
          :interactive="isCellInteractive(x, y)"
          :highlighted="false"
          :highlight-valid="false"
          @cell-click="handleCellClick"
        />
      </template>
    </div>
  </div>
</template>
