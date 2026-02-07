import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from './game'
import { useConnectionStore } from './connection'
import { GAME_PHASES, CELL_STATES } from '../types/game'
import type { PlacedShip } from '../types/game'
import { GRID_SIZE } from '../constants/grid'
import { getShipCells } from '../utils/board'

describe('useGameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // === Ticket 002: Initial state and getters ===

  describe('initial state', () => {
    it('initializes with correct defaults', () => {
      const store = useGameStore()
      expect(store.phase).toBe('lobby')
      expect(store.myShips).toEqual([])
      expect(store.opponentShips).toEqual([])
      expect(store.isMyTurn).toBe(false)
      expect(store.myCommitHash).toBeNull()
      expect(store.opponentCommitHash).toBeNull()
      expect(store.mySalt).toBeNull()
      expect(store.winner).toBeNull()
      expect(store.cheatDetected).toBe(false)
      expect(store.shotHistory).toEqual([])
    })

    it('initializes myBoard as 10x10 grid of empty cells', () => {
      const store = useGameStore()
      expect(store.myBoard).toHaveLength(GRID_SIZE)
      for (const row of store.myBoard) {
        expect(row).toHaveLength(GRID_SIZE)
        for (const cell of row) {
          expect(cell).toBe(CELL_STATES.EMPTY)
        }
      }
    })

    it('initializes opponentBoard as 10x10 grid of empty cells', () => {
      const store = useGameStore()
      expect(store.opponentBoard).toHaveLength(GRID_SIZE)
      for (const row of store.opponentBoard) {
        expect(row).toHaveLength(GRID_SIZE)
        for (const cell of row) {
          expect(cell).toBe(CELL_STATES.EMPTY)
        }
      }
    })
  })

  describe('isGameOver getter', () => {
    it('returns false when phase is lobby', () => {
      const store = useGameStore()
      expect(store.isGameOver).toBe(false)
    })

    it('returns false when phase is battle', () => {
      const store = useGameStore()
      store.phase = GAME_PHASES.BATTLE
      expect(store.isGameOver).toBe(false)
    })
  })

  describe('remainingShips getter', () => {
    it('returns { me: 0, opponent: 5 } when no ships placed and no shots fired', () => {
      const store = useGameStore()
      expect(store.remainingShips).toEqual({ me: 0, opponent: 5 })
    })
  })

  describe('canFire getter', () => {
    it('returns false when phase is lobby', () => {
      const store = useGameStore()
      expect(store.canFire).toBe(false)
    })

    it('returns false when phase is battle but isMyTurn is false', () => {
      const store = useGameStore()
      store.phase = GAME_PHASES.BATTLE
      store.isMyTurn = false
      expect(store.canFire).toBe(false)
    })

    it('returns true when phase is battle and isMyTurn is true', () => {
      const store = useGameStore()
      store.phase = GAME_PHASES.BATTLE
      store.isMyTurn = true
      expect(store.canFire).toBe(true)
    })
  })

  describe('startSetup()', () => {
    it('transitions phase from lobby to setup', () => {
      const store = useGameStore()
      store.startSetup()
      expect(store.phase).toBe('setup')
    })

    it('is a no-op in wrong phase', () => {
      const store = useGameStore()
      store.phase = GAME_PHASES.BATTLE
      store.startSetup()
      expect(store.phase).toBe('battle')
    })

    it('re-initializes boards', () => {
      const store = useGameStore()
      // Place some data on myBoard
      store.myBoard[0]![0] = CELL_STATES.SHIP
      store.startSetup()
      // Verify myBoard is a fresh empty board
      expect(store.myBoard[0]![0]).toBe(CELL_STATES.EMPTY)
      for (const row of store.myBoard) {
        for (const cell of row) {
          expect(cell).toBe(CELL_STATES.EMPTY)
        }
      }
    })
  })

  // === Ticket 003: Ship placement ===

  describe('placeShip()', () => {
    const destroyer: PlacedShip = {
      type: 'destroyer',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    const carrier: PlacedShip = {
      type: 'carrier',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    const cruiser: PlacedShip = {
      type: 'cruiser',
      x: 0,
      y: 2,
      orientation: 'h',
    }

    it('with valid ship returns true and updates state', () => {
      const store = useGameStore()
      store.startSetup()
      const result = store.placeShip(destroyer)
      expect(result).toBe(true)
      expect(store.myShips).toHaveLength(1)

      const cells = getShipCells(destroyer)
      for (const cell of cells) {
        expect(store.myBoard[cell.y]![cell.x]).toBe(CELL_STATES.SHIP)
      }
    })

    it('updates remainingShips.me after placing ships', () => {
      const store = useGameStore()
      store.startSetup()
      store.placeShip(destroyer)
      store.placeShip(cruiser)
      expect(store.remainingShips.me).toBe(2)
    })

    it('with overlapping ship returns false', () => {
      const store = useGameStore()
      store.startSetup()
      store.placeShip(carrier) // carrier at (0,0) horizontal, occupies x=0..4
      const battleship: PlacedShip = {
        type: 'battleship',
        x: 2,
        y: 0,
        orientation: 'h',
      }
      const result = store.placeShip(battleship)
      expect(result).toBe(false)
      expect(store.myShips).toHaveLength(1)
    })

    it('with out-of-bounds ship returns false', () => {
      const store = useGameStore()
      store.startSetup()
      const outOfBoundsCarrier: PlacedShip = {
        type: 'carrier',
        x: 8,
        y: 0,
        orientation: 'h',
      }
      const result = store.placeShip(outOfBoundsCarrier)
      expect(result).toBe(false)
      expect(store.myShips).toHaveLength(0)
    })

    it('with duplicate ship type returns false', () => {
      const store = useGameStore()
      store.startSetup()
      store.placeShip(destroyer)
      const anotherDestroyer: PlacedShip = {
        type: 'destroyer',
        x: 5,
        y: 5,
        orientation: 'h',
      }
      const result = store.placeShip(anotherDestroyer)
      expect(result).toBe(false)
      expect(store.myShips).toHaveLength(1)
    })

    it('is a no-op outside setup phase', () => {
      const store = useGameStore()
      // In lobby phase
      const result = store.placeShip(destroyer)
      expect(result).toBe(false)
      expect(store.myShips).toHaveLength(0)
    })
  })

  describe('removeShip()', () => {
    const destroyer: PlacedShip = {
      type: 'destroyer',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    const cruiser: PlacedShip = {
      type: 'cruiser',
      x: 0,
      y: 2,
      orientation: 'h',
    }

    it('removes ship and updates board', () => {
      const store = useGameStore()
      store.startSetup()
      store.placeShip(destroyer)

      const cells = getShipCells(destroyer)
      for (const cell of cells) {
        expect(store.myBoard[cell.y]![cell.x]).toBe(CELL_STATES.SHIP)
      }

      store.removeShip('destroyer')
      expect(store.myShips).toHaveLength(0)
      for (const cell of cells) {
        expect(store.myBoard[cell.y]![cell.x]).toBe(CELL_STATES.EMPTY)
      }
    })

    it('is a no-op for missing type', () => {
      const store = useGameStore()
      store.startSetup()
      store.removeShip('carrier')
      expect(store.myShips).toHaveLength(0)
    })

    it('preserves other ships', () => {
      const store = useGameStore()
      store.startSetup()
      store.placeShip(destroyer)
      store.placeShip(cruiser)
      expect(store.myShips).toHaveLength(2)

      store.removeShip('destroyer')
      expect(store.myShips).toHaveLength(1)
      expect(store.myShips[0]!.type).toBe('cruiser')

      const cruiserCells = getShipCells(cruiser)
      for (const cell of cruiserCells) {
        expect(store.myBoard[cell.y]![cell.x]).toBe(CELL_STATES.SHIP)
      }
    })
  })

  // === Ticket 004: Commit phase ===

  describe('commitBoard()', () => {
    const testHash =
      'a'.repeat(64)
    const testSalt = new Uint8Array(32)

    it('stores hash and salt and transitions to commit', () => {
      const store = useGameStore()
      store.startSetup()
      store.commitBoard(testHash, testSalt)
      expect(store.myCommitHash).toBe(testHash)
      expect(store.mySalt).toBe(testSalt)
      expect(store.phase).toBe('commit')
    })

    it('transitions setup → commit', () => {
      const store = useGameStore()
      store.startSetup()
      expect(store.phase).toBe('setup')
      store.commitBoard(testHash, testSalt)
      expect(store.phase).toBe('commit')
    })

    it('is a no-op outside setup phase', () => {
      const store = useGameStore()
      // In lobby phase
      store.commitBoard(testHash, testSalt)
      expect(store.myCommitHash).toBeNull()
      expect(store.phase).toBe('lobby')
    })
  })

  describe('receiveOpponentCommit()', () => {
    const opponentHash = 'b'.repeat(64)

    it('stores opponent hash in setup phase', () => {
      const store = useGameStore()
      store.startSetup()
      store.receiveOpponentCommit(opponentHash)
      expect(store.opponentCommitHash).toBe(opponentHash)
    })

    it('works in commit phase', () => {
      const store = useGameStore()
      store.startSetup()
      store.commitBoard('a'.repeat(64), new Uint8Array(32))
      expect(store.phase).toBe('commit')
      store.receiveOpponentCommit(opponentHash)
      expect(store.opponentCommitHash).toBe(opponentHash)
    })

    it('is a no-op in lobby phase', () => {
      const store = useGameStore()
      store.receiveOpponentCommit(opponentHash)
      expect(store.opponentCommitHash).toBeNull()
    })
  })

  describe('startBattle()', () => {
    const testHash = 'a'.repeat(64)
    const opponentHash = 'b'.repeat(64)
    const testSalt = new Uint8Array(32)

    it('transitions commit → battle with host going first', () => {
      const connectionStore = useConnectionStore()
      connectionStore.setConnecting('test-room', true)

      const store = useGameStore()
      store.startSetup()
      store.commitBoard(testHash, testSalt)
      store.receiveOpponentCommit(opponentHash)
      store.startBattle()

      expect(store.phase).toBe('battle')
      expect(store.isMyTurn).toBe(true)
    })

    it('sets joiner turn to false', () => {
      const connectionStore = useConnectionStore()
      connectionStore.setConnecting('test-room', false)

      const store = useGameStore()
      store.startSetup()
      store.commitBoard(testHash, testSalt)
      store.receiveOpponentCommit(opponentHash)
      store.startBattle()

      expect(store.phase).toBe('battle')
      expect(store.isMyTurn).toBe(false)
    })

    it('is a no-op without both commits', () => {
      const store = useGameStore()
      store.startSetup()
      store.commitBoard(testHash, testSalt)
      // Do NOT call receiveOpponentCommit
      store.startBattle()
      expect(store.phase).toBe('commit')
    })

    it('is a no-op outside commit phase', () => {
      const store = useGameStore()
      store.startSetup()
      store.startBattle()
      expect(store.phase).toBe('setup')
    })
  })

  // === Ticket 005: Battle actions ===

  function setupBattlePhase(
    store: ReturnType<typeof useGameStore>,
    isHost = true,
  ): void {
    const connectionStore = useConnectionStore()
    connectionStore.setConnecting('test-room', isHost)

    store.startSetup()
    store.placeShip({ type: 'carrier', x: 0, y: 0, orientation: 'h' })
    store.placeShip({ type: 'battleship', x: 0, y: 1, orientation: 'h' })
    store.placeShip({ type: 'cruiser', x: 0, y: 2, orientation: 'h' })
    store.placeShip({ type: 'submarine', x: 0, y: 3, orientation: 'h' })
    store.placeShip({ type: 'destroyer', x: 0, y: 4, orientation: 'h' })

    const hash = 'a'.repeat(64)
    store.commitBoard(hash, new Uint8Array(32))
    store.receiveOpponentCommit('b'.repeat(64))
    store.startBattle()
  }

  describe('fireShot()', () => {
    it('on empty cell records shot and toggles turn', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)
      expect(store.isMyTurn).toBe(true)

      store.fireShot(5, 5)

      expect(store.isMyTurn).toBe(false)
      expect(store.shotHistory).toHaveLength(1)
      expect(store.shotHistory[0]!.player).toBe('a')
      expect(store.shotHistory[0]!.hit).toBe(false)
      expect(store.shotHistory[0]!.x).toBe(5)
      expect(store.shotHistory[0]!.y).toBe(5)
    })

    it('is a no-op when not my turn', () => {
      const store = useGameStore()
      setupBattlePhase(store, false)
      expect(store.isMyTurn).toBe(false)

      store.fireShot(5, 5)

      expect(store.shotHistory).toHaveLength(0)
    })

    it('prevents duplicate shots', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.fireShot(5, 5)
      store.receiveResult(5, 5, false, null)

      // Manually restore turn to test duplicate prevention
      store.isMyTurn = true
      store.fireShot(5, 5)

      expect(store.shotHistory).toHaveLength(1)
    })
  })

  describe('receiveShot()', () => {
    it('on ship cell returns hit', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      // Carrier is at y=0, x=0..4
      const result = store.receiveShot(0, 0)

      expect(result).toEqual({ hit: true, sunk: null })
      expect(store.myBoard[0]![0]).toBe(CELL_STATES.HIT)
    })

    it('on empty cell returns miss', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      const result = store.receiveShot(9, 9)

      expect(result).toEqual({ hit: false, sunk: null })
      expect(store.myBoard[9]![9]).toBe(CELL_STATES.MISS)
    })

    it('detects sunk ship', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      // Destroyer is at y=4, x=0..1 (size 2)
      store.receiveShot(0, 4)
      const result = store.receiveShot(1, 4)

      expect(result).toEqual({ hit: true, sunk: 'destroyer' })
      expect(store.myBoard[4]![0]).toBe(CELL_STATES.SUNK)
      expect(store.myBoard[4]![1]).toBe(CELL_STATES.SUNK)
    })

    it('toggles turn to local player', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      // Host starts with isMyTurn = true, after firing it becomes false
      store.fireShot(5, 5)
      expect(store.isMyTurn).toBe(false)

      // Receiving opponent's shot sets isMyTurn = true
      store.receiveShot(9, 9)
      expect(store.isMyTurn).toBe(true)
    })
  })

  describe('receiveResult()', () => {
    it('updates opponent board on hit', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.fireShot(3, 3)
      store.receiveResult(3, 3, true, null)

      expect(store.opponentBoard[3]![3]).toBe(CELL_STATES.HIT)
    })

    it('updates opponent board on miss', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.fireShot(3, 3)
      store.receiveResult(3, 3, false, null)

      expect(store.opponentBoard[3]![3]).toBe(CELL_STATES.MISS)
    })

    it('updates shot history', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.fireShot(5, 5)
      expect(store.shotHistory[0]!.hit).toBe(false)
      expect(store.shotHistory[0]!.sunk).toBeNull()

      store.receiveResult(5, 5, true, 'carrier')

      expect(store.shotHistory[0]!.hit).toBe(true)
      expect(store.shotHistory[0]!.sunk).toBe('carrier')
    })
  })

  // === Ticket 006: Reveal and endgame actions ===

  describe('startReveal()', () => {
    it('transitions battle → reveal', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.startReveal()

      expect(store.phase).toBe('reveal')
    })

    it('is a no-op outside battle phase', () => {
      const store = useGameStore()
      store.startSetup()
      store.startReveal()
      expect(store.phase).toBe('setup')
    })
  })

  describe('receiveReveal()', () => {
    it('stores opponent ships in reveal phase', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)
      store.startReveal()

      const ships: PlacedShip[] = [
        { type: 'carrier', x: 0, y: 0, orientation: 'h' },
        { type: 'battleship', x: 0, y: 1, orientation: 'h' },
        { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
        { type: 'submarine', x: 0, y: 3, orientation: 'h' },
        { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
      ]
      store.receiveReveal(ships, 'c'.repeat(64))

      expect(store.opponentShips).toEqual(ships)
    })

    it('is a no-op outside reveal phase', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      const ships: PlacedShip[] = [
        { type: 'carrier', x: 0, y: 0, orientation: 'h' },
      ]
      store.receiveReveal(ships, 'c'.repeat(64))

      expect(store.opponentShips).toEqual([])
    })
  })

  describe('setCheatDetected()', () => {
    it('sets the flag', () => {
      const store = useGameStore()

      store.setCheatDetected(true)

      expect(store.cheatDetected).toBe(true)
    })
  })

  describe('finishGame()', () => {
    it('transitions to gameover with winner from reveal', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)
      store.startReveal()

      store.finishGame('me')

      expect(store.phase).toBe('gameover')
      expect(store.winner).toBe('me')
    })

    it('also works from battle phase', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.finishGame('opponent')

      expect(store.phase).toBe('gameover')
      expect(store.winner).toBe('opponent')
    })

    it('isGameOver returns true after finishGame()', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)
      store.startReveal()
      store.finishGame('me')

      expect(store.isGameOver).toBe(true)
    })
  })

  describe('resetForRematch()', () => {
    it('resets all game state to setup', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)
      store.startReveal()
      store.receiveReveal(
        [{ type: 'carrier', x: 0, y: 0, orientation: 'h' }],
        'c'.repeat(64),
      )
      store.setCheatDetected(true)
      store.finishGame('me')

      store.resetForRematch()

      expect(store.phase).toBe('setup')
      expect(store.myBoard.every((row) => row.every((c) => c === CELL_STATES.EMPTY))).toBe(true)
      expect(store.opponentBoard.every((row) => row.every((c) => c === CELL_STATES.EMPTY))).toBe(true)
      expect(store.myShips).toEqual([])
      expect(store.opponentShips).toEqual([])
      expect(store.isMyTurn).toBe(false)
      expect(store.myCommitHash).toBeNull()
      expect(store.opponentCommitHash).toBeNull()
      expect(store.mySalt).toBeNull()
      expect(store.winner).toBeNull()
      expect(store.cheatDetected).toBe(false)
      expect(store.shotHistory).toEqual([])
    })

    it('is a no-op outside gameover phase', () => {
      const store = useGameStore()
      setupBattlePhase(store, true)

      store.resetForRematch()

      expect(store.phase).toBe('battle')
    })
  })

  describe('full game lifecycle', () => {
    it('runs through the complete cycle: lobby → setup → commit → battle → reveal → gameover → rematch → setup', () => {
      const store = useGameStore()
      const connectionStore = useConnectionStore()

      // Lobby
      expect(store.phase).toBe('lobby')
      connectionStore.setConnecting('test-room', true)

      // Setup
      store.startSetup()
      expect(store.phase).toBe('setup')

      // Place ships
      store.placeShip({ type: 'carrier', x: 0, y: 0, orientation: 'h' })
      store.placeShip({ type: 'battleship', x: 0, y: 1, orientation: 'h' })
      store.placeShip({ type: 'cruiser', x: 0, y: 2, orientation: 'h' })
      store.placeShip({ type: 'submarine', x: 0, y: 3, orientation: 'h' })
      store.placeShip({ type: 'destroyer', x: 0, y: 4, orientation: 'h' })
      expect(store.myShips).toHaveLength(5)

      // Commit
      store.commitBoard('a'.repeat(64), new Uint8Array(32))
      expect(store.phase).toBe('commit')
      store.receiveOpponentCommit('b'.repeat(64))

      // Battle
      store.startBattle()
      expect(store.phase).toBe('battle')
      expect(store.isMyTurn).toBe(true)

      // Exchange shots
      store.fireShot(5, 5)
      expect(store.isMyTurn).toBe(false)
      store.receiveResult(5, 5, false, null)
      store.receiveShot(9, 9)
      expect(store.isMyTurn).toBe(true)

      // Reveal
      store.startReveal()
      expect(store.phase).toBe('reveal')

      store.receiveReveal(
        [
          { type: 'carrier', x: 5, y: 5, orientation: 'v' },
          { type: 'battleship', x: 6, y: 0, orientation: 'v' },
          { type: 'cruiser', x: 7, y: 0, orientation: 'v' },
          { type: 'submarine', x: 8, y: 0, orientation: 'v' },
          { type: 'destroyer', x: 9, y: 0, orientation: 'v' },
        ],
        'c'.repeat(64),
      )
      expect(store.opponentShips).toHaveLength(5)

      // Gameover
      store.finishGame('me')
      expect(store.phase).toBe('gameover')
      expect(store.winner).toBe('me')
      expect(store.isGameOver).toBe(true)

      // Rematch → setup
      store.resetForRematch()
      expect(store.phase).toBe('setup')
      expect(store.myShips).toEqual([])
      expect(store.shotHistory).toEqual([])
      expect(store.winner).toBeNull()
    })
  })
})
