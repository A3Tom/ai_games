import type { ShipType } from '../types/game'

export interface ShipConfig {
  type: ShipType
  name: string
  size: number
}

export const FLEET_CONFIG: readonly ShipConfig[] = [
  { type: 'carrier', name: 'Carrier', size: 5 },
  { type: 'battleship', name: 'Battleship', size: 4 },
  { type: 'cruiser', name: 'Cruiser', size: 3 },
  { type: 'submarine', name: 'Submarine', size: 3 },
  { type: 'destroyer', name: 'Destroyer', size: 2 },
] as const

export const FLEET_SIZE = FLEET_CONFIG.length

export const TOTAL_SHIP_CELLS = FLEET_CONFIG.reduce((sum, ship) => sum + ship.size, 0)
