<script setup lang="ts">
import { computed } from 'vue'

import type { PlacedShip, ShipType } from '../../types/game'
import { FLEET_CONFIG } from '../../constants/ships'

const props = defineProps<{
  myShips: PlacedShip[]
  mySunkShips: ShipType[]
  opponentSunkShips: ShipType[]
}>()

const myRemainingCount = computed<number>(() => {
  return FLEET_CONFIG.length - props.mySunkShips.length
})

const opponentRemainingCount = computed<number>(() => {
  return FLEET_CONFIG.length - props.opponentSunkShips.length
})

function isShipSunk(sunkList: ShipType[], shipType: ShipType): boolean {
  return sunkList.includes(shipType)
}
</script>

<template>
  <div class="flex flex-col gap-4 sm:flex-row sm:gap-6">
    <!-- Your Fleet -->
    <div class="flex flex-col gap-1">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-blue-300">
        Your Fleet
      </h3>
      <p class="text-xs text-gray-400">
        {{ myRemainingCount }} / {{ FLEET_CONFIG.length }} remaining
      </p>
      <div v-for="ship in FLEET_CONFIG" :key="ship.type" class="flex items-center gap-2">
        <span
          :class="[
            'text-sm',
            isShipSunk(mySunkShips, ship.type) ? 'text-red-400 line-through' : 'text-gray-200',
          ]"
        >
          {{ ship.name }}
        </span>
        <span class="flex gap-0.5">
          <span
            v-for="n in ship.size"
            :key="n"
            :class="[
              'inline-block h-3 w-3 rounded-sm',
              isShipSunk(mySunkShips, ship.type) ? 'bg-red-900' : 'bg-gray-400',
            ]"
          />
        </span>
      </div>
    </div>

    <!-- Enemy Fleet -->
    <div class="flex flex-col gap-1">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-red-300">
        Enemy Fleet
      </h3>
      <p class="text-xs text-gray-400">
        {{ opponentRemainingCount }} / {{ FLEET_CONFIG.length }} remaining
      </p>
      <div v-for="ship in FLEET_CONFIG" :key="ship.type" class="flex items-center gap-2">
        <span
          :class="[
            'text-sm',
            isShipSunk(opponentSunkShips, ship.type) ? 'text-red-400 line-through' : 'text-gray-200',
          ]"
        >
          {{ ship.name }}
        </span>
        <span class="flex gap-0.5">
          <span
            v-for="n in ship.size"
            :key="n"
            :class="[
              'inline-block h-3 w-3 rounded-sm',
              isShipSunk(opponentSunkShips, ship.type) ? 'bg-red-900' : 'bg-gray-400',
            ]"
          />
        </span>
      </div>
    </div>
  </div>
</template>
