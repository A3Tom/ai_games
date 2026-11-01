// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../shared/game-shell.js', () => ({}))

let resolveManifest: (response: Response) => void
let rejectManifest: (reason: Error) => void
let cleanupPageListeners = () => {}
let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let getGamepads: ReturnType<typeof vi.fn>

const bundledManifest = {
  version: 1,
  title: 'Overboard! (Europe)',
  file: 'overboard-europe.zip',
  size: 640 * 1048576,
  tracks: 31,
}

function get<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

function chooseFile(id: string, file: File): void {
  const input = get<HTMLInputElement>(id)
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function playerFrame(): HTMLIFrameElement {
  return get('screen').querySelector('iframe')!
}

function playerMessage(type: string, detail?: string, overrides: MessageEventInit = {}): void {
  window.dispatchEvent(new MessageEvent('message', {
    origin: location.origin,
    source: playerFrame().contentWindow,
    data: { source: 'overboard-player', type, detail },
    ...overrides,
  }))
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 5; index++) await Promise.resolve()
}

async function useBundledDisc(): Promise<void> {
  resolveManifest(new Response(JSON.stringify(bundledManifest)))
  await flushAsync()
  expect(get<HTMLButtonElement>('play').disabled).toBe(false)
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="app"></div>'
  document.head.innerHTML = `<base href="${location.origin}/ai_games/overboard/">`
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve, reject) => {
    resolveManifest = resolve
    rejectManifest = reject
  })))
  createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
  revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL
    static revokeObjectURL = revokeObjectURL
  })
  getGamepads = vi.fn(() => [])
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: getGamepads })

  const windowListeners = vi.spyOn(window, 'addEventListener')
  const documentListeners = vi.spyOn(document, 'addEventListener')
  cleanupPageListeners = () => {
    for (const [type, listener, options] of windowListeners.mock.calls) window.removeEventListener(type, listener, options)
    for (const [type, listener, options] of documentListeners.mock.calls) document.removeEventListener(type, listener, options)
  }
  await import('./main')
})

