<script setup lang="ts">
import { useRouter } from 'vue-router'

import CreateRoom from '../components/lobby/CreateRoom.vue'
import JoinRoom from '../components/lobby/JoinRoom.vue'

const router = useRouter()

function handleRoomCreated(roomId: string): void {
  router.push({ name: 'game', params: { roomId } })
}

function handleRoomJoined(roomId: string): void {
  router.push({ name: 'game', params: { roomId } })
}
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center px-4">
    <div class="w-full max-w-md space-y-8">
      <h2 class="text-center text-2xl font-bold text-white">Create or Join a Game</h2>

      <CreateRoom @room-created="handleRoomCreated" />

      <div class="flex items-center gap-4">
        <div class="h-px flex-1 bg-gray-600" />
        <span class="text-sm text-gray-400">or</span>
        <div class="h-px flex-1 bg-gray-600" />
      </div>

      <JoinRoom @room-joined="handleRoomJoined" />
    </div>
  </div>
</template>
