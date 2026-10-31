// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import CreateRoom from './CreateRoom.vue'

vi.mock('../../composables/useCrypto', () => ({
  useCrypto: vi.fn(() => ({
    isAvailable: true,
    commitBoard: vi.fn(),
    verifyBoard: vi.fn(),
  })),
}))

vi.mock('../../utils/room-id', () => ({
  generateRoomId: vi.fn(() => 'abc12345'),
}))

import { useCrypto } from '../../composables/useCrypto'
import { generateRoomId } from '../../utils/room-id'

describe('CreateRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCrypto).mockReturnValue({
      isAvailable: true,
      commitBoard: vi.fn(),
      verifyBoard: vi.fn(),
    })
  })

  it('renders "Create Game" button', () => {
    const wrapper = mount(CreateRoom)
    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('Create Game')
  })

  it('generates room ID and emits roomCreated on click', async () => {
    const wrapper = mount(CreateRoom)
    await wrapper.find('button').trigger('click')

    expect(generateRoomId).toHaveBeenCalled()
    expect(wrapper.emitted('roomCreated')).toBeTruthy()
    expect(wrapper.emitted('roomCreated')![0]).toEqual(['abc12345'])
  })

  it('displays shareable link after creation', async () => {
    const wrapper = mount(CreateRoom)
    await wrapper.find('button').trigger('click')

    const input = wrapper.find('input[readonly]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toContain('#/game/abc12345')
  })

  it('disables button when crypto is unavailable', () => {
    vi.mocked(useCrypto).mockReturnValue({
      isAvailable: false,
      commitBoard: vi.fn(),
      verifyBoard: vi.fn(),
    })

    const wrapper = mount(CreateRoom)
    const button = wrapper.find('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('secure connection')
  })

  it('copy button calls clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    const wrapper = mount(CreateRoom)
    await wrapper.find('button').trigger('click')

    const copyButton = wrapper.findAll('button').find((b) => b.text() === 'Copy')
    expect(copyButton).toBeTruthy()
    await copyButton!.trigger('click')

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#/game/abc12345'))
  })
})
