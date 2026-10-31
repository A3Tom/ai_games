export const CELL_STATES = {
  EMPTY: 'empty',
  SHIP: 'ship',
  HIT: 'hit',
  MISS: 'miss',
  SUNK: 'sunk',
} as const

export type CellState = (typeof CELL_STATES)[keyof typeof CELL_STATES]

export const GAME_PHASES = {
  LOBBY: 'lobby',
  SETUP: 'setup',
  COMMIT: 'commit',
  BATTLE: 'battle',
  REVEAL: 'reveal',
  GAMEOVER: 'gameover',
} as const

export type GamePhase = (typeof GAME_PHASES)[keyof typeof GAME_PHASES]

export const SHIP_TYPES = {
  CARRIER: 'carrier',
  BATTLESHIP: 'battleship',
  CRUISER: 'cruiser',
  SUBMARINE: 'submarine',
  DESTROYER: 'destroyer',
} as const

export type ShipType = (typeof SHIP_TYPES)[keyof typeof SHIP_TYPES]

export type Orientation = 'h' | 'v'

export interface PlacedShip {
  type: ShipType
  x: number
  y: number
  orientation: Orientation
}

export interface Shot {
  x: number
  y: number
  hit: boolean
  sunk: ShipType | null
  player: 'a' | 'b'
}

// Ships must be sorted alphabetically by type before serialization for deterministic hashing
export interface BoardCommitment {
  ships: PlacedShip[]
}

export interface GameState {
  phase: GamePhase
  myBoard: CellState[][]
  opponentBoard: CellState[][]
  myShips: PlacedShip[]
  opponentShips: PlacedShip[]
  isMyTurn: boolean
  myCommitHash: string | null
  opponentCommitHash: string | null
  mySalt: Uint8Array | null
  winner: 'me' | 'opponent' | null
  cheatDetected: boolean
  shotHistory: Shot[]
}
