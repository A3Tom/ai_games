import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prepareWeb, referenceMemberIndex, verifyNativeBuild } from './prepare-web.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
function leb(value) { const out = []; do { const b = value & 127; value >>>= 7; out.push(b | (value ? 128 : 0)) } while (value); return out }
function section(id, values) { return [id, ...leb(values.length), ...values] }
function fixtureWasm() {
  const names = ['fifa98_pixels', 'fifa98_palette', 'fifa98_rgba', 'fifa98_capacity', 'fifa98_decode_indexed', 'fifa98_attribute_display', 'fifa98_signed_reciprocal']
  const exportEntry = (name, kind, index) => [...leb(name.length), ...Buffer.from(name), kind, ...leb(index)]
  const bodies = [0, 16, 1024, 1, 1, 0, 0].map((value) => { const body = [0, 0x41, ...leb(value), 0x0b]; return [...leb(body.length), ...body] })
  return Buffer.from([0, 97, 115, 109, 1, 0, 0, 0,
    ...section(1, [1, 0x60, 0, 1, 0x7f]), ...section(3, [7, ...names.map(() => 0)]), ...section(5, [1, 0, 1]),
    ...section(7, [8, ...exportEntry('memory', 2, 0), ...names.flatMap((name, i) => exportEntry(name, 0, i))]),
    ...section(10, [7, ...bodies.flat()]),
  ])
}
function emptyDb(magic, size, teamOffset, playerOffset) {
  const bytes = Buffer.alloc(size)
  bytes.write(magic); bytes.writeUInt32LE(400, 4); bytes.writeUInt32LE(20, 8)
  bytes.writeUInt32LE(teamOffset, 12); bytes.writeUInt32LE(playerOffset, 16)
  if (magic === 'FCDB') { bytes.writeUInt32LE(64, 32); bytes.writeUInt32LE(20, 40) }
  return bytes
}
function transparentPsh() {
  const bytes = Buffer.alloc(90)
  bytes.write('SHPP'); bytes.writeUInt32LE(90, 4); bytes.writeUInt32LE(1, 8); bytes.write('GIMX', 12)
  bytes.write('TEST', 16); bytes.writeUInt32LE(24, 20); bytes.writeUInt32LE(0x1240, 24)
  bytes.writeUInt16LE(1, 28); bytes.writeUInt16LE(1, 30)
  bytes[42] = 0x23; bytes.writeUInt16LE(16, 46); bytes.writeUInt16LE(1, 48)
  return bytes
}
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fifa98-web-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const reference = path.join(directory, 'reference'), nativeDirectory = path.join(directory, 'engine'), webDirectory = path.join(directory, 'web'), moduleDirectory = path.join(directory, 'modules')
  await Promise.all([mkdir(path.join(reference, 'members'), { recursive: true }), mkdir(path.join(reference, 'disc'), { recursive: true }), mkdir(nativeDirectory), mkdir(webDirectory), mkdir(moduleDirectory)])
  const members = {
    'ZRESTDB.BIG/fcdb.dbi': emptyDb('FCDB', 44, 28, 36),
    'ZRESTDB.BIG/fcdbpeng.dbi': emptyDb('STR1', 28, 20, 20),
    'ZENGDB.BIG/fcdb_eng.dbi': emptyDb('STR0', 36, 28, 0),
    'TEXTURES.BIG/sample.psh': transparentPsh(),
  }
  const report = { version: 1, files: [] }
  for (const [id, data] of Object.entries(members)) {
    const [container, name] = id.split('/')
    await mkdir(path.join(reference, 'members', container), { recursive: true })
    await writeFile(path.join(reference, 'members', id), data)
    let file = report.files.find((item) => item.path === container)
    if (!file) { file = { path: container, archive: { entries: [] } }; report.files.push(file) }
    file.archive.entries.push({ name, size: data.length, sha256: digest(data) })
  }
  for (const name of ['SLES_009.14', 'FECODE.BIN', 'BECODE.BIN']) {
    const data = Buffer.from(name)
    await writeFile(path.join(reference, 'disc', name), data)
    report.files.push({ path: name, size: data.length, sha256: digest(data) })
  }
  await writeFile(path.join(reference, 'report.json'), JSON.stringify(report))
  const wasm = fixtureWasm(), source = Buffer.from('synthetic test source')
  const nativeSource = path.join(nativeDirectory, 'core.c')
  const manifest = { version: 1, status: 'reconstruction-only', sourceSha256: digest(source), wasmSha256: digest(wasm), bytes: wasm.length,
    exports: WebAssembly.Module.exports(await WebAssembly.compile(wasm)).map((item) => item.name), imports: [] }
  await Promise.all([writeFile(nativeSource, source), writeFile(path.join(nativeDirectory, 'fifa98-core.wasm'), wasm), writeFile(path.join(nativeDirectory, 'build.json'), JSON.stringify(manifest))])
  for (const name of ['index.html', 'style.css', 'app.mjs', 'native.mjs', 'scene-view.mjs', 'player-view.mjs', 'control-view.mjs']) await writeFile(path.join(webDirectory, name), name)
  for (const name of ['textures.mjs', 'mods.mjs', 'models.mjs', 'scene.mjs', 'pitch.mjs', 'animation.mjs', 'player-scene.mjs', 'motion-playback.mjs', 'control-session.mjs', 'control-input.mjs', 'control-scene.mjs', 'control-animation.mjs', 'control-ball.mjs', 'action-transition.mjs', 'action-calibration.mjs', 'ball-visual.mjs']) await writeFile(path.join(moduleDirectory, name), name)
  const analyze = () => ({ status: 'static-recovery-map', contexts: [{ context: 'fixture', functions: [{ address: '0x0' }] }], recoveryCandidates: [{}, {}] })
  const analyzeMatch = () => ({ status: 'reconstruction-only', nativeExports: [], routines: [] })
  const analyzePlayer = analyzeMatch, analyzeMotion = () => ({ status: 'reconstruction-only', regions: [] })
  return { options: { reference, out: path.join(directory, 'preview'), nativeDirectory, webDirectory, moduleDirectory, nativeSource }, analyze, analyzeMatch, analyzePlayer, analyzeMotion, members, report, directory, wasm, source, manifest }
}

