<script setup lang="ts">
import { computed } from 'vue'

import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'

const props = defineProps<{
  x: number
  y: number
  state: CellState
  interactive: boolean
  highlighted: boolean
  highlightValid: boolean
}>()

const emit = defineEmits<{
  cellClick: [x: number, y: number]
  cellHover: [x: number, y: number]
}>()

const STATE_BG: Record<CellState, string> = {
  [CELL_STATES.EMPTY]: 'bg-blue-900',
  [CELL_STATES.SHIP]: 'bg-gray-400',
  [CELL_STATES.HIT]: 'bg-red-600',
  [CELL_STATES.MISS]: 'bg-blue-400',
  [CELL_STATES.SUNK]: 'bg-red-900',
}

const cellClass = computed<string>(() => {
  const bg = props.highlighted
    ? props.highlightValid
      ? 'bg-green-500/70'
      : 'bg-red-500/70'
    : STATE_BG[props.state]

  const cursor = props.interactive ? 'cursor-pointer' : 'cursor-default'

  return `aspect-square border border-gray-600 transition-colors duration-100 select-none ${cursor} ${bg}`
})

function handleClick(): void {
  if (props.interactive) {
    emit('cellClick', props.x, props.y)
  }
}

function handleHover(): void {
  if (props.interactive) {
    emit('cellHover', props.x, props.y)
  }
}
</script>

<template>
  <div :class="cellClass" @click="handleClick" @mouseenter="handleHover" />
</template>
