// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GameStatus from './GameStatus.vue'
import type { PlacedShip } from '../../types/game'
import { FLEET_CONFIG } from '../../constants/ships'

const mockShips: PlacedShip[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'h' },
  { type: 'battleship', x: 0, y: 1, orientation: 'h' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'h' },
  { type: 'submarine', x: 0, y: 3, orientation: 'h' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'h' },
]

describe('GameStatus', () => {
  it('renders all 5 ship names for player fleet', () => {
    const wrapper = mount(GameStatus, {
      props: { myShips: mockShips, mySunkShips: [], opponentSunkShips: [] },
    })
    for (const ship of FLEET_CONFIG) {
      expect(wrapper.text()).toContain(ship.name)
    }
  })

  it('renders all 5 ship names for enemy fleet', () => {
    const wrapper = mount(GameStatus, {
      props: { myShips: mockShips, mySunkShips: [], opponentSunkShips: [] },
    })
    const html = wrapper.html()
    // Each ship name appears twice (once per fleet section)
    for (const ship of FLEET_CONFIG) {
      const regex = new RegExp(ship.name, 'g')
      const matches = html.match(regex)
      expect(matches?.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('marks player ship as sunk with line-through', () => {
    const wrapper = mount(GameStatus, {
      props: { myShips: mockShips, mySunkShips: ['destroyer'], opponentSunkShips: [] },
    })
    // Find all ship name spans — the first fleet section's "Destroyer" should have line-through
    const shipNames = wrapper.findAll('span.text-sm')
    const destroyerSpans = shipNames.filter((s) => s.text() === 'Destroyer')
    // First occurrence is in "Your Fleet"
    expect(destroyerSpans[0]?.classes()).toContain('line-through')
  })

  it('marks opponent ship as sunk with line-through', () => {
    const wrapper = mount(GameStatus, {
      props: { myShips: mockShips, mySunkShips: [], opponentSunkShips: ['carrier'] },
    })
    const shipNames = wrapper.findAll('span.text-sm')
    const carrierSpans = shipNames.filter((s) => s.text() === 'Carrier')
    // Second occurrence is in "Enemy Fleet"
    expect(carrierSpans[1]?.classes()).toContain('line-through')
  })

  it('shows correct remaining count', () => {
    const wrapper = mount(GameStatus, {
      props: {
        myShips: mockShips,
        mySunkShips: ['destroyer', 'submarine'],
        opponentSunkShips: [],
      },
    })
    expect(wrapper.text()).toContain('3 / 5')
  })

  it('active ships do not have line-through', () => {
    const wrapper = mount(GameStatus, {
      props: { myShips: mockShips, mySunkShips: [], opponentSunkShips: [] },
    })
    const shipNames = wrapper.findAll('span.text-sm')
    for (const span of shipNames) {
      expect(span.classes()).not.toContain('line-through')
    }
  })
})
