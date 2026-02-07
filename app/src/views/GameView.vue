<script setup lang="ts">
defineProps<{
  roomId: string
}>()
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center">
    <h1 class="mb-4 text-3xl font-bold">Sea Strike</h1>
    <p class="text-gray-400">Game Room: {{ roomId }}</p>
  </div>
</template>