test('prepares a self-contained preview with verified data, fixed-order database hash and native parity', async (t) => {
  const f = await fixture(t)
  const result = await prepareWeb(f.options, { analyze: f.analyze, analyzeMatch: f.analyzeMatch, analyzePlayer: f.analyzePlayer, analyzeMotion: f.analyzeMotion, analyzeControl: f.analyzeMatch, analyzeSteering: f.analyzeMatch, analyzePlacement: f.analyzeMatch, analyzeBallMotion:f.analyzeMatch, analyzeBallInteraction:f.analyzeMatch, analyzeAction:f.analyzeMatch, analyzeBallFlight:f.analyzeMatch, analyzeBallPhase:f.analyzeMatch, analyzePlayerBall:f.analyzeMatch, analyzePossession:f.analyzeMatch, analyzeBoundary:f.analyzeMatch, analyzeEvents:f.analyzeMatch })
  assert.deepEqual(result.parity, { containers: 1, bitmaps: 1 })
  assert.equal(result.manifest.baseSha256, digest(Buffer.concat(Object.values(f.members).slice(0, 3))))
  assert.deepEqual(result.manifest.counts, { leagues: 0, teams: 0, players: 0 })
  assert.equal(result.manifest.textures[0].id, 'TEXTURES.BIG/sample.psh')
  assert.equal(result.manifest.textures[0].textures[0].paletteLength, 16)
  assert.deepEqual(await readFile(path.join(result.output, 'assets/0000.psh')), f.members['TEXTURES.BIG/sample.psh'])
  assert.deepEqual((await readdir(result.output)).sort(), ['action-events-recovery.json', 'action-transition-recovery.json', 'animation-index.json', 'app.mjs', 'assets', 'ball-boundary-recovery.json', 'ball-flight-recovery.json', 'ball-interaction-recovery.json', 'ball-motion-recovery.json', 'ball-visual-phase.json', 'ball-visual-recovery.json', 'code-map.json', 'control-config.json', 'control-target-recovery.json', 'control-view.mjs', 'fifa98-core.wasm', 'index.html', 'locomotion-animation.json', 'manifest.json', 'match-recovery.json', 'modules', 'motion-playback.json', 'native.mjs', 'pitch-recovery.json', 'player-ball-recovery.json', 'player-placement.json', 'player-recovery.json', 'player-view.mjs', 'possession-recovery.json', 'roster.json', 'scene-view.mjs', 'steering-recovery.json', 'style.css'])
  await assert.rejects(prepareWeb(f.options, { analyze: f.analyze, analyzeMatch: f.analyzeMatch, analyzePlayer: f.analyzePlayer, analyzeMotion: f.analyzeMotion, analyzeControl: f.analyzeMatch, analyzeSteering: f.analyzeMatch, analyzePlacement: f.analyzeMatch, analyzeBallMotion:f.analyzeMatch, analyzeBallInteraction:f.analyzeMatch, analyzeAction:f.analyzeMatch, analyzeBallFlight:f.analyzeMatch, analyzeBallPhase:f.analyzeMatch, analyzePlayerBall:f.analyzeMatch, analyzePossession:f.analyzeMatch, analyzeBoundary:f.analyzeMatch, analyzeEvents:f.analyzeMatch }), /already exists/)
})

