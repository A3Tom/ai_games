import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openDisc, parseCue, normalizeCue, parseSystemCnf, inspectPsxExe } from './disc.mjs'

const RAW = 2352
const BLOCK = 2048

function both32(buffer, offset, value) {
  buffer.writeUInt32LE(value, offset)
  buffer.writeUInt32BE(value, offset + 4)
}

function both16(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset)
  buffer.writeUInt16BE(value, offset + 2)
}

function record(identifier, lba, size, directory = false) {
  const name = Buffer.isBuffer(identifier) ? identifier : Buffer.from(identifier)
  const result = Buffer.alloc(33 + name.length + (name.length % 2 === 0 ? 1 : 0))
  result[0] = result.length
  both32(result, 2, lba)
  both32(result, 10, size)
  result[25] = directory ? 2 : 0
  both16(result, 28, 1)
  result[32] = name.length
  name.copy(result, 33)
  return result
}

function exe() {
  const buffer = Buffer.alloc(4096, 0)
  buffer.write('PS-X EXE')
  buffer.writeUInt32LE(0x80010000, 0x10)
  buffer.writeUInt32LE(0x80010000, 0x18)
  buffer.writeUInt32LE(2048, 0x1c)
  buffer.write('Synthetic test executable', 0x4c)
  buffer.fill(0x5a, 2048)
  return buffer
}

async function fixture(t, mutate, { cueName = 'disc.bin' } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'fifa98-disc-test-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const source = path.join(temporary, 'reference')
  await mkdir(source)
  const image = Buffer.alloc(64 * RAW)
  for (let i = 0; i < 64; i++) {
    const start = i * RAW
    image.fill(0xff, start + 1, start + 11)
    image[start + 15] = 2
    image[start + 18] = image[start + 22] = 8
  }
  const block = (lba) => image.subarray(lba * RAW + 24, lba * RAW + 24 + BLOCK)
  const pvd = block(16)
  pvd[0] = 1
  pvd.write('CD001', 1)
  pvd[6] = 1
  pvd.fill(0x20, 40, 72)
  pvd.write('SYNTHETIC TEST DISC', 40)
  both32(pvd, 80, 64)
  both16(pvd, 120, 1)
  both16(pvd, 124, 1)
  both16(pvd, 128, BLOCK)
  record(Buffer.from([0]), 20, BLOCK, true).copy(pvd, 156)
  const end = block(17)
  end[0] = 255
  end.write('CD001', 1)
  end[6] = 1
  const files = {
    'SYSTEM.CNF': { lba: 30, bytes: Buffer.from('BOOT = cdrom:\\SLES_000.00;1\r\nTCB = 4\r\n') },
    'SLES_000.00': { lba: 31, bytes: exe() },
    'DATA/ASSET.BIG': { lba: 33, bytes: Buffer.from(Array.from({ length: 3001 }, (_, i) => i % 251)) },
  }
  const records = {}
  let rootOffset = 0
  let dataOffset = 0
  function append(lba, offset, id, entryLba, size, directory, key) {
    const bytes = record(id, entryLba, size, directory)
    bytes.copy(block(lba), offset)
    if (key) records[key] = block(lba).subarray(offset, offset + bytes.length)
    return offset + bytes.length
  }
  rootOffset = append(20, rootOffset, Buffer.from([0]), 20, BLOCK, true)
  rootOffset = append(20, rootOffset, Buffer.from([1]), 20, BLOCK, true)
  rootOffset = append(20, rootOffset, 'DATA', 21, BLOCK, true, 'DATA')
  dataOffset = append(21, dataOffset, Buffer.from([0]), 21, BLOCK, true)
  dataOffset = append(21, dataOffset, Buffer.from([1]), 20, BLOCK, true)
  for (const [name, entry] of Object.entries(files)) {
    for (let offset = 0; offset < entry.bytes.length; offset += BLOCK) {
      entry.bytes.subarray(offset, offset + BLOCK).copy(block(entry.lba + offset / BLOCK))
    }
    if (name.startsWith('DATA/')) {
      dataOffset = append(21, dataOffset, name.slice(5) + ';1', entry.lba, entry.bytes.length, false, name)
    } else {
      rootOffset = append(20, rootOffset, name + ';1', entry.lba, entry.bytes.length, false, name)
    }
  }
  mutate?.({ image, block, records, files })
  const binPath = path.join(source, 'disc.bin')
  const cuePath = path.join(source, 'disc.cue')
  await writeFile(binPath, image)
  await writeFile(cuePath, `FILE "${cueName}" BINARY\r\n TRACK 01 MODE2/2352\r\n INDEX 01 00:00:00\r\n`)
  return { binPath, cuePath, source, output: path.join(temporary, 'extracted'), image, files }
}

