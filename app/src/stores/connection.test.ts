import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from './connection'

describe('useConnectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with correct default state', () => {
    const store = useConnectionStore()
    expect(store.status).toBe('disconnected')
    expect(store.roomId).toBeNull()
    expect(store.isHost).toBe(false)
    expect(store.peerConnected).toBe(false)
    expect(store.lastPingMs).toBeNull()
    expect(store.reconnectAttempts).toBe(0)
  })

  it('isConnected getter returns false initially and true after setConnected', () => {
    const store = useConnectionStore()
    expect(store.isConnected).toBe(false)
    store.setConnecting('room-1', true)
    store.setConnected()
    expect(store.isConnected).toBe(true)
  })

  it('isReconnecting getter returns false initially and true after setReconnecting', () => {
    const store = useConnectionStore()
    expect(store.isReconnecting).toBe(false)
    store.setReconnecting()
    expect(store.isReconnecting).toBe(true)
  })

  it('follows connection lifecycle: connecting → connected → reconnecting → connected', () => {
    const store = useConnectionStore()
    store.setConnecting('room-1', true)
    expect(store.status).toBe('connecting')

    store.setConnected()
    expect(store.status).toBe('connected')

    store.setReconnecting()
    expect(store.status).toBe('reconnecting')

    store.setConnected()
    expect(store.status).toBe('connected')
  })

  it('setConnecting sets roomId and isHost', () => {
    const store = useConnectionStore()
    store.setConnecting('test-room-42', true)
    expect(store.roomId).toBe('test-room-42')
    expect(store.isHost).toBe(true)

    store.reset()
    store.setConnecting('other-room', false)
    expect(store.roomId).toBe('other-room')
    expect(store.isHost).toBe(false)
  })

  it('setConnected resets reconnect attempts', () => {
    const store = useConnectionStore()
    store.incrementReconnectAttempts()
    store.incrementReconnectAttempts()
    store.incrementReconnectAttempts()
    expect(store.reconnectAttempts).toBe(3)

    store.setConnected()
    expect(store.reconnectAttempts).toBe(0)
  })

  it('setDisconnected clears peerConnected', () => {
    const store = useConnectionStore()
    store.setPeerConnected(true)
    expect(store.peerConnected).toBe(true)

    store.setDisconnected()
    expect(store.peerConnected).toBe(false)
  })

  it('incrementReconnectAttempts returns new count', () => {
    const store = useConnectionStore()
    expect(store.incrementReconnectAttempts()).toBe(1)
    expect(store.incrementReconnectAttempts()).toBe(2)
    expect(store.incrementReconnectAttempts()).toBe(3)
  })

  it('reset restores all defaults', () => {
    const store = useConnectionStore()

    // Set various state values
    store.setConnecting('room-abc', true)
    store.setConnected()
    store.setPeerConnected(true)
    store.updatePing(42)
    store.incrementReconnectAttempts()

    // Reset
    store.reset()

    // Verify all defaults
    expect(store.status).toBe('disconnected')
    expect(store.roomId).toBeNull()
    expect(store.isHost).toBe(false)
    expect(store.peerConnected).toBe(false)
    expect(store.lastPingMs).toBeNull()
    expect(store.reconnectAttempts).toBe(0)
  })

  it('setPeerConnected updates peer presence', () => {
    const store = useConnectionStore()
    store.setPeerConnected(true)
    expect(store.peerConnected).toBe(true)
    store.setPeerConnected(false)
    expect(store.peerConnected).toBe(false)
  })

  it('updatePing records latency', () => {
    const store = useConnectionStore()
    store.updatePing(50)
    expect(store.lastPingMs).toBe(50)
    store.updatePing(120)
    expect(store.lastPingMs).toBe(120)
  })

  it('resetReconnectAttempts sets counter to zero', () => {
    const store = useConnectionStore()
    store.incrementReconnectAttempts()
    store.incrementReconnectAttempts()
    expect(store.reconnectAttempts).toBe(2)

    store.resetReconnectAttempts()
    expect(store.reconnectAttempts).toBe(0)
  })
})
