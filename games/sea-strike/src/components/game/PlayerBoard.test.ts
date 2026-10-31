// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlayerBoard from './PlayerBoard.vue'
import type { CellState, PlacedShip } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { GRID_SIZE } from '../../constants/grid'

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => CELL_STATES.EMPTY as CellState),
  )
}

const mockShips: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]

const GridCellStub = {
  name: 'GridCell',
  template:
    '<div class="grid-cell-stub" :data-state="state" :data-interactive="interactive"></div>',
  props: ['x', 'y', 'state', 'interactive', 'highlighted', 'highlightValid'],
}

describe('PlayerBoard', () => {
  it('renders 100 GridCell components', () => {
    const wrapper = mount(PlayerBoard, {
      props: { board: createEmptyBoard(), ships: mockShips },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    expect(cells).toHaveLength(100)
  })

  it('all cells are non-interactive', () => {
    const wrapper = mount(PlayerBoard, {
      props: { board: createEmptyBoard(), ships: mockShips },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    for (const cell of cells) {
      expect(cell.attributes('data-interactive')).toBe('false')
    }
  })

  it('passes correct CellState to cells', () => {
    const board = createEmptyBoard()
    board[0]![0] = CELL_STATES.SHIP
    board[1]![1] = CELL_STATES.HIT

    const wrapper = mount(PlayerBoard, {
      props: { board, ships: mockShips },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    // Cell at (0,0) is the first cell in the first row
    expect(cells[0]?.attributes('data-state')).toBe('ship')
    // Cell at (1,1) is the second cell in the second row (index = 10 + 1 = 11)
    expect(cells[11]?.attributes('data-state')).toBe('hit')
  })

  it('renders column labels A through J', () => {
    const wrapper = mount(PlayerBoard, {
      props: { board: createEmptyBoard(), ships: mockShips },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const text = wrapper.text()
    for (const label of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      expect(text).toContain(label)
    }
  })

  it('renders row labels 1 through 10', () => {
    const wrapper = mount(PlayerBoard, {
      props: { board: createEmptyBoard(), ships: mockShips },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const text = wrapper.text()
    for (const label of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
      expect(text).toContain(label)
    }
  })

  it('displays "Your Fleet" heading', () => {
    const wrapper = mount(PlayerBoard, {
      props: { board: createEmptyBoard(), ships: mockShips },
      global: { stubs: { GridCell: GridCellStub } },
    })
    expect(wrapper.text()).toContain('Your Fleet')
  })
})
