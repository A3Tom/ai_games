export interface ResourceFile {
  path: string
  data: Uint8Array
}

const MAX_FILE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const MAX_FILES = 512
const RESOURCE_EXTENSION = /\.(DAT|WAV|MID|MDS)$/i
const TABLE_FILE = /^(PINBALL|CADET|DEMO)\.DAT$/

function normalizePath(value: string): string {
  const parts = value.split('/')
  if (
    !value ||
    value.length > 512 ||
    parts.some((part) => !/^[a-zA-Z0-9_ .-]{1,128}$/.test(part) || part === '.' || part === '..')
  )
    throw new Error('The game resources contain an invalid file path.')
  return parts.join('/').toUpperCase()
}

function validatePaths(paths: string[]): void {
  if (!paths.length || paths.length > MAX_FILES)
    throw new Error('Choose a game resource folder containing up to 512 resource files.')
  if (new Set(paths).size !== paths.length)
    throw new Error('The game resources contain duplicate file names.')
  if (!paths.some((path) => TABLE_FILE.test(path)))
    throw new Error('The resource folder must contain PINBALL.DAT, CADET.DAT, or DEMO.DAT.')
}

function validateSize(size: number, total: number): number {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES)
    throw new Error('Each game resource must be between 1 byte and 32 MB.')
  if (total + size > MAX_TOTAL_BYTES)
    throw new Error('The game resources must total no more than 64 MB.')
  return total + size
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > limit) {
        await reader.cancel()
        throw new Error('The game resource download exceeds its size limit.')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const data = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return data
}

export async function loadLocalResources(files: File[]): Promise<ResourceFile[]> {
  const candidates = files.filter((file) => RESOURCE_EXTENSION.test(file.name))
  const relativePaths = candidates.map((file) => file.webkitRelativePath || file.name)
  relativePaths.forEach(normalizePath)
  // A folder picker includes the selected folder name; the virtual game directory does not.
  const root = relativePaths[0]?.split('/')[0]
  const stripRoot = relativePaths.every((path) => path.includes('/') && path.split('/')[0] === root)
  const paths = relativePaths.map((path) =>
    normalizePath(stripRoot ? path.slice(path.indexOf('/') + 1) : path),
  )
  validatePaths(paths)
  let total = 0
  for (const file of candidates) total = validateSize(file.size, total)
  const result: ResourceFile[] = []
  for (let index = 0; index < candidates.length; index++) {
    const data = new Uint8Array(await candidates[index].arrayBuffer())
    if (data.byteLength !== candidates[index].size)
      throw new Error(
        'A game resource could not be read completely. Please choose the folder again.',
      )
    result.push({ path: paths[index], data })
  }
  return result
}

export async function loadBundledResources(baseUrl: string): Promise<ResourceFile[] | null> {
  const base = baseUrl.replace(/\/+$/, '') + '/'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const options = { signal: controller.signal, credentials: 'omit' as const }
    const response = await fetch(`${base}manifest.json`, options)
    if (response.status === 404) return null
    if (!response.ok) throw new Error('The hosted game resources could not be loaded.')
    const text = new TextDecoder().decode(await readBounded(response, 128 * 1024))
    let manifest: unknown
    try {
      manifest = JSON.parse(text)
    } catch {
      throw new Error('The game resource manifest is invalid.')
    }
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      !('version' in manifest) ||
      manifest.version !== 1 ||
      !('files' in manifest) ||
      !Array.isArray(manifest.files) ||
      manifest.files.some(
        (path: unknown) => typeof path !== 'string' || !RESOURCE_EXTENSION.test(path),
      )
    )
      throw new Error('The game resource manifest is invalid.')
    const names = manifest.files as string[]
    const paths = names.map(normalizePath)
    validatePaths(paths)
    let total = 0
    const resources: ResourceFile[] = []
    for (let index = 0; index < paths.length; index++) {
      const resource = await fetch(
        base + names[index].split('/').map(encodeURIComponent).join('/'),
        options,
      )
      if (!resource.ok) throw new Error(`The game resource ${paths[index]} could not be loaded.`)
      const declaredLength = resource.headers.get('Content-Length')
      if (declaredLength !== null) validateSize(Number(declaredLength), total)
      const data = await readBounded(resource, Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - total))
      total = validateSize(data.byteLength, total)
      resources.push({ path: paths[index], data })
    }
    return resources
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error('Loading the game resources timed out. Please try again.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
