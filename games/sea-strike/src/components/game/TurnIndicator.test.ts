// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TurnIndicator from './TurnIndicator.vue'

describe('TurnIndicator', () => {
  it('renders "Your Turn" when isMyTurn is true', () => {
    const wrapper = mount(TurnIndicator, {
      props: { isMyTurn: true },
    })
    expect(wrapper.text()).toContain('Your Turn')
  })

  it('renders "Opponent\'s Turn" when isMyTurn is false', () => {
    const wrapper = mount(TurnIndicator, {
      props: { isMyTurn: false },
    })
    expect(wrapper.text()).toContain("Opponent's Turn")
  })

  it('applies active styling when isMyTurn is true', () => {
    const wrapper = mount(TurnIndicator, {
      props: { isMyTurn: true },
    })
    const root = wrapper.element as HTMLElement
    expect(root.classList.contains('text-green-400')).toBe(true)
    expect(root.classList.contains('font-bold')).toBe(true)
  })

  it('applies inactive styling when isMyTurn is false', () => {
    const wrapper = mount(TurnIndicator, {
      props: { isMyTurn: false },
    })
    const root = wrapper.element as HTMLElement
    expect(root.classList.contains('text-gray-400')).toBe(true)
  })

  it('has aria-live attribute for accessibility', () => {
    const wrapper = mount(TurnIndicator, {
      props: { isMyTurn: true },
    })
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  it('has role="status" attribute', () => {
    const wrapper = mount(TurnIndicator, {
      props: { isMyTurn: true },
    })
    expect(wrapper.attributes('role')).toBe('status')
  })
})
