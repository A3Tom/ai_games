import { parsePcmd, recoverPlayerGeometry, recoverPlayerHeadGeometry } from './modules/models.mjs'
import { parseMopClip } from './modules/animation.mjs'
import { verifyMotionBaseClip } from './modules/motion-playback.mjs'
import { decodePsh } from './modules/textures.mjs'
import { createPitchGeometry } from './modules/pitch.mjs'
import { projectScene } from './modules/scene.mjs'
import { createControlScene } from './modules/control-scene.mjs'
import { createControlSession } from './modules/control-session.mjs'
import { createControlInput } from './modules/control-input.mjs'
import { createControlAnimation } from './modules/control-animation.mjs'
import { createControlBall } from './modules/control-ball.mjs'
import { createBallVisualBatch,decodeBallVisual } from './modules/ball-visual.mjs'

/** Browser inputs, inspection clock and drawing around recovered controls.
 * Isolated launch tests omit possession/contact callbacks, opponents and rules.
 */
export function createControlView({ manifest, native, getBytes, hash, paletteFor, setStatus }) {
  const $ = (id) => document.getElementById(id)
  const canvas = $('control-preview'), context = canvas.getContext('2d'), input = createControlInput()
  const pad = [...document.querySelectorAll('[data-direction]')]
  let session, config, body, head, model, headModel, baseFrame, animation, ball, ballTexture, playerTextures, grass, pitch, loading
  let running = false, frame = 0, previousTime = 0, elapsed = 0
  const controls = ['control-play', 'control-step', 'control-reset','control-carry','control-launch','control-launch-type','control-launch-value','control-camera']
  function enable(enabled) {
    for (const id of controls) $(id).disabled = !enabled || (id==='control-launch-value' && !['speed','height'].includes($('control-launch-type').value))
    pad.forEach((button) => { button.disabled = !enabled })
  }
  function configureLaunchInput(){
    const height=$('control-launch-type').value==='height',value=$('control-launch-value')
    $('control-launch-value-label').textContent=height?'Loft height':'Loft speed'
    value.min=height?'4':'0';value.max=height?'1024':'50';value.value=(height?config.ball.flight.height:config.ball.flight.speed)/65536
  }
  function clearInput() { input.clear(); pad.forEach((button) => button.setAttribute('aria-pressed', 'false')) }
  function pause() {
    running = false; previousTime = 0; elapsed = 0; clearInput()
    $('control-play').textContent = 'Start control test'; $('control-play').setAttribute('aria-pressed', 'false')
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
  function fail(error) { pause(); enable(false); $('control-detail').textContent = error.message; if (!$('controls').hidden) setStatus(error.message, true) }
  async function checked(asset) {
    if (!asset) throw new Error('Missing control-test asset')
    const bytes = await getBytes(asset.path)
    if (await hash(bytes) !== (asset.sourceSha256 ?? asset.sha256)) throw new Error(`Control-test asset checksum mismatch: ${asset.id ?? asset.path}`)
    return bytes
  }
  function map(state) {
    const map = $('control-map'), ctx = map.getContext('2d'), [xLimit, zLimit] = config.bounds
    const point = (x, z) => [map.width / 2 + x / xLimit * (map.width / 2 - 12), map.height / 2 + z / zLimit * (map.height / 2 - 12)]
    ctx.fillStyle = '#142a20'; ctx.fillRect(0, 0, map.width, map.height)
    ctx.strokeStyle = '#7d9b87'; ctx.strokeRect(12, 12, map.width - 24, map.height - 24)
    for (const [coordinates, colour, radius] of [[point(state.target[0], state.target[2]), '#70baff', 3], [point(...state.position), '#c9ff59', 5]]) {
      ctx.beginPath(); ctx.fillStyle = colour; ctx.arc(...coordinates, radius, 0, Math.PI * 2); ctx.fill()
    }
    const testBall = ball.snapshot()
    if (testBall.exists) { ctx.beginPath();ctx.fillStyle='#fff';ctx.arc(...point(testBall.position[0],testBall.position[2]),3,0,Math.PI*2);ctx.fill() }
  }
  function draw() {
    const state = session.snapshot()
    const pose = animation.pose()
    body = recoverPlayerGeometry(model, pose.frame, native.core, { baseFrame })
    head = recoverPlayerHeadGeometry(headModel, body, native.core)
    const placement = session.renderPosition()
    const testBall = ball.snapshot()
    const ballPosition = testBall.exists ? testBall.fixedPosition.map((value) => (value >> 16) * 2) : null
    const cameraMode=$('control-camera').value
    const centre = !ballPosition || cameraMode==='player' ? [placement[0],placement[2]] : cameraMode==='ball' ? [ballPosition[0],ballPosition[2]] : [(placement[0]+ballPosition[0])/2,(placement[2]+ballPosition[2])/2]
    const scene = createControlScene([body, head], pitch, [placement[0], placement[2]], session.facingVector(), placement[1],centre)
    const separation = ballPosition && cameraMode==='both' ? Math.hypot(ballPosition[0]-placement[0],ballPosition[2]-placement[2])/scene.scaleLoader : 0
    const camera = { yaw:0, pitch:0.65,distance:Math.max(2.5,1.5+separation),width:canvas.width,height:canvas.height }
    const textures = new Map(playerTextures.decoded.textures.map((texture) => [texture.name, {
      width: texture.width, height: texture.height, rgba: native.render(texture, paletteFor(playerTextures.asset, texture)),
    }]))
    textures.set('__grass', { width: grass.texture.width, height: grass.texture.height,
      rgba: native.render(grass.texture, paletteFor(grass.asset, grass.texture)) })
    const batches = projectScene(scene,camera)
    let sprite
    if(testBall.exists){
      sprite=createBallVisualBatch(scene,testBall.fixedPosition,{camera,quarterSine:config.sine,
        orientationTable:config.ball.visual.orientationTable,zoomRaw:config.ball.visual.zoomRaw,
        rollPhase:testBall.visualPhase,ballHeadingRaw:testBall.visualHeading,cameraAngleRaw:0})
      const texture=ballTexture.decoded.textures[sprite.textureIndex]
      textures.set('__ball',{width:texture.width,height:texture.height,
        rgba:native.render(texture,paletteFor(ballTexture.asset,ballTexture.decoded.textures[config.ball.visual.paletteIndex]))})
      batches.push(sprite)
    }
    const result = native.renderScene(batches, textures, canvas.width, canvas.height)
    context.putImageData(new ImageData(result.rgba, canvas.width, canvas.height), 0, 0)
    Object.assign(canvas.dataset, { renderer: 'native-wasm', ticks: state.ticks, x: state.position[0], z: state.position[1], speed: state.speed, heading: state.heading,
      vertices: scene.counts.vertices, triangles: result.triangles, action: pose.actionId, clip: pose.clipName, key: pose.frame.index,
      phase: pose.phase, held: pose.held,mirrored:pose.mirrored,ballExists:testBall.exists,ballActive:testBall.active,ballOwned:testBall.owned,
      ballTicks:testBall.ticks,ballX:testBall.position?.[0]??'',ballZ:testBall.position?.[2]??'',ballSpeed:testBall.velocity?.[2]??'',ballStop:testBall.stopReason??'',
      ballY:testBall.position?.[1]??'',ballSpin:testBall.spin,ballPhase:testBall.visualPhase,ballLaunch:testBall.sourceLaunch?.kind??'',
      ballBoundaryFlag:testBall.boundaryFlag,ballVisible:sprite?.visible??false,ballTexture:sprite?.textureIndex??'',
      ballDuration:testBall.sourceLaunch?.duration??'',ballLaunchFlags:testBall.sourceLaunch?.flags??'',
      ballLaunchHeight:testBall.sourceLaunch?.height??'',
      ballOwner:testBall.possession?.state[0]??'',ballPreviousOwner:testBall.possession?.state[1]??'' })
    const ballDetail = !testBall.exists ? '' : testBall.stopReason === 'outside-pitch' ? ' · Ball outside the pitch; restart handling unfinished' : testBall.stopReason === 'boundary' ? ' · Ball paused before unrecovered boundary contact' : testBall.owned ? ' · Carrying test-owned ball' : testBall.active ? ` · Ball ${testBall.position[1]>0?'airborne':'rolling'}` : ' · Ball at rest'
    $('control-detail').textContent = `${state.ticks.toLocaleString()} ticks · ${state.speed === 0 ? 'Stopped' : 'Moving'} · ${pose.clipName}${pose.held ? ' · first key held while transition logic is recovered' : ''}${ballDetail}`
    $('control-readings').textContent = `X ${state.position[0].toFixed(3)}   Z ${state.position[1].toFixed(3)}\nSpeed ${state.speed}   Heading ${state.heading}   Facing ${state.facing}\nTarget ${state.target[0]}, ${state.target[2]}   Distance ${state.distance}\nTurn class ${state.turnClass}   Status ${state.statusFlags}`
    map(state)
  }
  function advance(ticks = 1) {
    const result = session.step(input.buttons, ticks)
    if (!result.advanced) {
      pause(); setStatus('This turn needs an animation action that has not been recovered. Reset the control test to continue.', true)
      return false
    }
    animation.step(result.state, ticks)
    ball.step(ticks,{player:result.state,marker:animation.pose().marker})
    return true
  }
  function launchBall(){if(!ball || $('control-launch').disabled)return;try{ball.launchFrom(session.snapshot(),{
    kind:$('control-launch-type').value,speed:Number($('control-launch-value').value)*65536,
    height:Number($('control-launch-value').value)*65536});draw();canvas.focus({preventScroll:true})}catch(error){fail(error)}}
  function carryBall(){if(!ball || $('control-carry').disabled)return;try{ball.carryFrom(session.snapshot());draw();canvas.focus({preventScroll:true})}catch(error){fail(error)}}
  function tick(now) {
    frame = 0
    if (!running || $('controls').hidden || document.hidden) { pause(); return }
    try {
      if (previousTime) elapsed += Math.min(now - previousTime, 100)
      previousTime = now
      const interval = 1000 / config.time.ticksPerSecond
      const ticks = Math.min(6,Math.floor(elapsed / interval))
      if (ticks > 0) { elapsed -= ticks * interval; advance(ticks); draw() }
      if (running) frame = requestAnimationFrame(tick)
    } catch (error) { fail(error) }
  }
  async function load() {
    enable(false); if (!$('controls').hidden) setStatus('Loading original player controls and pitch…')
    const [bytes, modelBytes, headBytes, baseBytes] = await Promise.all([
      checked(manifest.controls), checked(manifest.player.model), checked(manifest.player.head), checked(manifest.player.baseClip),
    ])
    config = JSON.parse(new TextDecoder().decode(bytes))
    if (config.version !== 1 || config.status !== 'isolated-control-test' || config.time?.kind !== 'inspection-cadence' ||
        !Number.isInteger(config.time.ticksPerSecond) || config.time.ticksPerSecond < 1 || config.time.ticksPerSecond > 60) throw new Error('Unsupported control-test configuration')
    await verifyMotionBaseClip(baseBytes)
    baseFrame = parseMopClip(baseBytes, { decodeDeltas: native.decodeMotionDeltas }).frames[0]
    model = parsePcmd(modelBytes); headModel = parsePcmd(headBytes)
    const clipLoads = new Map()
    const clips = new Map(await Promise.all(config.animation.actions.map(async (entry) => {
      if (!clipLoads.has(entry.asset.sourceSha256)) clipLoads.set(entry.asset.sourceSha256,
        checked(entry.asset).then((bytes) => parseMopClip(bytes, { decodeDeltas: native.decodeMotionDeltas })))
      return [entry.actionId, await clipLoads.get(entry.asset.sourceSha256)]
    })))
    const playerAsset = manifest.textures.find((entry) => entry.id === manifest.player.textureId)
    const grassAsset = manifest.textures.find((entry) => entry.id === manifest.pitch.textureId)
    const ballAsset = manifest.textures.find((entry) => entry.id === config.ball.visual.textureId)
    const [playerBytes, grassBytes,ballBytes] = await Promise.all([checked(playerAsset), checked(grassAsset),checked(ballAsset)])
    playerTextures = { asset: playerAsset, decoded: decodePsh(playerBytes) }
    const texture = decodePsh(grassBytes).textures.find((entry) => entry.name === manifest.pitch.textureName)
    if (!texture) throw new Error('Original grass texture is missing')
    grass = { asset: grassAsset, texture }
    decodeBallVisual(ballBytes,{paletteIndex:config.ball.visual.paletteIndex})
    ballTexture={asset:ballAsset,decoded:decodePsh(ballBytes)}
    pitch = createPitchGeometry({ profile: 2, margin: manifest.pitch.margin, nativeCore: native.core })
    session = createControlSession(native.core, config)
    animation = createControlAnimation(native.core, config.animation, clips,{baseFrame})
    ball = createControlBall(native.core,config.ball,config)
    animation.step(session.snapshot(), 0)
    configureLaunchInput()
    $('control-scope').textContent = `Carry starts a test-owned ball at the player. Original animation markers and attachment code move it; launch uses the recovered ownership release and current ball position. Without an owned ball, launch places a fresh test ball at the player. Speed-selected and height-selected loft use the original solvers for your chosen value. Possession acquisition, player contact and kick timing remain unfinished. The test uses an inspection speed and source texture templates.`
    draw(); enable(true); if (!$('controls').hidden) setStatus('Player control test ready. Start it and use the directional controls.')
  }
  $('control-play').addEventListener('click', () => {
    if (running) { pause(); return }
    if (!session) return
    running = true; $('control-play').textContent = 'Pause control test'; $('control-play').setAttribute('aria-pressed', 'true')
    canvas.focus({ preventScroll: true }); frame = requestAnimationFrame(tick)
  })
  $('control-step').addEventListener('click', () => { if (session) { try { if (advance()) draw() } catch (error) { fail(error) } } })
  $('control-reset').addEventListener('click', () => { if (session) { pause(); session.reset(); animation.reset();ball.reset(); try { animation.step(session.snapshot(), 0); draw(); enable(true) } catch (error) { fail(error) } } })
  $('control-launch').addEventListener('click',launchBall)
  $('control-carry').addEventListener('click',carryBall)
  $('control-launch-type').addEventListener('change',()=>{
    if(session && !$('control-launch-type').disabled){
      configureLaunchInput()
      enable(true)
    }
  })
  $('control-camera').addEventListener('change',()=>{if(session && !$('control-camera').disabled){try{draw()}catch(error){fail(error)}}})
  canvas.addEventListener('keydown', (event) => {
    if($('control-play').disabled)return
    if (session && input.key(event.code, true)) event.preventDefault()
    else if(session && event.code==='KeyB'){event.preventDefault();if(!event.repeat)launchBall()}
    else if(session && event.code==='KeyC'){event.preventDefault();if(!event.repeat)carryBall()}
    else if (session && event.code === 'Space') {
      event.preventDefault()
      if (!running && !event.repeat) { try { if (advance()) draw() } catch (error) { fail(error) } }
    }
  })
  window.addEventListener('keyup', (event) => { input.key(event.code, false) })
  canvas.addEventListener('blur', clearInput)
  window.addEventListener('blur', pause)
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause() })
  for (const button of pad) {
    const release = (event) => { input.pointer(event.pointerId, Number(button.dataset.direction), false); button.setAttribute('aria-pressed', 'false') }
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('pointerdown', (event) => {
      if (button.disabled || event.button !== 0) return
      event.preventDefault(); button.setPointerCapture(event.pointerId)
      input.pointer(event.pointerId, Number(button.dataset.direction), true); button.setAttribute('aria-pressed', 'true')
    })
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, release)
  }
  enable(false)
  return { pause, refresh() { if (session && !$('controls').hidden) { try { draw() } catch (error) { fail(error) } } },
    async open() {
      if (!session || $('control-play').disabled) {
        if (!loading) loading = load().catch((error) => { fail(error); if (!$('controls').hidden) throw error }).finally(() => { loading = null })
        await loading
      } else { try { draw(); setStatus('Player control test ready. Start it and use the directional controls.') } catch (error) { fail(error) } }
    } }
}