test('CUE parsing normalizes exported line endings and rejects unsafe or unsupported layouts', () => {
  assert.equal(normalizeCue('\uFEFFa\\r\\nb\rc'), 'a\nb\nc')
  assert.deepEqual(parseCue('FILE "disc.bin" BINARY\\r\\nTRACK 01 MODE2/2352\\r\\nINDEX 01 00:00:00'), {
    file: 'disc.bin', tracks: 1, mode: 'MODE2/2352', sectorSize: RAW,
  })
  for (const text of [
    'FILE "../disc.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00',
    'FILE "disc.bin" BINARY\nTRACK 01 MODE1/2352\nINDEX 01 00:00:00',
    'FILE "disc.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:02:00',
    'FILE "disc.bin" BINARY\nTRACK 01 MODE2/2352\nINDEX 01 00:00:00\nTRACK 02 AUDIO',
    'FILE "disc.bin" BINARY\nTRACK 01 MODE2/2352',
  ]) assert.throws(() => parseCue(text), /CUE/)
})

test('reads real ISO records, ranges, executable headers, hashes, and exact extracted bytes', async (t) => {
  const input = await fixture(t)
  const disc = await openDisc({ cuePath: input.cuePath })
  t.after(() => disc.close())
  assert.equal(disc.volumeId, 'SYNTHETIC TEST DISC')
  assert.equal(disc.files.length, 3)
  assert.equal(disc.warnings.length, 0)
  const system = parseSystemCnf((await disc.readFile('system.cnf;1')).toString())
  assert.equal(system.bootPath, 'SLES_000.00')
  const info = inspectPsxExe(await disc.readFileRange(system.bootPath, { length: BLOCK }), { fileSize: 4096 })
  assert.equal(info.entryPc, 0x80010000)
  assert.equal(info.payloadSize, 2048)
  assert.equal(info.marker, 'Synthetic test executable')
  const asset = input.files['DATA/ASSET.BIG'].bytes
  assert.deepEqual(await disc.readFileRange('data/asset.big', { offset: 2000, length: 200 }), asset.subarray(2000, 2200))
  assert.deepEqual(await disc.readFileRange('DATA/ASSET.BIG', { offset: 3000, length: 64 }), asset.subarray(3000))
  const digest = createHash('sha256').update(asset).digest('hex')
  assert.equal(await disc.hashFile('DATA/ASSET.BIG'), digest)
  const destination = path.join(input.output, 'asset.big')
  assert.deepEqual(await disc.extractFile('DATA/ASSET.BIG', destination), { path: destination, size: asset.length, sha256: digest })
  assert.deepEqual(await readFile(destination), asset)
  await assert.rejects(disc.extractFile('DATA/ASSET.BIG', destination), { code: 'EEXIST' })
  assert.deepEqual(await readFile(input.binPath), input.image)
  await assert.rejects(disc.readFile('DATA/ASSET.BIG', { maxBytes: 100 }), /read limit/)
  await assert.rejects(disc.readFile('../disc.bin'), /Unsafe/)
  await assert.rejects(disc.readFile('..;1'), /Unsafe/)
  await assert.rejects(disc.readFile('missing'), /not found/)
  for (const range of [{ offset: -1 }, { offset: 3002 }, { length: Infinity }, { length: MAX_SAFE_READ }]) {
    await assert.rejects(disc.readFileRange('DATA/ASSET.BIG', range), /range/)
  }
  await disc.close()
  await disc.close()
  await assert.rejects(disc.readFile('SYSTEM.CNF'), /closed/)
})

const MAX_SAFE_READ = 64 * 1024 * 1024 + 1

test('an explicit BIN selection warns about a CUE mismatch without modifying the reference', async (t) => {
  const input = await fixture(t, undefined, { cueName: 'original-name.bin' })
  const originalCue = await readFile(input.cuePath)
  await assert.rejects(openDisc({ cuePath: input.cuePath }), { code: 'ENOENT' })
  const disc = await openDisc(input)
  t.after(() => disc.close())
  assert.match(disc.warnings[0], /explicitly selected BIN "disc.bin"/)
  assert.deepEqual(await readFile(input.cuePath), originalCue)
})

