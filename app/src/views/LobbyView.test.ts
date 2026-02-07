// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'

import LobbyView from './LobbyView.vue'
import CreateRoom from '../components/lobby/CreateRoom.vue'
import JoinRoom from '../components/lobby/JoinRoom.vue'

const mockPush = vi.fn()
vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: mockPush,
    }),
  }
})

describe('LobbyView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders CreateRoom and JoinRoom components', () => {
    const wrapper = shallowMount(LobbyView)
    expect(wrapper.findComponent(CreateRoom).exists()).toBe(true)
    expect(wrapper.findComponent(JoinRoom).exists()).toBe(true)
  })

  it('navigates to game on roomCreated', async () => {
    const wrapper = shallowMount(LobbyView)
    wrapper.findComponent(CreateRoom).vm.$emit('roomCreated', 'abc12345')
    await wrapper.vm.$nextTick()

    expect(mockPush).toHaveBeenCalledWith({ name: 'game', params: { roomId: 'abc12345' } })
  })

  it('navigates to game on roomJoined', async () => {
    const wrapper = shallowMount(LobbyView)
    wrapper.findComponent(JoinRoom).vm.$emit('roomJoined', 'k7m2x9pq')
    await wrapper.vm.$nextTick()

    expect(mockPush).toHaveBeenCalledWith({ name: 'game', params: { roomId: 'k7m2x9pq' } })
  })

  it('has descriptive heading', () => {
    const wrapper = shallowMount(LobbyView)
    const heading = wrapper.find('h2')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('Create or Join')
  })
})
