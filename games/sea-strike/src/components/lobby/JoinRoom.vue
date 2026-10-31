<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{
  roomJoined: [roomId: string]
}>()

const roomIdInput = ref('')
const hasAttemptedSubmit = ref(false)

const validationError = computed((): string | null => {
  const trimmed = roomIdInput.value.trim()
  if (trimmed.length === 0) return 'Room ID is required'
  if (trimmed.length !== 8) return 'Room ID must be 8 characters'
  if (!/^[0-9a-z]+$/.test(trimmed)) return 'Room ID must contain only lowercase letters and numbers'
  return null
})

const isValid = computed((): boolean => validationError.value === null)

function handleJoin(): void {
  hasAttemptedSubmit.value = true
  if (isValid.value) {
    emit('roomJoined', roomIdInput.value.trim().toLowerCase())
  }
}
</script>

<template>
  <form class="w-full" @submit.prevent="handleJoin">
    <label for="room-id-input" class="sr-only">Room ID</label>
    <input
      id="room-id-input"
      v-model="roomIdInput"
      type="text"
      maxlength="8"
      placeholder="Enter room ID"
      autocomplete="off"
      class="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <p
      v-if="hasAttemptedSubmit && validationError !== null"
      class="mt-1 text-sm text-red-400"
      role="alert"
    >
      {{ validationError }}
    </p>
    <button
      type="submit"
      class="mt-3 w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
    >
      Join
    </button>
  </form>
</template>
