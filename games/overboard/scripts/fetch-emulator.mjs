import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const RUNTIME_LOCK = JSON.parse(await readFile(new URL('../emulator-lock.json', import.meta.url), 'utf8'))
const DEFAULT_OUTPUT = fileURLToPath(new URL('../public/emulator/', import.meta.url))

// Files are deliberately copied without modification. The full licenses remain
// in LICENSE.txt and in the core archive's license.txt (shown by its About menu).
export function verifyRuntimeFile(bytes, asset) {
  if (bytes.byteLength !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`EmulatorJS ${RUNTIME_LOCK.version}: SHA-256 verification failed for ${asset.path}.`)
  }
}

async function validFile(directory, asset) {
  try {
    verifyRuntimeFile(await readFile(path.join(directory, asset.path)), asset)
    return true
  } catch {
    return false
  }
}

export async function hasValidEmulator(directory = DEFAULT_OUTPUT, files = RUNTIME_LOCK.files) {
  return (await Promise.all(files.map((asset) => validFile(directory, asset)))).every(Boolean)
}

async function downloadAsset(asset, fetchImpl) {
  const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`EmulatorJS download failed for ${asset.path}: HTTP ${response.status}.`)
  const size = response.headers.get('Content-Length')
  // fetch transparently decompresses HTTP gzip/br, while Content-Length can
  // describe the compressed transfer. Always check the actual decoded bytes.
  if (!response.headers.get('Content-Encoding') && size !== null && Number(size) !== asset.bytes) {
    throw new Error(`Unexpected EmulatorJS download size for ${asset.path}.`)
  }
  if (!response.body) throw new Error(`EmulatorJS download was empty for ${asset.path}.`)
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > asset.bytes) {
        await reader.cancel()
        throw new Error(`Unexpected EmulatorJS download size for ${asset.path}.`)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks, length)
  verifyRuntimeFile(bytes, asset)
  return bytes
}

export async function ensureEmulator({
  outputDirectory = DEFAULT_OUTPUT,
  files = RUNTIME_LOCK.files,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  let downloaded = 0
  for (const asset of files) {
    if (await validFile(outputDirectory, asset)) continue
    log(`Downloading EmulatorJS ${RUNTIME_LOCK.version}: ${asset.path}`)
    let bytes
    try {
      bytes = await downloadAsset(asset, fetchImpl)
    } catch (error) {
      throw new Error(`Could not prepare the Overboard! emulator: ${error.message} Retry with pnpm --filter overboard run emulator:fetch.`, { cause: error })
    }
    const destination = path.join(outputDirectory, asset.path)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await mkdir(path.dirname(destination), { recursive: true })
    try {
      await writeFile(temporary, bytes, { flag: 'wx' })
      await rename(temporary, destination)
    } finally {
      await rm(temporary, { force: true })
    }
    downloaded++
  }
  log(downloaded ? `Prepared ${downloaded} verified EmulatorJS files.` : 'Using the verified local EmulatorJS runtime.')
  return downloaded ? 'downloaded' : 'cached'
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await ensureEmulator()
}
