import { cp, mkdir, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../public/game-data', import.meta.url))
const [flag, sourceArg, ...rest] = process.argv.slice(2)
if (flag !== '--from' || !sourceArg || rest.length)
  throw new Error('Usage: node pinball/scripts/import-resources.mjs --from /path/to/game-resources')
const source = await realpath(sourceArg)
const actualOutput = await realpath(output).catch((error) => {
  if (error.code !== 'ENOENT') throw error
  return output
})
if (
  source === actualOutput ||
  source.startsWith(actualOutput + path.sep) ||
  actualOutput.startsWith(source + path.sep)
)
  throw new Error('The source resource folder must be separate from pinball/public/game-data.')

const resources = []
let total = 0
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const localPath = path.join(directory, entry.name)
    const relative = prefix + entry.name
    if (entry.isDirectory()) await collect(localPath, relative + '/')
    else if (entry.isFile() && /\.(DAT|WAV|MID|MDS)$/i.test(entry.name)) {
      if (
        relative.length > 512 ||
        relative
          .split('/')
          .some((part) => !/^[a-zA-Z0-9_ .-]{1,128}$/.test(part) || part === '.' || part === '..')
      )
        throw new Error(`Invalid resource path: ${relative}`)
      const info = await stat(localPath)
      if (info.size <= 0 || info.size > 32 * 1024 * 1024)
        throw new Error(`Resource must be between 1 byte and 32 MB: ${relative}`)
      total += info.size
      if (total > 64 * 1024 * 1024 || resources.length >= 512)
        throw new Error('Resources exceed the limit of 512 files or 64 MB total.')
      resources.push({ from: localPath, to: relative.toUpperCase() })
    }
  }
}
await collect(source)
resources.sort((a, b) => a.to.localeCompare(b.to))
const names = resources.map((resource) => resource.to)
if (!names.some((name) => /^(PINBALL|CADET|DEMO)\.DAT$/.test(name)))
  throw new Error('The source folder must contain PINBALL.DAT, CADET.DAT, or DEMO.DAT at its root.')
if (new Set(names).size !== names.length)
  throw new Error('Duplicate resource paths after converting names to uppercase.')

const staging = `${output}.import-${process.pid}`
const backup = `${output}.previous-${process.pid}`
await mkdir(path.dirname(output), { recursive: true })
await mkdir(staging)
let backedUp = false
let installed = false
try {
  for (const resource of resources) {
    const target = path.join(staging, resource.to)
    await mkdir(path.dirname(target), { recursive: true })
    await cp(resource.from, target)
  }
  await writeFile(
    path.join(staging, 'manifest.json'),
    JSON.stringify({ version: 1, files: names }, null, 2) + '\n',
  )
  try {
    await rename(output, backup)
    backedUp = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await rename(staging, output)
  installed = true
} finally {
  await rm(staging, { recursive: true, force: true })
  if (backedUp) {
    if (installed) await rm(backup, { recursive: true, force: true })
    else await rename(backup, output)
  }
}
console.log(`Imported ${names.length} resource files (${total} bytes) into ${output}`)