test('rejects modified source assets and symlink members before publishing', async (t) => {
  const f = await fixture(t)
  const member = path.join(f.options.reference, 'members/TEXTURES.BIG/sample.psh')
  await writeFile(member, Buffer.alloc(90))
  await assert.rejects(prepareWeb(f.options, { analyze: f.analyze, analyzeMatch: f.analyzeMatch, analyzePlayer: f.analyzePlayer, analyzeMotion: f.analyzeMotion, analyzeControl: f.analyzeMatch, analyzeSteering: f.analyzeMatch, analyzePlacement: f.analyzeMatch, analyzeBallMotion:f.analyzeMatch, analyzeBallInteraction:f.analyzeMatch, analyzeAction:f.analyzeMatch, analyzeBallFlight:f.analyzeMatch, analyzeBallPhase:f.analyzeMatch, analyzePlayerBall:f.analyzeMatch, analyzePossession:f.analyzeMatch, analyzeBoundary:f.analyzeMatch, analyzeEvents:f.analyzeMatch }), /hash mismatch/)
  await writeFile(member, f.members['TEXTURES.BIG/sample.psh'])
  await symlink(member, path.join(f.options.reference, 'members/TEXTURES.BIG/alias.psh'))
  await assert.rejects(prepareWeb(f.options, { analyze: f.analyze, analyzeMatch: f.analyzeMatch, analyzePlayer: f.analyzePlayer, analyzeMotion: f.analyzeMotion, analyzeControl: f.analyzeMatch, analyzeSteering: f.analyzeMatch, analyzePlacement: f.analyzeMatch, analyzeBallMotion:f.analyzeMatch, analyzeBallInteraction:f.analyzeMatch, analyzeAction:f.analyzeMatch, analyzeBallFlight:f.analyzeMatch, analyzeBallPhase:f.analyzeMatch, analyzePlayerBall:f.analyzeMatch, analyzePossession:f.analyzeMatch, analyzeBoundary:f.analyzeMatch, analyzeEvents:f.analyzeMatch }), /symlinks/)
  assert.equal((await readdir(f.directory)).some((name) => name.startsWith('.fifa98-web-')), false)
})

test('native parity failure cleans staging and preserves source files', async (t) => {
  const f = await fixture(t)
  const psh = f.members['TEXTURES.BIG/sample.psh']
  psh.writeUInt16LE(31, 58)
  await writeFile(path.join(f.options.reference, 'members/TEXTURES.BIG/sample.psh'), psh)
  f.report.files.find((file) => file.path === 'TEXTURES.BIG').archive.entries[0].sha256 = digest(psh)
  await writeFile(path.join(f.options.reference, 'report.json'), JSON.stringify(f.report))
  await assert.rejects(prepareWeb(f.options, { analyze: f.analyze, analyzeMatch: f.analyzeMatch, analyzePlayer: f.analyzePlayer, analyzeMotion: f.analyzeMotion, analyzeControl: f.analyzeMatch, analyzeSteering: f.analyzeMatch, analyzePlacement: f.analyzeMatch, analyzeBallMotion:f.analyzeMatch, analyzeBallInteraction:f.analyzeMatch, analyzeAction:f.analyzeMatch, analyzeBallFlight:f.analyzeMatch, analyzeBallPhase:f.analyzeMatch, analyzePlayerBall:f.analyzeMatch, analyzePossession:f.analyzeMatch, analyzeBoundary:f.analyzeMatch, analyzeEvents:f.analyzeMatch }), /parity failed/)
  assert.equal((await readdir(f.directory)).includes('preview'), false)
  assert.equal((await readdir(f.directory)).some((name) => name.startsWith('.fifa98-web-')), false)
  assert.deepEqual(await readFile(path.join(f.options.reference, 'members/TEXTURES.BIG/sample.psh')), psh)
})

test('requires source/build hashes and matching WASM exports', async (t) => {
  const f = await fixture(t)
  await verifyNativeBuild({ wasm: f.wasm, source: f.source, manifest: f.manifest })
  await assert.rejects(verifyNativeBuild({ wasm: f.wasm, source: Buffer.from('stale'), manifest: f.manifest }), /stale/)
  await assert.rejects(verifyNativeBuild({ wasm: f.wasm, source: f.source, manifest: { ...f.manifest, exports: [] } }), /exports\/imports/)
  const manifest = { ...f.manifest, sources: [{ path: 'core.c', sha256: digest(f.source) }, { path: 'renderer.c', sha256: digest('renderer') }] }
  const sources = new Map([['core.c', f.source], ['renderer.c', Buffer.from('renderer')]])
  await verifyNativeBuild({ wasm: f.wasm, source: f.source, manifest, sources })
  sources.set('renderer.c', Buffer.from('stale renderer'))
  await assert.rejects(verifyNativeBuild({ wasm: f.wasm, source: f.source, manifest, sources }), /source hashes/)
})

test('report paths cannot escape the member root', () => {
  assert.throws(() => referenceMemberIndex({ version: 1, files: [{ path: 'ASSET.BIG', archive: { entries: [{ name: '../escape.psh', size: 4, sha256: 'a'.repeat(64) }] } }] }), /Unsafe/)
})
