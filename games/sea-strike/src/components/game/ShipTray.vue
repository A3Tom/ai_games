<script setup lang="ts">
import { computed } from 'vue'

import type { ShipType, PlacedShip } from '../../types/game'
import type { ShipConfig } from '../../constants/ships'

const props = defineProps<{
  ships: ShipConfig[]
  placedShips: PlacedShip[]
}>()

const emit = defineEmits<{
  shipSelected: [shipType: ShipType]
}>()

interface ShipEntry {
  config: ShipConfig
  isPlaced: boolean
}

const shipEntries = computed<ShipEntry[]>(() =>
  props.ships.map((config) => ({
    config,
    isPlaced: props.placedShips.some((placed) => placed.type === config.type),
  })),
)

function handleShipClick(shipType: ShipType): void {
  const isPlaced = props.placedShips.some((s) => s.type === shipType)
  if (!isPlaced) {
    emit('shipSelected', shipType)
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-sm font-semibold text-gray-300">Your Fleet</h3>
    <div
      v-for="entry in shipEntries"
      :key="entry.config.type"
      class="flex items-center gap-3 rounded-lg px-3 py-2"
      :class="
        entry.isPlaced
          ? 'cursor-default opacity-50'
          : 'cursor-pointer hover:bg-gray-700'
      "
      @click="handleShipClick(entry.config.type)"
    >
      <span class="w-24 text-sm text-gray-200">{{ entry.config.name }}</span>
      <div class="flex gap-1">
        <span
          v-for="i in entry.config.size"
          :key="i"
          class="h-4 w-4 rounded-sm"
          :class="entry.isPlaced ? 'bg-gray-600' : 'bg-gray-400'"
        />
      </div>
      <span v-if="entry.isPlaced" class="ml-auto text-xs text-gray-500">(placed)</span>
    </div>
  </div>
</template>
