// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupFullscreen } from './fullscreen'

let controller: ReturnType<typeof setupFullscreen> | undefined
let panel: HTMLElement
let button: HTMLButtonElement
let request: ReturnType<typeof vi.fn>
let exit: ReturnType<typeof vi.fn>
let fullscreenElement: Element | null

function changeFullscreen(element: Element | null) {
  fullscreenElement = element
  document.dispatchEvent(new Event('fullscreenchange'))
}

async function click() {
  button.click()
  await vi.waitFor(() =>
    expect(button.getAttribute('aria-pressed')).toBe(
      String(
        panel.classList.contains('is-expanded') || fullscreenElement === panel,
      ),
    ),
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  document.body.innerHTML = `<a id="outside" href="#">All games</a>
    <section aria-label="Pinball game"><button id="start">Start game</button>
      <button id="fullscreen">Full screen</button><div hidden><button>Hidden control</button></div>
    </section>`
  panel = document.querySelector('section')!
  button = document.querySelector('#fullscreen')!
  fullscreenElement = null
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  })
  request = vi.fn(async () => changeFullscreen(panel))
  exit = vi.fn(async () => changeFullscreen(null))
  panel.requestFullscreen = request
  document.exitFullscreen = exit
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    configurable: true,
    value: 0,
  })
})

afterEach(() => {
  controller?.destroy()
  controller = undefined
  document.body.className = ''
  vi.unstubAllGlobals()
})

