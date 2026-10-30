<script setup lang="ts">
import AppHeader from './components/shared/AppHeader.vue'
</script>

<template>
  <div class="flex flex-1 flex-col bg-gray-700">
    <AppHeader />
    <div class="flex flex-1 flex-col">
      <RouterView />
    </div>
  </div>
</template>
