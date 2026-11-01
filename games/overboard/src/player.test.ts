// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'

test('only launches for the parent, releases held keys and reports runtime failure once', async () => {
  document.body.innerHTML = '<div id="game"></div>'
  const send = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  await import('./player')
  expect(send).toHaveBeenCalledWith({ source: 'overboard-player', type: 'loaded', detail: undefined }, location.origin)
  const disc = { url: `${location.origin}/disc.zip`, name: 'disc.zip', size: 100 }
  window.dispatchEvent(new MessageEvent('message', { origin: 'https://untrusted.invalid', source: window, data: { type: 'overboard-start', disc } }))
  expect(document.querySelector('script')).toBeNull()
  window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { type: 'overboard-start', disc } }))
  expect(document.querySelector('script')?.src).toContain('/emulator/loader.js')
  window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { type: 'overboard-start', disc } }))
  expect(document.querySelectorAll('script')).toHaveLength(1)

  const game = document.getElementById('game')!
  const releases: number[] = []
  game.addEventListener('keyup', (event) => releases.push(event.keyCode))
  game.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, bubbles: true }))
  window.dispatchEvent(new Event('blur'))
  window.dispatchEvent(new Event('blur'))
  expect(releases).toEqual([38])

  game.innerHTML = '<div class="ejs_loading_text">Download Game Data 42%</div>'
  await Promise.resolve()
  expect(send.mock.calls.some(([message]) => message.type === 'error')).toBe(false)
  const loading = game.firstElementChild!
  loading.textContent = 'Error downloading core'
  loading.classList.add('ejs_error_text')
  await Promise.resolve()
  const errors = () => send.mock.calls.map(([message]) => message).filter((message) => message.type === 'error')
  expect(errors()).toEqual([{ source: 'overboard-player', type: 'error', detail: 'Error downloading core' }])
  window.dispatchEvent(new ErrorEvent('error', { message: 'Repeated error' }))
  loading.textContent = 'Repeated DOM error'
  await Promise.resolve()
  expect(errors()).toHaveLength(1)
  send.mockRestore()
})

test('assigns controllers present before the core starts without duplicates or replacing player choices', async () => {
  const { assignConnectedGamepads } = await import('./player')
  const updateGamepadLabels = vi.fn()
  const emulator = {
    gamepad: { gamepads: [{ id: 'Standard Pad', index: 0 }, { id: 'Standard Pad', index: 1 }] },
    gamepadSelection: ['', '', '', ''],
    updateGamepadLabels,
  }
  assignConnectedGamepads(undefined)
  assignConnectedGamepads(emulator)
  expect(emulator.gamepadSelection).toEqual(['Standard Pad_0', 'Standard Pad_1', '', ''])
  assignConnectedGamepads(emulator)
  expect(emulator.gamepadSelection).toEqual(['Standard Pad_0', 'Standard Pad_1', '', ''])
  expect(updateGamepadLabels).toHaveBeenCalledTimes(1)

  emulator.gamepadSelection = ['', 'Standard Pad_0', '', '']
  assignConnectedGamepads(emulator)
  expect(emulator.gamepadSelection).toEqual(['Standard Pad_1', 'Standard Pad_0', '', ''])
  expect(updateGamepadLabels).toHaveBeenCalledTimes(2)
})
