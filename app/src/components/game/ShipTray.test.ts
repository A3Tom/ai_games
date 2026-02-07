// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ShipTray from './ShipTray.vue'
import { FLEET_CONFIG } from '../../constants/ships'
import type { PlacedShip } from '../../types/game'

function mountTray(placedShips: PlacedShip[] = []) {
  return mount(ShipTray, {
    props: {
      ships: [...FLEET_CONFIG],
      placedShips,
    },
  })
}

describe('ShipTray', () => {
  it('renders all 5 ships', () => {
    const wrapper = mountTray()
    const entries = wrapper.findAll('[class*="flex items-center"]')
    expect(entries).toHaveLength(5)
    expect(wrapper.text()).toContain('Carrier')
    expect(wrapper.text()).toContain('Battleship')
    expect(wrapper.text()).toContain('Cruiser')
    expect(wrapper.text()).toContain('Submarine')
    expect(wrapper.text()).toContain('Destroyer')
  })

  it('placed ships appear muted', () => {
    const wrapper = mountTray([
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
    ])
    const entries = wrapper.findAll('[class*="flex items-center"]')
    const carrierEntry = entries[0]!
    expect(carrierEntry.classes()).toContain('opacity-50')
    expect(carrierEntry.classes()).toContain('cursor-default')
  })

  it('unplaced ships are clickable and emit shipSelected', async () => {
    const wrapper = mountTray()
    const entries = wrapper.findAll('[class*="flex items-center"]')
    // Destroyer is the last entry (index 4)
    await entries[4]!.trigger('click')
    expect(wrapper.emitted('shipSelected')).toEqual([['destroyer']])
  })

  it('placed ships do not emit on click', async () => {
    const wrapper = mountTray([
      { type: 'carrier', x: 0, y: 0, orientation: 'h' },
    ])
    const entries = wrapper.findAll('[class*="flex items-center"]')
    await entries[0]!.trigger('click')
    expect(wrapper.emitted('shipSelected')).toBeUndefined()
  })

  it('ship size indicators render correct count', () => {
    const wrapper = mountTray()
    const entries = wrapper.findAll('[class*="flex items-center"]')
    // Carrier (size 5) — first entry
    const carrierBlocks = entries[0]!.findAll('.h-4.w-4')
    expect(carrierBlocks).toHaveLength(5)
    // Destroyer (size 2) — last entry
    const destroyerBlocks = entries[4]!.findAll('.h-4.w-4')
    expect(destroyerBlocks).toHaveLength(2)
  })

  it('shows placed indicator text for placed ships', () => {
    const wrapper = mountTray([
      { type: 'battleship', x: 0, y: 0, orientation: 'h' },
    ])
    expect(wrapper.text()).toContain('(placed)')
  })
})
