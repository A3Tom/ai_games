import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ensureEmulator, hasValidEmulator, verifyRuntimeFile } from './fetch-emulator.mjs'

function fixture() {
  const contents = new Map([
    ['loader.js', Buffer.from('verified frontend fixture')],
    ['cores/pcsx_rearmed-wasm.data', Buffer.from('verified core fixture')],
  ])
  const files = [...contents].map(([name, bytes]) => ({
    path: name, url: `https://runtime.invalid/${name}`, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }))
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(url)
    return new Response(contents.get(files.find((asset) => asset.url === url).path))
  }
  return { files, contents, requests, fetchImpl }
}

async function withDirectory(callback) {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'overboard-emulator-test-'))
  try { await callback(outputDirectory) }
  finally { await rm(outputDirectory, { recursive: true, force: true }) }
}

test('downloads and verifies missing runtime files, then reuses them offline', async () => {
  await withDirectory(async (outputDirectory) => {
    const { files, contents, requests, fetchImpl } = fixture()
    assert.equal(await hasValidEmulator(outputDirectory, files), false)
    assert.equal(await ensureEmulator({ outputDirectory, files, fetchImpl, log() {} }), 'downloaded')
    assert.deepEqual(requests, files.map((asset) => asset.url))
    assert.equal(await hasValidEmulator(outputDirectory, files), true)
    for (const asset of files) assert.deepEqual(await readFile(path.join(outputDirectory, asset.path)), contents.get(asset.path))
    assert.equal(await ensureEmulator({ outputDirectory, files, fetchImpl() { throw new Error('Unexpected network request') }, log() {} }), 'cached')
  })
})

test('detects same-length tampering and repairs only the damaged runtime file', async () => {
  await withDirectory(async (outputDirectory) => {
    const { files, contents, requests, fetchImpl } = fixture()
    await ensureEmulator({ outputDirectory, files, fetchImpl, log() {} })
    const bytes = Buffer.from(contents.get(files[0].path))
    bytes[0] ^= 1
    assert.throws(() => verifyRuntimeFile(bytes, files[0]), /SHA-256/)
    await writeFile(path.join(outputDirectory, files[0].path), bytes)
    assert.equal(await hasValidEmulator(outputDirectory, files), false)
    requests.length = 0
    await ensureEmulator({ outputDirectory, files, fetchImpl, log() {} })
    assert.deepEqual(requests, [files[0].url])
    assert.equal(await hasValidEmulator(outputDirectory, files), true)
  })
})

test('never installs a changed or oversized upstream payload', async () => {
  await withDirectory(async (outputDirectory) => {
    const { files, contents } = fixture()
    const changed = Buffer.from(contents.get(files[0].path))
    changed[0] ^= 1
    await assert.rejects(ensureEmulator({ outputDirectory, files, fetchImpl: async () => new Response(changed), log() {} }), /SHA-256/)
    assert.deepEqual(await readdir(outputDirectory), [])
    await assert.rejects(ensureEmulator({ outputDirectory, files, fetchImpl: async () => new Response(Buffer.alloc(files[0].bytes + 1)), log() {} }), /download size/)
    assert.deepEqual(await readdir(outputDirectory), [])
  })
})

test('checks decoded HTTP bytes when a transfer uses gzip', async () => {
  await withDirectory(async (outputDirectory) => {
    const { files, contents } = fixture()
    const fetchImpl = async (url) => {
      const asset = files.find((file) => file.url === url)
      return new Response(contents.get(asset.path), { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '10' } })
    }
    await ensureEmulator({ outputDirectory, files, fetchImpl, log() {} })
    assert.equal(await hasValidEmulator(outputDirectory, files), true)
  })
})
