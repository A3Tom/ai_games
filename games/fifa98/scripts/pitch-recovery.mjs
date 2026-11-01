import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { inspectRecoveredRegion } from './match-recovery.mjs'
import { decodeInstruction } from './code-map.mjs'
import { pitchProfiles } from './pitch.mjs'

const BASE = 0x8005ae28
const IMAGE_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'
const GRASS_HASH = '0e3632097af20795365dc223854443676ddfaea212b963ae4a566aa30fff1cf9'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const hex = (value) => `0x${value.toString(16).padStart(8, '0')}`

export const pitchNativeExports = Object.freeze([
  'fifa98_pitch_vertices', 'fifa98_pitch_quads', 'fifa98_pitch_uv',
  'fifa98_pitch_vertex_capacity', 'fifa98_pitch_quad_capacity',
  'fifa98_pitch_profile_extent', 'fifa98_pitch_generate',
])
const regions = [
  { id: 'grass-grid-constructor', address: 0x800ea250, size: 780,
    sha256: '2e7bf78871a97a30100e14b80128aa4699e5ac321b2e47020cdf2b974da98efc',
    kind: 'constructor-source-evidence', nativeExport: 'fifa98_pitch_generate',
    semantics: 'The native function recovers only signed-bound sorting, wrapped span/truncating steps, 192 halfword XYZ writes and 165 quad index records. Original allocation, lookup, RGB selection and render-object construction remain excluded.' },
  { id: 'grass-quad-template', address: 0x800ea55c, size: 200,
    sha256: '33d191414ba162893d9e2d6f88663c098042de41db50e5a36e0077c75ffad08d',
    kind: 'primitive-template-source-evidence', nativeExport: 'fifa98_pitch_uv',
    semantics: 'Quad descriptor indices retain top-left, top-right, bottom-left, bottom-right order. Intermediate UV halfwords are (256,0),(0,0),(256,256),(0,256); texture handle, colour and primitive packet are not copied into the native ABI.' },
  { id: 'pitch-profile-dimension-writes', address: 0x800b595c, size: 612,
    sha256: 'e2e8651444fba18fa73c31c882538816ee2c94d69d179a114ebcb097dbc0b5c9',
    kind: 'partial-initializer-source-evidence', nativeExport: 'fifa98_pitch_profile_extent',
    semantics: 'Only the five explicit half-extent pairs are exported. This region is not a complete match initializer; mode 5 can retain prior dimensions and is unsupported by the stateless profile API.' },
  { id: 'grass-bound-caller', address: 0x800e9be4, size: 108,
    sha256: '3f8c910897d43e2ae0543735f0a56e86e5c3d9ccfef84ae2b21ffa65e761f7a6',
    kind: 'static-call-source-evidence', nativeExport: null,
    semantics: 'Caller prepares signed bounds from dimension globals, ordinarily extending them by 192. Special flag paths omit that margin; the preview supplies profile and margin explicitly.' },
]

export function inspectPitchRecovery(backend, { grass } = {}) {
  if (!(backend instanceof Uint8Array)) throw new TypeError('Backend must be a Uint8Array.')
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) }
  if (backend.length !== 939136 || source.sha256 !== IMAGE_HASH) return { version: 1, status: 'unsupported', reason: 'unknown-backend-image', source, routines: [], profiles: [] }
  if (grass !== undefined && (!(grass instanceof Uint8Array) || digest(grass) !== GRASS_HASH)) throw new Error('Grass resource fingerprint does not match the reviewed asset.')
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength)
  const constantSites = [[0x800b5a84, 0x800b5a94], [0x800b5aa0, 0x800b5ab0], [0x800b5ad0, 0x800b5adc], [0x800b5abc, 0x800b5acc], [0x800b59b0, 0x800b59bc]]
  const profiles = constantSites.map((sites, profile) => {
    const dimensions = sites.map((address, axis) => {
      const word = view.getUint32(address - BASE, true)
      const instruction = decodeInstruction(word, address)
      if (word >>> 16 !== 0x2402 || instruction.signed !== pitchProfiles[profile][axis]) throw new Error('Pitch-profile constant differs from reviewed instructions.')
      return { axis: axis ? 'z' : 'x', value: instruction.signed, at: hex(address), word: hex(word) }
    })
    return { profile, halfExtents: pitchProfiles[profile], dimensions }
  })
  const calls = [[0x800e9c48, 0x800ea250], [0x800ea4dc, 0x800ea55c], [0x800ea5bc, 0x80038dbc]].map(([at, target]) => {
    const word = view.getUint32(at - BASE, true), instruction = decodeInstruction(word, at)
    if (instruction.flow.kind !== 'call' || instruction.flow.target !== target) throw new Error('Reviewed pitch call differs from the backend image.')
    return { at: hex(at), target: hex(target), word: hex(word) }
  })
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-original-grass-grid-v1', source,
    nativeSource: 'native/pitch.c', nativeExports: pitchNativeExports,
    routines: regions.map((region) => ({ ...region, ...inspectRecoveredRegion(backend, { base: BASE, ...region }) })),
    profiles, calls, topology: { columns: 12, rows: 16, vertices: 192, quads: 165,
      quadOrder: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], intermediateUv: [[256, 0], [0, 0], [256, 256], [0, 256]],
      platformTriangleCorners: [[0, 1, 2], [1, 2, 3]] },
    texture: { id: 'ZGAOTHER.BIG/grass.psh', expectedSha256: GRASS_HASH, verified: grass !== undefined,
      tags: ['weto', 'damo', 'hoto', 'dryo', 'dryi', 'dami', 'hoti', 'weti'], width: 64, height: 64, bitsPerPixel: 4,
      previewTag: 'dryo', note: 'Texture selection and white modulation are explicit inspection settings, not recovered weather/material colour selection.' },
    preview: { profile: 2, margin: 192 },
    limitations: [
      'This is original grass geometry generation, not a recovered match initializer or playable football simulation.',
      'Mode selection, allocation, texture handles, alternating RGB tables and the special no-margin caller branches are not simulated.',
      'Pitch lines, goals, markings, collisions, player placement and ball rules are not supplied by this subset.',
      'UVs describe engine intermediate halfwords, not literal final GPU packet byte coordinates or original blend modes.',
      'Native buffers use packed XYZ rather than the original eight-byte padded vertex slot; no console memory or instructions are emulated.',
    ],
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, strict: true, options: { directory: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) { console.log('Usage: node games/fifa98/scripts/pitch-recovery.mjs [--directory EXTRACTED_DISC_DIRECTORY]\nPrints original grass-grid hashes, static disassembly and scope. Executes no game code.'); return }
  const directory = values.directory ?? fileURLToPath(new URL('../.work/reference/disc/', import.meta.url))
  console.log(JSON.stringify(inspectPitchRecovery(await readFile(path.join(directory, 'BECODE.BIN'))), null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
