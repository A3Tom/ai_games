import { loadNative } from './native.mjs'
import { createSceneView } from './scene-view.mjs'
import { createPlayerView } from './player-view.mjs'
import { createControlView } from './control-view.mjs'
import { decodePsh } from './modules/textures.mjs'
import { createMod, validateMod, applyRosterMod } from './modules/mods.mjs'

const $ = (id) => document.getElementById(id)
let manifest, baseRoster, roster, native, mod, catalog, storageKey, sceneView, playerView, controlView
let selectedAsset, container, selectedBitmap, requestNumber = 0
const cache = new Map()
const option = (text, value) => Object.assign(document.createElement('option'), { textContent: text, value: String(value) })
const setStatus = (message, error = false) => {
  $('status').textContent = message
  $('status').classList.toggle('error', error)
}
const on = (id, event, callback) => $(id).addEventListener(event, async () => {
  try { await callback() } catch (error) { setStatus(error.message, true) }
})
async function get(url, type = 'json') {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`)
  return type === 'json' ? response.json() : new Uint8Array(await response.arrayBuffer())
}
async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')
}
const modOptions = () => ({ baseSha256: manifest.baseSha256, textureCatalog: catalog })

function saveMod(candidate, message) {
  const validated = validateMod(candidate, baseRoster, modOptions())
  const updated = applyRosterMod(baseRoster, validated, modOptions())
  mod = validated
  roster = updated
  sceneView?.refresh()
  playerView?.refresh()
  controlView?.refresh()
  try {
    localStorage.setItem(storageKey, JSON.stringify(mod))
    setStatus(message)
  } catch {
    setStatus(`${message} Browser storage is unavailable; export your mod to keep it.`, true)
  }
}
function changeMod(callback, message) {
  const candidate = JSON.parse(JSON.stringify(mod))
  callback(candidate)
  saveMod(candidate, message)
}
function editRecord(list, id, fields) {
  const previous = list.find((entry) => entry.id === id)
  if (previous) Object.assign(previous, fields)
  else list.push({ id, ...fields })
}

function assetLabel(asset) {
  const name = asset.id.toLowerCase()
  const prefix = name.includes('zfplytex') ? 'Player · ' : name.includes('zgaplayr') ? 'Player graphics · ' :
    /zgas_/.test(name) ? 'Stadium · ' : /zfe_/.test(name) ? 'Menu · ' : ''
  return prefix + asset.id
}
function fillAssets() {
  const previous = $('asset').value
  const query = $('asset-search').value.toLowerCase()
  $('asset').replaceChildren(...manifest.textures.filter((entry) => assetLabel(entry).toLowerCase().includes(query))
    .map((entry) => option(assetLabel(entry), entry.id)))
  if ([...$('asset').options].some((entry) => entry.value === previous)) $('asset').value = previous
  else if ($('asset').options.length) $('asset').selectedIndex = 0
}
async function selectAsset() {
  const entry = manifest.textures.find((asset) => asset.id === $('asset').value)
  const request = ++requestNumber
  selectedAsset = null; container = null; selectedBitmap = null
  $('bitmap').replaceChildren(); $('palette-index').replaceChildren()
  $('preview').getContext('2d').clearRect(0, 0, $('preview').width, $('preview').height)
  $('texture-detail').textContent = ''
  const controls = ['bitmap', 'zoom', 'palette-index', 'palette-colour', 'palette-reset']
  controls.forEach((id) => { $(id).disabled = true })
  if (!entry) { setStatus('No texture containers match your search.'); return }
  setStatus('Loading original texture data…')
  let decoded = cache.get(entry.sourceSha256)
  try {
    if (!decoded) {
      const bytes = await get(entry.path, 'bytes')
      if (await hash(bytes) !== entry.sourceSha256) throw new Error('Texture checksum mismatch; prepare the browser files again.')
      decoded = decodePsh(bytes)
      cache.set(entry.sourceSha256, decoded)
      if (cache.size > 3) cache.delete(cache.keys().next().value)
    }
  } catch (error) {
    if (request === requestNumber) throw error
    return
  }
  if (request !== requestNumber) return
  selectedAsset = entry
  container = decoded
  $('bitmap').replaceChildren(...decoded.textures.map((texture) => option(`${texture.name} · ${texture.width} × ${texture.height} · #${texture.index}`, texture.index)))
  selectBitmap()
  controls.forEach((id) => { $(id).disabled = false })
  setStatus('Original texture decoded. Pixel conversion runs in native WebAssembly.')
}
function paletteOverride() {
  return mod.textures.find((entry) => entry.sourceSha256 === selectedAsset.sourceSha256 && entry.textureIndex === selectedBitmap.index)
}
function currentPalette() {
  const edited = paletteOverride()
  return edited ? Uint16Array.from(edited.palette) : selectedBitmap.palette
}
function selectBitmap() {
  selectedBitmap = container.textures[Number($('bitmap').value)]
  const usedColours = [...new Set(selectedBitmap.indices ?? [])].sort((left, right) => left - right)
  $('palette-index').replaceChildren(...usedColours.map((index) => option(`#${index}`, index)))
  renderBitmap()
  updateColour()
}
function renderBitmap() {
  if (!selectedBitmap) return
  const pixels = native.render(selectedBitmap, currentPalette())
  const canvas = $('preview')
  canvas.width = selectedBitmap.width
  canvas.height = selectedBitmap.height
  canvas.style.width = `${canvas.width * Number($('zoom').value)}px`
  canvas.style.height = 'auto'
  const context = canvas.getContext('2d')
  context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0)
  canvas.dataset.renderer = 'native-wasm'
  $('texture-detail').textContent = `${selectedAsset.id} / ${selectedBitmap.name} · ${canvas.width} × ${canvas.height} · ${selectedBitmap.bitsPerPixel}-bit indexed colour${selectedBitmap.compressed ? ' · RefPack decoded' : ''}${paletteOverride() ? ' · edited palette' : ''}`
}
function updateColour() {
  if (!selectedBitmap?.palette) return
  const word = currentPalette()[Number($('palette-index').value)]
  const channel = (value) => ((value << 3) | (value >> 2)).toString(16).padStart(2, '0')
  $('palette-colour').value = `#${channel(word & 31)}${channel((word >> 5) & 31)}${channel((word >> 10) & 31)}`
}
function saveColour() {
  const index = Number($('palette-index').value)
  const palette = Array.from(currentPalette())
  const rgb = $('palette-colour').value.slice(1).match(/../g).map((value) => Math.round(parseInt(value, 16) * 31 / 255))
  let word = (palette[index] & 0x8000) | rgb[0] | (rgb[1] << 5) | (rgb[2] << 10)
  if (word === 0 && palette[index] !== 0) word = 0x8000
  palette[index] = word
  changeMod((candidate) => {
    const existing = candidate.textures.find((entry) => entry.sourceSha256 === selectedAsset.sourceSha256 && entry.textureIndex === selectedBitmap.index)
    if (existing) existing.palette = palette
    else candidate.textures.push({ sourceSha256: selectedAsset.sourceSha256, textureIndex: selectedBitmap.index, palette })
  }, 'Palette saved locally. Export a mod to keep a copy.')
  renderBitmap()
}

