// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useConnectionStore } from '../../stores/connection'
import ReconnectionOverlay from './ReconnectionOverlay.vue'

describe('ReconnectionOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountWithState(overrides: Partial<{
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    reconnectAttempts: number
  }>) {
    const store = useConnectionStore()
    if (overrides.status !== undefined) store.status = overrides.status
    if (overrides.reconnectAttempts !== undefined) store.reconnectAttempts = overrides.reconnectAttempts
    return mount(ReconnectionOverlay)
  }

  it('is not rendered when connected', () => {
    const wrapper = mountWithState({ status: 'connected' })
    expect(wrapper.find('[data-testid="reconnecting-overlay"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="disconnected-overlay"]').exists()).toBe(false)
  })

  it('shows reconnecting overlay when status is reconnecting', () => {
    const wrapper = mountWithState({ status: 'reconnecting', reconnectAttempts: 3 })
    expect(wrapper.find('[data-testid="reconnecting-overlay"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Reconnecting...')
  })

  it('shows attempt count when reconnecting', () => {
    const wrapper = mountWithState({ status: 'reconnecting', reconnectAttempts: 5 })
    const attemptText = wrapper.find('[data-testid="reconnect-attempt-count"]')
    expect(attemptText.exists()).toBe(true)
    expect(attemptText.text()).toContain('5')
  })

  it('shows disconnected overlay when status is disconnected', () => {
    const wrapper = mountWithState({ status: 'disconnected' })
    expect(wrapper.find('[data-testid="disconnected-overlay"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Connection Lost')
  })

  it('shows retry button when disconnected', () => {
    const wrapper = mountWithState({ status: 'disconnected' })
    expect(wrapper.find('[data-testid="retry-button"]').exists()).toBe(true)
  })

  it('retry button triggers reconnection reset', async () => {
    const store = useConnectionStore()
    store.status = 'disconnected'
    store.reconnectAttempts = 7

    const wrapper = mount(ReconnectionOverlay)
    await wrapper.find('[data-testid="retry-button"]').trigger('click')

    expect(store.status).toBe('reconnecting')
    expect(store.reconnectAttempts).toBe(0)
  })
})
