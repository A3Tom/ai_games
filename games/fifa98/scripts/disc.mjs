import { createHash } from 'node:crypto'
import { open, readFile, realpath, stat, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'

const RAW_SECTOR = 2352
const BLOCK = 2048
const SYNC = Buffer.from([0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0])
const MAX_DIRECTORY = 16 * 1024 * 1024
const MAX_READ = 64 * 1024 * 1024

export function normalizeCue(text) {
  if (typeof text !== 'string') throw new Error('The CUE must be text.')
  return text.replace(/^\uFEFF/, '').replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n')
}

function plainName(name) {
  return name.length > 0 && name !== '.' && name !== '..' &&
    !/[\\/:\x00-\x1f\x7f-\uffff]/.test(name)
}

// This importer deliberately supports the supplied single-track disc format.
// Other layouts need their own sector mapping rather than guessed offsets.
export function parseCue(text) {
  let file
  let track = false
  let index = false
  for (const line of normalizeCue(text).split('\n').map((value) => value.trim()).filter(Boolean)) {
    if (/^(REM\b|TITLE\s+|PERFORMER\s+)/i.test(line)) continue
    const fileMatch = /^FILE\s+"([^"]+)"\s+BINARY$/i.exec(line)
    if (fileMatch) {
      if (file || !plainName(fileMatch[1])) throw new Error('The CUE must reference one plain BIN filename.')
      file = fileMatch[1]
    } else if (/^TRACK\s+0?1\s+MODE2\/2352$/i.test(line)) {
      if (!file || track) throw new Error('The CUE must contain one MODE2/2352 track.')
      track = true
    } else if (/^INDEX\s+0?1\s+00:00:00$/i.test(line)) {
      if (!track || index) throw new Error('The CUE must start its data track at INDEX 01 00:00:00.')
      index = true
    } else {
      throw new Error(`Unsupported CUE directive: ${line.slice(0, 100)}`)
    }
  }
  if (!file || !track || !index) throw new Error('The CUE must describe one MODE2/2352 track at INDEX 01 00:00:00.')
  return { file, tracks: 1, mode: 'MODE2/2352', sectorSize: RAW_SECTOR }
}

function both32(bytes, offset, label) {
  const value = bytes.readUInt32LE(offset)
  if (value !== bytes.readUInt32BE(offset + 4)) throw new Error(`Invalid ISO9660 ${label}: endian copies disagree.`)
  return value
}

function both16(bytes, offset, label) {
  const value = bytes.readUInt16LE(offset)
  if (value !== bytes.readUInt16BE(offset + 2)) throw new Error(`Invalid ISO9660 ${label}: endian copies disagree.`)
  return value
}

function isoPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')) {
    throw new Error('Use a relative ISO9660 file path.')
  }
  const parts = value.split('/')
  if (parts.some((part) => !plainName(part))) throw new Error('Unsafe ISO9660 file path.')
  return parts.map((part) => {
    if (part.includes(';') && (!/^[^;]+;[1-9]\d{0,4}$/.test(part) || Number(part.split(';')[1]) > 32767)) {
      throw new Error('Invalid ISO9660 file version.')
    }
    const name = part.replace(/;[1-9]\d*$/, '')
    if (!plainName(name)) throw new Error('Unsafe ISO9660 file path.')
    return name.toUpperCase()
  }).join('/')
}

export function parseSystemCnf(text) {
  if (typeof text !== 'string') throw new Error('SYSTEM.CNF must be text.')
  const entries = new Map()
  for (const line of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) throw new Error('Invalid SYSTEM.CNF entry.')
    const key = match[1].toUpperCase()
    if (entries.has(key)) throw new Error(`Duplicate SYSTEM.CNF ${key} entry.`)
    entries.set(key, match[2])
  }
  const boot = entries.get('BOOT')
  const match = typeof boot === 'string' && /^cdrom:\\([^\x00-\x1f]+);([1-9]\d*)$/i.exec(boot)
  if (!match) throw new Error('SYSTEM.CNF must contain a BOOT = cdrom:\\FILE;1 entry.')
  const bootPath = isoPath(match[1].replace(/\\/g, '/'))
  return { boot, bootPath, entries: Object.fromEntries(entries) }
}