function fillTeams(selected = Number($('team').value)) {
  const query = $('team-search').value.toLowerCase()
  $('team').replaceChildren(...roster.teams.filter((team) => team.name.toLowerCase().includes(query))
    .map((team) => option(team.name, team.id)))
  if ([...$('team').options].some((entry) => Number(entry.value) === selected)) $('team').value = selected
  else if ($('team').options.length) $('team').selectedIndex = 0
}
function selectedTeam() { return roster.teams.find((team) => team.id === Number($('team').value)) }
function selectTeam() {
  const team = selectedTeam()
  if (!team) { $('squad').replaceChildren(); $('team-name').value = ''; return }
  $('team-name').value = team.name
  const players = new Map(roster.players.map((player) => [player.id, player]))
  $('squad').replaceChildren(...team.squadSlots.map((id, index) => {
    const row = document.createElement('div')
    row.className = 'squad-row'
    const slot = document.createElement('span')
    slot.className = 'slot'; slot.textContent = String(index + 1).padStart(2, '0')
    const player = players.get(id)
    const name = document.createElement('button')
    name.type = 'button'; name.textContent = player?.name ?? 'Empty slot'
    name.addEventListener('click', () => {
      $('squad-slot').value = index
      if (player) {
        $('player-search').value = ''
        fillPlayers(player.id)
        selectPlayer()
        $('player-name').focus()
      }
    })
    const number = document.createElement('span')
    number.className = 'number'; number.textContent = player ? player.shirtNumber : '—'
    row.append(slot, name, number)
    return row
  }))
}
function fillPlayers(selected = Number($('player').value)) {
  const query = $('player-search').value.toLowerCase()
  $('player').replaceChildren(...roster.players.filter((player) => player.name.toLowerCase().includes(query))
    .map((player) => option(player.name, player.id)))
  if ([...$('player').options].some((entry) => Number(entry.value) === selected)) $('player').value = selected
  else if ($('player').options.length) $('player').selectedIndex = 0
}
function selectPlayer() {
  const player = roster.players.find((entry) => entry.id === Number($('player').value))
  $('player-name').value = player?.name ?? ''
  $('shirt-number').value = player?.shirtNumber ?? ''
}
function editSquad(id) {
  const team = selectedTeam()
  if (!team) throw new Error('Select a team first.')
  const slot = Number($('squad-slot').value)
  const squadSlots = [...team.squadSlots]
  squadSlots[slot] = id
  changeMod((candidate) => editRecord(candidate.teams, team.id, { squadSlots }), `Squad slot ${slot + 1} saved locally.`)
  selectTeam()
}
function refreshRoster() { fillTeams(); selectTeam(); fillPlayers(); selectPlayer() }
function downloadMod() {
  const blob = new Blob([JSON.stringify(mod, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'fifa98-roster-mod.json'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

document.querySelectorAll('input,button,select').forEach((element) => { element.disabled = true })
try {
  manifest = await get('./manifest.json')
  if (manifest.version !== 1 || manifest.status !== 'reconstruction-only') throw new Error('Unsupported browser preview manifest')
  const [rosterData, wasm] = await Promise.all([get('./roster.json'), get('./fifa98-core.wasm', 'bytes')])
  if (await hash(wasm) !== manifest.native.wasmSha256) throw new Error('Native module checksum mismatch; rebuild the preview.')
  baseRoster = rosterData
  native = await loadNative(wasm)
  catalog = manifest.textures.flatMap((asset) => asset.textures.filter((texture) => texture.paletteLength)
    .map((texture) => ({ sourceSha256: asset.sourceSha256, textureIndex: texture.index, paletteLength: texture.paletteLength })))
  storageKey = `fifa98-mod-v1:${manifest.baseSha256}`
  mod = createMod(manifest.baseSha256)
  let storageMessage = ''
  try {
    const previous = localStorage.getItem(storageKey)
    if (previous) mod = validateMod(previous, baseRoster, modOptions())
  } catch (error) { storageMessage = `Saved edits could not be loaded: ${error.message}` }
  roster = applyRosterMod(baseRoster, mod, modOptions())
  fillAssets()
  const preferred = manifest.textures.find((asset) => /ZFPLYTEX.*fplytex/i.test(asset.id))
  if (preferred) $('asset').value = preferred.id
  fillTeams(); selectTeam(); fillPlayers(); selectPlayer()
  $('squad-slot').replaceChildren(...Array.from({ length: 20 }, (_, index) => option(index + 1, index)))
  $('texture-count').textContent = `${manifest.textures.reduce((sum, asset) => sum + asset.textureCount, 0).toLocaleString()} original bitmaps`
  $('roster-count').textContent = `${roster.counts.teams} teams · ${roster.counts.players.toLocaleString()} players`
  const cards = [[roster.counts.teams, 'original teams decoded'], [roster.counts.players, 'players identified'],
    [manifest.recovery.nativeRoutines, 'original routines recovered']]
  $('recovery-cards').replaceChildren(...cards.map(([count, label]) => {
    const card = document.createElement('div'); card.className = 'recovery-card'
    const number = document.createElement('strong'); number.textContent = count.toLocaleString()
    const title = document.createElement('span'); title.textContent = label
    card.append(number, title); return card
  }))
  await selectAsset()
  sceneView = createSceneView({ manifest, native, getBytes: (url) => get(url, 'bytes'), hash,
    paletteFor: (asset, texture) => {
      const edit = mod.textures.find((entry) => entry.sourceSha256 === asset.sourceSha256 && entry.textureIndex === texture.index)
      return edit ? Uint16Array.from(edit.palette) : texture.palette
    }, setStatus })
  await sceneView.open()
  $('helper-result').textContent = `Input 8 → ${native.core.fifa98_attribute_display(8)}`
  document.querySelectorAll('input,button,select').forEach((element) => { element.disabled = false })
  playerView = createPlayerView({ manifest, native, getBytes: (url) => get(url, 'bytes'), hash,
    paletteFor: (asset, texture) => {
      const edit = mod.textures.find((entry) => entry.sourceSha256 === asset.sourceSha256 && entry.textureIndex === texture.index)
      return edit ? Uint16Array.from(edit.palette) : texture.palette
    }, setStatus })
  controlView = createControlView({ manifest, native, getBytes: (url) => get(url, 'bytes'), hash,
    paletteFor: (asset, texture) => {
      const edit = mod.textures.find((entry) => entry.sourceSha256 === asset.sourceSha256 && entry.textureIndex === texture.index)
      return edit ? Uint16Array.from(edit.palette) : texture.palette
    }, setStatus })
  document.body.dataset.ready = 'true'
  if (storageMessage) setStatus(storageMessage, true)
} catch (error) { setStatus(error.message, true); document.body.dataset.ready = 'error' }

for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => {
  document.querySelectorAll('.panel').forEach((panel) => { panel.hidden = panel.id !== tab.dataset.panel })
  document.querySelectorAll('.tab').forEach((entry) => { entry.classList.toggle('active', entry === tab); entry.setAttribute('aria-pressed', String(entry === tab)) })
  if (tab.dataset.panel === 'stadiums') sceneView?.open().catch((error) => { if (!$('stadiums').hidden) setStatus(error.message, true) })
  if (tab.dataset.panel === 'players') playerView?.open().catch((error) => { if (!$('players').hidden) setStatus(error.message, true) })
  else playerView?.pause()
  if (tab.dataset.panel === 'controls') controlView?.open().catch((error) => { if (!$('controls').hidden) setStatus(error.message, true) })
  else controlView?.pause()
})
on('asset-search', 'input', async () => {
  const previous = $('asset').value
  fillAssets()
  if ($('asset').value !== previous) await selectAsset()
})
on('asset', 'change', selectAsset)
on('bitmap', 'change', selectBitmap)
on('zoom', 'change', renderBitmap)
on('palette-index', 'change', updateColour)
on('palette-colour', 'change', saveColour)
on('palette-reset', 'click', () => {
  changeMod((candidate) => { candidate.textures = candidate.textures.filter((entry) => entry.sourceSha256 !== selectedAsset.sourceSha256 || entry.textureIndex !== selectedBitmap.index) }, 'Original palette restored.')
  renderBitmap(); updateColour()
})
on('team-search', 'input', () => { fillTeams(); selectTeam() })
on('team', 'change', selectTeam)
on('player-search', 'input', () => { fillPlayers(); selectPlayer() })
on('player', 'change', selectPlayer)
on('save-team', 'click', () => {
  const team = selectedTeam()
  if (!team) throw new Error('Select a team first.')
  changeMod((candidate) => editRecord(candidate.teams, team.id, { name: $('team-name').value.trim() }), 'Team name saved locally.')
  fillTeams(team.id); selectTeam()
})
on('save-player', 'click', () => {
  const id = Number($('player').value)
  if (!roster.players.some((player) => player.id === id)) throw new Error('Select a player first.')
  if ($('shirt-number').value === '') throw new Error('Enter a shirt number.')
  changeMod((candidate) => editRecord(candidate.players, id, { name: $('player-name').value.trim(), shirtNumber: Number($('shirt-number').value) }), 'Player saved locally.')
  fillPlayers(id); selectPlayer(); selectTeam()
})
on('assign-player', 'click', () => {
  const id = Number($('player').value)
  if (!roster.players.some((player) => player.id === id)) throw new Error('Select a player first.')
  editSquad(id)
})
on('clear-slot', 'click', () => editSquad(0))
on('helper-input', 'input', () => { const value = Number($('helper-input').value); $('helper-result').textContent = `Input ${value} → ${native.core.fifa98_attribute_display(value)}` })
on('export-mod', 'click', downloadMod)
on('import-mod', 'change', async () => {
  const file = $('import-mod').files[0]
  if (!file) return
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('Mod file exceeds the 8 MiB import limit.')
    saveMod(await file.text(), 'Mod imported and saved locally.')
    refreshRoster(); renderBitmap(); updateColour()
  } finally { $('import-mod').value = '' }
})
on('reset-mod', 'click', () => {
  saveMod(createMod(manifest.baseSha256), 'Local roster and palette edits reset.')
  refreshRoster(); renderBitmap(); updateColour()
})
