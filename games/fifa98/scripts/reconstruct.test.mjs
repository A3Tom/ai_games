import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { extractReference, main, validateOutput } from './reconstruct.mjs'
import { parseBigf } from './archives.mjs'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function makeArchive(name, data) {
  const headerSize = 16 + 8 + Buffer.byteLength(name) + 1
  const bytes = Buffer.alloc(headerSize + data.length)
  bytes.write('BIGF')
  bytes.writeUInt32BE(bytes.length, 4)
  bytes.writeUInt32BE(1, 8)
  bytes.writeUInt32BE(headerSize, 12)
  bytes.writeUInt32BE(headerSize, 16)
  bytes.writeUInt32BE(data.length, 20)
  bytes.write(name, 24)
  bytes.set(data, headerSize)
  return bytes
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fifa98-reconstruct-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source')
  await mkdir(source)
  const binPath = path.join(source, 'disc.bin')
  const cuePath = path.join(source, 'disc.cue')
  await writeFile(binPath, 'untouched reference placeholder')
  await writeFile(cuePath, 'untouched descriptor placeholder')
  const memberData = Buffer.from('invented database bytes')
  const archiveData = makeArchive('data/fcdb.dbi', memberData)
  const data = new Map([
    ['SYSTEM.CNF', Buffer.from('BOOT = cdrom:\\TEST_000.00;1\n')],
    ['TEST_000.00', Buffer.from('invented executable')],
    ['BECODE.BIN', Buffer.from('invented backend')],
    ['DATABASE.BIG', archiveData],
  ])
  const metadata = { binPath, cuePath }
  const disc = {
    metadata,
    async readFile(name) { return data.get(name) },
    async extractFile(name, destination) {
      await mkdir(path.dirname(destination), { recursive: true })
      const bytes = data.get(name)
      await writeFile(destination, bytes, { flag: 'wx' })
      return { size: bytes.length, sha256: sha256(bytes) }
    },
  }
  const report = {
    version: 1, boot: { bootPath: 'TEST_000.00' },
    files: [...data].map(([name, bytes]) => ({ path: name, size: bytes.length, sha256: sha256(bytes),
      ...(name === 'DATABASE.BIG' ? { archive: parseBigf(bytes) } : {}),
    })),
  }
  return { root, source, binPath, cuePath, memberData, data, disc, report }
}

test('extracts exact code and nested resource bytes with hashes, preserving the reference', async (t) => {
  const f = await fixture(t)
  const beforeBin = await readFile(f.binPath)
  const beforeCue = await readFile(f.cuePath)
  const output = path.join(f.root, 'output')
  const result = await extractReference(f.disc, f.report, output)
  assert.deepEqual(result, { output, files: 4, members: 1 })
  assert.deepEqual(await readFile(path.join(output, 'disc/TEST_000.00')), f.data.get('TEST_000.00'))
  assert.deepEqual(await readFile(path.join(output, 'members/DATABASE.BIG/data/fcdb.dbi')), f.memberData)
  const saved = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'))
  assert.equal(saved.extracted.length, 4)
  assert.equal(saved.extracted.find((entry) => entry.path === 'DATABASE.BIG').sha256, sha256(f.data.get('DATABASE.BIG')))
  assert.deepEqual(await readFile(f.binPath), beforeBin)
  assert.deepEqual(await readFile(f.cuePath), beforeCue)
  assert.deepEqual((await readdir(f.root)).sort(), ['output', 'source'])
})

test('refuses existing outputs without replacing their contents', async (t) => {
  const f = await fixture(t)
  const output = path.join(f.root, 'output')
  await mkdir(output)
  await writeFile(path.join(output, 'keep'), 'keep this')
  await assert.rejects(extractReference(f.disc, f.report, output), /already exists/)
  assert.equal(await readFile(path.join(output, 'keep'), 'utf8'), 'keep this')
})

test('rejects source directories, their ancestors, and output aliases through symlinks', async (t) => {
  const f = await fixture(t)
  for (const output of [f.root, f.source, path.join(f.source, 'generated/report')]) {
    await assert.rejects(validateOutput(output, [f.binPath, f.cuePath]), /separate from the reference/)
  }
  const alias = path.join(f.root, 'alias')
  await symlink(f.source, alias)
  await assert.rejects(validateOutput(path.join(alias, 'generated'), [f.binPath, f.cuePath]), /separate from the reference/)
  await assert.rejects(validateOutput(f.binPath, [f.binPath, f.cuePath]), /separate from the reference/)
})

test('cleans staging and publishes no partial output after an extraction error', async (t) => {
  const f = await fixture(t)
  const output = path.join(f.root, 'output')
  f.disc.extractFile = async () => { throw new Error('injected read failure') }
  await assert.rejects(extractReference(f.disc, f.report, output), /injected read failure/)
  assert.deepEqual(await readdir(f.root), ['source'])
})

test('rejects changed code bytes instead of publishing a report for different input', async (t) => {
  const f = await fixture(t)
  f.data.set('BECODE.BIN', Buffer.from('changed bytes'))
  await assert.rejects(extractReference(f.disc, f.report, path.join(f.root, 'output')), /Disc changed/)
  assert.deepEqual(await readdir(f.root), ['source'])
})

test('fails on an invalid archive instead of silently skipping it', async (t) => {
  const f = await fixture(t)
  const archive = f.report.files.find((file) => file.path === 'DATABASE.BIG')
  delete archive.archive
  archive.kind = 'archive'
  archive.inspectionError = 'corrupt index'
  await assert.rejects(extractReference(f.disc, f.report, path.join(f.root, 'output')), /corrupt index/)
  assert.deepEqual(await readdir(f.root), ['source'])
})

test('checks the reread archive before writing nested members', async (t) => {
  const f = await fixture(t)
  f.disc.readFile = async () => makeArchive('changed.dbi', Buffer.from('different content'))
  await assert.rejects(extractReference(f.disc, f.report, path.join(f.root, 'output')), /Disc changed while reading members/)
  assert.deepEqual(await readdir(f.root), ['source'])
})

test('CLI help needs no disc and unsupported commands fail clearly', async (t) => {
  let output = ''
  const capture = t.mock.method(process.stdout, 'write', (chunk) => { output += chunk; return true })
  await main(['--help'])
  capture.mock.restore()
  assert.match(output, /no game execution/)
  await assert.rejects(main(['play']), /FIFA 98 native reconstruction tools/)
  await assert.rejects(main(['inspect', '--out', '/unused']), /writes JSON to stdout/)
})
