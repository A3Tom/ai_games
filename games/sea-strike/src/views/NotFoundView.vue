<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center">
    <h1 class="mb-4 text-3xl font-bold">Page Not Found</h1>
    <RouterLink to="/" class="text-blue-400 hover:underline">Back to Lobby</RouterLink>
  </div>
</template>
