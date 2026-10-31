import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'

// The archive and digest match the SpaceCadetPinball Flatpak extra-data declaration.
export const RESOURCE_URL = 'https://archive.org/download/pinball_202007/Pinball.zip'
export const RESOURCE_SHA256 = '1078b6ec75a36b5585061d1ebdd3f27019d97c1ab7c5a4bb9f1159932aae3109'
const DEFAULT_OUTPUT = fileURLToPath(new URL('../public/game-data', import.meta.url))
const IMPORT_SCRIPT = fileURLToPath(new URL('./import-resources.mjs', import.meta.url))
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024
const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const RESOURCE_EXTENSION = /\.(DAT|WAV|MID|MDS)$/i
const TABLE_FILE = /^(PINBALL|CADET|DEMO)\.DAT$/i

function safeResourcePath(value) {
  return (
    typeof value === 'string' &&
    value.length <= 512 &&
    value
      .split('/')
      .every((part) => /^[a-zA-Z0-9_ .-]{1,128}$/.test(part) && part !== '.' && part !== '..')
  )
}

export async function hasValidResourceBundle(directory) {
  try {
    const text = await readFile(path.join(directory, 'manifest.json'), 'utf8')
    if (text.length > 128 * 1024) return false
    const manifest = JSON.parse(text)
    if (
      manifest?.version !== 1 ||
      !Array.isArray(manifest.files) ||
      !manifest.files.length ||
      manifest.files.length > 512 ||
      !manifest.files.every((name) => safeResourcePath(name) && RESOURCE_EXTENSION.test(name)) ||
      new Set(manifest.files.map((name) => name.toUpperCase())).size !== manifest.files.length ||
      !manifest.files.some((name) => TABLE_FILE.test(name))
    )
      return false
    let total = 0
    for (const name of manifest.files) {
      const info = await stat(path.join(directory, name))
      if (!info.isFile() || info.size <= 0 || info.size > MAX_FILE_BYTES) return false
      total += info.size
      if (total > MAX_TOTAL_BYTES) return false
    }
    return true
  } catch {
    return false
  }
}

export function verifyArchive(bytes, expectedDigest = RESOURCE_SHA256) {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error('The pinball resource archive exceeds 4 MB.')
  if (createHash('sha256').update(bytes).digest('hex') !== expectedDigest)
    throw new Error('The pinball resource archive failed its SHA-256 checksum verification.')
}

export async function downloadArchive({
  fetchImpl = fetch,
  expectedDigest = RESOURCE_SHA256,
  attempts = 3,
  timeoutMs = 30000,
  retryDelayMs = 250,
} = {}) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0 && retryDelayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(RESOURCE_URL, { signal: controller.signal })
      if (!response.ok) throw new Error(`Resource host returned HTTP ${response.status}.`)
      const declaredLength = response.headers.get('Content-Length')
      if (declaredLength !== null && Number(declaredLength) > MAX_ARCHIVE_BYTES)
        throw new Error('The pinball resource archive exceeds 4 MB.')
      if (!response.body) throw new Error('The pinball resource archive is empty.')
      const reader = response.body.getReader()
      const chunks = []
      let length = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          length += next.value.byteLength
          if (length > MAX_ARCHIVE_BYTES) {
            await reader.cancel()
            throw new Error('The pinball resource archive exceeds 4 MB.')
          }
          chunks.push(next.value)
        }
      } finally {
        reader.releaseLock()
      }
      const archive = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        archive.set(chunk, offset)
        offset += chunk.byteLength
      }
      verifyArchive(archive, expectedDigest)
      return archive
    } catch (error) {
      lastError = controller.signal.aborted ? new Error('The resource download timed out.') : error
      // Retrying cannot fix an unexpected payload or an archive outside the pinned limits.
      if (/checksum|exceeds 4 MB/.test(lastError.message)) break
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error(
    `Could not download the original pinball resources: ${lastError?.message ?? 'Download failed.'} Retry the build, or import a local copy with pnpm --filter space-cadet-pinball run resources:import --from /path/to/Pinball. Use PINBALL_SKIP_RESOURCE_DOWNLOAD=1 for a folder-picker-only build.`,
    { cause: lastError },
  )
}

export function extractResourceFiles(archive) {
  const files = []
  const seen = new Set()
  let total = 0
  const entries = unzipSync(archive, {
    filter(entry) {
      if (!entry.name.startsWith('Pinball/') || !RESOURCE_EXTENSION.test(entry.name)) return false
      const relative = entry.name.slice('Pinball/'.length)
      if (!safeResourcePath(relative))
        throw new Error('The resource archive contains an invalid file path.')
      if (entry.originalSize <= 0 || entry.originalSize > MAX_FILE_BYTES)
        throw new Error('The resource archive contains an invalid resource size.')
      total += entry.originalSize
      if (total > MAX_TOTAL_BYTES || seen.size >= 512)
        throw new Error('The resource archive exceeds the resource limits.')
      const canonical = relative.toUpperCase()
      if (seen.has(canonical))
        throw new Error('The resource archive contains duplicate resource paths.')
      seen.add(canonical)
      return true
    },
  })
  for (const [name, data] of Object.entries(entries))
    files.push({ path: name.slice('Pinball/'.length).toUpperCase(), data })
  if (!files.some((file) => TABLE_FILE.test(file.path)))
    throw new Error('The resource archive does not contain a supported pinball table.')
  return files
}

export async function ensureResources({
  outputDirectory = DEFAULT_OUTPUT,
  skipDownload = process.env.PINBALL_SKIP_RESOURCE_DOWNLOAD === '1',
  fetchImpl = fetch,
  expectedDigest = RESOURCE_SHA256,
  importResources = (directory) =>
    execFileSync(process.execPath, [IMPORT_SCRIPT, '--from', directory], { stdio: 'inherit' }),
  log = console.log,
} = {}) {
  if (await hasValidResourceBundle(outputDirectory)) {
    log('Using the existing pinball game resources.')
    return 'cached'
  }
  if (skipDownload) {
    log('Skipping pinball resource download; players can select their local resource folder.')
    return 'skipped'
  }
  log('Downloading the checksum-pinned original pinball resources…')
  const archive = await downloadArchive({ fetchImpl, expectedDigest })
  const files = extractResourceFiles(archive)
  const temporary = await mkdtemp(path.join(tmpdir(), 'pinball-resources-'))
  try {
    for (const file of files) {
      const target = path.join(temporary, file.path)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.data)
    }
    await importResources(temporary)
    return 'downloaded'
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await ensureResources()
}
