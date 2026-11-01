import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { parseRosterDatabase } from './database.mjs'
import { decodePsh } from './textures.mjs'
import { analyzeCodeImages } from './code-map.mjs'
import { validateOutput } from './reconstruct.mjs'
import { loadNative } from '../web/native.mjs'
import { parsePcmd, recoverPcmdQuaternionMatrix, recoverPlayerGeometry, recoverPlayerHeadGeometry } from './models.mjs'
import { createDirectScene } from './scene.mjs'
import { inspectMatchRecovery } from './match-recovery.mjs'
import { parseMopClip, recoverPcmdJointParameters } from './animation.mjs'
import { inspectPitchRecovery } from './pitch-recovery.mjs'
import { createPitchGeometry } from './pitch.mjs'
import { inspectPlayerRecovery } from './player-recovery.mjs'
import { inspectMotionPlayback } from './motion-playback.mjs'
import { inspectControlTargetRecovery } from './control-target-recovery.mjs'
import { inspectSteeringRecovery } from './steering-recovery.mjs'
import { prepareLocomotionTables, selectLocomotionAction } from './locomotion-animation.mjs'
import { inspectPlayerPlacement } from './player-placement.mjs'
import { inspectBallMotionRecovery } from './ball-motion-recovery.mjs'
import { inspectBallInteractionRecovery } from './ball-interaction-recovery.mjs'
import { inspectActionTransitionRecovery } from './action-transition-recovery.mjs'
import { actionRuntimeFlags, recoverActionFrame } from './action-transition.mjs'
import { createControlBall } from './control-ball.mjs'
import { createControlSession } from './control-session.mjs'
import { createControlAnimation } from './control-animation.mjs'
import { inspectBallVisual,decodeBallVisual } from './ball-visual.mjs'
import { inspectBallFlightRecovery } from './ball-flight-recovery.mjs'
import { calibrateAction } from './action-calibration.mjs'
import { inspectBallVisualPhase } from './ball-visual-phase.mjs'
import { inspectPlayerBallRecovery } from './player-ball-recovery.mjs'
import { inspectPossessionRecovery } from './possession-recovery.mjs'
import { inspectBallBoundaryRecovery } from './ball-boundary-recovery.mjs'
import { inspectActionEventsRecovery } from './action-events-recovery.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const scriptRoot = fileURLToPath(new URL('./', import.meta.url))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const shaPattern = /^[a-f0-9]{64}$/
const DATABASES = ['ZRESTDB.BIG/fcdb.dbi', 'ZRESTDB.BIG/fcdbpeng.dbi', 'ZENGDB.BIG/fcdb_eng.dbi']

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.split('/').some((part) => !part || part === '.' || part === '..' || /[:\x00-\x1f\x7f]/.test(part))) {
    throw new Error('Unsafe reference member path.')
  }
  return value
}

async function regularBytes(filename, maxBytes = 64 * 1024 * 1024) {
  const info = await lstat(filename)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw new Error(`Expected a bounded regular file: ${filename}`)
  const bytes = await readFile(filename)
  if (bytes.length !== info.size || bytes.length > maxBytes) throw new Error(`File changed while reading: ${filename}`)
  return bytes
}

