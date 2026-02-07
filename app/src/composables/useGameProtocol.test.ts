import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import type { GameMessage } from '../types/protocol'
import type { PlacedShip } from '../types/game'

import { useGameStore } from '../stores/game'
import { useConnectionStore } from '../stores/connection'
import { useGameProtocol } from './useGameProtocol'
import type { UseGameProtocolReturn } from './useGameProtocol'

// --- Mocks ---

const mockSend = vi.fn()
const mockDisconnect = vi.fn()
const mockReconnect = vi.fn()
let capturedOnGameMessage: ((msg: GameMessage) => void) | null = null

vi.mock('./useRelay', () => ({
  useRelay: vi.fn((opts: { onGameMessage: (msg: GameMessage) => void }) => {
    capturedOnGameMessage = opts.onGameMessage
    return {
      send: mockSend,
      connected: { value: true },
      reconnect: mockReconnect,
      disconnect: mockDisconnect,
    }
  }),
}))

const mockCryptoCommitBoard = vi.fn().mockResolvedValue({
  hash: 'a'.repeat(64),
  salt: new Uint8Array(32),
  saltHex: '0'.repeat(64),
})

const mockCryptoVerifyBoard = vi.fn().mockResolvedValue(true)

vi.mock('./useCrypto', () => ({
  useCrypto: vi.fn(() => ({
    commitBoard: mockCryptoCommitBoard,
    verifyBoard: mockCryptoVerifyBoard,
    isAvailable: true,
  })),
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    watch: vi.fn(() => vi.fn()),
  }
})

// --- Helpers ---

const TEST_SHIPS: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]

function setupBattlePhase(store: ReturnType<typeof useGameStore>): void {
  store.startSetup()
  for (const ship of TEST_SHIPS) {
    store.placeShip(ship)
  }
  store.commitBoard('a'.repeat(64), new Uint8Array(32))
  store.receiveOpponentCommit('b'.repeat(64))
  store.startBattle()
}

function filterShotSends(): GameMessage[] {
  return mockSend.mock.calls
    .map((call: unknown[]) => call[0] as GameMessage)
    .filter((msg: GameMessage) => msg.type === 'shot')
}

// --- Tests ---

