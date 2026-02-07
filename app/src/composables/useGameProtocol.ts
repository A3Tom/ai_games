import { watch } from 'vue'
import { storeToRefs } from 'pinia'

import type { PlacedShip, ShipType, Shot } from '../types/game'
import type {
  GameMessage,
  ReadyMessage,
  CommitMessage,
  ShotMessage,
  ResultMessage,
  RevealMessage,
  RematchMessage,
  PingMessage,
  PongMessage,
  SyncRequestMessage,
  SyncResponseMessage,
} from '../types/protocol'

import { useGameStore } from '../stores/game'
import { useConnectionStore } from '../stores/connection'
import { useRelay } from './useRelay'
import { useCrypto } from './useCrypto'
import { getShipCells } from '../utils/board'

export interface UseGameProtocolOptions {
  roomId: string
  isHost: boolean
}

export interface UseGameProtocolReturn {
  /** Signal that the player is ready (ships placed) */
  sendReady: () => void

  /** Commit the board: hash ships, send commit message, update store */
  sendCommit: (ships: PlacedShip[]) => Promise<void>

  /** Fire a shot at the opponent */
  sendShot: (x: number, y: number) => void

  /** Send result of opponent's shot against our board */
  sendResult: (x: number, y: number, hit: boolean, sunk: ShipType | null) => void

  /** Reveal board and salt after game ends */
  sendReveal: (ships: PlacedShip[], saltHex: string) => void

  /** Request a rematch */
  sendRematch: () => void

  /** Clean up connections and listeners */
  disconnect: () => void
}

// Phase-valid message map per docs/05-PROTOCOL-SPEC.md Section 5.1
const VALID_PHASES_FOR_MESSAGE: Record<string, readonly string[]> = {
  ready: ['setup'],
  commit: ['setup', 'commit'],
  shot: ['battle'],
  result: ['battle'],
  reveal: ['reveal'],
  rematch: ['gameover'],
  ping: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
  pong: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
  sync_request: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
  sync_response: ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover'],
}

