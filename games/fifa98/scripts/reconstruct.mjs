import { createHash } from 'node:crypto'
import { mkdir, lstat, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { openDisc, parseSystemCnf, inspectPsxExe } from './disc.mjs'
import { identifyResource, parseEaArchive } from './archives.mjs'
import { inspectCodeLayout } from './layout.mjs'

const gameRoot = fileURLToPath(new URL('../', import.meta.url))
const referenceRoot = fileURLToPath(new URL('../../../reference-games/Fifa98/', import.meta.url))
const MAX_ARCHIVE = 64 * 1024 * 1024
const MAX_MEMBERS = 32_000
const MAX_DEPTH = 4

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const contains = (directory, candidate) => candidate === directory || candidate.startsWith(directory + path.sep)

function archiveMembers(bytes, container, state, depth = 0) {
  if (depth >= MAX_DEPTH) throw new Error(`Archive nesting exceeds ${MAX_DEPTH}: ${container}`)
  const archive = parseEaArchive(bytes)
  const entries = []
  for (const entry of archive.entries) {
    state.count++
    if (state.count > MAX_MEMBERS) throw new Error('Archive member count exceeds the inspection limit.')
    const data = bytes.subarray(entry.offset, entry.offset + entry.size)
    const resource = identifyResource(data.subarray(0, 64), entry.name)
    const member = { ...entry, ...resource, sha256: digest(data) }
    if (resource.kind === 'archive') member.archive = archiveMembers(data, `${container}/${entry.name}`, state, depth + 1)
    entries.push(member)
  }
  return { format: archive.format, headerSize: archive.headerSize, declaredSize: archive.declaredSize, entries }
}

/** Read data and instruction metadata only. No game code is executed. */
export async function inspectReference(disc) {
  const cnf = parseSystemCnf((await disc.readFile('SYSTEM.CNF')).toString('ascii'))
  const state = { count: 0 }
  const files = []
  const issues = []
  for (const file of disc.metadata.files) {
    const item = { path: file.path, lba: file.lba, size: file.size }
    try {
      const prefix = await disc.readFileRange(file.path, { length: Math.min(2048, file.size) })
      Object.assign(item, identifyResource(prefix, file.path))
      if (item.kind === 'executable') item.executable = inspectPsxExe(prefix, { fileSize: file.size })
      if (item.kind === 'archive') {
        if (file.size > MAX_ARCHIVE) throw new Error('Archive exceeds the 64 MiB inspection limit.')
        const bytes = await disc.readFile(file.path)
        item.sha256 = digest(bytes)
        const archiveState = { count: state.count }
        item.archive = archiveMembers(bytes, file.path, archiveState)
        state.count = archiveState.count
      } else if (item.kind === 'executable' || item.kind === 'code-candidate') {
        item.sha256 = await disc.hashFile(file.path)
      }
    } catch (error) {
      item.inspectionError = error.message
      issues.push({ path: file.path, message: error.message })
    }
    files.push(item)
  }
  const codeLayout = await inspectCodeLayout(disc)
  return {
    version: 1,
    status: 'reconstruction-only',
    source: {
      bin: path.basename(disc.metadata.binPath), cue: path.basename(disc.metadata.cuePath),
      byteLength: disc.metadata.byteLength, sectorCount: disc.metadata.sectorCount,
      volumeId: disc.metadata.volumeId,
    },
    warnings: disc.metadata.warnings,
    boot: cnf,
    codeLayout,
    files,
    archiveMembers: state.count,
    issues,
    limitations: [
      'Static inspection does not execute, emulate, or recover source code automatically.',
      'Filename and signature candidates do not establish gameplay functions or roster/kit field layouts.',
      'MODE2 Form2 audio/video needs a separate media decoder and is not extracted as 2048-byte data.',
    ],
  }
}

// Resolve existing ancestors before creating anything, including symlinked
// parents. This prevents an output alias from writing into the source tree.
async function resolveOutput(destination) {
  const missing = []
  let current = path.resolve(destination)
  for (;;) {
    try { return path.join(await realpath(current), ...missing.reverse()) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      missing.push(path.basename(current))
      current = parent
    }
  }
}

export async function validateOutput(destination, sourcePaths) {
  const output = await resolveOutput(destination)
  for (const source of sourcePaths) {
    const actual = await realpath(source)
    const sourceDirectory = path.dirname(actual)
    if (contains(sourceDirectory, output) || contains(output, sourceDirectory)) {
      throw new Error('Output must be separate from the reference disc directory.')
    }
  }
  const existing = await lstat(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  if (existing) throw new Error(`Output already exists; choose another --out path: ${output}`)
  return output
}

async function writeMembers(bytes, directory, state, depth = 0) {
  if (depth >= MAX_DEPTH) throw new Error('Archive nesting exceeds the extraction limit.')
  const archive = parseEaArchive(bytes)
  for (const member of archive.entries) {
    state.count++
    if (state.count > MAX_MEMBERS) throw new Error('Archive member count exceeds the extraction limit.')
    const data = bytes.subarray(member.offset, member.offset + member.size)
    // The archive parser validates names, path components and collisions.
    const destination = path.join(directory, ...member.name.split('/'))
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, data, { flag: 'wx' })
    if (identifyResource(data.subarray(0, 64), member.name).kind === 'archive') {
      await writeMembers(data, destination + '.members', state, depth + 1)
    }
  }
}

/** Extract code, databases and indexed assets, leaving XA/video on the disc. */
export async function extractReference(disc, report, output) {
  const destination = await validateOutput(output, [disc.metadata.binPath, disc.metadata.cuePath])
  await mkdir(path.dirname(destination), { recursive: true })
  const staging = await mkdtemp(path.join(path.dirname(destination), '.fifa98-extract-'))
  const extracted = []
  const state = { count: 0 }
  try {
    for (const file of report.files) {
      if (!file.archive && file.kind !== 'archive' && file.path !== report.boot.bootPath && !['BECODE.BIN', 'FECODE.BIN', 'SYSTEM.CNF'].includes(file.path)) continue
      if (file.inspectionError) throw new Error(`Cannot extract ${file.path}: ${file.inspectionError}`)
      const target = path.join(staging, 'disc', ...file.path.split('/'))
      const result = await disc.extractFile(file.path, target)
      if (file.sha256 && file.sha256 !== result.sha256) throw new Error(`Disc changed while extracting ${file.path}.`)
      extracted.push({ path: file.path, size: result.size, sha256: result.sha256 })
      if (file.archive) {
        const bytes = await disc.readFile(file.path)
        if (digest(bytes) !== result.sha256) throw new Error(`Disc changed while reading members of ${file.path}.`)
        await writeMembers(bytes, path.join(staging, 'members', ...file.path.split('/')), state)
      }
    }
    await writeFile(path.join(staging, 'report.json'), JSON.stringify({ ...report, extracted }, null, 2) + '\n', { flag: 'wx' })
    // Refuse replacement if another process created the destination meanwhile.
    if (await lstat(destination).catch((error) => { if (error.code !== 'ENOENT') throw error; return null })) {
      throw new Error(`Output was created during extraction: ${destination}`)
    }
    await rename(staging, destination)
    return { output: destination, files: extracted.length, members: state.count }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

const help = `FIFA 98 native reconstruction tools (no game execution)

  node games/fifa98/scripts/reconstruct.mjs inspect [--bin FILE] [--cue FILE]
  node games/fifa98/scripts/reconstruct.mjs extract [--bin FILE] [--cue FILE] [--out DIRECTORY]

inspect prints a JSON inventory to stdout without writing files.
extract writes code and validated EA assets to a new directory, plus report.json.
Default input: reference-games/Fifa98/Fifa98.bin and Fifa98.cue
Default extraction output: games/fifa98/.work/reference
Existing outputs and reference files are never overwritten.
`

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    bin: { type: 'string' }, cue: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) { process.stdout.write(help); return }
  if (positionals.length !== 1 || !['inspect', 'extract'].includes(positionals[0])) throw new Error(help)
  const command = positionals[0]
  if (command === 'inspect' && values.out) throw new Error('inspect writes JSON to stdout. Use shell redirection to save a report.')
  const binPath = path.resolve(values.bin ?? path.join(referenceRoot, 'Fifa98.bin'))
  const cuePath = path.resolve(values.cue ?? (values.bin ? binPath.replace(/\.bin$/i, '.cue') : path.join(referenceRoot, 'Fifa98.cue')))
  const disc = await openDisc({ binPath, cuePath })
  try {
    const report = await inspectReference(disc)
    if (command === 'inspect') { process.stdout.write(JSON.stringify(report, null, 2) + '\n'); return }
    const result = await extractReference(disc, report, path.resolve(values.out ?? path.join(gameRoot, '.work/reference')))
    for (const warning of report.warnings) process.stderr.write(`Warning: ${warning}\n`)
    process.stdout.write(`Extracted ${result.files} disc files and ${result.members} indexed members to ${result.output}\n`)
    process.stdout.write(`Code layout: ${report.codeLayout.status}. Inspection issues: ${report.issues.length}. See report.json.\n`)
  } finally {
    await disc.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`FIFA 98 reconstruction: ${error.message}\n`); process.exitCode = 1 })
}
