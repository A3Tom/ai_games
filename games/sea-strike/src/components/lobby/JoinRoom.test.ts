// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import JoinRoom from './JoinRoom.vue'

describe('JoinRoom', () => {
  it('renders input and "Join" button', () => {
    const wrapper = mount(JoinRoom)
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('Join')
  })

  it('does not show error before submission attempt', () => {
    const wrapper = mount(JoinRoom)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows error for empty input on submit', async () => {
    const wrapper = mount(JoinRoom)
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[role="alert"]').text()).toContain('required')
    expect(wrapper.emitted('roomJoined')).toBeFalsy()
  })

  it('shows error for wrong length', async () => {
    const wrapper = mount(JoinRoom)
    await wrapper.find('input').setValue('abc')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[role="alert"]').text()).toContain('8 characters')
    expect(wrapper.emitted('roomJoined')).toBeFalsy()
  })

  it('shows error for invalid characters', async () => {
    const wrapper = mount(JoinRoom)
    await wrapper.find('input').setValue('ABCD1234')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.find('[role="alert"]').text()).toContain('lowercase')
    expect(wrapper.emitted('roomJoined')).toBeFalsy()
  })

  it('emits roomJoined for valid input', async () => {
    const wrapper = mount(JoinRoom)
    await wrapper.find('input').setValue('k7m2x9pq')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('roomJoined')).toBeTruthy()
    expect(wrapper.emitted('roomJoined')![0]).toEqual(['k7m2x9pq'])
  })

  it('trims whitespace from input', async () => {
    const wrapper = mount(JoinRoom)
    await wrapper.find('input').setValue('  k7m2x9pq  ')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('roomJoined')).toBeTruthy()
    expect(wrapper.emitted('roomJoined')![0]).toEqual(['k7m2x9pq'])
  })
})