afterEach(() => {
  cleanupPageListeners()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Overboard disc loading', () => {
  it.each(['success', 'failure'] as const)('keeps a selected local disc when the pending bundled check finishes with %s', async (outcome) => {
    chooseFile('disc-file', new File(['disc'], 'my-disc.zip'))
    if (outcome === 'success') resolveManifest(new Response(JSON.stringify(bundledManifest)))
    else rejectManifest(new Error('Network unavailable'))
    await flushAsync()

    expect(get('media-status').textContent).toContain('Local disc ready')
    expect(get<HTMLButtonElement>('play').disabled).toBe(false)
    get('play').click()
    const send = vi.spyOn(playerFrame().contentWindow!, 'postMessage')
    playerMessage('loaded')
    expect(send).toHaveBeenCalledWith({
      type: 'overboard-start',
      disc: { url: 'blob:my-disc.zip', name: 'my-disc.zip', size: 4, biosUrl: undefined },
    }, location.origin)
  })

  it('recovers from a missing bundle by accepting a local disc without a page reload', async () => {
    resolveManifest(new Response(null, { status: 404 }))
    await flushAsync()
    expect(get<HTMLDetailsElement>('setup').open).toBe(true)
    expect(get<HTMLButtonElement>('play').disabled).toBe(true)
    expect(get('media-status').textContent).toContain('No game disc is bundled')

    chooseFile('disc-file', new File(['disc'], 'disc.zip'))
    expect(get<HTMLButtonElement>('play').disabled).toBe(false)
    get('play').click()
    expect(playerFrame().src).toBe(`${location.origin}/ai_games/overboard/player.html`)
  })

  it('explains a missing disc when a static server returns its HTML fallback', async () => {
    resolveManifest(new Response('<!doctype html><title>Overboard!</title>', { headers: { 'Content-Type': 'text/html' } }))
    await flushAsync()
    expect(get('media-status').textContent).toContain('No game disc is bundled')
    expect(get<HTMLDetailsElement>('setup').open).toBe(true)
  })

  it('rejects invalid replacement media without discarding the selected disc', () => {
    chooseFile('disc-file', new File(['good'], 'disc.zip'))
    chooseFile('disc-file', new File(['partial'], 'track.bin'))
    expect(get('setup-message').textContent).toContain('every .bin track')
    expect(get('selected-disc').textContent).toBe('disc.zip')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('passes a local BIOS to the player and revokes it when another BIOS is selected', async () => {
    await useBundledDisc()
    chooseFile('bios-file', new File([new Uint8Array(512 * 1024)], 'first-bios.bin'))
    chooseFile('bios-file', new File([new Uint8Array(512 * 1024)], 'second-bios.bin'))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first-bios.bin')
    get('play').click()
    const send = vi.spyOn(playerFrame().contentWindow!, 'postMessage')
    playerMessage('loaded')
    expect(send.mock.calls[0][0].disc.biosUrl).toBe('blob:second-bios.bin')
  })

  it('keeps a local BIOS selected while a bundled BIOS manifest is still loading', async () => {
    chooseFile('bios-file', new File([new Uint8Array(512 * 1024)], 'my-bios.bin'))
    resolveManifest(new Response(JSON.stringify({ ...bundledManifest, bios: 'bundled-bios.bin' })))
    await flushAsync()
    expect(get('selected-bios').textContent).toBe('my-bios.bin')
    get('play').click()
    const send = vi.spyOn(playerFrame().contentWindow!, 'postMessage')
    playerMessage('loaded')
    expect(send.mock.calls[0][0].disc.biosUrl).toBe('blob:my-bios.bin')
  })
})

describe('Overboard player lifecycle', () => {
  it('shares the disc only with messages from the active player and the current origin', async () => {
    await useBundledDisc()
    get('play').click()
    const send = vi.spyOn(playerFrame().contentWindow!, 'postMessage')
    playerMessage('loaded', undefined, { origin: 'https://other.example' })
    playerMessage('loaded', undefined, { source: window })
    playerMessage('loaded', undefined, { data: { source: 'another-player', type: 'loaded' } })
    expect(send).not.toHaveBeenCalled()
    playerMessage('loaded')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].disc.url).toBe(`${location.origin}/ai_games/overboard/game-data/overboard-europe.zip`)
    expect(send.mock.calls[0][1]).toBe(location.origin)
  })

  it('offers a fresh player after a boot failure and ignores a late error from the discarded frame', async () => {
    await useBundledDisc()
    get('play').click()
    const firstFrame = playerFrame()
    const firstWindow = firstFrame.contentWindow
    playerMessage('error', 'WebAssembly failed to load')
    expect(firstFrame.hidden).toBe(true)
    expect(get('launch-card').hidden).toBe(false)
    expect(get<HTMLButtonElement>('play').disabled).toBe(false)
    expect(get('setup-message').textContent).toBe('WebAssembly failed to load')

    get('play').click()
    expect(playerFrame()).not.toBe(firstFrame)
    expect(firstFrame.isConnected).toBe(false)
    playerMessage('error', 'Old frame error', { source: firstWindow })
    expect(get('player-status').textContent).toBe('Loading the original disc…')
    expect(get('setup-message').textContent).toBe('')
    playerMessage('started')
    expect(get('player-status').textContent).toContain('At sea')
    vi.advanceTimersByTime(60000)
    expect(get('player-status').textContent).toContain('At sea')
  })

  it('keeps an active player when the user cancels a disc replacement', async () => {
    await useBundledDisc()
    get('play').click()
    const frame = playerFrame()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    chooseFile('disc-file', new File(['other'], 'another-disc.zip'))
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(playerFrame()).toBe(frame)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('updates the connection indicator when a controller disconnects', () => {
    getGamepads.mockReturnValue([null, { connected: true, id: 'USB controller' }])
    window.dispatchEvent(new Event('gamepadconnected'))
    expect(get('controller-status').textContent).toBe('Controller connected · USB controller')
    getGamepads.mockReturnValue([null, { connected: false, id: 'USB controller' }])
    window.dispatchEvent(new Event('gamepaddisconnected'))
    expect(get('controller-status').textContent).toContain('Keyboard ready')
  })
})
