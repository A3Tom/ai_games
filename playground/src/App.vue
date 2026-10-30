<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { createMultiplayerClient } from '@ai-games/multiplayer'

import ConnectionPanel from './components/ConnectionPanel.vue'
import RoomPanel from './components/RoomPanel.vue'
import LatencyPanel from './components/LatencyPanel.vue'
import ServerPanel from './components/ServerPanel.vue'
import ActionsPanel from './components/ActionsPanel.vue'
import EventLog from './components/EventLog.vue'

function stored(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
function save(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* Private browsing may disable storage. */ }
}
function resolveEndpoint(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return trimmed
  const url = new URL(trimmed, window.location.origin)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const configuredUrl = import.meta.env.VITE_RELAY_URL as string | undefined
const endpoint = ref(resolveEndpoint(configuredUrl || stored('multiplayer-lab.endpoint') || (localHost ? 'ws://localhost:14650' : '')))
const name = ref(stored('multiplayer-lab.name') || `Player ${Math.floor(Math.random() * 900 + 100)}`)
const sharedRoom = new URL(window.location.href).searchParams.get('room') ?? ''
const roomInput = ref(sharedRoom)
const validation = ref<string | null>(null)
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
let client = createMultiplayerClient({ url: endpoint.value, appId: 'multiplayer-lab', name: name.value })
const state = shallowRef(client.getState())
const playerId = state.value.playerId
let currentEndpoint = endpoint.value
let unsubscribe = client.subscribe((next) => { state.value = next })
let pendingInvite = sharedRoom
let pendingDisplayName: string | null = null

const shareLink = computed((): string => {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (state.value.room) url.searchParams.set('room', state.value.room.roomId)
  return url.toString()
})
const activeConnections = computed((): string => state.value.room ? `${state.value.room.players.length} in room` : 'No active room')

function prepare(): boolean {
  validation.value = null
  let url: URL
  try { url = new URL(resolveEndpoint(endpoint.value)) } catch { validation.value = 'Enter a valid ws:// or wss:// relay endpoint.'; return false }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.hash || url.username || url.password) {
    validation.value = 'Use a ws:// or wss:// URL without a fragment or embedded credentials.'
    return false
  }
  if (window.location.protocol === 'https:' && url.protocol !== 'wss:') {
    validation.value = 'This HTTPS page needs a secure wss:// relay endpoint.'
    return false
  }
  if (!name.value.trim()) { validation.value = 'Choose a display name first.'; return false }
  endpoint.value = url.toString()
  save('multiplayer-lab.endpoint', endpoint.value)
  save('multiplayer-lab.name', name.value.trim())
  if (currentEndpoint !== endpoint.value) {
    pendingDisplayName = null
    if (!pendingInvite) {
      const address = new URL(window.location.href)
      address.searchParams.delete('room')
      window.history.replaceState(null, '', address)
    }
    unsubscribe()
    client.destroy()
    client = createMultiplayerClient({ url: endpoint.value, appId: 'multiplayer-lab', playerId, name: name.value.trim() })
    currentEndpoint = endpoint.value
    unsubscribe = client.subscribe((next) => { state.value = next })
  }
  return true
}
function connect(): void {
  if (!prepare()) return
  const currentRoom = state.value.room?.roomId
  pendingDisplayName = name.value.trim()
  client.connect()
  if (pendingInvite) {
    client.join(pendingInvite, pendingDisplayName)
    pendingInvite = ''
    pendingDisplayName = null
  } else if (currentRoom) {
    client.join(currentRoom, pendingDisplayName)
    pendingDisplayName = null
  }
}
function reconnect(): void {
  if (!prepare()) return
  pendingDisplayName = name.value.trim()
  client.reconnect()
  if (pendingInvite) {
    client.join(pendingInvite, pendingDisplayName)
    pendingInvite = ''
    pendingDisplayName = null
  }
}
function join(): void {
  pendingInvite = ''
  pendingDisplayName = null
  client.join(roomInput.value.trim(), name.value.trim())
}
function leave(): void {
  pendingDisplayName = null
  client.leave()
}
function createRoom(): void {
  const random = crypto.getRandomValues(new Uint8Array(5))
  roomInput.value = `lab-${Array.from(random, (value) => value.toString(16).padStart(2, '0')).join('')}`
  join()
}
async function copyInvite(): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(shareLink.value); copied.value = true } catch { /* Select the link below instead. */ }
  }
  if (!copied.value) {
    const field = document.querySelector<HTMLInputElement>('#share-link')
    field?.focus()
    field?.select()
    try { copied.value = document.execCommand('copy') } catch { /* The selected field supports manual copy. */ }
  }
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 2000)
}
watch(() => state.value.room?.roomId, (roomId, oldRoomId) => {
  const url = new URL(window.location.href)
  if (roomId) url.searchParams.set('room', roomId)
  else if (oldRoomId && state.value.status === 'connected') url.searchParams.delete('room')
  window.history.replaceState(null, '', url)
  copied.value = false
})
watch(() => state.value.room, (room) => {
  if (room === null || pendingDisplayName === null) return
  const requestedName = pendingDisplayName
  pendingDisplayName = null
  const me = room.players.find((player) => player.id === playerId)
  if (me && me.name !== requestedName) client.join(room.roomId, requestedName)
})
onMounted(() => { if (sharedRoom && endpoint.value) connect() })
onUnmounted(() => { if (copyTimer) clearTimeout(copyTimer); unsubscribe(); client.destroy() })
</script>

<template>
  <div class="app-shell">
    <div>
      <div class="page-intro"><div><span class="eyebrow">THE PLAYGROUND BEFORE THE GAME</span><h1>Multiplayer Lab<span>.</span></h1><p>Make a connection. Share a room. See what happens.</p></div><div class="session-state"><span class="status-pill" :class="state.status"><span class="status-dot"></span>{{ state.status }}</span><span class="muted small">{{ activeConnections }}</span></div></div>
      <div v-if="!endpoint" class="notice setup-notice"><strong>Point the lab at your relay.</strong><span>Enter its wss:// endpoint below. For a hosted build, set VITE_RELAY_URL.</span></div>
      <div class="dashboard-grid">
        <div class="sidebar"><ConnectionPanel v-model:endpoint="endpoint" v-model:name="name" :state="state" :validation="validation" @connect="connect" @disconnect="client.disconnect()" @reconnect="reconnect" /><RoomPanel v-model:room-input="roomInput" :state="state" :copied="copied" :share-link="shareLink" @create="createRoom" @join="join" @leave="leave" @ready="client.setReady($event)" @copy="copyInvite" /></div>
        <div class="main-panels"><LatencyPanel :state="state" @ping="client.ping()" /><ActionsPanel :state="state" @send="client.send($event)" /><ServerPanel :state="state" @refresh="client.requestStats()" @reset="client.resetMetrics()" /></div>
      </div>
      <EventLog :events="state.events" />
    </div>
  </div>
</template>
