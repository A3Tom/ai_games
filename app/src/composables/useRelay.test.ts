import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { effectScope } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

import {
  useRelay,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
  MAX_RETRIES,
  PING_INTERVAL_MS,
} from './useRelay'
import type { UseRelayOptions, UseRelayReturn } from './useRelay'
import type { GameMessage } from '../types/protocol'

// --- Mock WebSocket ---

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    MockWebSocket.lastInstance = this
  }

  static lastInstance: MockWebSocket

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  simulateClose(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code } as CloseEvent)
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }

  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent)
    }
  }
}

function getLatestWs(): MockWebSocket {
  return MockWebSocket.lastInstance
}

// --- Mock connection store ---

const mockStore = {
  setConnecting: vi.fn(),
  setConnected: vi.fn(),
  setReconnecting: vi.fn(),
  setDisconnected: vi.fn(),
  setPeerConnected: vi.fn(),
  updatePing: vi.fn(),
  incrementReconnectAttempts: vi.fn(),
  resetReconnectAttempts: vi.fn(),
  reset: vi.fn(),
}

vi.mock('../stores/connection', () => ({
  useConnectionStore: () => mockStore,
}))

// --- Setup ---

function createOptions(
  overrides: Partial<UseRelayOptions> = {},
): UseRelayOptions {
  return {
    roomId: 'test1234',
    isHost: true,
    onGameMessage: vi.fn(),
    ...overrides,
  }
}

describe('useRelay — Ticket 001: Connection Lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubEnv('VITE_RELAY_URL', 'ws://localhost:8080')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.values(mockStore).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('throws if VITE_RELAY_URL is not configured', () => {
    vi.stubEnv('VITE_RELAY_URL', '')
    expect(() => useRelay(createOptions())).toThrow(
      'VITE_RELAY_URL is not configured',
    )
  })

  it('opens WebSocket to env URL', () => {
    useRelay(createOptions())
    expect(getLatestWs().url).toBe('ws://localhost:8080')
  })

  it('calls setConnecting immediately with roomId and isHost', () => {
    useRelay(createOptions({ roomId: 'room42', isHost: false }))
    expect(mockStore.setConnecting).toHaveBeenCalledWith('room42', false)
  })

  it('sends join message on open', () => {
    useRelay(createOptions({ roomId: 'abc123' }))
    getLatestWs().simulateOpen()
    expect(getLatestWs().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join', roomId: 'abc123' }),
    )
  })

  it('calls setConnected on open', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    expect(mockStore.setConnected).toHaveBeenCalled()
  })

  it('send() serializes and sends a game message', () => {
    const { send } = useRelay(createOptions())
    getLatestWs().simulateOpen()
    const message: GameMessage = { type: 'ready' }
    send(message)
    expect(getLatestWs().send).toHaveBeenCalledWith('{"type":"ready"}')
  })

  it('send() warns when disconnected and does not send', () => {
    const { send } = useRelay(createOptions())
    // Not connected yet (no simulateOpen)
    send({ type: 'ready' })
    expect(console.warn).toHaveBeenCalledWith(
      'Cannot send: WebSocket not connected',
    )
    // send is called once for the attempt, but ws.send should not have been called
    expect(getLatestWs().send).not.toHaveBeenCalled()
  })

  it('disconnect() closes WebSocket with code 1000 and updates store', () => {
    const { disconnect } = useRelay(createOptions())
    getLatestWs().simulateOpen()
    disconnect()
    expect(getLatestWs().close).toHaveBeenCalledWith(1000)
    expect(mockStore.setDisconnected).toHaveBeenCalled()
  })

  it('unexpected close triggers reconnecting (not disconnected)', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    mockStore.setReconnecting.mockClear()
    getLatestWs().simulateClose(1006)
    expect(mockStore.setReconnecting).toHaveBeenCalled()
  })

  it('intentional close does not double-update store', () => {
    const { disconnect } = useRelay(createOptions())
    getLatestWs().simulateOpen()
    disconnect()
    mockStore.setDisconnected.mockClear()
    // The close event fires after disconnect(), but should not call setDisconnected again
    getLatestWs().simulateClose(1000)
    expect(mockStore.setDisconnected).not.toHaveBeenCalled()
  })

  it('connected ref reflects state: false initially, true after open, false after close', () => {
    const { connected } = useRelay(createOptions())
    expect(connected.value).toBe(false)
    getLatestWs().simulateOpen()
    expect(connected.value).toBe(true)
    getLatestWs().simulateClose()
    expect(connected.value).toBe(false)
  })

  it('logs WebSocket error via console.warn', () => {
    useRelay(createOptions())
    getLatestWs().simulateError()
    expect(console.warn).toHaveBeenCalledWith(
      'WebSocket error:',
      expect.any(Event),
    )
  })

  it('reconnect() does nothing when already connected', () => {
    const { reconnect, connected } = useRelay(createOptions())
    getLatestWs().simulateOpen()
    expect(connected.value).toBe(true)
    const wsBefore = getLatestWs()
    reconnect()
    // No new WebSocket created since already connected
    expect(getLatestWs()).toBe(wsBefore)
  })
})

