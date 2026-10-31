import '../../../shared/game-shell.js'
import './style.css'
import { loadEngine, type PinballEngine } from './engine'
import { LeaderboardApi, type ScoreEntry } from './leaderboard'
import {
  loadBundledResources,
  loadLocalResources,
  type ResourceFile,
} from './resources'
import { setupFullscreen } from './fullscreen'

const soundIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>'
const pauseIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
const playIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <div class="arcade">
    <header class="masthead">
      <div><h1>Space Cadet <span>Pinball</span> <span class="solo-badge">1 player</span></h1>
        <p class="intro">The classic table. Your next high score.</p></div>
      <a class="scores-link" href="#high-scores">High scores <span aria-hidden="true">↓</span></a>
    </header>
    <div class="flightdeck">
      <section class="table-panel" aria-label="Pinball game">
        <div class="toolbar">
          <button id="new-game" class="button primary" disabled>Start game</button>
          <div class="toolbar-actions">
            <button id="sound" class="tool-button" aria-label="Mute sound" title="Mute sound (M)" aria-pressed="false" disabled>${soundIcon}<span class="control-label">Sound on</span></button>
            <button id="pause" class="tool-button" aria-label="Pause game" title="Pause game (P)" aria-pressed="false" disabled>${pauseIcon}<span class="control-label">Pause</span></button>
            <button id="fullscreen" class="tool-button expand-button" aria-pressed="false">Expand</button>
          </div>
        </div>
        <div id="stage" class="stage">
          <canvas id="canvas" width="600" height="416" tabindex="0" aria-label="Space Cadet Pinball. Arrow keys move flippers; hold Space and release to launch." hidden></canvas>
          <div id="resource-card" class="resource-card">
            <span class="loading-orbit" aria-hidden="true">✦</span><h2 id="resource-title">Getting the table ready</h2>
            <p id="load-status" role="status">Loading game resources…</p>
            <div id="resource-actions" hidden><button id="choose-folder" class="button primary">Choose game folder</button>
              <button id="choose-files" class="text-button">Select individual files</button>
              <p class="small">Choose the resource folder containing PINBALL.DAT or CADET.DAT and the sound files. Your files stay in this browser.</p></div>
            <input id="folder-input" type="file" webkitdirectory multiple hidden />
            <input id="files-input" type="file" multiple accept=".dat,.wav,.mid,.mds" hidden />
          </div>
          <div id="pause-notice" class="pause-notice" hidden><span>Game paused</span><button id="resume" class="button primary">Resume game</button></div>
        </div>
        <div class="touch-controls" aria-label="Game controls">
          <button id="left-flipper" data-action="0" disabled><span class="control-arrow" aria-hidden="true">←</span><span>Left flipper</span></button>
          <button id="launch" data-action="2" disabled><span>Launch</span><small>Hold & release</small></button>
          <button id="right-flipper" data-action="1" disabled><span>Right flipper</span><span class="control-arrow" aria-hidden="true">→</span></button>
        </div>
        <div class="under-table"><span id="table-status" role="status">Preparing engine</span><button id="nudge" class="text-button" data-action="3" disabled>Nudge <kbd>N</kbd></button></div>
        <dialog id="restart-dialog" class="confirm-dialog" aria-labelledby="restart-title">
          <h2 id="restart-title">Start a new game?</h2><p id="restart-message">Your current game will end.</p>
          <div class="confirm-actions"><button id="cancel-restart" class="button secondary" autofocus>Keep playing</button><button id="confirm-restart" class="button primary">New game</button></div>
        </dialog>
      </section>
      <p class="play-hint"><span class="keyboard-hint"><kbd>←</kbd> <kbd>→</kbd> flippers <span>·</span> Hold <kbd>Space</kbd> to launch <span>·</span> <kbd>P</kbd> pause</span><span class="touch-hint">Hold Launch, then release. Tap the flippers to keep the ball in play.</span></p>
      <aside class="instruments">
        <section id="result" class="instrument result" hidden><p class="eyebrow">GAME OVER</p><h2>Nice run, cadet.</h2>
          <p id="final-score" class="final-score">0</p><form id="score-form"><label for="pilot-name">Your callsign</label>
            <div class="save-row"><input id="pilot-name" name="name" maxlength="16" value="CADET" autocomplete="nickname" required /><button id="save-score" class="button primary" type="submit" disabled>Save</button></div></form>
          <p id="save-status" class="small" role="status"></p><button id="play-again" class="text-button">Play again →</button></section>
        <section id="high-scores" class="instrument" aria-labelledby="scores-title"><div class="section-label"><div><p class="eyebrow">THE SCOREBOARD</p><h2 id="scores-title">High scores</h2></div><button id="refresh-scores" class="text-button refresh-button" aria-label="Refresh high scores">↻</button></div>
          <p class="board-heading"><span>Player</span><span>Score</span></p><ol id="leaderboard"></ol>
          <p id="board-status" class="small" role="status">Loading high scores…</p><p class="server-note"><i id="server-dot"></i> Shared leaderboard</p></section>
        <details class="instrument controls-guide"><summary>How to play <span aria-hidden="true">+</span></summary>
          <p class="small">Hold the launcher to pull back the plunger, then release to send the ball up the table. Use the flippers to keep it in play.</p>
          <dl><div><dt>Flippers</dt><dd><kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd></dd></div>
            <div><dt>Plunger</dt><dd>Hold & release <kbd>SPACE</kbd></dd></div><div><dt>Nudge</dt><dd><kbd>N</kbd></dd></div>
            <div><dt>Pause / sound</dt><dd><kbd>P</kbd> / <kbd>M</kbd></dd></div></dl>
          <p class="small">Follow the missions on the table’s display. Complete a game to save your score here.</p></details>
        <p class="credits">Original game by Cinematronics and Microsoft. Engine port by Andrey Muzychenko.<br />
          <a href="./engine-LICENSE.txt">Engine license</a></p>
      </aside>
    </div>
  </div>`

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}
// SDL2's browser backend addresses #canvas when sizing its drawing buffer.
const canvas = element<HTMLCanvasElement>('canvas')
const newGame = element<HTMLButtonElement>('new-game')
const pauseButton = element<HTMLButtonElement>('pause')
const soundButton = element<HTMLButtonElement>('sound')
const saveButton = element<HTMLButtonElement>('save-score')
const status = element('table-status')
const loadStatus = element('load-status')
const panel = document.querySelector<HTMLElement>('.table-panel')!
const restartDialog = element<HTMLDialogElement>('restart-dialog')
const api = new LeaderboardApi()
let engine: PinballEngine | undefined
let ready = false
let loading = false
let failed = false
let playing = false
let paused = false
let sound = true
let generation = 0
let runId: string | undefined
let runPending = false
let finishedScore: number | undefined
let eligible = false
let saved = false
let saving = false
let refreshGeneration = 0
let pausedBeforeRestart = false
const held = new Map<number, Set<string>>()
const controls = [
  ...document.querySelectorAll<HTMLButtonElement>('[data-action]'),
]
const nameInput = element<HTMLInputElement>('pilot-name')
try {
  nameInput.value = localStorage.getItem('pinball-callsign') || 'CADET'
} catch {
  /* Storage is optional. */
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'
}
function renderScores(scores: ScoreEntry[]) {
  const list = element('leaderboard')
  list.replaceChildren()
  for (const [index, entry] of scores.entries()) {
    const row = document.createElement('li')
    const rank = document.createElement('span')
    rank.className = 'position'
    rank.textContent = String(index + 1).padStart(2, '0')
    const name = document.createElement('span')
    name.className = 'callsign'
    name.textContent = entry.name
    const score = document.createElement('strong')
    score.textContent = entry.score.toLocaleString()
    row.append(rank, name, score)
    list.append(row)
  }
  if (!scores.length) {
    const row = document.createElement('li')
    row.className = 'empty-score'
    row.textContent = 'First flight? Set the score to beat.'
    list.append(row)
  }
}
async function refreshScores() {
  const current = ++refreshGeneration
  element<HTMLButtonElement>('refresh-scores').disabled = true
  try {
    const scores = await api.list()
    if (current !== refreshGeneration) return
    renderScores(scores)
    element('board-status').textContent =
      'Top ten flights, saved on the server.'
    element('server-dot').classList.add('online')
  } catch (error) {
    if (current !== refreshGeneration) return
    element('board-status').textContent = message(error)
    element('server-dot').classList.remove('online')
  } finally {
    if (current === refreshGeneration)
      element<HTMLButtonElement>('refresh-scores').disabled = false
  }
}
function syncSave() {
  saveButton.disabled =
    finishedScore === undefined ||
    !eligible ||
    !runId ||
    saved ||
    saving ||
    failed
  if (saved) return
  if (finishedScore !== undefined) {
    element('save-status').textContent = !eligible
      ? 'This run used the demo or cheat controls and cannot be submitted.'
      : runPending
        ? 'Registering your flight with the score server…'
        : !runId
          ? 'This flight could not connect to the score server. Start a new game to try again.'
          : 'Save your final score to the shared leaderboard.'
  }
}
function input(action: number, source: string, pressed: boolean) {
  const sources = held.get(action) || new Set<string>()
  const wasHeld = sources.size > 0
  if (pressed && playing && !paused && !failed) sources.add(source)
  else sources.delete(source)
  held.set(action, sources)
  const isHeld = sources.size > 0
  if (wasHeld !== isHeld) engine?._pinball_input(action, Number(isHeld))
  controls
    .filter((button) => Number(button.dataset.action) === action)
    .forEach((button) => button.classList.toggle('held', isHeld))
}
function releaseControls() {
  for (const [action, sources] of held) {
    if (sources.size) engine?._pinball_input(action, 0)
    sources.clear()
  }
  controls.forEach((button) => button.classList.remove('held'))
}
function syncControls() {
  newGame.disabled = !ready || failed
  pauseButton.disabled = !ready || !playing || failed
  soundButton.disabled = !ready || failed
  controls.forEach((button) => {
    button.disabled = !ready || !playing || paused || failed
  })
  pauseButton.innerHTML = `${paused ? playIcon : pauseIcon}<span class="control-label">${paused ? 'Resume' : 'Pause'}</span>`
  pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game')
  pauseButton.title = `${paused ? 'Resume' : 'Pause'} game (P)`
  pauseButton.setAttribute('aria-pressed', String(paused))
  element('pause-notice').hidden = !paused || !playing || failed
}
function reflectPause(value: boolean) {
  paused = value
  if (paused) releaseControls()
  if (playing)
    status.textContent = paused ? 'Flight paused' : 'Mission in progress'
  syncControls()
}
function pause(value: boolean) {
  if (!ready || !playing || failed) return
  engine?._pinball_pause(Number(value))
  reflectPause(value)
}
function fail(text: string) {
  failed = true
  ready = false
  releaseControls()
  element('resource-card').hidden = false
  element('resource-title').textContent = 'The table could not start.'
  element('resource-actions').hidden = true
  loadStatus.textContent = text
  status.textContent = 'Reload the page to try again'
  syncControls()
  syncSave()
}
function onRunStart() {
  const current = ++generation
  runId = undefined
  runPending = true
  finishedScore = undefined
  saved = false
  saving = false
  eligible = false
  playing = true
  paused = false
  releaseControls()
  element('result').hidden = true
  newGame.textContent = 'New game'
  status.textContent = 'Mission in progress'
  syncControls()
  void api
    .startRun()
    .then((id) => {
      if (current !== generation) return
      runId = id
    })
    .catch(() => {
      if (current === generation && playing)
        status.textContent = 'Mission in progress · server scores unavailable'
    })
    .finally(() => {
      if (current !== generation) return
      runPending = false
      syncSave()
    })
}
function onGameOver(score: number, canSubmit: boolean) {
  if (
    !playing ||
    !Number.isSafeInteger(score) ||
    score < 0 ||
    score > 1_000_000_000
  )
    return
  playing = false
  paused = false
  releaseControls()
  finishedScore = score
  eligible = canSubmit
  element('final-score').textContent = score.toLocaleString()
  element('result').hidden = false
  saveButton.textContent = 'Save'
  status.textContent = 'Flight complete'
  syncControls()
  syncSave()
  // The score form lives beside the table, so bring it back into view after play.
  const current = generation
  void fullscreen.exit().then((exited) => {
    if (current !== generation) return
    if (!exited) {
      status.textContent = 'Game over · exit full screen to save your score'
      return
    }
    element('result').scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    nameInput.focus({ preventScroll: true })
  })
}
async function boot(resources: ResourceFile[]) {
  if (loading || engine || failed) return
  loading = true
  element('resource-actions').hidden = true
  loadStatus.textContent = 'Starting Space Cadet…'
  try {
    engine = await loadEngine(canvas, resources, {
      onReady() {
        ready = true
        element('resource-card').hidden = true
        canvas.hidden = false
        status.textContent = 'Ready for launch · choose Start game'
        syncControls()
      },
      onRunStart,
      onGameOver,
      onPause: reflectPause,
      onError: fail,
    })
    canvas.hidden = false
    engine.callMain([])
    if (!ready && !failed)
      fail(
        'The engine did not start. Reload and choose the complete game resource folder.',
      )
  } catch (error) {
    fail(message(error))
  } finally {
    loading = false
  }
}
function beginGame() {
  if (!ready || failed) return
  engine?._pinball_new_game()
  canvas.focus({ preventScroll: true })
  if (
    matchMedia('(max-width: 760px)').matches &&
    !panel.classList.contains('is-expanded') &&
    !document.fullscreenElement
  )
    panel.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
function startGame() {
  if (!ready || failed || restartDialog.open) return
  if (playing || (finishedScore !== undefined && eligible && runId && !saved)) {
    pausedBeforeRestart = paused
    pause(true)
    element('restart-message').textContent = playing
      ? 'Your current game will end.'
      : 'Your final score has not been saved yet.'
    element('cancel-restart').textContent = playing
      ? 'Keep playing'
      : 'Back to score'
    restartDialog.showModal()
    return
  }
  beginGame()
}
function toggleSound() {
  if (!ready || failed) return
  sound = !sound
  engine?._pinball_sound(Number(sound))
  soundButton.querySelector('.control-label')!.textContent = sound
    ? 'Sound on'
    : 'Sound off'
  soundButton.setAttribute('aria-label', sound ? 'Mute sound' : 'Unmute sound')
  soundButton.title = `${sound ? 'Mute' : 'Unmute'} sound (M)`
  soundButton.setAttribute('aria-pressed', String(!sound))
}
const fullscreen = setupFullscreen(
  panel,
  element<HTMLButtonElement>('fullscreen'),
)
panel.addEventListener('pinballviewchange', releaseControls)
newGame.addEventListener('click', startGame)
element('play-again').addEventListener('click', startGame)
element('cancel-restart').addEventListener('click', () => restartDialog.close())
element('confirm-restart').addEventListener('click', () => {
  restartDialog.close('restart')
  beginGame()
})
restartDialog.addEventListener('close', () => {
  if (restartDialog.returnValue !== 'restart') {
    pause(pausedBeforeRestart)
    if (playing) canvas.focus({ preventScroll: true })
    else nameInput.focus({ preventScroll: true })
  }
  restartDialog.returnValue = ''
})
pauseButton.addEventListener('click', () => pause(!paused))
element('resume').addEventListener('click', () => {
  pause(false)
  canvas.focus({ preventScroll: true })
})
soundButton.addEventListener('click', toggleSound)
element('refresh-scores').addEventListener('click', () => void refreshScores())
element<HTMLFormElement>('score-form').addEventListener(
  'submit',
  async (event) => {
    event.preventDefault()
    if (saveButton.disabled || !runId || finishedScore === undefined) return
    const current = generation
    const name = nameInput.value.trim()
    if (
      !name ||
      name.length > 16 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(name)
    ) {
      element('save-status').textContent =
        'Enter a callsign of 1–16 characters.'
      return
    }
    saving = true
    syncSave()
    element('save-status').textContent = 'Saving your flight…'
    try {
      const result = await api.submit(runId, name, finishedScore)
      if (current !== generation) return
      ++refreshGeneration
      element<HTMLButtonElement>('refresh-scores').disabled = false
      renderScores(result.scores)
      element('server-dot').classList.add('online')
      element('board-status').textContent =
        'Top ten flights, saved on the server.'
      saved = true
      saveButton.textContent = 'Saved'
      element('save-status').textContent =
        'Flight saved. Ready for another mission?'
      try {
        localStorage.setItem('pinball-callsign', name)
      } catch {
        /* Storage is optional. */
      }
    } catch (error) {
      if (current !== generation) return
      element('save-status').textContent = message(error)
    } finally {
      if (current === generation) {
        saving = false
        saveButton.disabled = saved || !eligible || !runId || failed
      }
    }
  },
)

for (const button of controls) {
  const action = Number(button.dataset.action)
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    if (button.disabled) return
    button.setPointerCapture(event.pointerId)
    input(action, `pointer:${event.pointerId}`, true)
  })
  const release = (event: PointerEvent) =>
    input(action, `pointer:${event.pointerId}`, false)
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', release)
  button.addEventListener('keydown', (event) => {
    if (event.code !== 'Enter' && event.code !== 'Space') return
    event.preventDefault()
    if (!event.repeat) input(action, `button:${event.code}`, true)
  })
}
const actions: Record<string, number> = {
  ArrowLeft: 0,
  KeyA: 0,
  ArrowRight: 1,
  KeyD: 1,
  Space: 2,
  KeyN: 3,
}
window.addEventListener(
  'keydown',
  (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return
    if (restartDialog.open) return
    if (
      event.code === 'Escape' &&
      (panel.classList.contains('is-expanded') || document.fullscreenElement)
    )
      return
    if (
      event.target instanceof HTMLButtonElement &&
      ['Enter', 'Space'].includes(event.code)
    )
      return
    if (
      !(event.code in actions) &&
      !['KeyP', 'Escape', 'KeyM', 'F2'].includes(event.code)
    )
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (event.code in actions)
      input(actions[event.code], `key:${event.code}`, true)
    else if (event.code === 'KeyM') toggleSound()
    else if (event.code === 'F2') startGame()
    else pause(!paused)
  },
  true,
)
window.addEventListener(
  'keyup',
  (event) => {
    if (event.code in actions) {
      input(actions[event.code], `key:${event.code}`, false)
      for (const action of held.keys())
        input(action, `button:${event.code}`, false)
      if (
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLButtonElement && event.code === 'Space')
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    } else if (event.code === 'Enter') {
      for (const action of held.keys()) input(action, 'button:Enter', false)
    }
  },
  true,
)
window.addEventListener('blur', () => {
  releaseControls()
  pause(true)
})
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseControls()
    pause(true)
  }
})
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault()
  fail('The graphics context was lost. Reload the page to restart the table.')
})
for (const [button, inputId] of [
  ['choose-folder', 'folder-input'],
  ['choose-files', 'files-input'],
]) {
  element(button).addEventListener('click', () =>
    element<HTMLInputElement>(inputId).click(),
  )
  element<HTMLInputElement>(inputId).addEventListener(
    'change',
    async (event) => {
      const input = event.currentTarget as HTMLInputElement
      if (!input.files?.length || loading || engine) return
      loadStatus.textContent = 'Reading game resources…'
      try {
        await boot(await loadLocalResources([...input.files]))
      } catch (error) {
        loadStatus.textContent = message(error)
      }
      input.value = ''
    },
  )
}
void refreshScores()
void loadBundledResources(new URL('./game-data/', document.baseURI).href)
  .then((resources) => {
    if (resources) return boot(resources)
    loadStatus.textContent =
      'Select your game resource folder to load the classic table.'
    element('resource-actions').hidden = false
  })
  .catch((error) => {
    loadStatus.textContent = message(error)
    element('resource-actions').hidden = false
  })
