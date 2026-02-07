// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import GameOver from './GameOver.vue'
import { createEmptyBoard } from '../../utils/board'
import type { PlacedShip } from '../../types/game'
import { CELL_STATES } from '../../types/game'

const GridCellStub = {
  name: 'GridCell',
  template: '<div class="grid-cell-stub" :data-state="state"></div>',
  props: ['state'],
}

function createDefaultProps(): {
  winner: 'me' | 'opponent'
  cheatDetected: boolean
  myBoard: ReturnType<typeof createEmptyBoard>
  myShips: PlacedShip[]
  opponentBoard: ReturnType<typeof createEmptyBoard>
  opponentShips: PlacedShip[]
  opponentRevealed: boolean
  rematchRequested: boolean
  opponentRematchRequested: boolean
} {
  return {
    winner: 'me',
    cheatDetected: false,
    myBoard: createEmptyBoard(),
    myShips: [],
    opponentBoard: createEmptyBoard(),
    opponentShips: [],
    opponentRevealed: false,
    rematchRequested: false,
    opponentRematchRequested: false,
  }
}

describe('GameOver', () => {
  it('renders "You Win!" when winner is me', () => {
    const wrapper = mount(GameOver, {
      props: { ...createDefaultProps(), winner: 'me' },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const winnerText = wrapper.find('[data-testid="winner-text"]')
    expect(winnerText.text()).toBe('You Win!')
  })

  it('renders "You Lose!" when winner is opponent', () => {
    const wrapper = mount(GameOver, {
      props: { ...createDefaultProps(), winner: 'opponent' },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const winnerText = wrapper.find('[data-testid="winner-text"]')
    expect(winnerText.text()).toBe('You Lose!')
  })

  it('renders my board grid with 100 GridCell components', () => {
    const wrapper = mount(GameOver, {
      props: createDefaultProps(),
      global: { stubs: { GridCell: GridCellStub } },
    })
    const myBoard = wrapper.find('[data-testid="my-board"]')
    expect(myBoard.exists()).toBe(true)
    expect(myBoard.findAll('.grid-cell-stub')).toHaveLength(100)
  })

  it('renders opponent board grid when opponentRevealed is true', () => {
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
    ]
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        opponentRevealed: true,
        opponentShips: ships,
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const opponentBoard = wrapper.find('[data-testid="opponent-board"]')
    expect(opponentBoard.exists()).toBe(true)
    expect(opponentBoard.findAll('.grid-cell-stub')).toHaveLength(100)
  })

  it('shows reveal-pending message when opponentRevealed is false', () => {
    const wrapper = mount(GameOver, {
      props: createDefaultProps(),
      global: { stubs: { GridCell: GridCellStub } },
    })
    expect(wrapper.find('[data-testid="reveal-pending"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reveal-pending"]').text()).toBe(
      'Waiting for opponent to reveal board...',
    )
    expect(wrapper.find('[data-testid="opponent-board"]').exists()).toBe(false)
  })

  it('revealed opponent board overlays ships onto empty cells', () => {
    const opponentBoard = createEmptyBoard()
    // Set (0,0) to HIT — this cell is part of the destroyer but should stay HIT
    opponentBoard[0]![0] = CELL_STATES.HIT

    // Destroyer at (0,0) horizontal, size 2: covers (0,0) and (1,0)
    const ships: PlacedShip[] = [
      { type: 'destroyer', x: 0, y: 0, orientation: 'h' },
    ]

    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        opponentBoard,
        opponentShips: ships,
        opponentRevealed: true,
      },
      global: { stubs: { GridCell: GridCellStub } },
    })

    const opponentBoardEl = wrapper.find('[data-testid="opponent-board"]')
    const cells = opponentBoardEl.findAll('.grid-cell-stub')

    // flat index = y * 10 + x
    // (x=0, y=0) → index 0: was HIT, should stay 'hit'
    expect(cells[0]!.attributes('data-state')).toBe('hit')
    // (x=1, y=0) → index 1: was EMPTY with ship, should become 'ship'
    expect(cells[1]!.attributes('data-state')).toBe('ship')
    // (x=2, y=0) → index 2: was EMPTY without ship, should stay 'empty'
    expect(cells[2]!.attributes('data-state')).toBe('empty')
  })

  // --- Ticket 002: Verification badge and rematch controls ---

  it('shows "Verified — Fair Game" when cheatDetected is false and opponentRevealed is true', () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        cheatDetected: false,
        opponentRevealed: true,
        opponentShips: [{ type: 'destroyer', x: 0, y: 0, orientation: 'h' }],
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const badge = wrapper.find('[data-testid="verification-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('Verified — Fair Game')
  })

  it('shows "Cheat Detected" when cheatDetected is true', () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        cheatDetected: true,
        opponentRevealed: true,
        opponentShips: [{ type: 'destroyer', x: 0, y: 0, orientation: 'h' }],
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const badge = wrapper.find('[data-testid="verification-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('Cheat Detected')
  })

  it('does not show verification badge when opponentRevealed is false', () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        opponentRevealed: false,
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    expect(wrapper.find('[data-testid="verification-badge"]').exists()).toBe(false)
  })

  it('renders "Rematch" button in default state', () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        rematchRequested: false,
        opponentRematchRequested: false,
        opponentRevealed: true,
        opponentShips: [{ type: 'destroyer', x: 0, y: 0, orientation: 'h' }],
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    expect(wrapper.find('[data-testid="rematch-button"]').exists()).toBe(true)
  })

  it('emits requestRematch on button click', async () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        rematchRequested: false,
        opponentRematchRequested: false,
        opponentRevealed: true,
        opponentShips: [{ type: 'destroyer', x: 0, y: 0, orientation: 'h' }],
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    await wrapper.find('[data-testid="rematch-button"]').trigger('click')
    expect(wrapper.emitted('requestRematch')).toHaveLength(1)
  })

  it('shows waiting text when rematchRequested is true', () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        rematchRequested: true,
        opponentRevealed: true,
        opponentShips: [{ type: 'destroyer', x: 0, y: 0, orientation: 'h' }],
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const waiting = wrapper.find('[data-testid="rematch-waiting"]')
    expect(waiting.exists()).toBe(true)
    expect(waiting.text()).toBe('Waiting for opponent to accept rematch...')
    expect(wrapper.find('[data-testid="rematch-button"]').exists()).toBe(false)
  })

  it('shows opponent rematch notice when opponentRematchRequested is true', () => {
    const wrapper = mount(GameOver, {
      props: {
        ...createDefaultProps(),
        opponentRematchRequested: true,
        rematchRequested: false,
        opponentRevealed: true,
        opponentShips: [{ type: 'destroyer', x: 0, y: 0, orientation: 'h' }],
      },
      global: { stubs: { GridCell: GridCellStub } },
    })
    const notice = wrapper.find('[data-testid="opponent-rematch-notice"]')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toBe('Opponent wants a rematch!')
    expect(wrapper.find('[data-testid="rematch-button"]').exists()).toBe(true)
  })
})