describe('useRelay — Ticket 002: Message Dispatch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubEnv('VITE_RELAY_URL', 'ws://localhost:8080')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.values(mockStore).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('peer_count with count 2 sets peer connected', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'peer_count', count: 2 }))
    expect(mockStore.setPeerConnected).toHaveBeenCalledWith(true)
  })

  it('peer_count with count 1 sets peer disconnected', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'peer_count', count: 1 }))
    expect(mockStore.setPeerConnected).toHaveBeenCalledWith(false)
  })

  it('peer_left sets peer disconnected', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'peer_left' }))
    expect(mockStore.setPeerConnected).toHaveBeenCalledWith(false)
  })

  it('relay error is logged and not forwarded', () => {
    const onGameMessage = vi.fn()
    useRelay(createOptions({ onGameMessage }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(
      JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: 'Room is full' }),
    )
    expect(console.warn).toHaveBeenCalledWith('Relay error:', 'ROOM_FULL', 'Room is full')
    expect(onGameMessage).not.toHaveBeenCalled()
  })

  it('game message forwarded to onGameMessage callback', () => {
    const onGameMessage = vi.fn()
    useRelay(createOptions({ onGameMessage }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'ready' }))
    expect(onGameMessage).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('shot message forwarded to onGameMessage callback', () => {
    const onGameMessage = vi.fn()
    useRelay(createOptions({ onGameMessage }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'shot', x: 3, y: 7 }))
    expect(onGameMessage).toHaveBeenCalledWith({ type: 'shot', x: 3, y: 7 })
  })

  it('invalid JSON dropped with warning', () => {
    const onGameMessage = vi.fn()
    useRelay(createOptions({ onGameMessage }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage('not json')
    expect(console.warn).toHaveBeenCalledWith('Received invalid message:', 'not json')
    expect(onGameMessage).not.toHaveBeenCalled()
  })

  it('unknown message type dropped with warning', () => {
    const onGameMessage = vi.fn()
    useRelay(createOptions({ onGameMessage }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'unknown_type' }))
    expect(console.warn).toHaveBeenCalledWith(
      'Received invalid message:',
      JSON.stringify({ type: 'unknown_type' }),
    )
    expect(onGameMessage).not.toHaveBeenCalled()
  })

  it('callback error caught and logged', () => {
    const onGameMessage = vi.fn().mockImplementation(() => {
      throw new Error('handler crash')
    })
    useRelay(createOptions({ onGameMessage }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateMessage(JSON.stringify({ type: 'ready' }))
    expect(console.error).toHaveBeenCalledWith(
      'Error in onGameMessage handler:',
      expect.any(Error),
    )
  })
})

describe('useRelay — Ticket 003: Reconnection Backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubEnv('VITE_RELAY_URL', 'ws://localhost:8080')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.values(mockStore).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('unexpected close triggers reconnection', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    mockStore.setReconnecting.mockClear()
    getLatestWs().simulateClose(1006)
    expect(mockStore.setReconnecting).toHaveBeenCalled()
  })

  it('first retry after 1s delay', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    const firstWs = getLatestWs()
    getLatestWs().simulateClose(1006)

    vi.advanceTimersByTime(BASE_DELAY_MS)
    expect(getLatestWs()).not.toBe(firstWs)
    expect(getLatestWs().url).toBe('ws://localhost:8080')
  })

  it('backoff doubles on successive failures', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    // First retry at 1s
    vi.advanceTimersByTime(BASE_DELAY_MS)
    const ws2 = getLatestWs()
    ws2.simulateClose(1006)

    // Second retry at 2s
    vi.advanceTimersByTime(BASE_DELAY_MS - 1)
    expect(getLatestWs()).toBe(ws2) // Not yet
    vi.advanceTimersByTime(BASE_DELAY_MS + 1)
    const ws3 = getLatestWs()
    expect(ws3).not.toBe(ws2)

    ws3.simulateClose(1006)

    // Third retry at 4s
    vi.advanceTimersByTime(4 * BASE_DELAY_MS)
    expect(getLatestWs()).not.toBe(ws3)
  })

  it('backoff caps at 30s', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    // Run through retries 0-4 (delays: 1s, 2s, 4s, 8s, 16s)
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(Math.min(BASE_DELAY_MS * 2 ** i, MAX_DELAY_MS))
      getLatestWs().simulateClose(1006)
    }

    // 6th retry should be 30s (capped), not 32s
    const wsBefore = getLatestWs()
    vi.advanceTimersByTime(MAX_DELAY_MS)
    expect(getLatestWs()).not.toBe(wsBefore)
  })

  it('successful reconnect re-sends join and resets attempts', () => {
    useRelay(createOptions({ roomId: 'myroom' }))
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    vi.advanceTimersByTime(BASE_DELAY_MS)
    mockStore.resetReconnectAttempts.mockClear()
    mockStore.setConnected.mockClear()
    getLatestWs().simulateOpen()

    expect(getLatestWs().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join', roomId: 'myroom' }),
    )
    expect(mockStore.resetReconnectAttempts).toHaveBeenCalled()
    expect(mockStore.setConnected).toHaveBeenCalled()
  })

  it('successful reconnect resets retry count — next failure uses 1s delay', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    // First retry at 1s
    vi.advanceTimersByTime(BASE_DELAY_MS)
    getLatestWs().simulateClose(1006)

    // Second retry at 2s
    vi.advanceTimersByTime(2 * BASE_DELAY_MS)
    // Successful reconnect
    getLatestWs().simulateOpen()

    // Disconnect again
    getLatestWs().simulateClose(1006)
    const wsBefore = getLatestWs()

    // Should be 1s delay again (reset), not 4s
    vi.advanceTimersByTime(BASE_DELAY_MS)
    expect(getLatestWs()).not.toBe(wsBefore)
  })

  it('max retries sets disconnected and stops', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    // Run through MAX_RETRIES attempts
    for (let i = 0; i < MAX_RETRIES; i++) {
      vi.advanceTimersByTime(Math.min(BASE_DELAY_MS * 2 ** i, MAX_DELAY_MS))
      getLatestWs().simulateClose(1006)
    }

    // After MAX_RETRIES, setDisconnected should be called
    expect(mockStore.setDisconnected).toHaveBeenCalled()

    // No further retries
    const wsBefore = getLatestWs()
    vi.advanceTimersByTime(MAX_DELAY_MS * 2)
    expect(getLatestWs()).toBe(wsBefore)
  })

  it('intentional disconnect prevents reconnection', () => {
    const { disconnect } = useRelay(createOptions())
    getLatestWs().simulateOpen()
    mockStore.setReconnecting.mockClear()
    disconnect()
    getLatestWs().simulateClose(1000)
    expect(mockStore.setReconnecting).not.toHaveBeenCalled()
  })

  it('manual reconnect() resets and retries immediately', () => {
    const { reconnect } = useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    // Exhaust retries
    for (let i = 0; i < MAX_RETRIES; i++) {
      vi.advanceTimersByTime(Math.min(BASE_DELAY_MS * 2 ** i, MAX_DELAY_MS))
      getLatestWs().simulateClose(1006)
    }

    mockStore.setReconnecting.mockClear()
    mockStore.resetReconnectAttempts.mockClear()
    const wsBefore = getLatestWs()
    reconnect()

    // Should create new WebSocket immediately
    expect(getLatestWs()).not.toBe(wsBefore)
    expect(mockStore.setReconnecting).toHaveBeenCalled()
    expect(mockStore.resetReconnectAttempts).toHaveBeenCalled()
  })

  it('incrementReconnectAttempts called on each retry', () => {
    useRelay(createOptions())
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)
    mockStore.incrementReconnectAttempts.mockClear()

    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(Math.min(BASE_DELAY_MS * 2 ** i, MAX_DELAY_MS))
      getLatestWs().simulateClose(1006)
    }

    expect(mockStore.incrementReconnectAttempts).toHaveBeenCalledTimes(3)
  })
})

