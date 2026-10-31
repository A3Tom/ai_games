// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GridCell from './GridCell.vue'

function mountCell(overrides: Record<string, unknown> = {}) {
  return mount(GridCell, {
    props: {
      x: 3,
      y: 5,
      state: 'empty' as const,
      interactive: true,
      highlighted: false,
      highlightValid: false,
      ...overrides,
    },
  })
}

describe('GridCell', () => {
  it('renders with correct base class for empty state', () => {
    const wrapper = mountCell()
    expect(wrapper.classes()).toContain('bg-blue-900')
  })

  it('renders ship state', () => {
    const wrapper = mountCell({ state: 'ship' })
    expect(wrapper.classes()).toContain('bg-gray-400')
  })

  it('renders hit state', () => {
    const wrapper = mountCell({ state: 'hit' })
    expect(wrapper.classes()).toContain('bg-red-600')
  })

  it('renders miss state', () => {
    const wrapper = mountCell({ state: 'miss' })
    expect(wrapper.classes()).toContain('bg-blue-400')
  })

  it('renders sunk state', () => {
    const wrapper = mountCell({ state: 'sunk' })
    expect(wrapper.classes()).toContain('bg-red-900')
  })

  it('renders highlight valid override', () => {
    const wrapper = mountCell({ highlighted: true, highlightValid: true })
    expect(wrapper.classes()).toContain('bg-green-500/70')
    expect(wrapper.classes()).not.toContain('bg-blue-900')
  })

  it('renders highlight invalid override', () => {
    const wrapper = mountCell({ highlighted: true, highlightValid: false })
    expect(wrapper.classes()).toContain('bg-red-500/70')
  })

  it('emits cellClick when interactive', async () => {
    const wrapper = mountCell({ interactive: true })
    await wrapper.trigger('click')
    expect(wrapper.emitted('cellClick')).toEqual([[3, 5]])
  })

  it('does not emit cellClick when not interactive', async () => {
    const wrapper = mountCell({ interactive: false })
    await wrapper.trigger('click')
    expect(wrapper.emitted('cellClick')).toBeUndefined()
  })

  it('emits cellHover on mouseenter when interactive', async () => {
    const wrapper = mountCell({ interactive: true })
    await wrapper.trigger('mouseenter')
    expect(wrapper.emitted('cellHover')).toEqual([[3, 5]])
  })

  it('does not emit cellHover when not interactive', async () => {
    const wrapper = mountCell({ interactive: false })
    await wrapper.trigger('mouseenter')
    expect(wrapper.emitted('cellHover')).toBeUndefined()
  })

  it('has cursor-pointer when interactive', () => {
    const wrapper = mountCell({ interactive: true })
    expect(wrapper.classes()).toContain('cursor-pointer')
  })

  it('has cursor-default when not interactive', () => {
    const wrapper = mountCell({ interactive: false })
    expect(wrapper.classes()).toContain('cursor-default')
  })

  it('has aspect-square class', () => {
    const wrapper = mountCell()
    expect(wrapper.classes()).toContain('aspect-square')
  })
})
