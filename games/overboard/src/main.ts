import '../../../shared/game-shell.js'
import './style.css'
import { controllerStatus, readManifest, validateBios, validateLocalDisc, type Disc } from './config'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <main class="harbour">
    <header class="masthead">
      <div><p class="eyebrow">FROM THE PLAYSTATION ARCHIVES · 1997</p><h1>Overboard<span>!</span></h1><p class="intro">A little ship. A lot of trouble.</p></div>
      <div class="edition"><span>ORIGINAL GAME</span><span>EUROPE · PS1</span></div>
    </header>
    <div class="game-layout">
      <section id="play-panel" class="play-panel" aria-label="Overboard game player">
        <div class="toolbar"><span class="signal"><i aria-hidden="true"></i> <span id="player-status" role="status">Checking the cargo…</span></span><button id="expand" type="button" aria-pressed="false">⛶ <span>Expand</span></button></div>
        <div id="screen" class="screen">
          <div id="launch-card" class="launch-card">
            <svg class="ship" viewBox="0 0 240 190" fill="none" aria-hidden="true"><path d="M119 22v113M121 28c27 29 44 51 54 74h-54V28Z" fill="#d8bd87"/><path d="M110 48C85 70 71 92 67 111h43V48Z" fill="#f2dfb0"/><path d="M58 123h128l-27 34H85l-27-34Z" fill="#967649"/><path d="M66 130h111M91 143h61" stroke="#e8ca92" stroke-width="3"/><path d="M120 20h32l-9 10 9 10h-32" fill="#bb674e"/><path d="M31 165c16-13 30 13 46 0s30 13 46 0 30 13 46 0 30 13 44 0" stroke="#4d8586" stroke-width="3" stroke-linecap="round"/></svg>
            <p class="eyebrow">ALL HANDS ON DECK</p><h2 id="launch-title">Your next adventure awaits.</h2>
            <p id="media-status" class="media-status" role="status">Checking for the original game disc…</p>
            <button id="play" type="button" class="primary" disabled>Set sail <span aria-hidden="true">→</span></button>
            <p class="launch-note">Controller or keyboard. Sound on for the full voyage.</p>
          </div>
        </div>
        <div class="player-foot"><span id="controller-status" role="status">Keyboard ready</span><span class="format">4:3 · ORIGINAL ASPECT</span></div>
      </section>
      <aside class="captains-notes">
        <section class="note"><p class="eyebrow">01 / TAKE THE HELM</p><h2>Bring your controller.</h2><p>Connect a USB or Bluetooth gamepad and press a button. Use the D-pad to steer.</p><p class="small">Xbox, PlayStation, and standard browser gamepads. Remap buttons or the left stick in the player’s control settings.</p><dl class="controls"><div><dt>Steer / menu</dt><dd><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></dd></div><div><dt>✕ / □ / ○ / △</dt><dd><kbd>X</kbd><kbd>Z</kbd><kbd>C</kbd><kbd>S</kbd></dd></div><div><dt>Start / Select</dt><dd><kbd>Enter</kbd><kbd>Shift</kbd></dd></div><div><dt>L1 / R1 · L2 / R2</dt><dd><kbd>Q</kbd><kbd>E</kbd> · <kbd>A</kbd><kbd>D</kbd></dd></div></dl><p class="small">Click the game to focus keyboard input. The original game’s menus explain its actions.</p></section>
        <section class="note"><p class="eyebrow">02 / KEEP YOUR PROGRESS</p><h2>Save your voyage.</h2><p>Use the player toolbar to save and load a state, or export a backup. In-game memory cards save to this browser automatically.</p><p class="small">Saves belong to this browser and device. Export a backup before clearing browser data.</p></section>
      </aside>
    </div>
    <details id="setup" class="setup"><summary>Game disc & setup <span>Local files, BIOS, and troubleshooting</span></summary><div class="setup-body"><div><h2>Your game disc</h2><p>The bundled disc starts with Set sail. If no disc is bundled, choose a ZIP containing the CUE sheet and every BIN track, all in one folder. Local files stay in your browser.</p><label class="file-button">Choose disc ZIP<input id="disc-file" type="file" accept=".zip" /></label><span id="selected-disc" class="file-description">No local disc selected</span></div><div><h2>Optional PlayStation BIOS</h2><p>The emulator includes a replacement BIOS. If the game fails to boot, select your own 512 KB European PlayStation BIOS dump before starting.</p><label class="file-button">Choose BIOS<input id="bios-file" type="file" accept=".bin,.rom" /></label><span id="selected-bios" class="file-description">Using built-in replacement BIOS</span></div><p id="setup-message" role="status" class="setup-message"></p></div></details>
    <footer class="page-foot"><span>A complete original-game experience, powered by <a href="https://emulatorjs.org/" target="_blank" rel="noopener noreferrer">EmulatorJS</a>.</span><span>Desktop first. Touch controls are planned.</span></footer>
  </main>`

function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }
const play = element<HTMLButtonElement>('play')
const screen = element<HTMLDivElement>('screen')
const launchCard = element<HTMLDivElement>('launch-card')
const panel = element<HTMLElement>('play-panel')
const status = element<HTMLElement>('player-status')
const mediaStatus = element<HTMLElement>('media-status')
const setupMessage = element<HTMLElement>('setup-message')
let disc: Disc | undefined
let localDiscUrl: string | undefined
let localBiosUrl: string | undefined
let frame: HTMLIFrameElement | undefined
let bootTimeout: ReturnType<typeof setTimeout> | undefined
let active = false

async function findBundledDisc(): Promise<void> {
  try {
    const response = await fetch(new URL('game-data/manifest.json', document.baseURI))
    if (response.status === 404) throw new Error('No game disc is bundled. Choose your disc ZIP below to set sail.')
    if (!response.ok) throw new Error(`Could not check the game disc (HTTP ${response.status}).`)
    if (response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('No game disc is bundled. Choose your disc ZIP below to set sail.')
    }
    const manifest = readManifest(await response.json())
    // A file chosen while the network request was pending takes precedence.
    if (localDiscUrl) return
    disc = {
      url: new URL(`game-data/${manifest.file}`, document.baseURI).href,
      name: manifest.file,
      size: manifest.size,
      biosUrl: manifest.bios ? new URL(`game-data/${manifest.bios}`, document.baseURI).href : undefined,
    }
    mediaStatus.textContent = `Original European disc ready · ${manifest.tracks} tracks · ${Math.round(manifest.size / 1048576)} MB on first load.`
    status.textContent = 'Ready to set sail'
    play.disabled = false
    if (manifest.bios && !localBiosUrl) element('selected-bios').textContent = 'Using bundled PlayStation BIOS'
  } catch (error) {
    if (localDiscUrl) return
    mediaStatus.textContent = error instanceof Error ? error.message : 'Choose your game disc below.'
    status.textContent = 'Game disc needed'
    element<HTMLDetailsElement>('setup').open = true
  }
}

function setError(message: string): void {
  clearTimeout(bootTimeout)
  status.textContent = 'The voyage could not start'
  setupMessage.textContent = message
  element<HTMLDetailsElement>('setup').open = true
  play.disabled = false
  play.textContent = 'Try again →'
  if (frame) {
    frame.hidden = true
    launchCard.hidden = false
    mediaStatus.textContent = message
  }
  active = false
}

play.addEventListener('click', () => {
  if (!disc) return
  frame?.remove()
  clearTimeout(bootTimeout)
  frame = document.createElement('iframe')
  frame.title = 'Overboard! PlayStation game. Click to use keyboard controls.'
  frame.allow = 'autoplay; fullscreen; gamepad'
  frame.src = new URL('player.html', document.baseURI).href
  screen.append(frame)
  launchCard.hidden = true
  active = true
  play.disabled = true
  status.textContent = 'Loading the original disc…'
  setupMessage.textContent = ''
  bootTimeout = setTimeout(() => {
    status.textContent = 'Still loading — the full disc may take a few minutes'
  }, 60000)
})

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow || event.data?.source !== 'overboard-player') return
  if (event.data.type === 'loaded' && disc) {
    frame.contentWindow!.postMessage({ type: 'overboard-start', disc: { ...disc, biosUrl: localBiosUrl || disc.biosUrl } }, location.origin)
  } else if (event.data.type === 'started') {
    clearTimeout(bootTimeout)
    status.textContent = 'At sea · use the player toolbar for saves and settings'
    frame.focus()
  } else if (event.data.type === 'error') {
    setError(typeof event.data.detail === 'string' ? event.data.detail : 'The emulator failed to start.')
  }
})

function resetPlayer(): void {
  clearTimeout(bootTimeout)
  frame?.remove()
  frame = undefined
  active = false
  launchCard.hidden = false
  play.disabled = !disc
  play.textContent = 'Set sail →'
  status.textContent = disc ? 'Ready to set sail' : 'Game disc needed'
}

function mayReplaceMedia(): boolean {
  return !active || window.confirm('Changing game files restarts the player. Save your progress with the player toolbar first. Continue?')
}

element<HTMLInputElement>('disc-file').addEventListener('change', (event) => {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    validateLocalDisc(file)
    if (!mayReplaceMedia()) return
    resetPlayer()
    if (localDiscUrl) URL.revokeObjectURL(localDiscUrl)
    localDiscUrl = URL.createObjectURL(file)
    disc = { url: localDiscUrl, name: file.name, size: file.size, biosUrl: disc?.biosUrl }
    element('selected-disc').textContent = file.name
    mediaStatus.textContent = `Local disc ready · ${Math.round(file.size / 1048576)} MB. Your file stays in this browser.`
    status.textContent = 'Ready to set sail'
    play.disabled = false
    setupMessage.textContent = ''
  } catch (error) {
    setupMessage.textContent = (error as Error).message
  } finally { input.value = '' }
})

element<HTMLInputElement>('bios-file').addEventListener('change', (event) => {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    validateBios(file)
    if (!mayReplaceMedia()) return
    resetPlayer()
    if (localBiosUrl) URL.revokeObjectURL(localBiosUrl)
    localBiosUrl = URL.createObjectURL(file)
    element('selected-bios').textContent = file.name
    setupMessage.textContent = 'BIOS ready. Set sail to start with this BIOS.'
  } catch (error) {
    setupMessage.textContent = (error as Error).message
  } finally { input.value = '' }
})

const expand = element<HTMLButtonElement>('expand')
function updateExpanded(): void {
  const expanded = document.fullscreenElement === panel || panel.classList.contains('expanded')
  expand.textContent = expanded ? '⛶ Exit' : '⛶ Expand'
  expand.setAttribute('aria-pressed', String(expanded))
}
expand.addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen()
  else if (panel.classList.contains('expanded')) panel.classList.remove('expanded')
  else {
    try { await panel.requestFullscreen() }
    catch { panel.classList.add('expanded') }
  }
  updateExpanded()
})
document.addEventListener('fullscreenchange', updateExpanded)
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { panel.classList.remove('expanded'); updateExpanded() }
})

function updateController(): void {
  let message = 'Keyboard ready · gamepad access needs HTTPS or localhost'
  try { if (navigator.getGamepads) message = controllerStatus(Array.from(navigator.getGamepads())) }
  catch { /* The keyboard remains available when browser policy denies gamepads. */ }
  element('controller-status').textContent = message
}
window.addEventListener('gamepadconnected', updateController)
window.addEventListener('gamepaddisconnected', updateController)
setInterval(updateController, 1500)
updateController()
window.addEventListener('beforeunload', (event) => {
  if (active) { event.preventDefault(); event.returnValue = '' }
})
void findBundledDisc()
