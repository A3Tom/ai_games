// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OpponentBoard from './OpponentBoard.vue'
import type { CellState } from '../../types/game'
import { CELL_STATES } from '../../types/game'
import { GRID_SIZE } from '../../constants/grid'

function createEmptyBoard(): CellState[][] {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => CELL_STATES.EMPTY as CellState),
  )
}

const GridCellStub = {
  name: 'GridCell',
  template:
    '<div class="grid-cell-stub" :data-state="state" :data-interactive="interactive" @click="$emit(\'cellClick\', x, y)"></div>',
  props: ['x', 'y', 'state', 'interactive', 'highlighted', 'highlightValid'],
  emits: ['cellClick', 'cellHover'],
}

describe('OpponentBoard', () => {
  it('renders 100 GridCell components', () => {
    const wrapper = mount(OpponentBoard, {
      props: { board: createEmptyBoard(), isMyTurn: true, canFire: true },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    expect(cells).toHaveLength(100)
  })

  it('cells are interactive when canFire is true and cell is empty', () => {
    const wrapper = mount(OpponentBoard, {
      props: { board: createEmptyBoard(), isMyTurn: true, canFire: true },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    for (const cell of cells) {
      expect(cell.attributes('data-interactive')).toBe('true')
    }
  })

  it('cells are not interactive when canFire is false', () => {
    const wrapper = mount(OpponentBoard, {
      props: { board: createEmptyBoard(), isMyTurn: false, canFire: false },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    for (const cell of cells) {
      expect(cell.attributes('data-interactive')).toBe('false')
    }
  })

  it('already-fired cells are not interactive even when canFire is true', () => {
    const board = createEmptyBoard()
    board[0]![0] = CELL_STATES.HIT

    const wrapper = mount(OpponentBoard, {
      props: { board, isMyTurn: true, canFire: true },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    // First cell (0,0) should not be interactive
    expect(cells[0]?.attributes('data-interactive')).toBe('false')
    // Second cell (1,0) should be interactive
    expect(cells[1]?.attributes('data-interactive')).toBe('true')
  })

  it('emits fire event with coordinates on valid cell click', async () => {
    const wrapper = mount(OpponentBoard, {
      props: { board: createEmptyBoard(), isMyTurn: true, canFire: true },
      global: { stubs: { GridCell: GridCellStub } },
    })
    // Cell at row 4, col 3 → index = 4 * 10 + 3 = 43
    const cells = wrapper.findAll('.grid-cell-stub')
    await cells[43]!.trigger('click')

    const fireEvents = wrapper.emitted('fire')
    expect(fireEvents).toHaveLength(1)
    expect(fireEvents![0]).toEqual([3, 4])
  })

  it('does not emit fire event when canFire is false', async () => {
    const wrapper = mount(OpponentBoard, {
      props: { board: createEmptyBoard(), isMyTurn: false, canFire: false },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const cells = wrapper.findAll('.grid-cell-stub')
    await cells[0]!.trigger('click')

    expect(wrapper.emitted('fire')).toBeUndefined()
  })

  it('does not emit fire event for already-fired cell', async () => {
    const board = createEmptyBoard()
    board[2]![3] = CELL_STATES.MISS

    const wrapper = mount(OpponentBoard, {
      props: { board, isMyTurn: true, canFire: true },
      global: { stubs: { GridCell: GridCellStub } },
    })
    // Cell at (3, 2) → index = 2 * 10 + 3 = 23
    const cells = wrapper.findAll('.grid-cell-stub')
    await cells[23]!.trigger('click')

    expect(wrapper.emitted('fire')).toBeUndefined()
  })
})
