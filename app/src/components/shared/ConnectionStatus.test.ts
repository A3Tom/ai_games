// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useConnectionStore } from '../../stores/connection'
import ConnectionStatus from './ConnectionStatus.vue'

describe('ConnectionStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountWithState(overrides: Partial<{
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    peerConnected: boolean
    lastPingMs: number | null
  }>) {
    const store = useConnectionStore()
    if (overrides.status !== undefined) store.status = overrides.status
    if (overrides.peerConnected !== undefined) store.peerConnected = overrides.peerConnected
    if (overrides.lastPingMs !== undefined) store.lastPingMs = overrides.lastPingMs
    return mount(ConnectionStatus)
  }

  it('shows green dot when connected with peer', () => {
    const wrapper = mountWithState({ status: 'connected', peerConnected: true })
    const dot = wrapper.find('[data-testid="status-dot"]')
    expect(dot.classes()).toContain('bg-green-500')
  })

  it('shows yellow dot when reconnecting', () => {
    const wrapper = mountWithState({ status: 'reconnecting' })
    const dot = wrapper.find('[data-testid="status-dot"]')
    expect(dot.classes()).toContain('bg-yellow-500')
  })

  it('shows yellow dot when connected without peer', () => {
    const wrapper = mountWithState({ status: 'connected', peerConnected: false })
    const dot = wrapper.find('[data-testid="status-dot"]')
    expect(dot.classes()).toContain('bg-yellow-500')
  })

  it('shows red dot when disconnected', () => {
    const wrapper = mountWithState({ status: 'disconnected' })
    const dot = wrapper.find('[data-testid="status-dot"]')
    expect(dot.classes()).toContain('bg-red-500')
  })

  it('shows "Opponent connected" when connected with peer', () => {
    const wrapper = mountWithState({ status: 'connected', peerConnected: true })
    const text = wrapper.find('[data-testid="status-text"]')
    expect(text.text()).toBe('Opponent connected')
  })

  it('shows "Waiting for opponent..." when connected without peer', () => {
    const wrapper = mountWithState({ status: 'connected', peerConnected: false })
    const text = wrapper.find('[data-testid="status-text"]')
    expect(text.text()).toBe('Waiting for opponent...')
  })

  it('shows ping latency when connected with value', () => {
    const wrapper = mountWithState({ status: 'connected', lastPingMs: 42 })
    const ping = wrapper.find('[data-testid="ping-latency"]')
    expect(ping.exists()).toBe(true)
    expect(ping.text()).toBe('42ms')
  })

  it('hides ping latency when disconnected', () => {
    const wrapper = mountWithState({ status: 'disconnected', lastPingMs: 42 })
    const ping = wrapper.find('[data-testid="ping-latency"]')
    expect(ping.exists()).toBe(false)
  })
})