describe('useGameProtocol', () => {
  let protocol: UseGameProtocolReturn
  let gameStore: ReturnType<typeof useGameStore>
  let connectionStore: ReturnType<typeof useConnectionStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    capturedOnGameMessage = null

    gameStore = useGameStore()
    connectionStore = useConnectionStore()
    connectionStore.setConnecting('abc123', true)

    protocol = useGameProtocol({ roomId: 'abc123', isHost: true })
  })

  // === Ticket 001: Scaffold and Simple Sends ===

  describe('scaffold (ticket 001)', () => {
    it('calls useRelay with correct options', async () => {
      const relayModule = await import('./useRelay')
      expect(relayModule.useRelay).toHaveBeenCalledWith({
        roomId: 'abc123',
        isHost: true,
        onGameMessage: expect.any(Function),
      })
    })

    it('captures the onGameMessage callback', () => {
      expect(capturedOnGameMessage).toBeTypeOf('function')
    })

    it('sendReady sends ready message', () => {
      protocol.sendReady()
      expect(mockSend).toHaveBeenCalledWith({ type: 'ready' })
    })

    it('sendRematch sends rematch message', () => {
      protocol.sendRematch()
      expect(mockSend).toHaveBeenCalledWith({ type: 'rematch' })
    })

    it('disconnect calls relay disconnect', () => {
      protocol.disconnect()
      expect(mockDisconnect).toHaveBeenCalledOnce()
    })
  })

  // === Ticket 002: Commit, Shot, Reveal Sends ===

  describe('send functions (ticket 002)', () => {
    it('sendCommit calls crypto, store, and relay', async () => {
      gameStore.startSetup()
      for (const ship of TEST_SHIPS) {
        gameStore.placeShip(ship)
      }

      await protocol.sendCommit(TEST_SHIPS)

      expect(mockCryptoCommitBoard).toHaveBeenCalledWith(TEST_SHIPS)
      expect(gameStore.myCommitHash).toBe('a'.repeat(64))
      expect(gameStore.phase).toBe('commit')
      expect(mockSend).toHaveBeenCalledWith({
        type: 'commit',
        hash: 'a'.repeat(64),
      })
    })

    it('sendShot sends shot message', () => {
      setupBattlePhase(gameStore)

      protocol.sendShot(3, 5)

      expect(mockSend).toHaveBeenCalledWith({ type: 'shot', x: 3, y: 5 })
    })

    it('sendShot debounces rapid calls', () => {
      vi.useFakeTimers()
      setupBattlePhase(gameStore)

      protocol.sendShot(3, 5)

      // Simulate receiving result to clear awaitingResult
      capturedOnGameMessage!({ type: 'result', x: 3, y: 5, hit: false, sunk: null })

      // Immediately try another shot (within 200ms)
      protocol.sendShot(4, 6)

      // Only the first shot message should have been sent
      expect(filterShotSends()).toHaveLength(1)

      vi.useRealTimers()
    })

    it('sendShot blocks while awaiting result', () => {
      vi.useFakeTimers()
      setupBattlePhase(gameStore)

      protocol.sendShot(3, 5)

      // Advance past debounce window
      vi.advanceTimersByTime(250)

      // Try another shot without clearing awaitingResult
      protocol.sendShot(4, 6)

      expect(filterShotSends()).toHaveLength(1)

      vi.useRealTimers()
    })

    it('sendResult sends result message', () => {
      protocol.sendResult(3, 5, true, 'carrier')

      expect(mockSend).toHaveBeenCalledWith({
        type: 'result',
        x: 3,
        y: 5,
        hit: true,
        sunk: 'carrier',
      })
    })

    it('sendReveal sends reveal message with salt field', () => {
      const saltHex = 'ff'.repeat(32)
      protocol.sendReveal(TEST_SHIPS, saltHex)

      expect(mockSend).toHaveBeenCalledWith({
        type: 'reveal',
        ships: TEST_SHIPS,
        salt: saltHex,
      })
    })
  })

  // === Ticket 003: Incoming Message Dispatcher ===

  describe('message dispatcher (ticket 003)', () => {
    it('drops shot message in SETUP phase', () => {
      gameStore.startSetup()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      capturedOnGameMessage!({ type: 'shot', x: 3, y: 5 })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring'),
      )
      warnSpy.mockRestore()
    })

    it('accepts commit message in SETUP phase', () => {
      gameStore.startSetup()

      capturedOnGameMessage!({ type: 'commit', hash: 'c'.repeat(64) })

      expect(gameStore.opponentCommitHash).toBe('c'.repeat(64))
    })

    it('drops ready message in BATTLE phase', () => {
      setupBattlePhase(gameStore)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      capturedOnGameMessage!({ type: 'ready' })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring'),
      )
      warnSpy.mockRestore()
    })

    it('handles commit and starts battle when both committed', async () => {
      gameStore.startSetup()
      for (const ship of TEST_SHIPS) {
        gameStore.placeShip(ship)
      }

      await protocol.sendCommit(TEST_SHIPS)

      capturedOnGameMessage!({ type: 'commit', hash: 'b'.repeat(64) })

      expect(gameStore.opponentCommitHash).toBe('b'.repeat(64))
      expect(gameStore.phase).toBe('battle')
    })

    it('handles ping — auto-responds with pong', () => {
      gameStore.startSetup()

      capturedOnGameMessage!({ type: 'ping', timestamp: 1000 })

      expect(mockSend).toHaveBeenCalledWith({ type: 'pong', timestamp: 1000 })
    })

    it('handles pong — updates connection store latency', () => {
      gameStore.startSetup()
      const now = 1100
      vi.spyOn(Date, 'now').mockReturnValue(now)

      capturedOnGameMessage!({ type: 'pong', timestamp: 1000 })

      expect(connectionStore.lastPingMs).toBe(100)
      vi.restoreAllMocks()
    })

    it('handles rematch — resets game when both agree', () => {
      setupBattlePhase(gameStore)
      gameStore.startReveal()
      gameStore.finishGame('me')

      expect(gameStore.phase).toBe('gameover')

      protocol.sendRematch()
      capturedOnGameMessage!({ type: 'rematch' })

      expect(gameStore.phase).toBe('setup')
    })
  })

  // === Ticket 004: Battle Message Handlers ===

  describe('battle handlers (ticket 004)', () => {
    beforeEach(() => {
      setupBattlePhase(gameStore)
    })

    it('incoming shot calls receiveShot and sends result', () => {
      // Host goes first — send our shot to make it opponent's turn
      protocol.sendShot(9, 9)
      mockSend.mockClear()

      // Opponent shoots at (0, 0) where carrier is
      capturedOnGameMessage!({ type: 'shot', x: 0, y: 0 })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          x: 0,
          y: 0,
          hit: true,
        }),
      )
    })

    it('incoming shot on empty cell sends miss result', () => {
      protocol.sendShot(9, 9)
      mockSend.mockClear()

      capturedOnGameMessage!({ type: 'shot', x: 9, y: 9 })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          x: 9,
          y: 9,
          hit: false,
          sunk: null,
        }),
      )
    })

    it('incoming result clears awaitingResult and allows next shot', () => {
      vi.useFakeTimers()

      // Fire first shot
      protocol.sendShot(5, 5)

      // Advance time past debounce
      vi.advanceTimersByTime(250)

      // Receive result
      capturedOnGameMessage!({ type: 'result', x: 5, y: 5, hit: false, sunk: null })

      // Opponent shoots so it becomes our turn
      capturedOnGameMessage!({ type: 'shot', x: 8, y: 8 })

      vi.advanceTimersByTime(250)

      // Fire second shot — should succeed since awaitingResult was cleared
      protocol.sendShot(6, 6)

      expect(filterShotSends()).toHaveLength(2)

      vi.useRealTimers()
    })

    it('sinking last opponent ship triggers reveal', () => {
      vi.useFakeTimers()
      let shotTime = 1000

      const sunkShips = ['carrier', 'battleship', 'cruiser', 'submarine'] as const
      for (const shipType of sunkShips) {
        vi.setSystemTime(shotTime)
        protocol.sendShot(0, 0)
        capturedOnGameMessage!({ type: 'result', x: 0, y: 0, hit: true, sunk: shipType })
        capturedOnGameMessage!({ type: 'shot', x: 7, y: 7 })
        shotTime += 300
      }

      mockSend.mockClear()
      vi.setSystemTime(shotTime)

      protocol.sendShot(0, 0)
      capturedOnGameMessage!({ type: 'result', x: 0, y: 0, hit: true, sunk: 'destroyer' })

      expect(gameStore.phase).toBe('reveal')
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'reveal' }),
      )

      vi.useRealTimers()
    })
  })

  // === Ticket 005: Reveal Verification ===

  describe('reveal verification (ticket 005)', () => {
    const opponentShips: PlacedShip[] = [
      { type: 'carrier', x: 5, y: 0, orientation: 'h' },
      { type: 'battleship', x: 5, y: 1, orientation: 'h' },
      { type: 'cruiser', x: 5, y: 2, orientation: 'h' },
      { type: 'submarine', x: 5, y: 3, orientation: 'h' },
      { type: 'destroyer', x: 5, y: 4, orientation: 'h' },
    ]

    beforeEach(() => {
      setupBattlePhase(gameStore)
      gameStore.startReveal()
      mockCryptoVerifyBoard.mockResolvedValue(true)
    })

    it('honest board passes verification', async () => {
      capturedOnGameMessage!({
        type: 'reveal',
        ships: opponentShips,
        salt: 'b'.repeat(64),
      })

      await vi.waitFor(() => {
        expect(gameStore.phase).toBe('gameover')
      })

      expect(gameStore.cheatDetected).toBe(false)
      expect(gameStore.opponentShips).toEqual(opponentShips)
    })

    it('tampered hash triggers cheat detection', async () => {
      mockCryptoVerifyBoard.mockResolvedValue(false)

      capturedOnGameMessage!({
        type: 'reveal',
        ships: opponentShips,
        salt: 'b'.repeat(64),
      })

      await vi.waitFor(() => {
        expect(gameStore.phase).toBe('gameover')
      })

      expect(gameStore.cheatDetected).toBe(true)
    })

    it('receiveReveal stores opponent ships', async () => {
      capturedOnGameMessage!({
        type: 'reveal',
        ships: opponentShips,
        salt: 'b'.repeat(64),
      })

      await vi.waitFor(() => {
        expect(gameStore.opponentShips).toEqual(opponentShips)
      })
    })
  })

  // === Ticket 006: Reconnection Sync ===

  describe('reconnection sync (ticket 006)', () => {
    it('sync request sends current game state', () => {
      setupBattlePhase(gameStore)
      mockSend.mockClear()

      capturedOnGameMessage!({ type: 'sync_request' })

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync_response',
          phase: 'battle',
          turnNumber: gameStore.shotHistory.length,
        }),
      )
    })

    it('sync response with matching state makes no changes', () => {
      setupBattlePhase(gameStore)

      const currentLength = gameStore.shotHistory.length

      capturedOnGameMessage!({
        type: 'sync_response',
        phase: 'battle',
        turnNumber: currentLength,
        shotHistory: [],
      })

      expect(gameStore.shotHistory.length).toBe(currentLength)
    })

    it('sync response with more shots replays missing shots', () => {
      setupBattlePhase(gameStore)

      capturedOnGameMessage!({
        type: 'sync_response',
        phase: 'battle',
        turnNumber: 2,
        shotHistory: [
          { x: 3, y: 3, hit: false, sunk: null, player: 'a' },
          { x: 4, y: 4, hit: false, sunk: null, player: 'b' },
        ],
      })

      expect(gameStore.shotHistory.length).toBe(2)
    })

    it('sync response with ahead phase transitions forward', () => {
      setupBattlePhase(gameStore)

      capturedOnGameMessage!({
        type: 'sync_response',
        phase: 'reveal',
        turnNumber: 0,
        shotHistory: [],
      })

      expect(gameStore.phase).toBe('reveal')
    })
  })
})