describe('pinball fullscreen', () => {
  it.each(['touchscreen', 'secondary coarse pointer'])(
    'uses expanded play with a fine primary pointer and a %s',
    async (input) => {
      Object.defineProperty(window.navigator, 'maxTouchPoints', {
        value: input === 'touchscreen' ? 1 : 0,
      })
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches:
            input === 'secondary coarse pointer' &&
            query === '(any-pointer: coarse)',
        })),
      )
      controller = setupFullscreen(panel, button)
      await click()
      expect(request).not.toHaveBeenCalled()
      expect(panel.classList.contains('is-expanded')).toBe(true)
      expect(button.getAttribute('aria-label')).toBe('Exit expanded view')
    },
  )

  it('expands touch play without triggering a browser fullscreen notice and restores the page on exit', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    vi.stubGlobal('scrollX', 12)
    vi.stubGlobal('scrollY', 260)
    document.body.className = 'existing-theme'
    const changed = vi.fn()
    panel.addEventListener('pinballviewchange', changed)
    controller = setupFullscreen(panel, button)

    await click()
    expect(request).not.toHaveBeenCalled()
    expect(panel.classList.contains('is-expanded')).toBe(true)
    expect(document.body.classList.contains('pinball-expanded')).toBe(true)
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(button.textContent).toBe('Exit')
    expect(button.getAttribute('aria-label')).toBe('Exit expanded view')

    await click()
    expect(panel.classList.contains('is-expanded')).toBe(false)
    expect(document.body.className).toBe('existing-theme')
    expect(panel.hasAttribute('role')).toBe(false)
    expect(panel.hasAttribute('aria-modal')).toBe(false)
    expect(window.scrollTo).toHaveBeenCalledWith({
      left: 12,
      top: 260,
      behavior: 'instant',
    })
    expect(document.activeElement).toBe(button)
    expect(button.textContent).toBe('Expand')
    expect(button.getAttribute('aria-label')).toBe('Expand game')
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('keeps the native fullscreen button synchronized when the browser enters or exits independently', async () => {
    controller = setupFullscreen(panel, button)
    await click()
    expect(request).toHaveBeenCalledTimes(1)
    expect(panel.classList.contains('is-expanded')).toBe(false)
    expect(button.textContent).toBe('Exit')
    expect(button.getAttribute('aria-label')).toBe('Exit full screen')

    changeFullscreen(null)
    expect(button.textContent).toBe('Expand')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(document.activeElement).toBe(button)

    await click()
    await click()
    expect(exit).toHaveBeenCalledTimes(1)
    expect(button.textContent).toBe('Expand')
  })

  it.each(['unavailable', 'disabled', 'rejected'])(
    'falls back to expanded view when native fullscreen is %s',
    async (failure) => {
      if (failure === 'unavailable')
        Object.defineProperty(panel, 'requestFullscreen', { value: undefined })
      if (failure === 'disabled')
        Object.defineProperty(document, 'fullscreenEnabled', { value: false })
      if (failure === 'rejected')
        request.mockRejectedValue(new TypeError('Fullscreen denied'))
      controller = setupFullscreen(panel, button)
      await click()
      await vi.waitFor(() =>
        expect(panel.classList.contains('is-expanded')).toBe(true),
      )
      expect(button.textContent).toBe('Exit')
      expect(button.getAttribute('aria-label')).toBe('Exit expanded view')
    },
  )

  it('ignores repeated taps while a native fullscreen request is pending', async () => {
    let resolveRequest!: () => void
    request.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve
        }),
    )
    controller = setupFullscreen(panel, button)
    button.click()
    button.click()
    expect(request).toHaveBeenCalledTimes(1)
    changeFullscreen(panel)
    resolveRequest()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await click()
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('contains keyboard focus in expanded play and supports Escape without losing page state', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    document.body.classList.add('pinball-expanded')
    panel.setAttribute('role', 'region')
    panel.setAttribute('aria-modal', 'false')
    controller = setupFullscreen(panel, button)
    await click()
    const start = document.querySelector<HTMLButtonElement>('#start')!

    button.focus()
    button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(document.activeElement).toBe(start)
    start.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(document.activeElement).toBe(button)
    document.querySelector<HTMLElement>('#outside')!.focus()
    expect(document.activeElement).toBe(button)

    button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(panel.classList.contains('is-expanded')).toBe(false)
    expect(panel.getAttribute('role')).toBe('region')
    expect(panel.getAttribute('aria-modal')).toBe('false')
    expect(document.body.classList.contains('pinball-expanded')).toBe(true)
    document.querySelector<HTMLElement>('#outside')!.focus()
    expect(document.activeElement?.id).toBe('outside')
  })

  it('excludes closed dialogs from the focus cycle and lets an open dialog own Escape and Tab', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const dialog = document.createElement('dialog')
    dialog.innerHTML = '<button>Confirm restart</button>'
    panel.append(dialog)
    controller = setupFullscreen(panel, button)
    await click()

    button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(document.activeElement?.id).toBe('start')

    dialog.open = true
    const confirm = dialog.querySelector('button')!
    confirm.focus()
    for (const key of ['Escape', 'Tab']) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      })
      confirm.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(panel.classList.contains('is-expanded')).toBe(true)
    }
  })

  it.each(['native', 'expanded'])(
    'can leave %s view when a game ends so the score form is reachable',
    async (mode) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: mode === 'expanded' })),
      )
      controller = setupFullscreen(panel, button)
      await click()

      expect(await controller.exit()).toBe(true)
      expect(fullscreenElement).toBe(null)
      expect(panel.classList.contains('is-expanded')).toBe(false)
      expect(button.getAttribute('aria-pressed')).toBe('false')
      document.querySelector<HTMLElement>('#outside')!.focus()
      expect(document.activeElement?.id).toBe('outside')
    },
  )

  it('reports a rejected native exit so the caller can keep a visible exit cue', async () => {
    controller = setupFullscreen(panel, button)
    await click()
    exit.mockRejectedValue(new Error('Browser refused to exit'))

    expect(await controller.exit()).toBe(false)
    expect(button.textContent).toBe('Exit')
    expect(button.getAttribute('aria-label')).toBe('Exit full screen')
  })

  it('waits for an in-flight native entry before a game-over exit', async () => {
    let finishEntry!: () => void
    request.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishEntry = () => {
            changeFullscreen(panel)
            resolve()
          }
        }),
    )
    controller = setupFullscreen(panel, button)
    button.click()
    const exited = controller.exit()
    expect(exit).not.toHaveBeenCalled()
    finishEntry()

    expect(await exited).toBe(true)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(fullscreenElement).toBe(null)
    expect(button.textContent).toBe('Expand')
  })
})
