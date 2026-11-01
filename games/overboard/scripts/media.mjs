import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { crc32 } from 'node:zlib'

const MAX_ZIP_SIZE = 0xffffffff
const GAME_FILE = 'overboard.zip'

function isPlainFilename(name) {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' &&
    Buffer.byteLength(name) <= 255 && !/[\\/\x00-\x1f\x7f]/.test(name)
}

// Some disc exports contain escaped CRLF text instead of actual line endings.
export function normalizeCue(text) {
  return text.replace(/^\uFEFF/, '').replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n')
}

export function parseCue(text) {
  const cue = normalizeCue(text)
  const files = []
  let tracks = 0
  for (const line of cue.split('\n')) {
    if (/^\s*FILE\b/i.test(line)) {
      const match = /^\s*FILE\s+"([^"]+)"\s+BINARY\s*$/i.exec(line)
      if (!match || !isPlainFilename(match[1])) throw new Error('CUE FILE entries must reference plain BIN filenames in the same folder.')
      files.push(match[1])
    }
    if (/^\s*TRACK\s+\d+\s+/i.test(line)) tracks++
  }
  if (files.length === 0 || tracks === 0 || !/^\s*TRACK\s+0?1\s+MODE[12]\/2352\s*$/im.test(cue)) {
    throw new Error('The CUE must describe a PlayStation disc with a raw data track.')
  }
  if (new Set(files.map((file) => file.toLowerCase())).size !== files.length) {
    throw new Error('The CUE repeats a disc filename.')
  }
  return { cue: cue.trimEnd() + '\n', files, tracks }
}

async function sourceFile(directory, name) {
  if (!isPlainFilename(name)) throw new Error(`Invalid media filename: ${name}`)
  const filename = path.join(directory, name)
  let info
  try {
    info = await lstat(filename)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`The disc is incomplete: missing ${name}.`)
    throw error
  }
  if (!info.isFile() || info.size === 0 || info.size > MAX_ZIP_SIZE) {
    throw new Error(`Disc entries must be nonempty regular files smaller than 4 GB: ${name}`)
  }
  return { name, filename, size: info.size, mtimeMs: info.mtimeMs }
}

async function writeAll(handle, bytes) {
  let offset = 0
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset)
    if (result.bytesWritten === 0) throw new Error('Unable to write the disc archive.')
    offset += result.bytesWritten
  }
}

// STORE entries stream directly from the disc files. This keeps importing a full
// CD image from requiring another CD-sized in-memory buffer or a system zip tool.
export async function writeDiscZip(destination, entries) {
  const handle = await open(destination, 'wx')
  const central = []
  let offset = 0
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name)
      const localOffset = offset
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0x0808, 6) // UTF-8 names; CRC/sizes follow the data.
      local.writeUInt16LE(0x21, 12) // 1980-01-01, stable generated metadata.
      local.writeUInt16LE(name.length, 26)
      await writeAll(handle, local)
      await writeAll(handle, name)
      offset += local.length + name.length
      let checksum = 0
      let size = 0
      const chunks = entry.data ? [entry.data] : createReadStream(entry.filename)
      for await (const chunk of chunks) {
        checksum = crc32(chunk, checksum)
        size += chunk.length
        await writeAll(handle, chunk)
      }
      if (size > MAX_ZIP_SIZE || offset + size > MAX_ZIP_SIZE) throw new Error('Disc archive exceeds the 4 GB ZIP limit.')
      const descriptor = Buffer.alloc(16)
      descriptor.writeUInt32LE(0x08074b50, 0)
      descriptor.writeUInt32LE(checksum, 4)
      descriptor.writeUInt32LE(size, 8)
      descriptor.writeUInt32LE(size, 12)
      await writeAll(handle, descriptor)
      offset += size + descriptor.length
      const record = Buffer.alloc(46)
      record.writeUInt32LE(0x02014b50, 0)
      record.writeUInt16LE(20, 4)
      record.writeUInt16LE(20, 6)
      record.writeUInt16LE(0x0808, 8)
      record.writeUInt16LE(0x21, 14)
      record.writeUInt32LE(checksum, 16)
      record.writeUInt32LE(size, 20)
      record.writeUInt32LE(size, 24)
      record.writeUInt16LE(name.length, 28)
      record.writeUInt32LE(localOffset, 42)
      central.push(record, name)
    }
    const centralOffset = offset
    for (const record of central) {
      await writeAll(handle, record)
      offset += record.length
    }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(offset - centralOffset, 12)
    end.writeUInt32LE(centralOffset, 16)
    await writeAll(handle, end)
    return offset + end.length
  } finally {
    await handle.close()
  }
}