export function inspectPsxExe(bytes, { fileSize = bytes?.length } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < BLOCK) throw new Error('A PS-X EXE header requires 2048 bytes.')
  const header = Buffer.from(bytes.buffer, bytes.byteOffset, BLOCK)
  if (header.subarray(0, 8).toString('ascii') !== 'PS-X EXE') throw new Error('The file is not a PS-X EXE.')
  if (!Number.isSafeInteger(fileSize) || fileSize < BLOCK) throw new Error('Invalid PS-X EXE file size.')
  const fields = ['entryPc', 'globalPointer', 'loadAddress', 'payloadSize', 'dataAddress', 'dataSize',
    'bssAddress', 'bssSize', 'stackAddress', 'stackOffset']
  const info = Object.fromEntries(fields.map((name, index) => [name, header.readUInt32LE(0x10 + index * 4)]))
  if (!info.payloadSize || info.payloadSize > fileSize - BLOCK || info.payloadSize % 4 !== 0 ||
      info.loadAddress + info.payloadSize > 0x100000000) {
    throw new Error('PS-X EXE payload exceeds the file or address boundaries.')
  }
  return { ...info, fileSize, marker: header.subarray(0x4c, 0x100).toString('ascii').split('\0')[0] }
}

async function readExactly(handle, length, position) {
  const buffer = Buffer.alloc(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset)
    if (!bytesRead) throw new Error('The disc image is truncated.')
    offset += bytesRead
  }
  return buffer
}

function sectorData(raw, offset, lba) {
  const sector = raw.subarray(offset, offset + RAW_SECTOR)
  if (!sector.subarray(0, 12).equals(SYNC) || sector[15] !== 2 ||
      !sector.subarray(16, 20).equals(sector.subarray(20, 24))) {
    throw new Error(`Invalid MODE2/2352 sector at LBA ${lba}.`)
  }
  if (sector[18] & 0x20) throw new Error(`MODE2 Form2 sector at LBA ${lba} requires an XA/STR media decoder.`)
  return sector.subarray(24, 24 + BLOCK)
}

function inside(candidate, directory) {
  return candidate === directory || candidate.startsWith(directory + path.sep)
}