test('extraction rejects reference-directory destinations and symlink aliases', async (t) => {
  const input = await fixture(t)
  const disc = await openDisc(input)
  t.after(() => disc.close())
  await assert.rejects(disc.extractFile('SYSTEM.CNF', input.binPath), /source directory/)
  await assert.rejects(disc.extractFile('SYSTEM.CNF', path.join(input.source, 'new', 'copy')), /source directory/)
  const alias = path.join(input.output, 'alias')
  await mkdir(input.output)
  await symlink(input.source, alias, 'dir')
  await assert.rejects(disc.extractFile('SYSTEM.CNF', path.join(alias, 'copy')), /source directory/)
  await assert.rejects(access(path.join(input.source, 'copy')), { code: 'ENOENT' })
  await assert.rejects(disc.extractFile('SYSTEM.CNF', ''), /explicit/)
})

test('corrupt ISO metadata, unsafe names, and directory cycles are rejected', async (t) => {
  const cases = [
    ['endian mismatch', ({ block }) => block(16).writeUInt32BE(63, 84), /endian/],
    ['volume bounds', ({ block }) => both32(block(16), 80, 65), /bounds/],
    ['block size', ({ block }) => both16(block(16), 128, 1024), /block size/],
    ['extent bounds', ({ records }) => both32(records['SYSTEM.CNF'], 2, 64), /extent/],
    ['interleaved file', ({ records }) => { records['SYSTEM.CNF'][26] = 1 }, /interleaved/],
    ['unsafe name', ({ records }) => records['DATA/ASSET.BIG'].write('BAD/ASSET;1', 33), /Unsafe/],
    ['cycle', ({ records }) => both32(records.DATA, 2, 20), /cycle/],
    ['corrupt sector', ({ image }) => { image[16 * RAW + 15] = 1 }, /sector/],
    ['mismatched subheader', ({ image }) => { image[16 * RAW + 20] = 1 }, /sector/],
    ['truncated record', ({ records }) => { records['SYSTEM.CNF'][32] = 255 }, /record length/],
  ]
  for (const [name, mutation, pattern] of cases) {
    await t.test(name, async (t) => {
      const input = await fixture(t, mutation)
      await assert.rejects(openDisc(input), pattern)
    })
  }
})

test('unsupported Form2 media aborts extraction and removes the incomplete output', async (t) => {
  const input = await fixture(t, ({ image }) => {
    image[34 * RAW + 18] |= 0x20
    image[34 * RAW + 22] |= 0x20
  })
  const disc = await openDisc(input)
  t.after(() => disc.close())
  const destination = path.join(input.output, 'asset.big')
  await assert.rejects(disc.extractFile('DATA/ASSET.BIG', destination), /Form2/)
  await assert.rejects(access(destination), { code: 'ENOENT' })
  await assert.rejects(disc.hashFile('DATA/ASSET.BIG'), /Form2/)
})

test('truncated images and incorrect executable lengths are rejected', async (t) => {
  const input = await fixture(t)
  await writeFile(input.binPath, input.image.subarray(0, -1))
  await assert.rejects(openDisc(input), /complete regular/)
  assert.throws(() => inspectPsxExe(Buffer.alloc(BLOCK)), /not a PS-X/)
  assert.throws(() => inspectPsxExe(Buffer.alloc(128)), /2048/)
  assert.throws(() => inspectPsxExe(exe().subarray(0, BLOCK)), /payload/)
  const bad = exe()
  bad.writeUInt32LE(0xfffffff0, 0x18)
  assert.throws(() => inspectPsxExe(bad), /boundaries/)
})

test('SYSTEM.CNF boot paths reject traversal, missing BOOT, and duplicate entries', () => {
  assert.equal(parseSystemCnf('BOOT = cdrom:\\DIR\\GAME.EXE;1\r\n').bootPath, 'DIR/GAME.EXE')
  for (const text of [
    'BOOT = cdrom:\\..\\GAME.EXE;1',
    'BOOT = cdrom:\\C:\\GAME.EXE;1',
    'BOOT = cdrom:\\GAME.EXE;1\nBOOT = cdrom:\\OTHER.EXE;1',
    'TCB = 4',
    'BOOT = host:GAME.EXE',
  ]) assert.throws(() => parseSystemCnf(text), /SYSTEM.CNF|Unsafe/)
})
