import { createHash } from 'node:crypto'
import { inspectPsxExe } from './disc.mjs'

const PROFILE = Object.freeze({
  id: 'SLES_009.14-europe-bootstrap-v1',
  boot: 'SLES_009.14',
  size: 251904,
  sha256: 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644',
  sizes: { 'FECODE.BIN': 733204, 'BECODE.BIN': 939136 },
})
const hex = (value) => `0x${value.toString(16).padStart(8, '0')}`

/** Decode this bootstrap's evidence, without identifying a disc revision.
 * This is static instruction inspection: instructions are never executed.
 * inspectLayout additionally requires the complete known executable hash.
 */
export function decodeBootstrapLayout(bytes, fileSizes) {
  const boot = inspectPsxExe(bytes, { fileSize: bytes.length })
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const evidence = []
  function offset(address, length = 4) {
    const index = address - boot.loadAddress + 2048
    if (!Number.isSafeInteger(index) || index < 2048 || index + length > data.length ||
        index + length > boot.payloadSize + 2048) throw new Error('Bootstrap evidence exceeds the executable payload.')
    return index
  }
  function word(address, role) {
    const value = data.readUInt32LE(offset(address))
    evidence.push({ address: hex(address), word: hex(value), role })
    return value
  }
  function expect(address, expected, role) {
    const actual = word(address, role)
    if (actual !== expected) throw new Error(`Unexpected bootstrap instruction at ${hex(address)}.`)
    return actual
  }
  function pair(address, register, lowerOpcode, role) {
    const upper = word(address, role)
    const lower = word(address + 4, role)
    if (upper >>> 16 !== (0x3c00 | register) ||
        lower >>> 16 !== ((lowerOpcode << 10) | (register << 5) | register)) {
      throw new Error(`Unexpected constant construction at ${hex(address)}.`)
    }
    const low = lower & 0xffff
    return (((upper & 0xffff) * 65536) + (lowerOpcode === 13 ? low : (low << 16 >> 16))) >>> 0
  }
  function call(address, role) {
    const instruction = word(address, role)
    if (instruction >>> 26 !== 3) throw new Error(`Expected a direct call at ${hex(address)}.`)
    return (((address + 4) & 0xf0000000) | ((instruction & 0x03ffffff) << 2)) >>> 0
  }
  function filename(address) {
    const start = offset(address, 11)
    const name = data.subarray(start, start + 11).toString('ascii')
    if (!/^(be|fe)code\.bin\0$/.test(name)) throw new Error('Unexpected overlay filename.')
    return name.slice(0, -1).toUpperCase()
  }

  const switchEntry = call(0x800150c8, 'overlay switch call before first entry')
  expect(0x800150cc, 0x00002021, 'switch argument zero')
  const feEntry = call(0x800150d0, 'entry called after switch argument zero')
  if (call(0x800150d8, 'overlay switch call before second entry') !== switchEntry) {
    throw new Error('Overlay switches call different functions.')
  }
  expect(0x800150dc, 0x24040001, 'switch argument one')
  const beEntry = call(0x800150e0, 'entry called after switch argument one')
  if (switchEntry !== 0x8001510c) throw new Error('Unexpected overlay switch destination.')
  expect(0x8001511c, 0x00808021, 'preserve switch argument in s0')
  expect(0x80015180, 0x1200000b, 'argument zero selects second loading branch')

  const pointerCell = pair(0x80015188, 5, 35, 'load shared destination pointer')
  const base = word(pointerCell, 'shared overlay destination value')
  const beName = filename(pair(0x80015190, 4, 9, 'first branch filename'))
  const loader = call(0x80015198, 'first branch file loader')
  const beHeap = pair(0x800151a0, 5, 9, 'first branch heap boundary')
  if (pair(0x800151b0, 5, 35, 'second branch destination pointer') !== pointerCell) {
    throw new Error('Overlay branches use different destination pointers.')
  }
  const feName = filename(pair(0x800151b8, 4, 9, 'second branch filename'))
  if (call(0x800151c0, 'second branch file loader') !== loader) throw new Error('Overlay branches use different file loaders.')
  const feHeap = pair(0x800151cc, 5, 9, 'second branch heap boundary')
  if (beName !== 'BECODE.BIN' || feName !== 'FECODE.BIN' || base < 0x80000000 || base >= 0x80200000) {
    throw new Error('Unexpected overlay filenames or RAM destination.')
  }
  const overlays = [
    { file: feName, entry: feEntry, heap: feHeap, switchArgument: 0 },
    { file: beName, entry: beEntry, heap: beHeap, switchArgument: 1 },
  ].map(({ file, entry, heap, switchArgument }) => {
    const size = fileSizes?.[file]
    const end = base + size
    if (!Number.isSafeInteger(size) || size <= 0 || end > 0x80200000 ||
        entry < base || entry >= end || entry % 4 !== 0 || heap < end || heap - end > 15) {
      throw new Error(`Overlay entry, extent, or heap boundary is inconsistent for ${file}.`)
    }
    return {
      file, size, loadAddress: hex(base), endAddress: hex(end),
      entryAddress: hex(entry), entryOffset: entry - base,
      heapStart: hex(heap), heapPadding: heap - end, switchArgument,
    }
  })
  return {
    overlays, evidence,
    note: 'Both images occupy the same RAM base. Entry labels describe direct bootstrap calls; gameplay function semantics remain unresolved.',
  }
}

export function inspectLayout(bytes, fileSizes = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Executable bytes must be a Uint8Array.')
  const boot = { file: PROFILE.boot, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  const unsupported = (reason, detail) => ({ status: 'unsupported', profile: null, reason, detail, boot, overlays: [] })
  try { boot.header = inspectPsxExe(bytes, { fileSize: bytes.length }) }
  catch (error) { return unsupported('invalid-executable', error.message) }
  if (boot.size !== PROFILE.size || boot.sha256 !== PROFILE.sha256) {
    return unsupported('unknown-executable', 'The complete bootstrap executable does not match the verified profile. No overlay addresses were inferred.')
  }
  for (const [file, size] of Object.entries(PROFILE.sizes)) {
    if (fileSizes[file] !== size) return unsupported('overlay-size-mismatch', `Expected ${file} to contain ${size} bytes.`)
  }
  try {
    return { status: 'identified', profile: PROFILE.id, boot, ...decodeBootstrapLayout(bytes, fileSizes) }
  } catch (error) { return unsupported('inconsistent-bootstrap', error.message) }
}

export async function inspectCodeLayout(disc) {
  const required = [PROFILE.boot, ...Object.keys(PROFILE.sizes)]
  const entries = new Map(disc.files.map((file) => [file.path, file]))
  const missingFiles = required.filter((file) => !entries.has(file))
  if (missingFiles.length) {
    return { status: 'unsupported', profile: null, reason: 'missing-files', missingFiles, boot: null, overlays: [] }
  }
  // Read errors and malformed ISO sectors are reader failures, not unknown builds.
  const bytes = await disc.readFile(PROFILE.boot, { maxBytes: 1024 * 1024 })
  return inspectLayout(bytes, Object.fromEntries(required.map((file) => [file, entries.get(file).size])))
}