export function useGameProtocol(options: UseGameProtocolOptions): UseGameProtocolReturn {
  const gameStore = useGameStore()
  const connectionStore = useConnectionStore()
  const { commitBoard: cryptoCommitBoard, verifyBoard: cryptoVerifyBoard } = useCrypto()

  // --- Internal state (non-reactive) ---
  // Ready/rematch flags — written by send and handler functions, read to check mutual agreement
  let isLocalReady = false
  let isOpponentReady = false
  let localRematchRequested = false
  let opponentRematchRequested = false
  let awaitingResult = false
  let lastShotTime = 0
  let mySaltHex = ''
  let localSunkCount = 0
  let opponentSunkCount = 0

  // --- Incoming message handlers ---

  function handleReady(_message: ReadyMessage): void {
    isOpponentReady = true
    // Both ready is informational — commit phase is initiated by the player calling sendCommit()
    if (isLocalReady && isOpponentReady) {
      // Both players ready — no auto-transition, just informational
    }
  }

  function handleCommit(message: CommitMessage): void {
    gameStore.receiveOpponentCommit(message.hash)
    if (gameStore.myCommitHash !== null && gameStore.opponentCommitHash !== null) {
      gameStore.startBattle()
    }
  }

  function handleShot(message: ShotMessage): void {
    const result = gameStore.receiveShot(message.x, message.y)
    sendResult(message.x, message.y, result.hit, result.sunk)

    if (result.sunk !== null) {
      localSunkCount++
    }
    if (localSunkCount >= 5) {
      gameStore.startReveal()
      sendReveal(gameStore.myShips, mySaltHex)
    }
  }

  function handleResult(message: ResultMessage): void {
    gameStore.receiveResult(message.x, message.y, message.hit, message.sunk)
    awaitingResult = false

    if (message.sunk !== null) {
      opponentSunkCount++
    }
    if (opponentSunkCount >= 5) {
      gameStore.startReveal()
      sendReveal(gameStore.myShips, mySaltHex)
    }
  }

  function handleReveal(message: RevealMessage): void {
    void verifyAndFinish(message)
  }

  async function verifyAndFinish(message: RevealMessage): Promise<void> {
    gameStore.receiveReveal(message.ships, message.salt)

    const isHashValid = await cryptoVerifyBoard(
      message.ships,
      message.salt,
      gameStore.opponentCommitHash!,
    )

    if (!isHashValid) {
      gameStore.setCheatDetected(true)
      console.warn('Cheat detected: board commitment hash mismatch')
    }

    const localPlayerRole: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'
    const isShotHonest = verifyShotHonesty(
      message.ships,
      gameStore.shotHistory,
      localPlayerRole,
    )

    if (!isShotHonest) {
      gameStore.setCheatDetected(true)
      console.warn('Cheat detected: dishonest shot results')
    }

    const winner: 'me' | 'opponent' = localSunkCount >= 5 ? 'opponent' : 'me'
    gameStore.finishGame(winner)
  }

  function verifyShotHonesty(
    revealedShips: PlacedShip[],
    shotHistory: Shot[],
    localPlayerRole: 'a' | 'b',
  ): boolean {
    // Build set of cells occupied by opponent's ships
    const occupiedCells = new Set<string>()
    for (const ship of revealedShips) {
      const cells = getShipCells(ship)
      for (const cell of cells) {
        occupiedCells.add(`${cell.x},${cell.y}`)
      }
    }

    // Check each shot where local player was attacker (opponent was defending)
    for (const shot of shotHistory) {
      if (shot.player !== localPlayerRole) continue

      const key = `${shot.x},${shot.y}`
      const cellOccupied = occupiedCells.has(key)

      if (shot.hit && !cellOccupied) return false
      if (!shot.hit && cellOccupied) return false
    }

    // Verify sunk claims
    for (const shot of shotHistory) {
      if (shot.player !== localPlayerRole) continue
      if (shot.sunk === null) continue

      const sunkShip = revealedShips.find((s) => s.type === shot.sunk)
      if (!sunkShip) return false

      const shipCells = getShipCells(sunkShip)
      const allHit = shipCells.every((cell) =>
        shotHistory.some(
          (s) => s.player === localPlayerRole && s.x === cell.x && s.y === cell.y && s.hit,
        ),
      )
      if (!allHit) return false
    }

    return true
  }

  function handleRematch(_message: RematchMessage): void {
    opponentRematchRequested = true
    if (localRematchRequested && opponentRematchRequested) {
      gameStore.resetForRematch()
      resetInternalState()
    }
  }

  function handlePing(message: PingMessage): void {
    relay.send({ type: 'pong', timestamp: message.timestamp })
  }

  function handlePong(message: PongMessage): void {
    const latency = Math.max(0, Date.now() - message.timestamp)
    connectionStore.updatePing(latency)
  }

  function handleSyncRequest(_message: SyncRequestMessage): void {
    const response: SyncResponseMessage = {
      type: 'sync_response',
      phase: gameStore.phase,
      turnNumber: gameStore.shotHistory.length,
      shotHistory: gameStore.shotHistory.map((shot) => ({
        x: shot.x,
        y: shot.y,
        hit: shot.hit,
        sunk: shot.sunk,
        player: shot.player,
      })),
    }
    relay.send(response)
  }

  function handleSyncResponse(message: SyncResponseMessage): void {
    const localTurnNumber = gameStore.shotHistory.length

    // Replay missing shots if the remote has more
    if (message.turnNumber > localTurnNumber) {
      const localPlayerRole: 'a' | 'b' = connectionStore.isHost ? 'a' : 'b'

      for (let i = localTurnNumber; i < message.turnNumber; i++) {
        const shot = message.shotHistory[i]
        if (!shot) continue

        if (shot.player === localPlayerRole) {
          // Local player's shot was missed — add placeholder then fill result
          gameStore.fireShot(shot.x, shot.y)
          gameStore.receiveResult(shot.x, shot.y, shot.hit, shot.sunk)
        } else {
          gameStore.receiveShot(shot.x, shot.y)
        }
      }
    }

    // Phase reconciliation — only transition forward
    const phaseOrder = ['lobby', 'setup', 'commit', 'battle', 'reveal', 'gameover']
    const localPhaseIndex = phaseOrder.indexOf(gameStore.phase)
    const remotePhaseIndex = phaseOrder.indexOf(message.phase)

    if (remotePhaseIndex > localPhaseIndex) {
      if (message.phase === 'reveal' && gameStore.phase === 'battle') {
        gameStore.startReveal()
      } else if (message.phase === 'gameover') {
        const winner: 'me' | 'opponent' = localSunkCount >= 5 ? 'opponent' : 'me'
        gameStore.finishGame(winner)
      }
    }
  }

  function resetInternalState(): void {
    isLocalReady = false
    isOpponentReady = false
    localRematchRequested = false
    opponentRematchRequested = false
    awaitingResult = false
    lastShotTime = 0
    mySaltHex = ''
    localSunkCount = 0
    opponentSunkCount = 0
  }

  // --- Main dispatch ---

  function handleIncomingMessage(message: GameMessage): void {
    const validPhases = VALID_PHASES_FOR_MESSAGE[message.type]
    if (!validPhases || !validPhases.includes(gameStore.phase)) {
      console.warn(`Ignoring '${message.type}' message in '${gameStore.phase}' phase`)
      return
    }

    switch (message.type) {
      case 'ready':
        handleReady(message)
        break
      case 'commit':
        handleCommit(message)
        break
      case 'shot':
        handleShot(message)
        break
      case 'result':
        handleResult(message)
        break
      case 'reveal':
        handleReveal(message)
        break
      case 'rematch':
        handleRematch(message)
        break
      case 'ping':
        handlePing(message)
        break
      case 'pong':
        handlePong(message)
        break
      case 'sync_request':
        handleSyncRequest(message)
        break
      case 'sync_response':
        handleSyncResponse(message)
        break
      default: {
        const _exhaustive: never = message
        console.warn('Unrecognized message type:', _exhaustive)
      }
    }
  }

  // --- Relay setup ---

  const relay = useRelay({
    roomId: options.roomId,
    isHost: options.isHost,
    onGameMessage: handleIncomingMessage,
  })

  // --- Reconnection watcher ---

  const { peerConnected } = storeToRefs(connectionStore)

  const stopWatcher = watch(peerConnected, (newValue, oldValue) => {
    if (newValue && !oldValue && gameStore.phase !== 'lobby') {
      sendSyncRequest()
    }
  })

  // --- Send functions ---

  function sendReady(): void {
    isLocalReady = true
    relay.send({ type: 'ready' })
  }

  async function sendCommit(ships: PlacedShip[]): Promise<void> {
    const result = await cryptoCommitBoard(ships)
    mySaltHex = result.saltHex
    gameStore.commitBoard(result.hash, result.salt)
    relay.send({ type: 'commit', hash: result.hash })

    // If opponent's commit was already received, both are now ready → start battle
    if (gameStore.myCommitHash !== null && gameStore.opponentCommitHash !== null) {
      gameStore.startBattle()
    }
  }

  function sendShot(x: number, y: number): void {
    if (Date.now() - lastShotTime < 200) return
    if (awaitingResult) return

    lastShotTime = Date.now()
    awaitingResult = true
    gameStore.fireShot(x, y)
    relay.send({ type: 'shot', x, y })
  }

  function sendResult(x: number, y: number, hit: boolean, sunk: ShipType | null): void {
    relay.send({ type: 'result', x, y, hit, sunk })
  }

  function sendReveal(ships: PlacedShip[], saltHex: string): void {
    relay.send({ type: 'reveal', ships, salt: saltHex })
  }

  function sendRematch(): void {
    localRematchRequested = true
    relay.send({ type: 'rematch' })
  }

  function sendSyncRequest(): void {
    relay.send({ type: 'sync_request' })
  }

  function disconnect(): void {
    stopWatcher()
    relay.disconnect()
  }

  return {
    sendReady,
    sendCommit,
    sendShot,
    sendResult,
    sendReveal,
    sendRematch,
    disconnect,
  }
}