async function plainDirectory(directory) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Expected a directory without symlinks: ${directory}`)
  return realpath(directory)
}

/** Match physical extracted-member paths to logical IDs and recorded hashes. */
export function referenceMemberIndex(report) {
  if (report?.version !== 1 || !Array.isArray(report.files)) throw new Error('Expected a version 1 extraction report.')
  const members = new Map()
  let count = 0
  function walk(archive, physical, logical, depth) {
    if (depth > 4 || !Array.isArray(archive?.entries)) throw new Error('Invalid nested archive report.')
    for (const entry of archive.entries) {
      if (++count > 32000) throw new Error('Reference member count exceeds the limit.')
      const name = safeRelative(entry.name)
      const relative = `${physical}/${name}`
      const id = `${logical}/${name}`
      if (!shaPattern.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 64 * 1024 * 1024 || members.has(relative)) throw new Error(`Invalid reference member integrity record: ${id}`)
      members.set(relative, { id, size: entry.size, sha256: entry.sha256 })
      if (entry.archive) walk(entry.archive, `${relative}.members`, id, depth + 1)
    }
  }
  for (const file of report.files) {
    if (file.archive) walk(file.archive, safeRelative(file.path), safeRelative(file.path), 0)
  }
  return members
}

async function readMember(directory, relative, expected) {
  if (!expected) throw new Error(`Member is absent from the extraction report: ${relative}`)
  const parts = safeRelative(relative).split('/')
  let cursor = directory
  for (const part of parts.slice(0, -1)) { cursor = path.join(cursor, part); await plainDirectory(cursor) }
  const bytes = await regularBytes(path.join(directory, ...parts))
  if (bytes.length !== expected.size || sha256(bytes) !== expected.sha256) throw new Error(`Reference member hash mismatch: ${relative}`)
  return bytes
}

async function texturePaths(directory) {
  const output = []
  let count = 0
  async function walk(relative, depth) {
    if (depth > 32) throw new Error('Reference directory nesting exceeds the limit.')
    const current = path.join(directory, relative)
    for (const item of await readdir(current, { withFileTypes: true })) {
      if (++count > 64000) throw new Error('Reference directory entry limit exceeded.')
      const name = relative ? `${relative}/${item.name}` : item.name
      const info = await lstat(path.join(directory, name))
      if (info.isSymbolicLink()) throw new Error(`Reference symlinks are not accepted: ${name}`)
      if (info.isDirectory()) await walk(name, depth + 1)
      else if (!info.isFile()) throw new Error(`Reference entry is not a regular file: ${name}`)
      else if (/\.psh$/i.test(name)) output.push(name)
    }
  }
  await walk('', 0)
  return output.sort((left, right) => left.localeCompare(right, 'en'))
}

export async function verifyNativeBuild({ wasm, manifest, source, sources = new Map() }) {
  if (manifest?.version !== 1 || manifest.status !== 'reconstruction-only' ||
      !shaPattern.test(manifest.sourceSha256) || !shaPattern.test(manifest.wasmSha256) ||
      manifest.bytes !== wasm.length || sha256(source) !== manifest.sourceSha256 || sha256(wasm) !== manifest.wasmSha256 ||
      !Array.isArray(manifest.exports) || !Array.isArray(manifest.imports) || manifest.imports.length) {
    throw new Error('Native build is stale or its source/WASM hashes do not match. Rebuild the native core.')
  }
  if (manifest.sources !== undefined) {
    if (!Array.isArray(manifest.sources) || !manifest.sources.length || manifest.sources.length > 18) throw new Error('Invalid native source manifest')
    const names = new Set()
    for (const entry of manifest.sources) {
      if (!entry || !/^[a-z][a-z0-9_-]*\.c$/.test(entry.path) || names.has(entry.path) || !shaPattern.test(entry.sha256) ||
          !sources.has(entry.path) || sha256(sources.get(entry.path)) !== entry.sha256) throw new Error('Native source hashes do not match. Rebuild the native core.')
      names.add(entry.path)
    }
    if (!names.has('core.c') || manifest.sources.find((entry) => entry.path === 'core.c').sha256 !== manifest.sourceSha256) throw new Error('Missing native core source hash')
  }
  const module = await WebAssembly.compile(wasm)
  const exports = WebAssembly.Module.exports(module).map((entry) => entry.name).sort()
  if (WebAssembly.Module.imports(module).length || JSON.stringify(exports) !== JSON.stringify([...manifest.exports].sort())) throw new Error('Native build exports/imports differ from its manifest.')
  return loadNative(wasm)
}

export function verifyTextureParity(texture, native) {
  if (!texture.indices || !texture.palette) throw new Error('Native preview currently requires indexed PSH textures.')
  const pixels = native.render(texture)
  if (pixels.length !== texture.rgba.length || !Buffer.from(pixels).equals(Buffer.from(texture.rgba))) throw new Error(`Native RGBA parity failed for texture ${texture.index} (${texture.name}).`)
}

/** Build a new static preview atomically. Source files and existing outputs stay untouched.
 * The optional analyzer dependency supports synthetic integration fixtures; the
 * CLI always uses the verified original-image analyzer.
 */
export async function prepareWeb({ reference = path.join(root, '.work/reference'), out = path.join(root, '.work/web'),
  nativeDirectory = path.join(root, '.engine-build'), webDirectory = path.join(root, 'web'),
  nativeSource = path.join(root, 'native/core.c'), moduleDirectory = scriptRoot } = {}, {
    analyze = analyzeCodeImages, analyzeMatch = inspectMatchRecovery, analyzePlayer = inspectPlayerRecovery, analyzeMotion = inspectMotionPlayback,
    analyzeControl = inspectControlTargetRecovery, analyzeSteering = inspectSteeringRecovery,
    analyzePlacement = inspectPlayerPlacement,
    analyzeBallMotion = inspectBallMotionRecovery, analyzeBallInteraction = inspectBallInteractionRecovery,
    analyzeAction = inspectActionTransitionRecovery,
    analyzeBallFlight = inspectBallFlightRecovery, analyzeBallPhase = inspectBallVisualPhase,
    analyzePlayerBall=inspectPlayerBallRecovery,
    analyzePossession=inspectPossessionRecovery,analyzeBoundary=inspectBallBoundaryRecovery,
    analyzeEvents=inspectActionEventsRecovery,
  } = {}) {
  const referenceDirectory = await plainDirectory(path.resolve(reference))
  const membersDirectory = await plainDirectory(path.join(referenceDirectory, 'members'))
  const discDirectory = await plainDirectory(path.join(referenceDirectory, 'disc'))
  const nativeRoot = await plainDirectory(path.resolve(nativeDirectory))
  const webRoot = await plainDirectory(path.resolve(webDirectory))
  const moduleRoot = await plainDirectory(path.resolve(moduleDirectory))
  const reportPath = path.join(referenceDirectory, 'report.json')
  const sourcePaths = [reportPath, path.join(nativeRoot, 'build.json'), path.join(webRoot, 'index.html'), nativeSource,
    path.join(moduleRoot, 'textures.mjs'), path.join(moduleRoot, 'mods.mjs')]
  const destination = await validateOutput(out, sourcePaths)
  const report = JSON.parse((await regularBytes(reportPath, 32 * 1024 * 1024)).toString('utf8'))
  const index = referenceMemberIndex(report)
  const paths = await texturePaths(membersDirectory)
  const expectedPsh = [...index.keys()].filter((name) => /\.psh$/i.test(name))
  if (!paths.length || paths.length !== expectedPsh.length || paths.some((name) => !index.has(name))) throw new Error('Extracted PSH files do not match the extraction report.')
  const rawDatabases = await Promise.all(DATABASES.map((name) => readMember(membersDirectory, name, index.get(name))))
  const roster = parseRosterDatabase({ fcdb: rawDatabases[0], playerNames: rawDatabases[1], teamNames: rawDatabases[2] })
  const baseSha256 = sha256(Buffer.concat(rawDatabases))
  const [wasm, buildBytes, source] = await Promise.all([
    regularBytes(path.join(nativeRoot, 'fifa98-core.wasm'), 4 * 1024 * 1024), regularBytes(path.join(nativeRoot, 'build.json'), 1024 * 1024), regularBytes(nativeSource),
  ])
  const build = JSON.parse(buildBytes.toString('utf8'))
  const sources = new Map()
  if (build.sources !== undefined) {
    if (!Array.isArray(build.sources) || build.sources.length > 18) throw new Error('Invalid native source manifest')
    for (const entry of build.sources) {
      if (!entry || !/^[a-z][a-z0-9_-]*\.c$/.test(entry.path)) throw new Error('Unsafe native source path')
      sources.set(entry.path, await regularBytes(path.join(path.dirname(nativeSource), entry.path)))
    }
  }
  const native = await verifyNativeBuild({ wasm, manifest: build, source, sources })
  const names = ['SLES_009.14', 'FECODE.BIN', 'BECODE.BIN']
  const images = await Promise.all(names.map(async (name) => {
    const entry = report.files.find((file) => file.path === name)
    const bytes = await regularBytes(path.join(discDirectory, name), 1024 * 1024)
    if (!entry || !shaPattern.test(entry.sha256) || bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error(`Extracted code hash mismatch: ${name}`)
    return bytes
  }))
  const codeMap = analyze({ boot: images[0], frontend: images[1], backend: images[2] })
  if (codeMap.status !== 'static-recovery-map' || codeMap.recoveryCandidates?.length !== 2) throw new Error('The extracted executable images do not match the reviewed native reconstruction.')
  const matchRecovery = analyzeMatch(images[2], images[0])
  if (matchRecovery.status !== 'reconstruction-only') throw new Error('The backend does not match the reviewed match recovery')
  for (const name of matchRecovery.nativeExports) if (typeof native.core[name] !== 'function') throw new Error(`Missing recovered native simulation export: ${name}`)
  const playerRecovery = analyzePlayer(images[2], images[0])
  let motionRecovery = await analyzeMotion(images[2])
  if (playerRecovery.status !== 'reconstruction-only' || motionRecovery.status !== 'reconstruction-only') throw new Error('The executable images do not match reviewed player/motion recovery')
  for (const name of playerRecovery.nativeExports) if (typeof native.core[name] !== 'function') throw new Error(`Missing recovered native player export: ${name}`)
  const controlRecovery = analyzeControl(images[2], images[0]), steeringRecovery = analyzeSteering(images[2]), placementRecovery = analyzePlacement(images[2], images[0])
  const ballMotionRecovery = analyzeBallMotion(images[2]), ballInteractionRecovery = analyzeBallInteraction(images[2],images[0])
  const ballFlightRecovery=await analyzeBallFlight(images[2],images[0]),ballPhaseRecovery=await analyzeBallPhase(images[2],images[0])
  const playerBallRecovery=await analyzePlayerBall(images[2],images[0])
  const possessionRecovery=await analyzePossession(images[2]),boundaryRecovery=await analyzeBoundary(images[2],images[0])
  const eventsRecovery=await analyzeEvents(images[2])
  let actionRecovery = analyzeAction(images[2])
  for (const recovery of [controlRecovery, steeringRecovery, placementRecovery,ballMotionRecovery,ballInteractionRecovery,actionRecovery,ballFlightRecovery,ballPhaseRecovery,playerBallRecovery,possessionRecovery,boundaryRecovery,eventsRecovery]) {
    if (recovery.status !== 'reconstruction-only') throw new Error('The executable images do not match reviewed control/steering recovery')
    for (const name of recovery.nativeExports) if (typeof native.core[name] !== 'function') throw new Error(`Missing native control export: ${name}`)
  }
  const controlConfig = controlRecovery.boundsProfiles?.length ? { version: 1, status: 'isolated-control-test',
    sine: controlRecovery.tables.quarterSine.values, atan: controlRecovery.tables.quarterAtan.values,
    thresholds: steeringRecovery.tables.turnThresholds.values, caps: steeringRecovery.tables.classSpeedCaps.values,
    bounds: controlRecovery.boundsProfiles[2].bounds, profileIndices: [10, 10],
    turnCoefficient: steeringRecovery.inspectionRecipe.turnCoefficient,
    motionFlags: steeringRecovery.inspectionRecipe.motionFlags216, entityFlags: steeringRecovery.inspectionRecipe.ownerFlags36,
    entityState: steeringRecovery.inspectionRecipe.ownerStateFlags24,
    time: { kind: 'inspection-cadence', ticksPerSecond: 60 },
    sources: { control: controlRecovery.profile, steering: steeringRecovery.profile },
    ball: { parameter:10, flight:{duration:60,speed:9*65536,height:16*65536,horizontalCap:35*65536,verticalCap:25*65536},releaseAttribute:10,
      radius:boundaryRecovery.normalProfile2.radius,gravity:0xfe000000, options:0, seed:0,
      material:matchRecovery.materialTables.map((table) => table.values[0]),
      atan16:ballInteractionRecovery.tables.atan16.values, exponential:ballInteractionRecovery.tables.exponential.values,
      inverseA:ballFlightRecovery.tables.inverseA.values.map((word)=>word>>>0),inverseB:ballFlightRecovery.tables.inverseB.values.map((word)=>word>>>0) },
  } : null
  const webFiles = ['index.html', 'style.css', 'app.mjs', 'native.mjs', 'scene-view.mjs', 'player-view.mjs', 'control-view.mjs']
  const webBytes = await Promise.all(webFiles.map((file) => regularBytes(path.join(webRoot, file), 2 * 1024 * 1024)))
  const modules = ['textures.mjs', 'mods.mjs', 'models.mjs', 'scene.mjs', 'pitch.mjs', 'animation.mjs', 'player-scene.mjs', 'motion-playback.mjs', 'control-session.mjs', 'control-input.mjs', 'control-scene.mjs', 'control-animation.mjs','control-ball.mjs','action-transition.mjs','action-calibration.mjs','ball-visual.mjs']
  const moduleBytes = await Promise.all(modules.map((file) => regularBytes(path.join(moduleRoot, file), 2 * 1024 * 1024)))
  await mkdir(path.dirname(destination), { recursive: true })
  const staging = await mkdtemp(path.join(path.dirname(destination), '.fifa98-web-'))
  try {
    await mkdir(path.join(staging, 'assets'))
    await mkdir(path.join(staging, 'modules'))
    const textures = []
    let bitmapCount = 0
    for (const relative of paths) {
      const expected = index.get(relative)
      const bytes = await readMember(membersDirectory, relative, expected)
      const decoded = decodePsh(bytes)
      for (const texture of decoded.textures) verifyTextureParity(texture, native)
      const asset = `assets/${String(textures.length).padStart(4, '0')}.psh`
      await writeFile(path.join(staging, asset), bytes, { flag: 'wx' })
      textures.push({ id: expected.id, path: asset, sourceSha256: expected.sha256, textureCount: decoded.textures.length,
        textures: decoded.textures.map(({ index, name, width, height, bitsPerPixel, palette }) => ({ index, name, width, height, bitsPerPixel, paletteLength: palette?.length ?? 0 })) })
      bitmapCount += decoded.textures.length
    }
    const scenes = [], sceneGroups = new Map()
    for (const [relative, entry] of index) {
      const match = /^ZGMS_(\d{2})(D|N)\.BIG\/[^/]+\.pc$/.exec(relative)
      if (!match) continue
      const id = `ZGMS_${match[1]}${match[2]}.BIG`
      if (!sceneGroups.has(id)) sceneGroups.set(id, { id, stadiumId: match[1], time: match[2], members: [] })
      sceneGroups.get(id).members.push({ relative, entry })
    }
    let modelIndex = 0
    for (const group of [...sceneGroups.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
      const models = [], assets = []
      for (const { relative, entry } of group.members.sort((a, b) => a.relative.localeCompare(b.relative, 'en'))) {
        const bytes = await readMember(membersDirectory, relative, entry)
        models.push(parsePcmd(bytes))
        const asset = `assets/model-${String(modelIndex++).padStart(4, '0')}.pc`
        await writeFile(path.join(staging, asset), bytes, { flag: 'wx' })
        assets.push({ id: entry.id, path: asset, sourceSha256: entry.sha256 })
      }
      const scene = createDirectScene(models)
      const nativeScene = createDirectScene(models, native.core)
      if (JSON.stringify(scene) !== JSON.stringify(nativeScene)) throw new Error(`Native model conversion differs from recovered loader: ${group.id}`)
      const textureId = `ZGAS_${group.stadiumId}.BIG/stad${group.stadiumId}.psh`
      const texture = textures.find((entry) => entry.id === textureId)
      if (!texture) throw new Error(`Missing original stadium textures: ${textureId}`)
      const unresolvedTags = [...new Set(scene.batches.filter((batch) => batch.textureTag && !texture.textures.some((item) => item.name === batch.textureTag)).map((batch) => batch.textureTag))]
      if (unresolvedTags.length) throw new Error(`Missing stadium material textures: ${unresolvedTags.join(', ')}`)
      scenes.push({ id: group.id, stadiumId: group.stadiumId, time: group.time, models: assets, textureId, counts: scene.counts })
    }
    let pitch = null, pitchRecovery = null
    if (scenes.length) {
      const textureId = 'ZGAOTHER.BIG/grass.psh', entry = index.get(textureId)
      if (!entry) throw new Error('Original grass texture is missing')
      const grass = await readMember(membersDirectory, textureId, entry)
      pitchRecovery = inspectPitchRecovery(images[2], { grass })
      if (pitchRecovery.status === 'unsupported') throw new Error('The backend does not match recovered grass geometry')
      for (let profile = 0; profile < 5; profile++) {
        const referencePitch = createPitchGeometry({ profile, margin: 192 })
        const nativePitch = createPitchGeometry({ profile, margin: 192, nativeCore: native.core })
        if (JSON.stringify(referencePitch) !== JSON.stringify(nativePitch)) throw new Error(`Original pitch conversion parity failed for profile ${profile}`)
      }
      pitch = { profile: 2, margin: 192, textureId, textureName: 'dryo', shading: 'preview-white' }
    }
    const animationIndex = [], decoded115 = new Map(), assets115 = new Map()
    const motionEntries = [...index].filter(([, entry]) => /^(?:MOPSX115\.BK[2-9]\/[^/]+|ZMODAT(?:30)?\.BIG\/mopsx(?:115|130)\.viv\/[^/]+)$/.test(entry.id))
    let baseFrame
    if (motionEntries.length) {
      const baseEntry = motionEntries.find(([, entry]) => entry.id === 'ZMODAT.BIG/mopsx115.viv/aaaaaa')
      if (!baseEntry) throw new Error('Original AAAAAA player pose initializer is missing')
      const baseBytes = await readMember(membersDirectory, baseEntry[0], baseEntry[1])
      motionRecovery = await analyzeMotion(images[2], { baseClip: baseBytes })
      if (motionRecovery.basePose?.baseClipVerified !== true) throw new Error('The original AAAAAA initializer does not match reviewed pose data')
      baseFrame = parseMopClip(baseBytes).frames[0]
    }
    let keyCount = 0, poseMatrices = 0, skinnedPoses = 0, headPoses = 0, playerModel, playerAsset, headModel, headAsset
    for (const [relative, entry] of motionEntries) {
      const bytes = await readMember(membersDirectory, relative, entry)
      const clip = parseMopClip(bytes)
      const nativeClip = parseMopClip(bytes, { decodeDeltas: native.decodeMotionDeltas })
      if (JSON.stringify(clip) !== JSON.stringify(nativeClip)) throw new Error(`Native motion decoding differs for ${entry.id}`)
      if (!playerModel) {
        const member = 'ZGMPLYR3.BIG/nhigh.pc'
        const bytes = await readMember(membersDirectory, member, index.get(member))
        playerModel = parsePcmd(bytes)
        playerAsset = { id: member, path: 'assets/player-nhigh.pc', sourceSha256: index.get(member).sha256 }
        await writeFile(path.join(staging, playerAsset.path), bytes, { flag: 'wx' })
        const headMember = 'ZGMPLYR3.BIG/nhead1.pc'
        const headBytes = await readMember(membersDirectory, headMember, index.get(headMember))
        headModel = parsePcmd(headBytes)
        headAsset = { id: headMember, path: 'assets/player-nhead1.pc', sourceSha256: index.get(headMember).sha256 }
        await writeFile(path.join(staging, headAsset.path), headBytes, { flag: 'wx' })
      }
      if (typeof native.core.fifa98_pcmd_quaternion_matrix !== 'function') throw new Error('Missing native local quaternion conversion')
      const input = new Int32Array(native.core.memory.buffer, native.core.fifa98_pcmd_quaternion(), 4)
      const output = new Int32Array(native.core.memory.buffer, native.core.fifa98_pcmd_matrix(), 9)
      for (const frame of clip.frames) {
        for (const joint of recoverPcmdJointParameters(playerModel, frame, { baseFrame, alternateScale: true })) {
          const expected = recoverPcmdQuaternionMatrix(joint.quaternion12)
          input.set(joint.quaternion12)
          if (native.core.fifa98_pcmd_quaternion_matrix() !== 1 || expected.some((value, axis) => value !== output[axis])) throw new Error(`Native local quaternion conversion differs for ${entry.id}, key ${frame.index}, joint ${joint.nodeIndex}`)
          poseMatrices++
        }
        const geometry = recoverPlayerGeometry(playerModel, frame, undefined, { baseFrame })
        const nativeGeometry = recoverPlayerGeometry(playerModel, frame, native.core, { baseFrame })
        if (JSON.stringify(geometry) !== JSON.stringify(nativeGeometry)) throw new Error(`Native player skinning differs for ${entry.id}, key ${frame.index}`)
        const head = recoverPlayerHeadGeometry(headModel, geometry)
        const nativeHead = recoverPlayerHeadGeometry(headModel, nativeGeometry, native.core)
        if (JSON.stringify(head) !== JSON.stringify(nativeHead)) throw new Error(`Native head attachment differs for ${entry.id}, key ${frame.index}`)
        headPoses++
        skinnedPoses++
      }
      const asset = `assets/motion-${String(animationIndex.length).padStart(4, '0')}.mop`
      await writeFile(path.join(staging, asset), bytes, { flag: 'wx' })
      const animationAsset = { id: entry.id, path: asset, sourceSha256: entry.sha256, keys: clip.frames.length, channels: clip.valueCount,
        translationMask: clip.translationMask, rotationMask: clip.rotationMask }
      animationIndex.push(animationAsset)
      const clipName = entry.id.split('/').at(-1).toLowerCase()
      if (!entry.id.startsWith('ZMODAT30.') && !decoded115.has(clipName)) {
        decoded115.set(clipName, clip); assets115.set(clipName, animationAsset)
      }
      keyCount += clip.frames.length
    }
    let locomotion = null,ballVisualRecovery = null
    if (controlConfig && decoded115.size) {
      const ballMember='ZCRAM.BIG/gameball.psh'
      const ballBytes=await readMember(membersDirectory,ballMember,index.get(ballMember))
      ballVisualRecovery=await inspectBallVisual(images[2],images[0],ballBytes)
      if(ballVisualRecovery.status!=='reconstruction-only')throw new Error('Original ball sprite source mismatch')
      const ballDecoded=decodePsh(ballBytes),ballVisual=decodeBallVisual(ballBytes)
      for(const texture of ballVisual.frames){
        const rgba=native.render(ballDecoded.textures[texture.index],ballDecoded.textures[ballVisual.paletteIndex].palette)
        if(!Buffer.from(rgba).equals(Buffer.from(texture.rgba)))throw new Error('Native ball palette composition differs from original indexed sprite')
      }
      controlConfig.ball.visual={textureId:ballMember,paletteIndex:1,orientationTable:ballVisualRecovery.orientationTable,
        zoomRaw:ballVisualRecovery.defaultZoomRaw,rollPhase:0}
      const member = 'ZMODAT.BIG/aiseqs.tbi'
      const bytes = await readMember(membersDirectory, member, index.get(member))
      actionRecovery = analyzeAction(images[2],bytes)
      if (actionRecovery.status !== 'reconstruction-only') throw new Error('Original action runtime source mismatch')
      const tables = await prepareLocomotionTables(images[2], bytes, decoded115)
      // This is BA460's exact0/-100,A/B numeric calibration for resolved,
      // available115 action clips. It does not assert queue eligibility or
      // execute animation callbacks. Preserve source invalid-phase results.
      const calibrations=tables.database.records.flatMap((record)=>{
        const clip=decoded115.get(record.clipName)
        if(!clip)return[]
        const value=calibrateAction(native.core,clip,record,controlConfig)
        return value ? [{actionId:record.actionId,clipName:record.clipName,...value}] : []
      })
      eventsRecovery.calibrationValidation={recipe:{startSelector:0,endSelector:-100,startReference:0,endReference:1},
        cases:calibrations.length,actions:calibrations}
      const variant = native.core.fifa98_locomotion_run_variant(0, 0)
      if (variant !== 0) throw new Error('Native run-variant selection differs from the source initializer fixture')
      const runVariant = tables.runVariants[variant]
      const selectorState = new Uint32Array(native.core.memory.buffer, native.core.fifa98_locomotion_state(), 3)
      const selectorMotion = new Uint32Array(native.core.memory.buffer, native.core.fifa98_locomotion_motion(), 9)
      new Uint8Array(native.core.memory.buffer, native.core.fifa98_locomotion_categories(), 252).set(tables.categoryBytes)
      new Uint16Array(native.core.memory.buffer, native.core.fifa98_locomotion_actions(), 330).set(tables.actionHalfwords)
      let selectorCases = 0
      for (let category = 0; category < 12; category++) for (let speed = 0; speed < 18; speed++) for (let turnClass = 0; turnClass < 3; turnClass++) for (const turn of [-400,-27,-26,-10,-9,0,9,10,26,27,400]) {
        const state = [category, 65536, 30], motion = [speed * 65536, turnClass, turn, 128, 256, 0, 50, runVariant.actionId, runVariant.referenceRaw]
        selectorState.set(state); selectorMotion.set(motion)
        const actionId = native.core.fifa98_locomotion_select(native.core.fifa98_locomotion_state(), native.core.fifa98_locomotion_motion(), native.core.fifa98_locomotion_categories(), native.core.fifa98_locomotion_actions()) >>> 0
        if (JSON.stringify({ actionId, state: Array.from(selectorState) }) !== JSON.stringify(selectLocomotionAction(state, motion, tables))) throw new Error('Native original locomotion selection differs from independent source arithmetic')
        selectorCases++
      }
      const actionIds = new Set([runVariant.actionId])
      // This control fixture has ordinary style0. Include all eleven categories
      // from its center table and four source turning tables; never choose130
      // resources for the loader's explicitly selected115 bank.
      for (let category = 0; category < 11; category++) {
        actionIds.add(tables.actionHalfwords[category * 2])
        for (const offset of [110, 165, 220, 275]) actionIds.add(tables.actionHalfwords[offset + category])
      }
      const actions = [...actionIds].sort((a,b) => a-b).map((actionId) => {
        const record = tables.database.records[actionId], asset = assets115.get(record.clipName), clip = decoded115.get(record.clipName)
        if (!asset || !clip || clip.keyCount < 2) throw new Error(`Control test requires an original motion resource: ${actionId}`)
        return { actionId, clipName: record.clipName, actionFlags: record.flagsRaw, headingOffsetRaw:record.headingOffsetRaw, asset }
      })
      const mirrorMap = actionRecovery.tables.mirrorMap.values
      let actionKeyCases = 0, previousFrame
      for (const action of actions) for (const frame of decoded115.get(action.clipName).frames) {
        const options = { baseFrame, previousFrame, runtimeFlags:actionRuntimeFlags(action.actionFlags), mirrorMap }
        const expected = recoverActionFrame(frame,options), actual = recoverActionFrame(frame,{...options,nativeCore:native.core})
        if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Native action mirroring/retained key differs from original arithmetic')
        previousFrame = expected; actionKeyCases++
      }
      actionRecovery.validation = { nativeKeyPoseCases:actionKeyCases }
      controlConfig.animation = { categoryBytes: tables.categoryBytes, actionHalfwords: tables.actionHalfwords, runVariant, actions, mirrorMap }
      const ballTest = createControlBall(native.core,controlConfig.ball,controlConfig)
      if(boundaryRecovery.normalProfile2.halfWidth!==controlConfig.bounds[0] ||
          boundaryRecovery.normalProfile2.halfLength!==controlConfig.bounds[1])throw new Error('Original player and ball pitch dimensions disagree')
      const pitchCrossings=[]
      for(const axis of [0,2])for(const side of [-1,1]){
        const limit=controlConfig.bounds[axis===0?0:1],fixedPosition=[0,0],target=[0,0,0]
        fixedPosition[axis===0?0:1]=side*(limit-2)*65536;target[axis]=side*(limit+190)
        ballTest.reset();ballTest.launchFrom({fixedPosition,target,facing:0})
        for(let i=0;i<20&&ballTest.snapshot().active;i++)ballTest.step(1)
        const crossing=ballTest.snapshot()
        if(crossing.stopReason!=='outside-pitch'||crossing.boundaryFlag!==16||
            Math.abs(crossing.fixedPosition[axis])<=(limit+controlConfig.ball.radius)*65536)throw new Error('Original radius-adjusted pitch crossing fixture failed')
        pitchCrossings.push({axis,side,state:crossing})
      }
      boundaryRecovery.validation={pitchCrossings}
      ballTest.reset()
      ballTest.launchFrom({fixedPosition:[0,0],target:[0,0,0],facing:0})
      for(let i=0;i<3000 && ballTest.snapshot().active;i++)ballTest.step(1)
      const trajectory = ballTest.snapshot()
      if (trajectory.stopReason !== 'rest' || trajectory.position[2] <= 0) throw new Error('Original ball launch inspection fixture did not roll to rest')
      ballInteractionRecovery.validation = { groundedLaunchFixture:trajectory }
      const airborneFixtures={}
      for(const kind of ['loft','curve','reverse-curve','speed','height']){
        ballTest.reset();const initial=ballTest.launchFrom({fixedPosition:[0,0],target:[0,0,192],facing:0},{kind})
        if(initial.velocity[1]<=0)throw new Error('Original airborne launch fixture did not rise')
        let peak=0
        for(let i=0;i<3000&&ballTest.snapshot().active;i++){const state=ballTest.step(1);peak=Math.max(peak,state.position[1])}
        const final=ballTest.snapshot()
        if(final.stopReason!=='rest'||final.position[1]!==0||peak<=0)throw new Error('Original airborne fixture did not return to ground and rest')
        airborneFixtures[kind]={initial,peak,final}
      }
      ballFlightRecovery.validation={airborneFixtures}
      const speedFixtures=[]
      for(const speed of [5,9,18,35,50]){
        ballTest.reset()
        const initial=ballTest.launchFrom({fixedPosition:[0,0],target:[0,0,192],facing:0},{kind:'speed',speed:speed*65536})
        if(initial.sourceLaunch.duration<1||initial.sourceLaunch.duration>319||initial.sourceLaunch.requestedSpeed!==speed*65536)throw new Error('Original speed-selected launch failed')
        speedFixtures.push(initial)
      }
      ballFlightRecovery.validation.speedFixtures=speedFixtures
      const heightFixtures=[]
      for(const height of [4,16,64,128]){
        ballTest.reset()
        const initial=ballTest.launchFrom({fixedPosition:[0,0],target:[0,0,192],facing:0},{kind:'height',height:height*65536})
        if(initial.sourceLaunch.duration<0||initial.sourceLaunch.duration>319||initial.sourceLaunch.height!==height*65536)throw new Error('Original height-selected launch failed')
        heightFixtures.push(initial)
      }
      ballFlightRecovery.validation.heightFixtures=heightFixtures
      const controller=createControlSession(native.core,controlConfig)
      const controlledAnimation=createControlAnimation(native.core,controlConfig.animation,
        new Map(actions.map((action)=>[action.actionId,decoded115.get(action.clipName)])),{baseFrame})
      controlledAnimation.step(controller.snapshot(),0)
      ballTest.reset();ballTest.carryFrom(controller.snapshot())
      let ownedTicks=0
      for(const direction of [1,8,2,4,0])for(let i=0;i<60;i++){
        const moved=controller.step(direction,1)
        if(!moved.advanced)throw new Error('Owned-ball fixture reached an unsupported player action')
        const pose=controlledAnimation.step(moved.state,1)
        ballTest.step(1,{player:moved.state,marker:pose.marker});ownedTicks++
      }
      const owned=ballTest.snapshot(),released=ballTest.launchFrom(controller.snapshot(),{kind:'loft'})
      if(!owned.owned||released.owned||JSON.stringify(owned.fixedPosition)!==JSON.stringify(released.fixedPosition))throw new Error('Owned-ball release changed its source position')
      playerBallRecovery.validation={ownedTicks,owned,released}
      if(released.possession.state[0]!==0||released.possession.state[1]!==1||released.possession.state[9]!==0||
          JSON.stringify(released.possession.history)!==JSON.stringify(owned.possession.history))throw new Error('Original ownership release changed unsupported history or retained its owner')
      possessionRecovery.validation={fixture:'explicitly eligible unowned player1; attachment token1 supplied separately',
        state:owned.possession,released:released.possession}
      locomotion = { ...tables.evidence, calibration: { runVariants: tables.runVariants, nativeSelectorCases: selectorCases,
        centerReferences: tables.actionHalfwords.slice(0, 110), loadedClipBank: 'mopsx115', supportedControlActions: actions.length },
        inspection: { actionChange: 'restart source phase; retain sparse pose and apply original per-key mirroring in the unlinked zero-heading branch; phase search, blends, heading offsets and callbacks remain unrecovered',
          runVariantAttributes: { byte61: 0, halfword24: 0 }, selectorCategory: 0, categoryDeadline: 'low16(wholeClock+30) on action changes' } }
    }
    const controlBytes = JSON.stringify(controlConfig, null, 2) + '\n'
    const playerTextureId = 'ZFPLYTEX.BIG/fplytex.psh'
    if (playerModel && !textures.some((entry) => entry.id === playerTextureId &&
        [...playerModel.materials, ...headModel.materials].every((material) => !(material.flagsRaw & 1) || entry.textures.some((texture) => texture.name === material.textureTag)))) throw new Error('Original player material textures are missing')
    const manifest = { version: 1, status: 'reconstruction-only', baseSha256, counts: roster.counts, textures, scenes, pitch,
      controls: controlConfig ? { path: 'control-config.json', sha256: sha256(controlBytes) } : null,
      player: playerModel ? { model: playerAsset, head: headAsset, textureId: playerTextureId, clips: animationIndex,
        baseClip: animationIndex.find((entry) => entry.id === 'ZMODAT.BIG/mopsx115.viv/aaaaaa') } : null,
      animation: { clips: animationIndex.length, keys: keyCount, localPoseMatrices: poseMatrices, skinnedPoses, headPoses,
        poseMapping: 'joint-parameters-recovered', skinning: 'native-key-poses' },
      recovery: { contexts: codeMap.contexts.map((context) => ({ name: context.context, functionCount: context.functions.length })),
        nativeRoutines: codeMap.recoveryCandidates.length + [...matchRecovery.routines, ...playerRecovery.routines, ...controlRecovery.routines].filter((routine) => routine.kind.startsWith('complete-')).length }, native: build }
    const outputs = [
      ...webFiles.map((file, i) => [file, webBytes[i]]), ...modules.map((file, i) => [`modules/${file}`, moduleBytes[i]]),
      ['fifa98-core.wasm', wasm], ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
      ['roster.json', JSON.stringify(roster) + '\n'], ['code-map.json', JSON.stringify(codeMap) + '\n'],
      ['match-recovery.json', JSON.stringify(matchRecovery, null, 2) + '\n'],
      ['animation-index.json', JSON.stringify(animationIndex, null, 2) + '\n'],
      ['pitch-recovery.json', JSON.stringify(pitchRecovery, null, 2) + '\n'],
      ['player-recovery.json', JSON.stringify(playerRecovery, null, 2) + '\n'],
      ['motion-playback.json', JSON.stringify(motionRecovery, null, 2) + '\n'],
      ['control-config.json', controlBytes],
      ['control-target-recovery.json', JSON.stringify(controlRecovery, null, 2) + '\n'],
      ['steering-recovery.json', JSON.stringify(steeringRecovery, null, 2) + '\n'],
      ['locomotion-animation.json', JSON.stringify(locomotion, null, 2) + '\n'],
      ['player-placement.json', JSON.stringify(placementRecovery, null, 2) + '\n'],
      ['ball-motion-recovery.json',JSON.stringify(ballMotionRecovery,null,2)+'\n'],
      ['ball-flight-recovery.json',JSON.stringify(ballFlightRecovery,null,2)+'\n'],
      ['ball-visual-phase.json',JSON.stringify(ballPhaseRecovery,null,2)+'\n'],
      ['player-ball-recovery.json',JSON.stringify(playerBallRecovery,null,2)+'\n'],
      ['possession-recovery.json',JSON.stringify(possessionRecovery,null,2)+'\n'],
      ['ball-boundary-recovery.json',JSON.stringify(boundaryRecovery,null,2)+'\n'],
      ['action-events-recovery.json',JSON.stringify(eventsRecovery,null,2)+'\n'],
      ['ball-interaction-recovery.json',JSON.stringify(ballInteractionRecovery,null,2)+'\n'],
      ['action-transition-recovery.json',JSON.stringify(actionRecovery,null,2)+'\n'],
      ['ball-visual-recovery.json',JSON.stringify(ballVisualRecovery,null,2)+'\n'],
    ]
    for (const [file, bytes] of outputs) await writeFile(path.join(staging, file), bytes, { flag: 'wx' })
    if (await lstat(destination).catch((error) => { if (error.code !== 'ENOENT') throw error; return null })) throw new Error('Preview output was created during preparation; refusing replacement.')
    await rename(staging, destination)
    return { output: destination, manifest, parity: { containers: textures.length, bitmaps: bitmapCount } }
  } finally { await rm(staging, { recursive: true, force: true }) }
}

export async function runPrepareWeb(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { reference: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/prepare-web.mjs [--reference EXTRACTED_DIRECTORY] [--out NEW_DIRECTORY]\nDefault output: games/fifa98/.work/web. Existing outputs are never replaced.'); return }
  const { output, manifest, parity } = await prepareWeb(values)
  console.log(JSON.stringify({ output, status: manifest.status, counts: manifest.counts, parity }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runPrepareWeb().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
