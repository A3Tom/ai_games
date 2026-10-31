import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

import type { GamePhase, CellState, PlacedShip, Shot, ShipType } from '../types/game'
import { GAME_PHASES, CELL_STATES } from '../types/game'

import {
  createEmptyBoard,
  getShipCells,
  canPlaceShip,
  placeShip as placeShipOnBoard,
} from '../utils/board'
import { FLEET_CONFIG } from '../constants/ships'
import { useConnectionStore } from './connection'

export const useGameStore = defineStore('game', () => {
  // === State ===
  const phase = ref<GamePhase>(GAME_PHASES.LOBBY)
  const myBoard = ref<CellState[][]>(createEmptyBoard())
  const opponentBoard = ref<CellState[][]>(createEmptyBoard())
  const myShips = ref<PlacedShip[]>([])
  const opponentShips = ref<PlacedShip[]>([])
  const isMyTurn = ref<boolean>(false)
  const myCommitHash = ref<string | null>(null)
  const opponentCommitHash = ref<string | null>(null)
  const mySalt = ref<Uint8Array | null>(null)
  const winner = ref<'me' | 'opponent' | null>(null)
  const cheatDetected = ref<boolean>(false)
  const shotHistory = ref<Shot[]>([])

  // === Getters ===
  const isGameOver = computed(() => phase.value === GAME_PHASES.GAMEOVER)

  const remainingShips = computed(() => {
    // Count my remaining ships (ships where NOT all cells are HIT or SUNK)
    const myRemaining = myShips.value.filter((ship) => {
      const cells = getShipCells(ship)
      return !cells.every((cell) => {
        const state = myBoard.value[cell.y]?.[cell.x]
        return state === CELL_STATES.HIT || state === CELL_STATES.SUNK
      })
    }).length

    // Count opponent's sunk ships from shot history (unique sunk ship types)
    const sunkTypes = new Set(
      shotHistory.value
        .filter((shot): shot is Shot & { sunk: ShipType } => shot.sunk !== null)
        .map((shot) => shot.sunk),
    )
    const opponentRemaining = FLEET_CONFIG.length - sunkTypes.size

    return { me: myRemaining, opponent: opponentRemaining }
  })

  const canFire = computed(
    () => phase.value === GAME_PHASES.BATTLE && isMyTurn.value,
  )

  // === Actions ===

  // Ticket 002: lobby → setup
  function startSetup(): void {
    if (phase.value !== GAME_PHASES.LOBBY) return
    phase.value = GAME_PHASES.SETUP
    myBoard.value = createEmptyBoard()
    myShips.value = []
  }

  // Ticket 003: Ship placement
  function placeShip(ship: PlacedShip): boolean {
    if (phase.value !== GAME_PHASES.SETUP) return false
    if (myShips.value.some((s) => s.type === ship.type)) return false
    if (!canPlaceShip(myBoard.value, ship)) return false

    myBoard.value = placeShipOnBoard(myBoard.value, ship)
    myShips.value = [...myShips.value, ship]
    return true
  }

  function removeShip(type: ShipType): void {
    if (phase.value !== GAME_PHASES.SETUP) return
    if (!myShips.value.some((s) => s.type === type)) return

    myShips.value = myShips.value.filter((s) => s.type !== type)

    let board = createEmptyBoard()
    for (const s of myShips.value) {
      board = placeShipOnBoard(board, s)
    }
    myBoard.value = board
  }

  // Ticket 004: Commit phase
  function commitBoard(hash: string, salt: Uint8Array): void {
    if (phase.value !== GAME_PHASES.SETUP) return
    myCommitHash.value = hash
    mySalt.value = salt
    phase.value = GAME_PHASES.COMMIT
  }

  function receiveOpponentCommit(hash: string): void {
    if (
      phase.value !== GAME_PHASES.SETUP &&
      phase.value !== GAME_PHASES.COMMIT
    )
      return
    opponentCommitHash.value = hash
  }

  function startBattle(): void {
    if (phase.value !== GAME_PHASES.COMMIT) return
    if (myCommitHash.value === null || opponentCommitHash.value === null) return

    const connectionStore = useConnectionStore()
    isMyTurn.value = connectionStore.isHost

    phase.value = GAME_PHASES.BATTLE
  }

  // Ticket 005: Battle actions
  function fireShot(x: number, y: number): void {
    if (phase.value !== GAME_PHASES.BATTLE) return
    if (!isMyTurn.value) return
    if (opponentBoard.value[y]![x] !== CELL_STATES.EMPTY) return

    const connectionStore = useConnectionStore()
    const player: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'

    shotHistory.value = [
      ...shotHistory.value,
      { x, y, hit: false, sunk: null, player },
    ]
    isMyTurn.value = false
  }

  function receiveShot(
    x: number,
    y: number,
  ): { hit: boolean; sunk: ShipType | null } {
    if (phase.value !== GAME_PHASES.BATTLE) return { hit: false, sunk: null }

    const cellState = myBoard.value[y]![x]

    // Duplicate shot — defensive handling
    if (
      cellState === CELL_STATES.HIT ||
      cellState === CELL_STATES.MISS ||
      cellState === CELL_STATES.SUNK
    ) {
      return { hit: false, sunk: null }
    }

    const hit = cellState === CELL_STATES.SHIP
    const newBoard = myBoard.value.map((row) => [...row])
    let sunk: ShipType | null = null

    if (hit) {
      newBoard[y]![x] = CELL_STATES.HIT

      // Check if the hit ship is now fully sunk
      for (const ship of myShips.value) {
        const cells = getShipCells(ship)
        const containsHitCell = cells.some((c) => c.x === x && c.y === y)
        if (containsHitCell) {
          const isFullySunk = cells.every((c) => {
            const state = newBoard[c.y]![c.x]
            return state === CELL_STATES.HIT || state === CELL_STATES.SUNK
          })
          if (isFullySunk) {
            sunk = ship.type
            for (const c of cells) {
              newBoard[c.y]![c.x] = CELL_STATES.SUNK
            }
          }
          break
        }
      }
    } else {
      newBoard[y]![x] = CELL_STATES.MISS
    }

    myBoard.value = newBoard

    // Record in shot history
    const connectionStore = useConnectionStore()
    const opponentPlayer: 'a' | 'b' = connectionStore.isHost ? 'b' : 'a'
    shotHistory.value = [
      ...shotHistory.value,
      { x, y, hit, sunk, player: opponentPlayer },
    ]

    isMyTurn.value = true
    return { hit, sunk }
  }

  function receiveResult(
    x: number,
    y: number,
    hit: boolean,
    sunk: ShipType | null,
  ): void {
    if (phase.value !== GAME_PHASES.BATTLE) return

    // Update opponent board
    const newBoard = opponentBoard.value.map((row) => [...row])
    newBoard[y]![x] = hit ? CELL_STATES.HIT : CELL_STATES.MISS
    opponentBoard.value = newBoard

    // Update shot history — find the most recent placeholder shot at these coordinates
    const connectionStore = useConnectionStore()
    const localPlayer: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'

    let targetIndex = -1
    for (let i = shotHistory.value.length - 1; i >= 0; i--) {
      const shot = shotHistory.value[i]!
      if (
        shot.x === x &&
        shot.y === y &&
        shot.player === localPlayer &&
        !shot.hit
      ) {
        targetIndex = i
        break
      }
    }

    if (targetIndex !== -1) {
      shotHistory.value = shotHistory.value.map((shot, i) =>
        i === targetIndex ? { ...shot, hit, sunk } : shot,
      )
    }
  }

  // Ticket 006: Reveal and endgame actions
  function startReveal(): void {
    if (phase.value !== GAME_PHASES.BATTLE) return
    phase.value = GAME_PHASES.REVEAL
  }

  function receiveReveal(ships: PlacedShip[], _salt: string): void {
    if (phase.value !== GAME_PHASES.REVEAL) return
    opponentShips.value = ships
  }

  function setCheatDetected(detected: boolean): void {
    cheatDetected.value = detected
  }

  function finishGame(gameWinner: 'me' | 'opponent'): void {
    if (
      phase.value !== GAME_PHASES.REVEAL &&
      phase.value !== GAME_PHASES.BATTLE
    )
      return
    winner.value = gameWinner
    phase.value = GAME_PHASES.GAMEOVER
  }

  function resetForRematch(): void {
    if (phase.value !== GAME_PHASES.GAMEOVER) return
    phase.value = GAME_PHASES.SETUP
    myBoard.value = createEmptyBoard()
    opponentBoard.value = createEmptyBoard()
    myShips.value = []
    opponentShips.value = []
    isMyTurn.value = false
    myCommitHash.value = null
    opponentCommitHash.value = null
    mySalt.value = null
    winner.value = null
    cheatDetected.value = false
    shotHistory.value = []
  }

  return {
    // state
    phase,
    myBoard,
    opponentBoard,
    myShips,
    opponentShips,
    isMyTurn,
    myCommitHash,
    opponentCommitHash,
    mySalt,
    winner,
    cheatDetected,
    shotHistory,
    // getters
    isGameOver,
    remainingShips,
    canFire,
    // actions
    startSetup,
    placeShip,
    removeShip,
    commitBoard,
    receiveOpponentCommit,
    startBattle,
    fireShot,
    receiveShot,
    receiveResult,
    startReveal,
    receiveReveal,
    setCheatDetected,
    finishGame,
    resetForRematch,
  }
})
