import { CELL_STATES } from '../types/game'
import { GRID_SIZE } from '../constants/grid'
import { FLEET_CONFIG } from '../constants/ships'
import type { CellState, PlacedShip } from '../types/game'

/** Creates a 10×10 board filled with CELL_STATES.EMPTY */
export function createEmptyBoard(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => CELL_STATES.EMPTY),
  )
}

/** Returns all (x, y) coordinates occupied by a ship */
export function getShipCells(
  ship: PlacedShip,
): Array<{ x: number; y: number }> {
  const config = FLEET_CONFIG.find((c) => c.type === ship.type)
  // config will always be found for valid ShipType values
  const size = config!.size

  return Array.from({ length: size }, (_, i) => ({
    x: ship.orientation === 'h' ? ship.x + i : ship.x,
    y: ship.orientation === 'v' ? ship.y + i : ship.y,
  }))
}

/** Checks if a ship can be placed on the board without overlapping or going out of bounds */
export function canPlaceShip(
  board: CellState[][],
  ship: PlacedShip,
): boolean {
  const cells = getShipCells(ship)

  return cells.every((cell) => {
    if (
      cell.x < 0 ||
      cell.x >= GRID_SIZE ||
      cell.y < 0 ||
      cell.y >= GRID_SIZE
    ) {
      return false
    }
    return board[cell.y]![cell.x] === CELL_STATES.EMPTY
  })
}

/** Places a ship on the board. Returns a new board (does not mutate input). */
export function placeShip(
  board: CellState[][],
  ship: PlacedShip,
): CellState[][] {
  const newBoard = board.map((row) => [...row])
  const cells = getShipCells(ship)

  for (const cell of cells) {
    newBoard[cell.y]![cell.x] = CELL_STATES.SHIP
  }

  return newBoard
}

/** Checks if all ship cells on the board have been hit */
export function isAllSunk(
  board: CellState[][],
  ships: PlacedShip[],
): boolean {
  return ships.every((ship) => {
    const cells = getShipCells(ship)
    return cells.every((cell) => {
      const state = board[cell.y]![cell.x]
      return state === CELL_STATES.HIT || state === CELL_STATES.SUNK
    })
  })
}
