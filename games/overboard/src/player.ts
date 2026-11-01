import { buildEmulatorConfig, type Disc } from './config'

interface PlayerRuntime {
  failedToStart?: boolean
  gamepad?: { gamepads: ({ id: string; index: number; connected?: boolean } | null)[] }
  gamepadSelection?: string[]
  updateGamepadLabels?: () => void
}

// EmulatorJS 4.2.3 starts polling inside GamepadHandler's constructor before
// attaching its connection listener. Controllers already present at launch
// therefore need the same assignment after the core finishes starting.
export function assignConnectedGamepads(emulator: PlayerRuntime | undefined): void {
  if (!emulator?.gamepad || !emulator.gamepadSelection) return
  const selections = emulator.gamepadSelection
  const assigned = new Set(selections.filter(Boolean))
  let changed = false
  for (const pad of emulator.gamepad.gamepads) {
    if (!pad || pad.connected === false) continue
    const identity = `${pad.id}_${pad.index}`
    if (assigned.has(identity)) continue
    const slot = selections.indexOf('')
    if (slot === -1) break
    selections[slot] = identity
    assigned.add(identity)
    changed = true
  }
  if (changed) emulator.updateGamepadLabels?.()
}

function report(type: string, detail?: string): void {
  window.parent.postMessage({ source: 'overboard-player', type, detail }, window.location.origin)
}

let failed = false
function reportError(message: string): void {
  if (failed) return
  failed = true
  report('error', message)
}

// The pinned frontend reports network/core failures by rendering an error
// element rather than firing a documented lifecycle event.
const runtimeWindow = window as typeof window & { EJS_emulator?: PlayerRuntime }
const game = document.querySelector<HTMLElement>('#game')!
const observer = new MutationObserver(() => {
  const error = game.querySelector('.ejs_error_text')
  if (error || runtimeWindow.EJS_emulator?.failedToStart) {
    reportError(error?.textContent?.trim() || 'The emulator could not start. Check the game disc and BIOS in setup.')
  }
})
observer.observe(game, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })

// The native player listens for keyboard releases only while its element has
// focus. Release held buttons when switching tabs or leaving this frame.
const heldKeys = new Map<number, KeyboardEvent>()
game.addEventListener('keydown', (event) => { heldKeys.set(event.keyCode, event) }, true)
game.addEventListener('keyup', (event) => { heldKeys.delete(event.keyCode) }, true)
function releaseKeys(): void {
  const held = [...heldKeys.values()]
  heldKeys.clear()
  for (const event of held) {
    game.dispatchEvent(new KeyboardEvent('keyup', {
      key: event.key, code: event.code, keyCode: event.keyCode, which: event.which, bubbles: true,
    }))
  }
}
window.addEventListener('blur', releaseKeys)
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys() })

let configured = false
window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== window.location.origin || event.source !== window.parent || configured || event.data?.type !== 'overboard-start') return
  const disc: Disc = event.data.disc
  if (!disc || typeof disc.url !== 'string' || typeof disc.name !== 'string') return
  configured = true
  Object.assign(window, buildEmulatorConfig(disc, window.location.href), {
    EJS_ready: () => { assignConnectedGamepads(runtimeWindow.EJS_emulator); report('ready') },
    EJS_onGameStart: () => { assignConnectedGamepads(runtimeWindow.EJS_emulator); report('started') },
  })
  const loader = document.createElement('script')
  loader.src = new URL('emulator/loader.js', window.location.href).href
  loader.onerror = () => reportError('The emulator runtime could not load. Rebuild the game to restore its runtime files.')
  document.body.append(loader)
})
window.addEventListener('error', (event) => reportError(event.message || 'The emulator could not start.'))
window.addEventListener('unhandledrejection', (event) => reportError(String(event.reason)))
report('loaded')
