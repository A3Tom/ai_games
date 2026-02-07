// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GameView from './GameView.vue'
import { useGameStore } from '../stores/game'
import { GAME_PHASES } from '../types/game'

const mockDisconnect = vi.fn()
const mockSendReady = vi.fn()

vi.mock('../composables/useGameProtocol', () => ({
  useGameProtocol: () => ({
    sendReady: mockSendReady,
    sendCommit: vi.fn(),
    sendShot: vi.fn(),
    sendResult: vi.fn(),
    sendReveal: vi.fn(),
    sendRematch: vi.fn(),
    disconnect: mockDisconnect,
  }),
}))

vi.mock('../composables/useCrypto', () => ({
  useCrypto: () => ({
    isAvailable: true,
    commitBoard: vi.fn().mockResolvedValue({
      hash: 'a'.repeat(64),
      salt: new Uint8Array(32),
      saltHex: 'b'.repeat(64),
    }),
    verifyBoard: vi.fn(),
  }),
}))

describe('GameView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDisconnect.mockClear()
    mockSendReady.mockClear()
  })

  it('shows connecting message in LOBBY phase', () => {
    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
    })
    expect(wrapper.text()).toContain('Connecting to room test1234')
  })

  it('renders SetupPhase in SETUP phase', () => {
    const store = useGameStore()
    store.startSetup()

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
    })
    const setupPhase = wrapper.findComponent({ name: 'SetupPhase' })
    expect(setupPhase.exists()).toBe(true)
  })

  it('renders SetupPhase in COMMIT phase', () => {
    const store = useGameStore()
    store.startSetup()
    store.commitBoard('a'.repeat(64), new Uint8Array(32))

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
    })
    expect(store.phase).toBe(GAME_PHASES.COMMIT)
    const setupPhase = wrapper.findComponent({ name: 'SetupPhase' })
    expect(setupPhase.exists()).toBe(true)
  })

  it('shows placeholder for BATTLE phase', () => {
    const store = useGameStore()
    store.startSetup()
    store.commitBoard('a'.repeat(64), new Uint8Array(32))
    store.receiveOpponentCommit('b'.repeat(64))
    store.startBattle()

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
    })
    expect(store.phase).toBe(GAME_PHASES.BATTLE)
    expect(wrapper.text()).toContain('coming in Phase 11')
    expect(wrapper.findComponent({ name: 'SetupPhase' }).exists()).toBe(false)
  })

  it('shows placeholder for GAMEOVER phase', () => {
    const store = useGameStore()
    // Force phase to gameover via the store internals
    store.startSetup()
    store.commitBoard('a'.repeat(64), new Uint8Array(32))
    store.receiveOpponentCommit('b'.repeat(64))
    store.startBattle()
    store.finishGame('me')

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
    })
    expect(wrapper.text()).toContain('coming in Phase 12')
  })
})
