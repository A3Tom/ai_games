<script setup lang="ts">
import AppHeader from './components/shared/AppHeader.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <main class="flex flex-1 flex-col bg-gray-700">
      <RouterView />
    </main>
  </div>
</template>
