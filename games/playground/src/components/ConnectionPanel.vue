<script setup lang="ts">
import type { ClientState } from '@ai-games/multiplayer'

defineProps<{
  state: ClientState
  endpoint: string
  name: string
  validation: string | null
}>()

const emit = defineEmits<{
  'update:endpoint': [value: string]
  'update:name': [value: string]
  connect: []
  disconnect: []
  reconnect: []
}>()
</script>

<template>
  <section class="panel connection-panel" aria-labelledby="connection-heading">
    <div class="panel-heading">
      <div><span class="eyebrow">01 / CONNECTION</span><h2 id="connection-heading">Relay connection</h2></div>
      <span class="status-pill" :class="state.status"><span class="status-dot"></span>{{ state.status }}</span>
    </div>
    <form class="stack" @submit.prevent="emit('connect')">
      <div class="field">
        <label for="relay-url">WebSocket endpoint</label>
        <input id="relay-url" :value="endpoint" type="url" placeholder="wss://relay.example.com" spellcheck="false" autocomplete="url" @input="emit('update:endpoint', ($event.target as HTMLInputElement).value)" />
      </div>
      <div class="field">
        <label for="player-name">Your display name</label>
        <input id="player-name" :value="name" maxlength="32" autocomplete="nickname" placeholder="Choose a name" @input="emit('update:name', ($event.target as HTMLInputElement).value)" />
      </div>
      <p v-if="validation" class="notice warning" role="alert">{{ validation }}</p>
      <div class="button-row">
        <button class="button primary" type="submit" :disabled="!endpoint.trim() || !name.trim()">{{ state.status === 'connected' ? 'Apply & connect' : 'Connect to relay' }} <span aria-hidden="true">↗</span></button>
        <button class="button" type="button" :disabled="state.status === 'disconnected'" @click="emit('disconnect')">Disconnect</button>
      </div>
    </form>
    <div class="connection-foot">
      <span>{{ state.reconnectAttempts ? `${state.reconnectAttempts} reconnect attempts` : 'Automatic reconnect enabled' }}</span>
      <button class="text-button" :disabled="!endpoint.trim()" @click="emit('reconnect')">Reconnect now</button>
    </div>
    <p v-if="state.lastError" class="notice warning" role="alert">{{ state.lastError }}</p>
  </section>
</template>
