import { parsePcmd } from './modules/models.mjs'
import { createDirectScene, appendPitch, projectScene } from './modules/scene.mjs'
import { decodePsh } from './modules/textures.mjs'
import { createPitchGeometry } from './modules/pitch.mjs'

/** Inspection camera over recovered original geometry. No match state is created. */
export function createSceneView({ manifest, native, getBytes, hash, paletteFor, setStatus }) {
  const $ = (id) => document.getElementById(id)
  const canvas = $('stadium-preview'), context = canvas.getContext('2d')
  const scenes = new Map()
  let selected = null, scene = null, sourceTextures = null, grass = null, generation = 0, frame = 0
  let camera = { yaw: 0.5, pitch: 0.55, distance: 2.8 }
  const syncCamera = () => {
    $('camera-yaw').value = camera.yaw; $('camera-pitch').value = camera.pitch; $('camera-distance').value = camera.distance
  }
  function render() {
    frame = 0
    if (!scene || !sourceTextures) return
    const textures = new Map(sourceTextures.decoded.textures.map((texture) => [texture.name, {
      width: texture.width, height: texture.height, rgba: native.render(texture, paletteFor(sourceTextures.asset, texture)),
    }]))
    textures.set('__grass', { width: grass.texture.width, height: grass.texture.height,
      rgba: native.render(grass.texture, paletteFor(grass.asset, grass.texture)) })
    const geometry = appendPitch(scene, createPitchGeometry({ profile: Number($('pitch-size').value), margin: manifest.pitch.margin, nativeCore: native.core }))
    const batches = projectScene(geometry, { ...camera, width: canvas.width, height: canvas.height })
    const result = native.renderScene(batches, textures, canvas.width, canvas.height)
    context.putImageData(new ImageData(result.rgba, canvas.width, canvas.height), 0, 0)
    canvas.dataset.renderer = 'native-wasm'
    canvas.dataset.triangles = result.triangles
    canvas.dataset.scene = selected.id
    $('scene-detail').textContent = `${selected.id} · ${scene.counts.models} original meshes + recovered grass grid · ${geometry.counts.vertices.toLocaleString()} vertices · ${geometry.counts.triangles.toLocaleString()} triangles`
  }
  function refresh() {
    if (!frame && scene) frame = requestAnimationFrame(() => {
      try { render() } catch (error) { setStatus(error.message, true) }
    })
  }
  async function checkedAsset(asset) {
    const bytes = await getBytes(asset.path)
    if (await hash(bytes) !== asset.sourceSha256) throw new Error(`Original mesh/texture checksum mismatch: ${asset.id}`)
    return bytes
  }
  async function select() {
    const entry = manifest.scenes.find((item) => item.id === $('stadium').value)
    if (!entry) return
    const current = ++generation
    setStatus('Loading original stadium geometry…')
    try {
      if (!grass) {
        const asset = manifest.textures.find((entry) => entry.id === manifest.pitch.textureId)
        const decoded = decodePsh(await checkedAsset(asset))
        const texture = decoded.textures.find((entry) => entry.name === manifest.pitch.textureName)
        if (!texture) throw new Error('Missing original grass texture')
        grass = { asset, texture }
      }
      let prepared = scenes.get(entry.id)
      if (!prepared) {
        const texture = manifest.textures.find((asset) => asset.id === entry.textureId)
        if (!texture) throw new Error('Missing stadium texture container')
        const [models, bytes] = await Promise.all([
          Promise.all(entry.models.map(async (asset) => parsePcmd(await checkedAsset(asset)))), checkedAsset(texture),
        ])
        prepared = { scene: createDirectScene(models, native.core), textures: { asset: texture, decoded: decodePsh(bytes) } }
        scenes.set(entry.id, prepared)
        if (scenes.size > 2) scenes.delete(scenes.keys().next().value)
      }
      if (current !== generation) return
      selected = entry; scene = prepared.scene; sourceTextures = prepared.textures
      render()
      setStatus('Original stadium geometry rendered in WebAssembly. Drag to orbit the inspection camera.')
    } catch (error) {
      if (current === generation) { setStatus(error.message, true); throw error }
    }
  }
  $('stadium').replaceChildren(...(manifest.scenes ?? []).map((scene) => {
    const option = document.createElement('option')
    option.value = scene.id; option.textContent = `Stadium ${scene.stadiumId} · ${scene.time === 'D' ? 'day' : 'night'}`
    return option
  }))
  $('stadium').addEventListener('change', () => select().catch((error) => setStatus(error.message, true)))
  $('pitch-size').addEventListener('change', refresh)
  for (const [id, key] of [['camera-yaw', 'yaw'], ['camera-pitch', 'pitch'], ['camera-distance', 'distance']]) {
    $(id).addEventListener('input', () => { camera[key] = Number($(id).value); refresh() })
  }
  $('camera-reset').addEventListener('click', () => { camera = { yaw: 0.5, pitch: 0.55, distance: 2.8 }; syncCamera(); refresh() })
  let drag = null
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    drag = { x: event.clientX, y: event.clientY, ...camera }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return
    camera.yaw = Math.max(-Math.PI, Math.min(Math.PI, drag.yaw + (event.clientX - drag.x) * 0.01))
    camera.pitch = Math.max(-0.2, Math.min(1.4, drag.pitch + (event.clientY - drag.y) * 0.01))
    syncCamera(); refresh()
  })
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, () => { drag = null })
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault(); camera.distance = Math.max(1.3, Math.min(5, camera.distance + event.deltaY * 0.002))
    syncCamera(); refresh()
  }, { passive: false })
  syncCamera()
  return { refresh, async open() { if (!scene) await select(); else refresh() } }
}
