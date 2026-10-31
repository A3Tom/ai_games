<script setup lang="ts">
import ConnectionStatus from './ConnectionStatus.vue'
</script>

<template>
  <header class="flex w-full items-center justify-between bg-gray-800 px-4 py-3">
    <h1 class="text-xl font-bold text-white sm:text-2xl">Sea Strike</h1>
    <ConnectionStatus />
  </header>
</template>
