import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useConnectionStore = defineStore('connection', () => {
  // State
  const status = ref<
    'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  >('disconnected')
  const roomId = ref<string | null>(null)
  const isHost = ref<boolean>(false)
  const peerConnected = ref<boolean>(false)
  const lastPingMs = ref<number | null>(null)
  const reconnectAttempts = ref<number>(0)

  // Getters
  const isConnected = computed(() => status.value === 'connected')
  const isReconnecting = computed(() => status.value === 'reconnecting')

  // Actions
  function setConnecting(newRoomId: string, host: boolean): void {
    status.value = 'connecting'
    roomId.value = newRoomId
    isHost.value = host
  }

  function setConnected(): void {
    status.value = 'connected'
    reconnectAttempts.value = 0
  }

  function setReconnecting(): void {
    status.value = 'reconnecting'
  }

  function setDisconnected(): void {
    status.value = 'disconnected'
    peerConnected.value = false
  }

  function setPeerConnected(connected: boolean): void {
    peerConnected.value = connected
  }

  function updatePing(ms: number): void {
    lastPingMs.value = ms
  }

  function incrementReconnectAttempts(): number {
    reconnectAttempts.value += 1
    return reconnectAttempts.value
  }

  function resetReconnectAttempts(): void {
    reconnectAttempts.value = 0
  }

  function resetReconnection(): void {
    reconnectAttempts.value = 0
    status.value = 'reconnecting'
  }

  function reset(): void {
    status.value = 'disconnected'
    roomId.value = null
    isHost.value = false
    peerConnected.value = false
    lastPingMs.value = null
    reconnectAttempts.value = 0
  }

  return {
    // state
    status,
    roomId,
    isHost,
    peerConnected,
    lastPingMs,
    reconnectAttempts,
    // getters
    isConnected,
    isReconnecting,
    // actions
    setConnecting,
    setConnected,
    setReconnecting,
    setDisconnected,
    setPeerConnected,
    updatePing,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    resetReconnection,
    reset,
  }
})
