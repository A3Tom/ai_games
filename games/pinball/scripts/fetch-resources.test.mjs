import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'

import {
  downloadArchive,
  ensureResources,
  extractResourceFiles,
  hasValidResourceBundle,
  verifyArchive,
} from './fetch-resources.mjs'

const table = strToU8('example table')
function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function temporary(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pinball-fetch-test-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('pinned resource archive', () => {
  it('rejects unexpected content before extraction', () => {
    assert.throws(() => verifyArchive(table), /SHA-256 checksum/)
    assert.throws(() => verifyArchive(new Uint8Array(4 * 1024 * 1024 + 1)), /exceeds 4 MB/)
    assert.doesNotThrow(() => verifyArchive(table, digest(table)))
  })

  it('extracts only game data, preserves sound folders, and omits executable content', () => {
    const archive = zipSync({
      'Pinball/pinball.dat': table,
      'Pinball/Sound/bell.wav': strToU8('audio'),
      'Pinball/pinball.exe': strToU8('never execute'),
      'Elsewhere/OTHER.DAT': strToU8('unrelated'),
    })
    const files = extractResourceFiles(archive)
    assert.deepEqual(
      files.map((file) => file.path),
      ['PINBALL.DAT', 'SOUND/BELL.WAV'],
    )
    assert.deepEqual(files[0].data, table)
  })

  it('rejects traversal, duplicate paths, and unsupported tables', () => {
    assert.throws(
      () => extractResourceFiles(zipSync({ 'Pinball/../PINBALL.DAT': table })),
      /invalid file path/,
    )
    assert.throws(
      () =>
        extractResourceFiles(
          zipSync({ 'Pinball/PINBALL.DAT': table, 'Pinball/pinball.dat': table }),
        ),
      /duplicate/,
    )
    assert.throws(
      () => extractResourceFiles(zipSync({ 'Pinball/OTHER.DAT': table })),
      /supported pinball table/,
    )
  })

  it('retries transient host failures twice and then verifies the successful body', async () => {
    let calls = 0
    const archive = await downloadArchive({
      fetchImpl: async (_url, options) => {
        calls++
        assert.ok(options.signal instanceof AbortSignal)
        return calls < 3 ? new Response(null, { status: 500 }) : new Response(table)
      },
      expectedDigest: digest(table),
      retryDelayMs: 0,
    })
    assert.equal(calls, 3)
    assert.deepEqual(archive, table)
  })

  it('does not retry a checksum mismatch and explains the local import alternative', async () => {
    let calls = 0
    await assert.rejects(
      downloadArchive({
        fetchImpl: async () => {
          calls++
          return new Response(table)
        },
      }),
      /resources:import.*PINBALL_SKIP_RESOURCE_DOWNLOAD/,
    )
    assert.equal(calls, 1)
  })

  it('bounds downloads even when the server omits its content length', async () => {
    await assert.rejects(
      downloadArchive({ fetchImpl: async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)) }),
      /exceeds 4 MB/,
    )
  })

  it('aborts a stalled request at its timeout', async () => {
    await assert.rejects(
      downloadArchive({
        fetchImpl: async (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
          }),
        timeoutMs: 5,
        attempts: 1,
      }),
      /download timed out/,
    )
  })
})

describe('resource caching and import', () => {
  it('preserves a valid custom bundle without requesting the archive', async () => {
    await temporary(async (directory) => {
      await writeFile(path.join(directory, 'CADET.DAT'), table)
      await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify({ version: 1, files: ['CADET.DAT'] }),
      )
      assert.equal(await hasValidResourceBundle(directory), true)
      const result = await ensureResources({
        outputDirectory: directory,
        fetchImpl: () => {
          throw new Error('must not fetch')
        },
        log() {},
      })
      assert.equal(result, 'cached')
    })
  })

  it('treats missing files and unsafe manifest paths as invalid caches', async () => {
    await temporary(async (directory) => {
      await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify({ version: 1, files: ['PINBALL.DAT'] }),
      )
      assert.equal(await hasValidResourceBundle(directory), false)
      await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify({ version: 1, files: ['../PINBALL.DAT'] }),
      )
      assert.equal(await hasValidResourceBundle(directory), false)
    })
  })

  it('supports an engine-only build without downloading resources', async () => {
    await temporary(async (directory) => {
      assert.equal(
        await ensureResources({
          outputDirectory: directory,
          skipDownload: true,
          fetchImpl: () => {
            throw new Error('must not fetch')
          },
          log() {},
        }),
        'skipped',
      )
    })
  })

  it('imports verified files from an isolated directory and removes it afterward', async () => {
    await temporary(async (directory) => {
      const archive = zipSync({
        'Pinball/PINBALL.DAT': table,
        'Pinball/pinball.exe': strToU8('excluded'),
      })
      let importDirectory
      const result = await ensureResources({
        outputDirectory: directory,
        fetchImpl: async () => new Response(archive),
        expectedDigest: digest(archive),
        async importResources(source) {
          importDirectory = source
          assert.deepEqual(new Uint8Array(await readFile(path.join(source, 'PINBALL.DAT'))), table)
          await assert.rejects(stat(path.join(source, 'pinball.exe')), { code: 'ENOENT' })
        },
        log() {},
      })
      assert.equal(result, 'downloaded')
      await assert.rejects(stat(importDirectory), { code: 'ENOENT' })
    })
  })

  it('also removes temporary files if the importer fails', async () => {
    await temporary(async (directory) => {
      const archive = zipSync({ 'Pinball/PINBALL.DAT': table })
      let importDirectory
      await assert.rejects(
        ensureResources({
          outputDirectory: directory,
          fetchImpl: async () => new Response(archive),
          expectedDigest: digest(archive),
          async importResources(source) {
            importDirectory = source
            throw new Error('import failed')
          },
          log() {},
        }),
        /import failed/,
      )
      await assert.rejects(stat(importDirectory), { code: 'ENOENT' })
    })
  })
})
