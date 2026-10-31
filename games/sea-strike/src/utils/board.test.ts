import { describe, it, expect } from 'vitest'
import {
  createEmptyBoard,
  getShipCells,
  canPlaceShip,
  placeShip,
  isAllSunk,
} from './board'
import { CELL_STATES } from '../types/game'
import type { PlacedShip } from '../types/game'

describe('createEmptyBoard', () => {
  it('returns a 10x10 array', () => {
    const board = createEmptyBoard()
    expect(board).toHaveLength(10)
    for (const row of board) {
      expect(row).toHaveLength(10)
    }
  })

  it('fills every cell with CELL_STATES.EMPTY', () => {
    const board = createEmptyBoard()
    for (const row of board) {
      for (const cell of row) {
        expect(cell).toBe(CELL_STATES.EMPTY)
      }
    }
  })

  it('creates independent inner arrays', () => {
    const board = createEmptyBoard()
    expect(board[0]).not.toBe(board[1])
    board[0]![0] = CELL_STATES.SHIP
    expect(board[1]![0]).toBe(CELL_STATES.EMPTY)
  })
})

describe('getShipCells', () => {
  it('returns 5 cells for a horizontal carrier at (0, 0)', () => {
    const ship: PlacedShip = { type: 'carrier', x: 0, y: 0, orientation: 'h' }
    const cells = getShipCells(ship)
    expect(cells).toHaveLength(5)
    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ])
  })

  it('returns 2 cells for a vertical destroyer at (9, 8)', () => {
    const ship: PlacedShip = {
      type: 'destroyer',
      x: 9,
      y: 8,
      orientation: 'v',
    }
    const cells = getShipCells(ship)
    expect(cells).toHaveLength(2)
    expect(cells).toEqual([
      { x: 9, y: 8 },
      { x: 9, y: 9 },
    ])
  })

  it('returns 3 cells for a vertical cruiser at (1, 7)', () => {
    const ship: PlacedShip = {
      type: 'cruiser',
      x: 1,
      y: 7,
      orientation: 'v',
    }
    const cells = getShipCells(ship)
    expect(cells).toEqual([
      { x: 1, y: 7 },
      { x: 1, y: 8 },
      { x: 1, y: 9 },
    ])
  })

  it('returns 4 cells for a horizontal battleship at (3, 5)', () => {
    const ship: PlacedShip = {
      type: 'battleship',
      x: 3,
      y: 5,
      orientation: 'h',
    }
    const cells = getShipCells(ship)
    expect(cells).toHaveLength(4)
    expect(cells).toEqual([
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ])
  })
})

describe('canPlaceShip', () => {
  it('returns false for a carrier at (8, 0) horizontal (extends beyond grid)', () => {
    const board = createEmptyBoard()
    const ship: PlacedShip = {
      type: 'carrier',
      x: 8,
      y: 0,
      orientation: 'h',
    }
    expect(canPlaceShip(board, ship)).toBe(false)
  })

  it('returns false for a vertical ship that extends beyond the grid', () => {
    const board = createEmptyBoard()
    const ship: PlacedShip = {
      type: 'cruiser',
      x: 0,
      y: 8,
      orientation: 'v',
    }
    expect(canPlaceShip(board, ship)).toBe(false)
  })

  it('returns false when target cells are occupied', () => {
    const board = createEmptyBoard()
    const ship1: PlacedShip = {
      type: 'destroyer',
      x: 3,
      y: 3,
      orientation: 'h',
    }
    const boardWithShip = placeShip(board, ship1)

    const ship2: PlacedShip = {
      type: 'cruiser',
      x: 3,
      y: 3,
      orientation: 'v',
    }
    expect(canPlaceShip(boardWithShip, ship2)).toBe(false)
  })

  it('returns true for a valid placement on an empty board', () => {
    const board = createEmptyBoard()
    const ship: PlacedShip = {
      type: 'carrier',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    expect(canPlaceShip(board, ship)).toBe(true)
  })

  it('returns true when ships do not overlap', () => {
    const board = createEmptyBoard()
    const ship1: PlacedShip = {
      type: 'destroyer',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    const boardWithShip = placeShip(board, ship1)

    const ship2: PlacedShip = {
      type: 'cruiser',
      x: 0,
      y: 1,
      orientation: 'h',
    }
    expect(canPlaceShip(boardWithShip, ship2)).toBe(true)
  })
})

describe('placeShip', () => {
  it('sets ship cells to CELL_STATES.SHIP', () => {
    const board = createEmptyBoard()
    const ship: PlacedShip = {
      type: 'destroyer',
      x: 2,
      y: 3,
      orientation: 'h',
    }
    const newBoard = placeShip(board, ship)
    expect(newBoard[3]![2]).toBe(CELL_STATES.SHIP)
    expect(newBoard[3]![3]).toBe(CELL_STATES.SHIP)
  })

  it('leaves other cells as CELL_STATES.EMPTY', () => {
    const board = createEmptyBoard()
    const ship: PlacedShip = {
      type: 'destroyer',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    const newBoard = placeShip(board, ship)
    expect(newBoard[0]![2]).toBe(CELL_STATES.EMPTY)
    expect(newBoard[1]![0]).toBe(CELL_STATES.EMPTY)
  })

  it('does not mutate the original board', () => {
    const board = createEmptyBoard()
    const ship: PlacedShip = {
      type: 'destroyer',
      x: 0,
      y: 0,
      orientation: 'h',
    }
    placeShip(board, ship)
    expect(board[0]![0]).toBe(CELL_STATES.EMPTY)
    expect(board[0]![1]).toBe(CELL_STATES.EMPTY)
  })
})

describe('isAllSunk', () => {
  it('returns false when some ship cells are still SHIP', () => {
    const board = createEmptyBoard()
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
    ]
    const boardWithShip = placeShip(board, ships[0]!)
    expect(isAllSunk(boardWithShip, ships)).toBe(false)
  })

  it('returns true when all ship cells are HIT', () => {
    const board = createEmptyBoard()
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
    ]
    board[0]![0] = CELL_STATES.HIT
    board[0]![1] = CELL_STATES.HIT
    expect(isAllSunk(board, ships)).toBe(true)
  })

  it('returns true when all ship cells are SUNK', () => {
    const board = createEmptyBoard()
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
    ]
    board[0]![0] = CELL_STATES.SUNK
    board[0]![1] = CELL_STATES.SUNK
    expect(isAllSunk(board, ships)).toBe(true)
  })

  it('returns true when ship cells are a mix of HIT and SUNK', () => {
    const board = createEmptyBoard()
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
    ]
    board[0]![0] = CELL_STATES.HIT
    board[0]![1] = CELL_STATES.SUNK
    expect(isAllSunk(board, ships)).toBe(true)
  })

  it('returns true for an empty ships array', () => {
    const board = createEmptyBoard()
    expect(isAllSunk(board, [])).toBe(true)
  })

  it('returns false when one of multiple ships is not fully sunk', () => {
    const board = createEmptyBoard()
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
      { type: 'cruiser', x: 0, y: 1, orientation: 'h' },
    ]
    board[0]![0] = CELL_STATES.HIT
    board[0]![1] = CELL_STATES.HIT
    // cruiser cells are still EMPTY
    expect(isAllSunk(board, ships)).toBe(false)
  })
})
