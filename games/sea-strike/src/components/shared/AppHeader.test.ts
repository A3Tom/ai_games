// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AppHeader from './AppHeader.vue'

const ConnectionStatusStub = {
  name: 'ConnectionStatus',
  template: '<div data-testid="connection-status-stub"></div>',
}

describe('AppHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders ConnectionStatus in the header', () => {
    const wrapper = mount(AppHeader, {
      global: { stubs: { ConnectionStatus: ConnectionStatusStub } },
    })
    expect(wrapper.find('[data-testid="connection-status-stub"]').exists()).toBe(true)
  })

  it('maintains existing header content alongside ConnectionStatus', () => {
    const wrapper = mount(AppHeader, {
      global: { stubs: { ConnectionStatus: ConnectionStatusStub } },
    })
    expect(wrapper.find('h1').text()).toBe('Sea Strike')
    expect(wrapper.find('[data-testid="connection-status-stub"]').exists()).toBe(true)
  })
})
