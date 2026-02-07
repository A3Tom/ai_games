<script setup lang="ts">
import type { CellState, PlacedShip } from '../../types/game'
import { GRID_SIZE, COLUMN_LABELS, ROW_LABELS } from '../../constants/grid'
import GridCell from '../shared/GridCell.vue'

defineProps<{
  board: CellState[][]
  ships: PlacedShip[]
}>()
</script>

<template>
  <div class="mx-auto w-full max-w-sm">
    <h3 class="mb-1 text-sm font-semibold text-blue-300">
      Your Fleet
    </h3>
    <div
      class="grid gap-0"
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
          :interactive="false"
          :highlighted="false"
          :highlight-valid="false"
        />
      </template>
    </div>
  </div>
</template>
