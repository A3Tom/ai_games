// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GameView from './GameView.vue'
import { useGameStore } from '../stores/game'
import { GAME_PHASES } from '../types/game'

const mockDisconnect = vi.fn()
const mockSendReady = vi.fn()
const mockSendShot = vi.fn()

vi.mock('../composables/useGameProtocol', () => ({
  useGameProtocol: () => ({
    sendReady: mockSendReady,
    sendCommit: vi.fn(),
    sendShot: mockSendShot,
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

const PlayerBoardStub = {
  name: 'PlayerBoard',
  template: '<div class="player-board-stub"></div>',
  props: ['board', 'ships'],
}
const OpponentBoardStub = {
  name: 'OpponentBoard',
  template: '<div class="opponent-board-stub"></div>',
  props: ['board', 'isMyTurn', 'canFire'],
  emits: ['fire'],
}
const TurnIndicatorStub = {
  name: 'TurnIndicator',
  template: '<div class="turn-indicator-stub"></div>',
  props: ['isMyTurn'],
}
const GameStatusStub = {
  name: 'GameStatus',
  template: '<div class="game-status-stub"></div>',
  props: ['myShips', 'mySunkShips', 'opponentSunkShips'],
}

const battleStubs = {
  PlayerBoard: PlayerBoardStub,
  OpponentBoard: OpponentBoardStub,
  TurnIndicator: TurnIndicatorStub,
  GameStatus: GameStatusStub,
}

function transitionToBattle(): void {
  const store = useGameStore()
  store.startSetup()
  store.commitBoard('a'.repeat(64), new Uint8Array(32))
  store.receiveOpponentCommit('b'.repeat(64))
  store.startBattle()
}

describe('GameView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDisconnect.mockClear()
    mockSendReady.mockClear()
    mockSendShot.mockClear()
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

  it('battle phase renders all four components', () => {
    transitionToBattle()

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
      global: { stubs: battleStubs },
    })
    expect(wrapper.find('.player-board-stub').exists()).toBe(true)
    expect(wrapper.find('.opponent-board-stub').exists()).toBe(true)
    expect(wrapper.find('.turn-indicator-stub').exists()).toBe(true)
    expect(wrapper.find('.game-status-stub').exists()).toBe(true)
  })

  it('battle phase does not render SetupPhase', () => {
    transitionToBattle()

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
      global: { stubs: battleStubs },
    })
    expect(wrapper.findComponent({ name: 'SetupPhase' }).exists()).toBe(false)
  })

  it('PlayerBoard receives myBoard and myShips as props', () => {
    transitionToBattle()
    const store = useGameStore()

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
      global: { stubs: battleStubs },
    })
    const playerBoard = wrapper.findComponent(PlayerBoardStub)
    expect(playerBoard.props('board')).toEqual(store.myBoard)
    expect(playerBoard.props('ships')).toEqual(store.myShips)
  })

  it('OpponentBoard receives correct props', () => {
    transitionToBattle()
    const store = useGameStore()

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
      global: { stubs: battleStubs },
    })
    const opponentBoard = wrapper.findComponent(OpponentBoardStub)
    expect(opponentBoard.props('board')).toEqual(store.opponentBoard)
    expect(opponentBoard.props('isMyTurn')).toBe(store.isMyTurn)
    expect(opponentBoard.props('canFire')).toBe(store.canFire)
  })

  it('fire event triggers gameStore.fireShot', async () => {
    transitionToBattle()
    const store = useGameStore()
    // Ensure it's player's turn so fireShot proceeds
    // isHost is false by default in test, so isMyTurn is false after startBattle
    // We need to set isMyTurn to true — use a ship placement to make fireShot work
    // Actually, startBattle sets isMyTurn based on isHost. In tests, connectionStore.isHost defaults to false, so isMyTurn = false.
    // Directly set for test purposes:
    store.$patch({ isMyTurn: true })

    const wrapper = mount(GameView, {
      props: { roomId: 'test1234' },
      global: { stubs: battleStubs },
    })

    const opponentBoard = wrapper.findComponent(OpponentBoardStub)
    await opponentBoard.vm.$emit('fire', 3, 4)
    await wrapper.vm.$nextTick()

    // fireShot should have added a placeholder shot
    expect(store.shotHistory.length).toBe(1)
    expect(store.shotHistory[0]?.x).toBe(3)
    expect(store.shotHistory[0]?.y).toBe(4)
  })

  it('shows placeholder for GAMEOVER phase', () => {
    const store = useGameStore()
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
