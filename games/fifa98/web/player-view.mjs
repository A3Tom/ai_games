import { parsePcmd, recoverPlayerGeometry, recoverPlayerHeadGeometry } from './modules/models.mjs'
import { parseMopClip } from './modules/animation.mjs'
import { createPlayerScene } from './modules/player-scene.mjs'
import { projectScene } from './modules/scene.mjs'
import { decodePsh } from './modules/textures.mjs'
import { sampleMotionPose, motionPhaseForKey, verifyMotionBaseClip } from './modules/motion-playback.mjs'

/** Original key poses through recovered native skinning and platform drawing.
 * Playback is an inspection aid, not the original match scheduler.
 */
export function createPlayerView({ manifest, native, getBytes, hash, paletteFor, setStatus: reportStatus }) {
  const $ = (id) => document.getElementById(id)
  const setStatus = (...args) => { if (!$('players').hidden) reportStatus(...args) }
  const canvas = $('player-preview'), context = canvas.getContext('2d'), cache = new Map()
  let model, headModel, textureAsset, textures, baseFrame, clip, selected, normalization, generation = 0, frame = 0
  let playing = false, previousTime = 0, elapsed = 0
  const camera = () => ({ yaw: Number($('player-yaw').value), pitch: 0.12, distance: 2.7,
    width: canvas.width, height: canvas.height })
  const controls = ['motion-key', 'motion-previous', 'motion-next', 'motion-play', 'player-yaw']
  const enable = (enabled) => controls.forEach((id) => { $(id).disabled = !enabled })
  function pause() {
    playing = false; previousTime = 0; elapsed = 0
    $('motion-play').textContent = 'Preview motion'; $('motion-play').setAttribute('aria-pressed', 'false')
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
  function draw() {
    if (!model || !clip || !textures) return
    const key = Number($('motion-key').value)
    const geometry = recoverPlayerGeometry(model, sampleMotionPose(clip, motionPhaseForKey(clip, key)), native.core, { baseFrame })
    const head = recoverPlayerHeadGeometry(headModel, geometry, native.core)
    const scene = createPlayerScene([geometry, head], normalization)
    normalization ??= { centreLoader: scene.centreLoader, scaleLoader: scene.scaleLoader }
    const rgbaTextures = new Map(textures.textures.map((texture) => [texture.name, {
      width: texture.width, height: texture.height, rgba: native.render(texture, paletteFor(textureAsset, texture)),
    }]))
    const result = native.renderScene(projectScene(scene, camera()), rgbaTextures, canvas.width, canvas.height)
    context.putImageData(new ImageData(result.rgba, canvas.width, canvas.height), 0, 0)
    canvas.dataset.renderer = 'native-wasm'; canvas.dataset.clip = selected.id; canvas.dataset.key = key
    canvas.dataset.vertices = scene.counts.vertices; canvas.dataset.triangles = result.triangles
    $('motion-key-label').textContent = `Key ${key + 1} of ${clip.keyCount}`
    $('player-detail').textContent = `${selected.id} · ${scene.counts.vertices} original vertices · ${scene.counts.triangles} triangles · native skinning`
  }
  function safelyDraw() {
    try { draw() } catch (error) { pause(); enable(false); setStatus(error.message, true) }
  }
  function tick(now) {
    frame = 0
    if (!playing || $('players').hidden || document.hidden) { pause(); return }
    if (previousTime) elapsed += Math.min(now - previousTime, 250)
    previousTime = now
    // Viewing cadence only. Original keys and fixed-point poses are unchanged.
    if (elapsed >= 1000 / 12) {
      const advance = Math.floor(elapsed / (1000 / 12))
      elapsed %= 1000 / 12
      $('motion-key').value = (Number($('motion-key').value) + advance) % clip.keyCount
      safelyDraw()
    }
    if (playing) frame = requestAnimationFrame(tick)
  }
  async function checked(asset) {
    const bytes = await getBytes(asset.path)
    if (await hash(bytes) !== asset.sourceSha256) throw new Error(`Original player asset checksum mismatch: ${asset.id}`)
    return bytes
  }
  function fillClips() {
    const previous = $('motion-clip').value, query = $('motion-search').value.toLowerCase()
    const entries = (manifest.player?.clips ?? []).filter((entry) => entry.id.toLowerCase().includes(query))
    $('motion-clip').replaceChildren(...entries.map((entry) => {
      const option = document.createElement('option'); option.value = entry.id
      option.textContent = `${entry.id} · ${entry.keys} keys`; return option
    }))
    if (entries.some((entry) => entry.id === previous)) $('motion-clip').value = previous
    return previous !== $('motion-clip').value
  }
  async function select() {
    const entry = manifest.player?.clips.find((item) => item.id === $('motion-clip').value)
    const current = ++generation
    pause(); enable(false); clip = null; normalization = null
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (const key of ['clip', 'key', 'vertices', 'triangles']) delete canvas.dataset[key]
    $('player-detail').textContent = ''; $('motion-key-label').textContent = ''
    if (!entry) { setStatus('No motion clips match your search.'); return }
    setStatus('Loading original player and motion data…')
    try {
      if (!model || !headModel || !textures || !baseFrame) {
        const asset = manifest.textures.find((entry) => entry.id === manifest.player.textureId)
        if (!asset) throw new Error('Missing original player textures')
        const [modelBytes, textureBytes, baseBytes, headBytes] = await Promise.all([checked(manifest.player.model), checked(asset), checked(manifest.player.baseClip), checked(manifest.player.head)])
        model = parsePcmd(modelBytes); headModel = parsePcmd(headBytes); textureAsset = asset; textures = decodePsh(textureBytes)
        await verifyMotionBaseClip(baseBytes)
        const baseClip = parseMopClip(baseBytes, { decodeDeltas: native.decodeMotionDeltas })
        baseFrame = baseClip.frames[0]
        cache.set(manifest.player.baseClip.sourceSha256, baseClip)
      }
      let decoded = cache.get(entry.sourceSha256)
      if (!decoded) {
        decoded = parseMopClip(await checked(entry), { decodeDeltas: native.decodeMotionDeltas })
        cache.set(entry.sourceSha256, decoded)
        if (cache.size > 8) cache.delete(cache.keys().next().value)
      }
      if (current !== generation) return
      clip = decoded; selected = entry
      $('motion-key').max = clip.keyCount - 1; $('motion-key').value = 0
      draw(); enable(true)
      setStatus('Original player pose rendered in WebAssembly. Scrub the keys or preview the motion.')
    } catch (error) {
      if (current === generation) { enable(false); setStatus(error.message, true) }
    }
  }
  $('motion-search').addEventListener('input', () => { if (fillClips()) void select() })
  $('motion-clip').addEventListener('change', () => { void select() })
  $('motion-key').addEventListener('input', () => { pause(); safelyDraw() })
  for (const [id, delta] of [['motion-previous', -1], ['motion-next', 1]]) $(id).addEventListener('click', () => {
    if (!clip) return
    pause(); $('motion-key').value = (Number($('motion-key').value) + delta + clip.keyCount) % clip.keyCount
    safelyDraw()
  })
  $('player-yaw').addEventListener('input', safelyDraw)
  $('motion-play').addEventListener('click', () => {
    if (playing) { pause(); return }
    if (!clip) return
    playing = true; $('motion-play').textContent = 'Pause motion'; $('motion-play').setAttribute('aria-pressed', 'true')
    frame = requestAnimationFrame(tick)
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
  fillClips(); enable(false)
  return { pause, refresh() { if (!$('players').hidden) safelyDraw() }, async open() { if (!clip) await select(); else safelyDraw() } }
}
