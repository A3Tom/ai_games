<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isMyTurn: boolean
}>()

const indicatorClass = computed<string>(() => {
  if (props.isMyTurn) {
    return 'text-green-400 font-bold bg-green-900/30 border border-green-500/50'
  }
  return 'text-gray-400 font-normal bg-gray-800/30 border border-gray-600/50'
})
</script>

<template>
  <div
    :class="['rounded-lg px-4 py-2 text-center text-lg select-none', indicatorClass]"
    aria-live="polite"
    role="status"
  >
    {{ isMyTurn ? 'Your Turn' : "Opponent's Turn" }}
  </div>
</template>