// Resolve existing ancestors too, so an output path through a symlink cannot
// accidentally target the reference directory. Existing files are never replaced.
async function resolvedDestination(destination) {
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

class Disc {
  #handle
  #lookup = new Map()
  #sourceDirectories
  #closed = false

  constructor(handle, metadata, sourceDirectories) {
    this.#handle = handle
    this.#sourceDirectories = sourceDirectories
    Object.assign(this, metadata)
  }

  get metadata() {
    const { binPath, cuePath, byteLength, sectorCount, volumeSectors, volumeId, files, warnings } = this
    return Object.freeze({ binPath, cuePath, byteLength, sectorCount, volumeSectors, volumeId, files, warnings })
  }

  async #blocks(lba, count) {
    if (this.#closed) throw new Error('The disc is closed.')
    if (!Number.isSafeInteger(lba) || !Number.isSafeInteger(count) || lba < 0 || count < 1 ||
        lba + count > (this.volumeSectors ?? this.sectorCount)) throw new Error('Disc sector range exceeds the image.')
    const raw = await readExactly(this.#handle, count * RAW_SECTOR, lba * RAW_SECTOR)
    const data = Buffer.alloc(count * BLOCK)
    for (let i = 0; i < count; i++) sectorData(raw, i * RAW_SECTOR, lba + i).copy(data, i * BLOCK)
    return data
  }

  #record(bytes) {
    if (bytes.length < 34 || bytes[0] !== bytes.length || !bytes[32] || 33 + bytes[32] > bytes.length) {
      throw new Error('Invalid ISO9660 directory record length.')
    }
    if (bytes[1] || bytes[26] || bytes[27] || (bytes[25] & ~3)) {
      throw new Error('Unsupported ISO9660 extended, interleaved, associated, or multi-extent file.')
    }
    if (both16(bytes, 28, 'volume sequence') !== 1) throw new Error('Multi-volume ISO9660 images are unsupported.')
    const lba = both32(bytes, 2, 'extent')
    const size = both32(bytes, 10, 'file size')
    if (lba >= this.volumeSectors || lba + Math.ceil(size / BLOCK) > this.volumeSectors) {
      throw new Error('ISO9660 file extent exceeds the volume.')
    }
    return { lba, size, directory: Boolean(bytes[25] & 2), identifier: bytes.subarray(33, 33 + bytes[32]) }
  }

  async initialize() {
    let primary
    let terminated = false
    for (let lba = 16; lba < Math.min(this.sectorCount, 80); lba++) {
      const block = await this.#blocks(lba, 1)
      if (block.subarray(1, 6).toString('ascii') !== 'CD001' || block[6] !== 1) throw new Error('Invalid ISO9660 volume descriptor.')
      if (block[0] === 255) { terminated = true; break }
      if (block[0] === 1) {
        if (primary) throw new Error('Multiple ISO9660 primary volumes are unsupported.')
        primary = block
      }
    }
    if (!primary || !terminated) throw new Error('The disc has no complete ISO9660 primary volume descriptor set.')
    this.volumeSectors = both32(primary, 80, 'volume size')
    if (this.volumeSectors < 18 || this.volumeSectors > this.sectorCount || both16(primary, 128, 'block size') !== BLOCK) {
      throw new Error('Invalid ISO9660 volume bounds or logical block size.')
    }
    if (both16(primary, 120, 'volume set size') !== 1 || both16(primary, 124, 'volume sequence') !== 1) {
      throw new Error('Multi-volume ISO9660 images are unsupported.')
    }
    this.volumeId = primary.subarray(40, 72).toString('ascii').trim()
    const rootLength = primary[156]
    if (rootLength < 34 || 156 + rootLength > BLOCK) throw new Error('Invalid ISO9660 root record.')
    const root = this.#record(primary.subarray(156, 156 + rootLength))
    if (!root.directory || root.identifier.length !== 1 || root.identifier[0] !== 0) throw new Error('Invalid ISO9660 root directory.')
    const directories = new Set()
    const entries = []
    const allPaths = new Set()
    const walk = async (directory, prefix, depth) => {
      if (depth > 32 || directories.size >= 256 || directories.has(directory.lba)) throw new Error('ISO9660 directory cycle or directory limit exceeded.')
      if (!directory.size || directory.size > MAX_DIRECTORY) throw new Error('ISO9660 directory is empty or too large.')
      directories.add(directory.lba)
      const data = await this.#readExtent(directory, 0, directory.size)
      let position = 0
      while (position < data.length) {
        const length = data[position]
        if (!length) {
          const end = Math.min(data.length, (Math.floor(position / BLOCK) + 1) * BLOCK)
          if (data.subarray(position, end).some((byte) => byte !== 0)) throw new Error('Invalid ISO9660 directory padding.')
          position = end
          continue
        }
        if (position + length > data.length || position % BLOCK + length > BLOCK) throw new Error('ISO9660 directory record crosses a block boundary.')
        const record = this.#record(data.subarray(position, position + length))
        position += length
        if (record.identifier.length === 1 && (record.identifier[0] === 0 || record.identifier[0] === 1)) continue
        const name = record.identifier.toString('latin1')
        if (!plainName(name)) throw new Error('Unsafe ISO9660 directory identifier.')
        const canonical = isoPath(prefix + name)
        if (allPaths.has(canonical)) throw new Error(`Duplicate ISO9660 path: ${canonical}`)
        allPaths.add(canonical)
        if (allPaths.size > 100000) throw new Error('ISO9660 file limit exceeded.')
        if (record.directory) await walk(record, canonical + '/', depth + 1)
        else {
          const entry = Object.freeze({ path: canonical, lba: record.lba, size: record.size })
          this.#lookup.set(canonical, entry)
          entries.push(entry)
        }
      }
    }
    await walk(root, '', 0)
    this.files = Object.freeze(entries.sort((a, b) => a.path.localeCompare(b.path, 'en')))
    return this
  }

  #entry(name) {
    if (this.#closed) throw new Error('The disc is closed.')
    const entry = this.#lookup.get(isoPath(name))
    if (!entry) throw new Error(`ISO9660 file not found: ${name}`)
    return entry
  }

  async #readExtent(entry, offset, length) {
    if (!length) return Buffer.alloc(0)
    const first = Math.floor(offset / BLOCK)
    const skip = offset % BLOCK
    const count = Math.ceil((skip + length) / BLOCK)
    const chunks = []
    for (let i = 0; i < count; i += 128) chunks.push(await this.#blocks(entry.lba + first + i, Math.min(128, count - i)))
    return Buffer.concat(chunks).subarray(skip, skip + length)
  }

  async readFileRange(name, { offset = 0, length = 64 } = {}) {
    const entry = this.#entry(name)
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || length > MAX_READ || offset > entry.size) {
      throw new Error('Invalid ISO9660 file range; reads are limited to 64 MiB.')
    }
    return this.#readExtent(entry, offset, Math.min(length, entry.size - offset))
  }

  async readFile(name, { maxBytes = MAX_READ } = {}) {
    const entry = this.#entry(name)
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || entry.size > maxBytes || entry.size > MAX_READ) {
      throw new Error(`ISO9660 file exceeds the read limit: ${entry.path}`)
    }
    return this.#readExtent(entry, 0, entry.size)
  }

  async *#chunks(entry) {
    for (let offset = 0; offset < entry.size; offset += 128 * BLOCK) {
      yield await this.#readExtent(entry, offset, Math.min(128 * BLOCK, entry.size - offset))
    }
  }

  async hashFile(name) {
    const hash = createHash('sha256')
    for await (const chunk of this.#chunks(this.#entry(name))) hash.update(chunk)
    return hash.digest('hex')
  }

  async extractFile(name, destination) {
    const entry = this.#entry(name)
    if (typeof destination !== 'string' || !destination) throw new Error('Supply an explicit extraction destination.')
    const output = await resolvedDestination(destination)
    if (this.#sourceDirectories.some((directory) => inside(output, directory))) throw new Error('Extraction cannot write into a disc source directory.')
    await mkdir(path.dirname(output), { recursive: true })
    const handle = await open(output, 'wx')
    let complete = false
    try {
      const hash = createHash('sha256')
      for await (const chunk of this.#chunks(entry)) {
        hash.update(chunk)
        let offset = 0
        while (offset < chunk.length) {
          const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset)
          if (!bytesWritten) throw new Error('Unable to write the extracted file.')
          offset += bytesWritten
        }
      }
      complete = true
      return { path: output, size: entry.size, sha256: hash.digest('hex') }
    } finally {
      await handle.close()
      if (!complete) await unlink(output).catch(() => {})
    }
  }

  async close() {
    if (!this.#closed) { this.#closed = true; await this.#handle.close() }
  }
}

export async function openDisc({ binPath, cuePath } = {}) {
  if (typeof cuePath !== 'string' || !cuePath) throw new Error('Supply a CUE path.')
  const actualCue = await realpath(cuePath)
  const cueInfo = await stat(actualCue)
  if (!cueInfo.isFile() || cueInfo.size > 65536) throw new Error('The CUE must be a regular text file smaller than 64 KiB.')
  const cue = parseCue(await readFile(actualCue, 'utf8'))
  if (binPath !== undefined && (typeof binPath !== 'string' || !binPath)) throw new Error('Invalid explicit BIN path.')
  const selectedBin = binPath ?? path.join(path.dirname(actualCue), cue.file)
  const actualBin = await realpath(selectedBin)
  const handle = await open(actualBin, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size < 18 * RAW_SECTOR || info.size % RAW_SECTOR !== 0 || !Number.isSafeInteger(info.size)) {
      throw new Error('The BIN must be a complete regular MODE2/2352 image.')
    }
    const warnings = []
    if (binPath !== undefined && path.basename(actualBin) !== cue.file) {
      warnings.push(`CUE names "${cue.file}"; explicitly selected BIN "${path.basename(actualBin)}" is used without changing the CUE.`)
    }
    const disc = new Disc(handle, {
      binPath: actualBin, cuePath: actualCue, byteLength: info.size,
      sectorCount: info.size / RAW_SECTOR, warnings: Object.freeze(warnings),
    }, [path.dirname(actualBin), path.dirname(actualCue)])
    return await disc.initialize()
  } catch (error) {
    await handle.close()
    throw error
  }
}
