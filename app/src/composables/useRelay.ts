import { ref, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

import type { GameMessage } from '../types/protocol'

import { useConnectionStore } from '../stores/connection'
import {
  parseIncomingMessage,
  isPeerCountMessage,
  isPeerLeftMessage,
  isRelayErrorMessage,
  isPongMessage,
} from '../utils/validation'

export interface UseRelayOptions {
  roomId: string
  isHost: boolean
  onGameMessage: (message: GameMessage) => void
}

export interface UseRelayReturn {
  /** Send a game message to the peer */
  send: (message: GameMessage) => void

  /** Current WebSocket ready state */
  connected: Ref<boolean>

  /** Manually trigger a reconnection attempt */
  reconnect: () => void

  /** Close the connection and stop reconnection */
  disconnect: () => void
}

const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30_000
const MAX_RETRIES = 10
const PING_INTERVAL_MS = 30_000

export { BASE_DELAY_MS, MAX_DELAY_MS, MAX_RETRIES, PING_INTERVAL_MS }

export function useRelay(options: UseRelayOptions): UseRelayReturn {
  const relayUrl = import.meta.env.VITE_RELAY_URL
  if (!relayUrl) {
    throw new Error('VITE_RELAY_URL is not configured')
  }

  const store = useConnectionStore()
  const connected = ref(false)
  let intentionalClose = false
  let retryCount = 0
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let pingInterval: ReturnType<typeof setInterval> | null = null

  store.setConnecting(options.roomId, options.isHost)

  function clearPingInterval(): void {
    if (pingInterval !== null) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  }

  function startPingInterval(): void {
    clearPingInterval()
    pingInterval = setInterval(() => {
      if (connected.value) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }
    }, PING_INTERVAL_MS)
  }

  function handleOpen(): void {
    connected.value = true
    store.resetReconnectAttempts()
    store.setConnected()
    ws.send(JSON.stringify({ type: 'join', roomId: options.roomId }))
    retryCount = 0
    startPingInterval()
  }

  function handleClose(): void {
    connected.value = false
    clearPingInterval()

    if (intentionalClose) {
      return
    }

    if (retryCount >= MAX_RETRIES) {
      store.setDisconnected()
      return
    }

    store.setReconnecting()
    scheduleReconnect()
  }

  function handleError(event: Event): void {
    console.warn('WebSocket error:', event)
  }

  function handleMessage(event: MessageEvent): void {
    const raw = event.data as string
    const parsed = parseIncomingMessage(raw)

    if (parsed === null) {
      console.warn('Received invalid message:', raw)
      return
    }

    if (isPongMessage(parsed)) {
      const latency = Date.now() - parsed.timestamp
      store.updatePing(latency)
      return
    }

    if (isPeerCountMessage(parsed)) {
      store.setPeerConnected(parsed.count >= 2)
      return
    }

    if (isPeerLeftMessage(parsed)) {
      store.setPeerConnected(false)
      return
    }

    if (isRelayErrorMessage(parsed)) {
      console.warn('Relay error:', parsed.code, parsed.message)
      return
    }

    try {
      options.onGameMessage(parsed as GameMessage)
    } catch (error: unknown) {
      console.error('Error in onGameMessage handler:', error)
    }
  }

  function wireHandlers(socket: WebSocket): void {
    socket.onopen = handleOpen
    socket.onclose = handleClose
    socket.onerror = handleError
    socket.onmessage = handleMessage
  }

  function scheduleReconnect(): void {
    const delay = Math.min(BASE_DELAY_MS * 2 ** retryCount, MAX_DELAY_MS)
    reconnectTimeout = setTimeout(() => {
      retryCount++
      store.incrementReconnectAttempts()
      ws = new WebSocket(relayUrl)
      wireHandlers(ws)
    }, delay)
  }

  let ws = new WebSocket(relayUrl)
  wireHandlers(ws)

  function send(message: GameMessage): void {
    if (!connected.value) {
      console.warn('Cannot send: WebSocket not connected')
      return
    }
    ws.send(JSON.stringify(message))
  }

  function disconnect(): void {
    intentionalClose = true
    clearPingInterval()
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    ws.close(1000)
    connected.value = false
    store.setDisconnected()
  }

  function reconnect(): void {
    if (connected.value) {
      return
    }
    retryCount = 0
    store.resetReconnectAttempts()
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    store.setReconnecting()
    ws = new WebSocket(relayUrl)
    wireHandlers(ws)
  }

  // onScopeDispose fires on both component unmount and effectScope.stop()
  onScopeDispose(() => {
    intentionalClose = true
    clearPingInterval()
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000)
    }
  })

  return {
    send,
    connected,
    reconnect,
    disconnect,
  }
}
