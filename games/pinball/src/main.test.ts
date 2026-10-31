// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { EngineCallbacks, PinballEngine } from './engine'

const mocks = vi.hoisted(() => ({
  loadEngine: vi.fn(),
  loadBundledResources: vi.fn(),
  loadLocalResources: vi.fn(),
  list: vi.fn(),
  startRun: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('../../../shared/game-shell.js', () => ({}))
vi.mock('./engine', () => ({ loadEngine: mocks.loadEngine }))
vi.mock('./resources', () => ({
  loadBundledResources: mocks.loadBundledResources,
  loadLocalResources: mocks.loadLocalResources,
}))
vi.mock('./leaderboard', () => ({
  LeaderboardApi: class {
    list = mocks.list
    startRun = mocks.startRun
    submit = mocks.submit
  },
}))

let callbacks: EngineCallbacks
let engine: PinballEngine
let panel: HTMLElement
let coarsePointer: boolean
let fullscreenElement: Element | null
let requestFullscreen: ReturnType<typeof vi.fn>
let exitFullscreen: ReturnType<typeof vi.fn>
let cleanupPageListeners = () => {}
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

function get<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

async function expand() {
  get<HTMLButtonElement>('fullscreen').click()
  await vi.waitFor(() =>
    expect(get('fullscreen').getAttribute('aria-pressed')).toBe('true'),
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function pointer(id: string, type: string, pointerId: number) {
  const target = get<HTMLButtonElement>(id)
  target.setPointerCapture = vi.fn()
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  target.dispatchEvent(event)
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="app"></div>'
  document.body.className = ''
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  })
  coarsePointer = true
  fullscreenElement = null
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse') && coarsePointer,
    })),
  )
  const windowListeners = vi.spyOn(window, 'addEventListener')
  const documentListeners = vi.spyOn(document, 'addEventListener')
  cleanupPageListeners = () => {
    for (const [type, listener, options] of windowListeners.mock.calls)
      window.removeEventListener(type, listener, options)
    for (const [type, listener, options] of documentListeners.mock.calls)
      document.removeEventListener(type, listener, options)
    windowListeners.mockRestore()
    documentListeners.mockRestore()
  }

  engine = {
    FS: { mkdirTree: vi.fn(), writeFile: vi.fn(), chdir: vi.fn() },
    callMain: vi.fn(() => {
      callbacks.onReady()
      return 0
    }),
    _pinball_input: vi.fn(),
    _pinball_new_game: vi.fn(() => callbacks.onRunStart()),
    _pinball_pause: vi.fn(),
    _pinball_sound: vi.fn(),
  }
  mocks.loadEngine.mockImplementation(
    async (_canvas, _resources, handlers: EngineCallbacks) => {
      callbacks = handlers
      return engine
    },
  )
  mocks.loadBundledResources.mockResolvedValue([
    { path: 'PINBALL.DAT', data: new Uint8Array([1]) },
  ])
  mocks.list.mockResolvedValue([])
  mocks.startRun.mockResolvedValue('run-1')
  const entry = {
    id: 'run-1',
    name: 'PILOT',
    score: 123456,
    createdAt: '2026-01-01T00:00:00Z',
  }
  mocks.submit.mockResolvedValue({ entry, scores: [entry] })

  await import('./main')
  await vi.waitFor(() =>
    expect(get<HTMLButtonElement>('new-game').disabled).toBe(false),
  )
  panel = document.querySelector('.table-panel')!
  const dialog = get<HTMLDialogElement>('restart-dialog')
  // jsdom has no dialog top layer; model its browser API while exercising the
  // application's real confirmation, pause, and restart handlers.
  dialog.showModal = vi.fn(() => {
    dialog.open = true
    get('cancel-restart').focus()
  })
  dialog.close = vi.fn((returnValue?: string) => {
    dialog.open = false
    dialog.returnValue = returnValue ?? ''
    dialog.dispatchEvent(new Event('close'))
  })
  requestFullscreen = vi.fn(async () => {
    fullscreenElement = panel
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  exitFullscreen = vi.fn(async () => {
    fullscreenElement = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  panel.requestFullscreen = requestFullscreen
  document.exitFullscreen = exitFullscreen
})

afterEach(() => {
  // main.ts owns page-lifetime listeners. Remove each imported instance so tests
  // exercise a fresh page rather than invoking handlers from earlier runs.
  cleanupPageListeners()
  vi.unstubAllGlobals()
})

afterAll(() => {
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    )
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('pinball play interface', () => {
  it.each(['expanded', 'native'] as const)(
    'reveals an accessible, working score form after a game ends in %s view',
    async (mode) => {
      coarsePointer = mode === 'expanded'
      await expand()
      const start = get<HTMLButtonElement>('new-game')
      expect(panel.contains(start)).toBe(true)
      expect(start.disabled).toBe(false)
      start.click()
      await vi.waitFor(() => expect(mocks.startRun).toHaveBeenCalledTimes(1))
      expect(engine._pinball_new_game).toHaveBeenCalledTimes(1)

      callbacks.onGameOver(123456, true)

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(get('pilot-name')),
      )
      expect(get('result').hidden).toBe(false)
      expect(get('final-score').textContent?.replace(/\D/g, '')).toBe('123456')
      expect(get('fullscreen').getAttribute('aria-pressed')).toBe('false')
      expect(document.body.classList.contains('pinball-expanded')).toBe(false)
      expect(fullscreenElement).toBe(null)
      expect(get<HTMLButtonElement>('save-score').disabled).toBe(false)
      if (mode === 'native') expect(exitFullscreen).toHaveBeenCalledTimes(1)
      else expect(requestFullscreen).not.toHaveBeenCalled()

      get<HTMLInputElement>('pilot-name').value = 'PILOT'
      get('score-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await vi.waitFor(() =>
        expect(get('save-score').textContent).toBe('Saved'),
      )
      expect(mocks.submit).toHaveBeenCalledWith('run-1', 'PILOT', 123456)
      expect(get('leaderboard').textContent).toContain('PILOT')
      expect(get<HTMLButtonElement>('save-score').disabled).toBe(true)
    },
  )

  it('keeps Exit usable when the engine fails during expanded play', async () => {
    get<HTMLButtonElement>('new-game').click()
    await expand()

    callbacks.onError('The graphics context was lost.')

    const exit = get<HTMLButtonElement>('fullscreen')
    expect(get('load-status').textContent).toBe(
      'The graphics context was lost.',
    )
    expect(get<HTMLButtonElement>('new-game').disabled).toBe(true)
    expect(exit.disabled).toBe(false)
    exit.click()
    await vi.waitFor(() =>
      expect(exit.getAttribute('aria-pressed')).toBe('false'),
    )
    expect(document.body.classList.contains('pinball-expanded')).toBe(false)
  })

  it('lets a player cancel or confirm a restart without leaving expanded play', async () => {
    await expand()
    const start = get<HTMLButtonElement>('new-game')
    start.click()
    start.click()

    const dialog = get<HTMLDialogElement>('restart-dialog')
    expect(dialog.open).toBe(true)
    expect(panel.contains(dialog)).toBe(true)
    expect(engine._pinball_new_game).toHaveBeenCalledTimes(1)
    expect(engine._pinball_pause).toHaveBeenLastCalledWith(1)
    get<HTMLButtonElement>('cancel-restart').click()
    expect(dialog.open).toBe(false)
    expect(engine._pinball_pause).toHaveBeenLastCalledWith(0)
    expect(engine._pinball_new_game).toHaveBeenCalledTimes(1)
    expect(panel.classList.contains('is-expanded')).toBe(true)

    start.click()
    get<HTMLButtonElement>('confirm-restart').click()
    expect(dialog.open).toBe(false)
    expect(engine._pinball_new_game).toHaveBeenCalledTimes(2)
    expect(panel.classList.contains('is-expanded')).toBe(true)
  })

  it('protects an unsaved final score when another game is requested', async () => {
    get<HTMLButtonElement>('new-game').click()
    callbacks.onGameOver(123456, true)
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(get('pilot-name')),
    )

    get<HTMLButtonElement>('play-again').click()
    expect(get<HTMLDialogElement>('restart-dialog').open).toBe(true)
    expect(get('restart-message').textContent).toContain('not been saved')
    expect(engine._pinball_new_game).toHaveBeenCalledTimes(1)
    get<HTMLButtonElement>('cancel-restart').click()
    expect(document.activeElement).toBe(get('pilot-name'))
    expect(get<HTMLButtonElement>('save-score').disabled).toBe(false)
    expect(get('result').hidden).toBe(false)
  })

  it('holds both flippers independently and releases them when changing the play view', async () => {
    get<HTMLButtonElement>('new-game').click()
    pointer('left-flipper', 'pointerdown', 1)
    pointer('right-flipper', 'pointerdown', 2)
    expect(engine._pinball_input).toHaveBeenCalledWith(0, 1)
    expect(engine._pinball_input).toHaveBeenCalledWith(1, 1)
    expect(get('left-flipper').classList.contains('held')).toBe(true)
    expect(get('right-flipper').classList.contains('held')).toBe(true)

    await expand()

    expect(engine._pinball_input).toHaveBeenCalledWith(0, 0)
    expect(engine._pinball_input).toHaveBeenCalledWith(1, 0)
    expect(get('left-flipper').classList.contains('held')).toBe(false)
    expect(get('right-flipper').classList.contains('held')).toBe(false)
    // The original pointers can still end after the view change without sending
    // duplicate releases or leaving the next press stuck.
    vi.mocked(engine._pinball_input).mockClear()
    pointer('left-flipper', 'pointerup', 1)
    pointer('right-flipper', 'pointerup', 2)
    expect(engine._pinball_input).not.toHaveBeenCalled()
    pointer('left-flipper', 'pointerdown', 3)
    pointer('left-flipper', 'pointerup', 3)
    expect(engine._pinball_input).toHaveBeenNthCalledWith(1, 0, 1)
    expect(engine._pinball_input).toHaveBeenNthCalledWith(2, 0, 0)
  })
})