describe('useRelay — Ticket 004: Ping/Pong and Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubEnv('VITE_RELAY_URL', 'ws://localhost:8080')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.values(mockStore).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('ping sent after interval', () => {
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()
    getLatestWs().send.mockClear()

    vi.advanceTimersByTime(PING_INTERVAL_MS)

    const pingCall = getLatestWs().send.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string) as Record<string, unknown>
      return parsed.type === 'ping'
    })
    expect(pingCall).toBeDefined()

    scope.stop()
  })

  it('no ping when disconnected', () => {
    const scope = effectScope()
    let relay!: UseRelayReturn
    scope.run(() => {
      relay = useRelay(createOptions())
    })
    // Never call simulateOpen — stays disconnected
    expect(relay.connected.value).toBe(false)
    getLatestWs().send.mockClear()

    vi.advanceTimersByTime(PING_INTERVAL_MS * 2)

    // No send calls should happen (not even for ping)
    expect(getLatestWs().send).not.toHaveBeenCalled()

    scope.stop()
  })

  it('pong updates store latency', () => {
    const now = 1000
    vi.spyOn(Date, 'now').mockReturnValue(now + 50)

    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()

    getLatestWs().simulateMessage(
      JSON.stringify({ type: 'pong', timestamp: now }),
    )
    expect(mockStore.updatePing).toHaveBeenCalledWith(50)

    scope.stop()
  })

  it('pong not forwarded to onGameMessage', () => {
    const onGameMessage = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions({ onGameMessage }))
    })
    getLatestWs().simulateOpen()

    getLatestWs().simulateMessage(
      JSON.stringify({ type: 'pong', timestamp: 1000 }),
    )
    expect(onGameMessage).not.toHaveBeenCalled()

    scope.stop()
  })

  it('ping interval restarted on reconnect', () => {
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006)

    // Reconnect
    vi.advanceTimersByTime(BASE_DELAY_MS)
    getLatestWs().simulateOpen()
    getLatestWs().send.mockClear()

    vi.advanceTimersByTime(PING_INTERVAL_MS)

    const pingCall = getLatestWs().send.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string) as Record<string, unknown>
      return parsed.type === 'ping'
    })
    expect(pingCall).toBeDefined()

    scope.stop()
  })

  it('ping interval cleared on disconnect', () => {
    const scope = effectScope()
    let relay!: UseRelayReturn
    scope.run(() => {
      relay = useRelay(createOptions())
    })
    getLatestWs().simulateOpen()
    relay.disconnect()
    getLatestWs().send.mockClear()

    vi.advanceTimersByTime(PING_INTERVAL_MS * 2)
    expect(getLatestWs().send).not.toHaveBeenCalled()

    scope.stop()
  })

  it('onUnmounted closes WebSocket', () => {
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()
    const wsRef = getLatestWs()

    scope.stop()

    expect(wsRef.close).toHaveBeenCalledWith(1000)
  })

  it('onUnmounted clears reconnect timeout', () => {
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()
    getLatestWs().simulateClose(1006) // Triggers reconnection

    const wsBefore = getLatestWs()
    scope.stop()

    // Advance past the reconnect delay — no new WS should be created
    vi.advanceTimersByTime(MAX_DELAY_MS * 2)
    expect(getLatestWs()).toBe(wsBefore)
  })

  it('onUnmounted clears ping interval', () => {
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()
    getLatestWs().send.mockClear()

    scope.stop()

    vi.advanceTimersByTime(PING_INTERVAL_MS * 2)
    expect(getLatestWs().send).not.toHaveBeenCalled()
  })

  it('no reconnection after unmount', () => {
    const scope = effectScope()
    scope.run(() => {
      useRelay(createOptions())
    })
    getLatestWs().simulateOpen()

    scope.stop()

    mockStore.setReconnecting.mockClear()
    getLatestWs().simulateClose(1006)
    expect(mockStore.setReconnecting).not.toHaveBeenCalled()
  })
})