export async function readMediaManifest(output) {
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  if (manifest.version !== 1 || manifest.file !== GAME_FILE || !Number.isSafeInteger(manifest.size) || manifest.size <= 0 ||
      (manifest.bios !== undefined && manifest.bios !== 'bios.bin')) {
    throw new Error('Invalid Overboard media manifest; import the disc again.')
  }
  const game = await lstat(path.join(output, manifest.file))
  if (!game.isFile() || game.size !== manifest.size) throw new Error('The imported disc archive is missing or has changed; import the disc again.')
  if (manifest.bios) {
    const bios = await lstat(path.join(output, manifest.bios))
    if (!bios.isFile() || bios.size !== 512 * 1024) throw new Error('The imported PlayStation BIOS must be a 512 KB file.')
  }
  return manifest
}

async function assertSeparate(source, output) {
  const actualSource = await realpath(source)
  const actualOutput = await realpath(output).catch(async (error) => {
    if (error.code !== 'ENOENT') throw error
    await mkdir(path.dirname(output), { recursive: true })
    return path.join(await realpath(path.dirname(output)), path.basename(output))
  })
  if (actualSource === actualOutput || actualSource.startsWith(actualOutput + path.sep) || actualOutput.startsWith(actualSource + path.sep)) {
    throw new Error('The disc source and generated game-data folder must be separate.')
  }
  return actualSource
}

export async function prepareMedia({ source, output, bios, force = false }) {
  let directory
  try {
    directory = await assertSeparate(source, output)
  } catch (error) {
    if (error.code === 'ENOENT' && !force) return await readMediaManifest(output)
    throw error
  }
  const cueNames = (await readdir(directory)).filter((name) => /\.cue$/i.test(name))
  if (cueNames.length !== 1) throw new Error('The disc folder must contain exactly one CUE file and all of its BIN tracks.')
  const cueFile = await sourceFile(directory, cueNames[0])
  const parsed = parseCue(await readFile(cueFile.filename, 'utf8'))
  const tracks = await Promise.all(parsed.files.map((name) => sourceFile(directory, name)))
  const files = [cueFile, ...tracks]
  const sourceFiles = files.map(({ name, size, mtimeMs }) => ({ name, size, mtimeMs }))
  let biosFile
  if (bios) {
    biosFile = await sourceFile(path.dirname(path.resolve(bios)), path.basename(bios))
    if (biosFile.size !== 512 * 1024) throw new Error('Supply a 512 KB PlayStation BIOS file.')
  }
  const sourceFingerprint = createHash('sha256').update(JSON.stringify({ sourceFiles, cue: parsed.cue })).digest('hex')
  // A complete source disc can repair an incomplete or corrupted generated bundle.
  const existing = await readMediaManifest(output).catch(() => null)
  if (!force && !biosFile) {
    if (existing?.sourceFingerprint === sourceFingerprint) return existing
  }
  const staging = `${output}.import-${process.pid}`
  const backup = `${output}.previous-${process.pid}`
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(staging)
  let backedUp = false
  let installed = false
  try {
    const size = await writeDiscZip(path.join(staging, GAME_FILE), [
      { name: cueFile.name, data: Buffer.from(parsed.cue) }, ...tracks,
    ])
    const manifest = { version: 1, title: 'Overboard! (Europe)', file: GAME_FILE, size, tracks: parsed.tracks, sourceFiles, sourceFingerprint }
    // Keep a previously imported BIOS when refreshing only the disc.
    if (biosFile || existing?.bios) {
      await copyFile(biosFile?.filename ?? path.join(output, 'bios.bin'), path.join(staging, 'bios.bin'))
      manifest.bios = 'bios.bin'
    }
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    try {
      await rename(output, backup)
      backedUp = true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await rename(staging, output)
    installed = true
    return manifest
  } finally {
    await rm(staging, { recursive: true, force: true })
    if (backedUp) {
      if (installed) await rm(backup, { recursive: true, force: true })
      else await rename(backup, output)
    }
  }
}
