import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32 } from 'node:zlib'
import { normalizeCue, parseCue, prepareMedia, readMediaManifest } from './media.mjs'

const cue = 'FILE "Track 01.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n' +
  'FILE "Track 02.bin" BINARY\n  TRACK 02 AUDIO\n    INDEX 00 00:00:00\n    INDEX 01 00:03:00\n'

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'overboard-media-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const source = path.join(directory, 'disc')
  const output = path.join(directory, 'public', 'game-data')
  await mkdir(source)
  await writeFile(path.join(source, 'Overboard!.cue'), cue.replace(/\n/g, '\\r\\n'))
  await writeFile(path.join(source, 'Track 01.bin'), Buffer.from([0, 1, 255, 2]))
  await writeFile(path.join(source, 'Track 02.bin'), Buffer.from([42, 43, 44, 45, 46]))
  return { directory, source, output }
}

// Read ZIP central records and verify their local payloads independently of the
// streaming writer, including CRC values used by ordinary archive extractors.
function unzipStored(bytes) {
  const endOffset = bytes.length - 22
  assert.equal(bytes.readUInt32LE(endOffset), 0x06054b50)
  const count = bytes.readUInt16LE(endOffset + 10)
  let offset = bytes.readUInt32LE(endOffset + 16)
  const result = new Map()
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50)
    assert.equal(bytes.readUInt16LE(offset + 10), 0)
    const expectedCrc = bytes.readUInt32LE(offset + 16)
    const size = bytes.readUInt32LE(offset + 24)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString()
    const localOffset = bytes.readUInt32LE(offset + 42)
    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50)
    const dataOffset = localOffset + 30 + bytes.readUInt16LE(localOffset + 26)
    const payload = bytes.subarray(dataOffset, dataOffset + size)
    assert.equal(crc32(payload), expectedCrc)
    assert.equal(bytes.readUInt32LE(dataOffset + size), 0x08074b50)
    result.set(name, payload)
    offset += 46 + nameLength
  }
  return result
}

test('normalizes the supplied escaped CUE line endings', () => {
  assert.equal(normalizeCue(cue.replace(/\n/g, '\\r\\n')), cue)
  assert.equal(normalizeCue('\uFEFF' + cue.replace(/\n/g, '\r\n')), cue)
  assert.deepEqual(parseCue(cue).files, ['Track 01.bin', 'Track 02.bin'])
})

test('rejects CUE references outside the selected disc folder', () => {
  for (const filename of ['../secret.bin', '/secret.bin', 'sub/track.bin', 'sub\\track.bin', '..']) {
    assert.throws(() => parseCue(cue.replace('Track 01.bin', filename)), /plain BIN filenames/)
  }
  assert.throws(() => parseCue(cue.replace('Track 02.bin', 'Track 01.bin')), /repeats/)
})

test('imports every track and a normalized CUE in a standard streaming ZIP', async (t) => {
  const options = await fixture(t)
  const manifest = await prepareMedia(options)
  assert.equal(manifest.file, 'overboard.zip')
  assert.equal(manifest.tracks, 2)
  assert.equal(manifest.sourceFiles.length, 3)
  const zip = await readFile(path.join(options.output, manifest.file))
  assert.equal(zip.length, manifest.size)
  const files = unzipStored(zip)
  assert.deepEqual([...files.keys()], ['Overboard!.cue', 'Track 01.bin', 'Track 02.bin'])
  assert.equal(files.get('Overboard!.cue').toString(), cue)
  assert.deepEqual(files.get('Track 02.bin'), await readFile(path.join(options.source, 'Track 02.bin')))
  assert.deepEqual(await readMediaManifest(options.output), manifest)
})

test('fails for a missing audio track and leaves the previous bundle intact', async (t) => {
  const options = await fixture(t)
  const original = await prepareMedia(options)
  await rm(path.join(options.source, 'Track 02.bin'))
  await assert.rejects(prepareMedia(options), /missing Track 02.bin/)
  assert.deepEqual(await readMediaManifest(options.output), original)
})

test('rejects symlinks to files outside the disc folder', async (t) => {
  const options = await fixture(t)
  await writeFile(path.join(options.directory, 'outside.bin'), 'private')
  await rm(path.join(options.source, 'Track 02.bin'))
  await symlink(path.join(options.directory, 'outside.bin'), path.join(options.source, 'Track 02.bin'))
  await assert.rejects(prepareMedia(options), /regular files/)
})

test('reuses an unchanged import and rebuilds when a track changes', async (t) => {
  const options = await fixture(t)
  const original = await prepareMedia(options)
  const originalFile = await stat(path.join(options.output, original.file))
  assert.deepEqual(await prepareMedia(options), original)
  assert.equal((await stat(path.join(options.output, original.file))).ino, originalFile.ino)
  await writeFile(path.join(options.source, 'Track 02.bin'), 'updated soundtrack')
  const updated = await prepareMedia(options)
  assert.notEqual(updated.sourceFingerprint, original.sourceFingerprint)
  assert.notEqual(updated.size, original.size)
  const files = unzipStored(await readFile(path.join(options.output, updated.file)))
  assert.equal(files.get('Track 02.bin').toString(), 'updated soundtrack')
})

test('a source disc repairs an incomplete generated ZIP', async (t) => {
  const options = await fixture(t)
  const original = await prepareMedia(options)
  await writeFile(path.join(options.output, original.file), 'truncated')
  await assert.rejects(readMediaManifest(options.output), /has changed/)
  const repaired = await prepareMedia(options)
  assert.deepEqual(repaired, original)
  unzipStored(await readFile(path.join(options.output, repaired.file)))
})

test('without a source disc, retains a valid import or offers local-file fallback', async (t) => {
  const options = await fixture(t)
  assert.equal(await prepareMedia({ ...options, source: path.join(options.directory, 'missing') }), null)
  const original = await prepareMedia(options)
  await rm(options.source, { recursive: true })
  assert.deepEqual(await prepareMedia(options), original)
  await rm(path.join(options.output, original.file))
  await assert.rejects(prepareMedia(options), /ENOENT/)
})

test('optionally imports and preserves a user-supplied BIOS on a disc refresh', async (t) => {
  const options = await fixture(t)
  const bios = path.join(options.directory, 'scph5502.bin')
  await writeFile(bios, Buffer.alloc(512 * 1024, 42))
  const original = await prepareMedia({ ...options, bios })
  assert.equal(original.bios, 'bios.bin')
  await writeFile(path.join(options.source, 'Track 02.bin'), 'changed')
  const updated = await prepareMedia(options)
  assert.equal(updated.bios, 'bios.bin')
  assert.deepEqual(await readFile(path.join(options.output, updated.bios)), await readFile(bios))
  await writeFile(bios, 'invalid bios')
  await assert.rejects(prepareMedia({ ...options, bios }), /512 KB/)
})

test('refuses to replace a folder containing the original disc', async (t) => {
  const options = await fixture(t)
  await assert.rejects(prepareMedia({ ...options, output: options.source }), /must be separate/)
  await assert.rejects(prepareMedia({ ...options, output: path.join(options.source, 'game-data') }), /must be separate/)
})
