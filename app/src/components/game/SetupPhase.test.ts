// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SetupPhase from './SetupPhase.vue'
import { useGameStore } from '../../stores/game'
import { FLEET_CONFIG } from '../../constants/ships'

const mockCommitBoard = vi.fn().mockResolvedValue({
  hash: 'a'.repeat(64),
  salt: new Uint8Array(32),
  saltHex: 'b'.repeat(64),
})

vi.mock('../../composables/useCrypto', () => ({
  useCrypto: () => ({
    isAvailable: true,
    commitBoard: mockCommitBoard,
    verifyBoard: vi.fn(),
  }),
}))

function placeAllShips(store: ReturnType<typeof useGameStore>): void {
  store.placeShip({ type: 'carrier', x: 0, y: 0, orientation: 'h' })
  store.placeShip({ type: 'battleship', x: 0, y: 1, orientation: 'h' })
  store.placeShip({ type: 'cruiser', x: 0, y: 2, orientation: 'h' })
  store.placeShip({ type: 'submarine', x: 0, y: 3, orientation: 'h' })
  store.placeShip({ type: 'destroyer', x: 0, y: 4, orientation: 'h' })
}

describe('SetupPhase', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useGameStore()
    store.startSetup()
    mockCommitBoard.mockClear()
  })

  it('renders 100 GridCell components', () => {
    const wrapper = mount(SetupPhase)
    const cells = wrapper.findAllComponents({ name: 'GridCell' })
    expect(cells).toHaveLength(100)
  })

  it('renders ShipTray with FLEET_CONFIG', () => {
    const wrapper = mount(SetupPhase)
    const tray = wrapper.findComponent({ name: 'ShipTray' })
    expect(tray.exists()).toBe(true)
    expect(tray.props('ships')).toHaveLength(FLEET_CONFIG.length)
  })

  it('placing a ship updates the board', async () => {
    const store = useGameStore()
    store.placeShip({ type: 'destroyer', x: 0, y: 0, orientation: 'h' })

    const wrapper = mount(SetupPhase)
    await wrapper.vm.$nextTick()

    const cells = wrapper.findAllComponents({ name: 'GridCell' })
    const cell00 = cells.find(
      (c) => c.props('x') === 0 && c.props('y') === 0,
    )
    expect(cell00?.props('state')).toBe('ship')
    const cell10 = cells.find(
      (c) => c.props('x') === 1 && c.props('y') === 0,
    )
    expect(cell10?.props('state')).toBe('ship')
  })

  it('rotation toggle changes orientation', async () => {
    const wrapper = mount(SetupPhase)
    const tray = wrapper.findComponent({ name: 'ShipTray' })
    tray.vm.$emit('shipSelected', 'carrier')
    await wrapper.vm.$nextTick()

    const rotateBtn = wrapper.find('button')
    expect(rotateBtn.text()).toBe('Horizontal')
    await rotateBtn.trigger('click')
    expect(rotateBtn.text()).toBe('Vertical')
  })

  it('clicking a placed ship removes it', async () => {
    const store = useGameStore()
    store.placeShip({ type: 'destroyer', x: 0, y: 0, orientation: 'h' })
    expect(store.myShips).toHaveLength(1)

    const wrapper = mount(SetupPhase)
    await wrapper.vm.$nextTick()

    const cells = wrapper.findAllComponents({ name: 'GridCell' })
    const cell00 = cells.find(
      (c) => c.props('x') === 0 && c.props('y') === 0,
    )
    cell00?.vm.$emit('cellClick', 0, 0)
    await wrapper.vm.$nextTick()

    expect(store.myShips).toHaveLength(0)
  })

  // Ticket 004 tests

  it('ready button is disabled when not all ships placed', () => {
    const wrapper = mount(SetupPhase)
    const readyBtn = wrapper.findAll('button').find((b) => b.text() === 'Ready')
    expect(readyBtn).toBeDefined()
    expect(readyBtn!.attributes('disabled')).toBeDefined()
  })

  it('ready button is enabled when all ships placed', async () => {
    const store = useGameStore()
    placeAllShips(store)

    const wrapper = mount(SetupPhase)
    await wrapper.vm.$nextTick()

    const readyBtn = wrapper.findAll('button').find((b) => b.text() === 'Ready')
    expect(readyBtn).toBeDefined()
    expect(readyBtn!.attributes('disabled')).toBeUndefined()
  })

  it('clicking ready calls commit flow', async () => {
    const store = useGameStore()
    placeAllShips(store)

    const wrapper = mount(SetupPhase)
    await wrapper.vm.$nextTick()

    const readyBtn = wrapper.findAll('button').find((b) => b.text() === 'Ready')
    await readyBtn!.trigger('click')
    await flushPromises()

    expect(mockCommitBoard).toHaveBeenCalledWith(store.myShips)
    expect(store.myCommitHash).toBe('a'.repeat(64))
    expect(wrapper.emitted('boardCommitted')).toBeTruthy()
  })

  it('waiting state shown after commit', async () => {
    const store = useGameStore()
    placeAllShips(store)

    const wrapper = mount(SetupPhase)
    await wrapper.vm.$nextTick()

    const readyBtn = wrapper.findAll('button').find((b) => b.text() === 'Ready')
    await readyBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Waiting for opponent')
    expect(wrapper.findComponent({ name: 'ShipTray' }).exists()).toBe(false)
  })
})
