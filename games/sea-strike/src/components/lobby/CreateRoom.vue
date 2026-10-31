<script setup lang="ts">
import { ref, computed } from 'vue'

import { generateRoomId } from '../../utils/room-id'
import { useCrypto } from '../../composables/useCrypto'

const emit = defineEmits<{
  roomCreated: [roomId: string]
}>()

const { isAvailable } = useCrypto()

const createdRoomId = ref<string | null>(null)
const isCopied = ref(false)

const isCryptoUnavailable = computed((): boolean => !isAvailable)

const shareableLink = computed((): string => {
  if (createdRoomId.value === null) return ''
  return `${window.location.origin}${window.location.pathname}#/game/${createdRoomId.value}`
})

function handleCreateGame(): void {
  const roomId = generateRoomId()
  createdRoomId.value = roomId
  emit('roomCreated', roomId)
}

function handleCopyLink(): void {
  if (!navigator.clipboard) return
  navigator.clipboard.writeText(shareableLink.value).then(() => {
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  })
}
</script>

<template>
  <div class="w-full">
    <div
      v-if="isCryptoUnavailable"
      class="mb-4 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-200"
    >
      A secure connection (HTTPS or localhost) is required to create a game.
    </div>

    <button
      type="button"
      :disabled="isCryptoUnavailable"
      class="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      @click="handleCreateGame"
    >
      Create Game
    </button>

    <div v-if="createdRoomId !== null" class="mt-4 space-y-2">
      <p class="text-sm text-gray-400">Share this link with your opponent:</p>
      <div class="flex items-center gap-2">
        <input
          type="text"
          readonly
          :value="shareableLink"
          class="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-gray-200"
        />
        <button
          type="button"
          class="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-500"
          @click="handleCopyLink"
        >
          {{ isCopied ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </div>
  </div>
</template>
