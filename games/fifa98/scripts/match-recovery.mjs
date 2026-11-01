import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeInstruction } from './code-map.mjs';

const BACKEND_BASE = 0x8005ae28;
const BACKEND_SIZE = 939136;
const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0';
const BOOT_HASH = 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644';
const BOOT_SIZE = 251904;
const BOOT_FILE_BASE = 0x80011000; // PS-X EXE load 80011800h minus its 2048-byte file header.
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;

export const matchNativeExports = Object.freeze([
  'fifa98_planar_distance', 'fifa98_distance_rows', 'fifa98_tick_accumulate',
  'fifa98_match_workspace', 'fifa98_match_workspace_words',
  'fifa98_fixed_multiply', 'fifa98_ball_air_drag', 'fifa98_ball_free_tick',
  'fifa98_ball_surface_material', 'fifa98_ball_ground_contact',
  'fifa98_ball_ground_drag', 'fifa98_ball_surface_tick',
]);

const regions = [
  {
    id: 'simulation-fractional-tick-accumulator', address: 0x8006a120, size: 72,
    sha256: 'd1cdedaec158e495bd13326710f8e7714b19377db9bf98bb14419d5da48d3a63',
    kind: 'complete-leaf-routine', nativeExport: 'fifa98_tick_accumulate',
    semantics: 'Add delta to the fractional word with 32-bit wrap, transfer the high 16 bits to the whole counter with wrap, and retain the low 16 bits.',
    abi: {
      original: { wholeAddress: '0x8013b440', fractionAddress: '0x8013b444' },
      native: 'clock[0] is whole, clock[1] is fraction; delta is an explicit unsigned 32-bit argument. The original unused return register is not exported.',
    },
  },
  {
    id: 'per-side-rolling-planar-distances', address: 0x80061818, size: 396,
    sha256: 'e8fde2fc05adb052801dd3a1429b7b92bf022a0e242e3cfafeebae671ff14e91',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_distance_rows',
    semantics: 'Visit up to twice the current tick carry in rolling rows; compute upper-triangle distances and mirror them into the 11-column matrix. Diagonal and unvisited cells are unchanged.',
    abi: {
      original: { sideStride: 1968, sideBase: '0x8013e0a0', entityPointersOffset: 196,
        entityCountOffset: 1908, positionOffsets: [152, 160], matrixOffset: 332,
        matrixRowStride: 44, rowIndexBase: '0x80124a14', ticksAddress: '0x8013b448' },
      native: 'xz contains two unsigned coordinate bit-patterns per entity; matrix has 11 columns; count, current row and ticks are explicit arguments. Return is the next row. Validation rejects count outside 1..11, row outside 0..count or ticks outside 0..65535 before writes.',
    },
  },
  {
    id: 'planar-distance-arithmetic-block', address: 0x800618f4, size: 76,
    sha256: '6b760a5fc78b1f622cd50c8e1b7383f05f7484a51c4affc615b45e05229f5662',
    kind: 'basic-block-with-branches', nativeExport: 'fifa98_planar_distance',
    semantics: 'For ordinary coordinates: max(abs(dx),abs(dz)) plus ceil(min(abs(dx),abs(dz))/2). The native helper additionally preserves wrapped subtraction/absolute-value and signed-shift behavior for every 32-bit bit pattern.',
    abi: { native: 'dx and dz replace the two already loaded/subtracted coordinate components; there is no independently callable original leaf at this block address.' },
  },
  { id: 'central-simulation-tick', address: 0x8006a3c4, size: 916,
    sha256: 'b4b22f582a29adea3b4cb3b2637d06e03b64614ba22c5157ffe7edb6bcd89e7b',
    kind: 'static-call-path-evidence', nativeExport: null },
  { id: 'simulation-scheduler', address: 0x8006b3bc, size: 296,
    sha256: '7a085d3c6f34574728d9353763945cad72bdf99ee43075a687219b0c54dcc800',
    kind: 'static-call-path-evidence', nativeExport: null },
  { id: 'backend-inner-match-loop', address: 0x800de4f4, size: 756,
    sha256: '8abd6358b9961e6aa86c7e41d9a715cc5f6a85156dc34242c3569923150f8ac5',
    kind: 'static-call-path-evidence', nativeExport: null },
];

const ballRegions = [
  { id: 'ball-position-advance-block', address: 0x8007abe0, size: 80,
    sha256: '0287d3087f629f0cbc7238433b0b02f3f745a97fd4fb3210da23f1091006958b',
    kind: 'guarded-composition-of-basic-blocks', nativeExport: 'fifa98_ball_free_tick',
    semantics: 'Copy previous XYZ, then add velocity XYZ with original 32-bit word arithmetic. Native composition stops before ground contact or signed-position overflow instead of replacing collision code.',
    abi: { original: { positionOffset: 5832, velocityOffset: 5820, previousOffset: 5844 },
      native: 'state[0..2] position XYZ, state[3..5] velocity XYZ, state[6..8] previous XYZ, all Q16.16. Return 1 advanced, 0 requires ground contact, -1 invalid/overflow; failure writes nothing. Original intermediate collision processing is excluded.' } },
  { id: 'ball-air-drag-no-spin-path', address: 0x8007a88c, size: 428,
    sha256: '3dfb1272355092c168d871a8702ba0a26f4acd8d87611b4224b9b253abdfd68b',
    kind: 'conditional-basic-block-path', nativeExport: 'fifa98_ball_air_drag',
    semantics: 'Only the *spin==0 branch: subtract rounded Q16.16 fixedMultiply(203,component) from each velocity, then add the original multiply-high/shift gravity expression to Y. Spin, random curve and contact paths are not included.',
    abi: { original: { velocityPointerArgument: 'a0', spinPointerArgument: 'a1', gravityAddress: '0x80125d18' },
      native: 'velocity is a native array of three word bit-patterns and gravity is explicit. The omitted original spin value must be zero.' } },
  { id: 'ball-trajectory-predictor', address: 0x8007ab2c, size: 3172,
    sha256: '81c4517f27c170df131551f18ca11a7f039eb46951d1cde667461bb7d7bbcf7e',
    kind: 'static-call-path-evidence', nativeExport: null },
  { id: 'ball-isolated-ground-contact-physics', address: 0x80079e98, size: 260,
    sha256: '3b866606571b7ea87a78d70b6a2f69ad6103a1c2e7e5b705196f54b5cba69bbe',
    kind: 'physics-subset-of-conditional-path', nativeExport: 'fifa98_ball_ground_contact',
    semantics: 'Only the signed Y<0 guard, Y=0 clamp and bounce arithmetic: negate rounded vertical restitution product, apply horizontal retention to X/Z, then stop vertical motion at signed velocity<=0xbfff. Containing branch flags, contact records and callback are omitted; this is not the complete contact processor.',
    abi: { original: { positionYOffset: 5836, velocityOffset: 5820, materialBase: '0x8013c680', verticalRestitutionOffset: 6248, horizontalRetentionOffset: 6252 },
      native: 'Same nine-word position/velocity/previous ABI as free flight; material[0..2] is vertical restitution, horizontal retention, rolling retention. Return 1 for ground branch, 0 for nonnegative Y, -1 for null storage. Position X/Z and previous XYZ remain unchanged.' } },
  { id: 'ball-ground-rolling-drag', address: 0x8007aa38, size: 244,
    sha256: '6163d2ecfd97df4baecd7de50121554be8d3d61c1892f8d9748cea93b90c093b',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_ball_ground_drag',
    semantics: 'Round fixed-multiply X/Z by rolling retention. If each wrapped signed absolute value is<6553 and their wrapped squared sum is signed<=0x028f3d70, zero both horizontal components. Y is unchanged.',
    abi: { original: { velocityPointerArgument: 'a0', rollingRetentionArgument: 'a1' }, native: 'velocity[3] and explicit unsigned retention retain original word bit patterns, including signed absolute-value and squared-sum overflow boundaries.' } },
  { id: 'ball-material-table-selection', address: 0x80074440, size: 256,
    sha256: '0232bb400ee181c9c31b7f4a9ee9354a020da3df5c17e161fa540ed454819d6a',
    kind: 'data-selection-subset-of-routine', nativeExport: 'fifa98_ball_surface_material',
    semantics: 'Read each original 2x5 coefficient table at index settings[0x80054448]*5+settings[0x80054444]. Only data selection is adapted; initializer calls at0x80074520/0x80074528 are excluded. Friendly setting names are unresolved.',
    abi: { native: 'Explicit row0..1 and column0..4; out[3] receives vertical restitution, horizontal retention, rolling retention. Invalid bounds/null returns0 without writes, success returns1.' } },
];

const materialTableDescriptors = [
  { name: 'verticalRestitution', address: 0x80125d1c, values: [0x9eb8,0x9eb8,0x9eb8,0x9eb8,0x9eb8,0x9999,0xa666,0x8000,0x4000,0x8ccc] },
  { name: 'horizontalRetention', address: 0x80125d44, values: [0xbae1,0xbae1,0xbae1,0xbae1,0xbae1,0xb851,0xb851,0xb333,0xe666,0xc000] },
  { name: 'rollingRetention', address: 0x80125d6c, values: [0xfd70,0xfd70,0xfd70,0xfd70,0xfd70,0xfae1,0xfd70,0xf5c2,0xf333,0xf851] },
];

/** Generic fingerprint verifier; it decodes instruction fields but executes none. */
export function inspectRecoveredRegion(input, { base, address, size, sha256 } = {}) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Recovery input must be a Uint8Array');
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(address) || !Number.isSafeInteger(size)
    || base < 0 || address < base || address % 4 || size <= 0 || size % 4
    || address - base > input.length - size) throw new Error('Recovered region is outside the image or unaligned');
  const fileOffset = address - base;
  const bytes = input.subarray(fileOffset, fileOffset + size);
  const actualHash = digest(bytes);
  if (actualHash !== sha256) throw new Error('Recovered region fingerprint does not match the reviewed bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const disassembly = [];
  for (let index = 0; index < size; index += 4) {
    const item = decodeInstruction(view.getUint32(index, true), address + index);
    if (!item.known) throw new Error(`Unknown instruction in reviewed region at ${hex(address + index)}`);
    disassembly.push({ address: hex(item.address), word: hex(item.word), instruction: `${item.mnemonic}${item.operands ? ` ${item.operands}` : ''}` });
  }
  return { address: hex(address), fileOffset, size, sha256: actualHash, disassembly };
}

/** Exact-image-gated recovery evidence. This is neither execution nor emulation. */
export function inspectMatchRecovery(backend, boot) {
  if (!(backend instanceof Uint8Array)) throw new TypeError('Backend must be a Uint8Array');
  if (boot !== undefined && !(boot instanceof Uint8Array)) throw new TypeError('Resident executable must be a Uint8Array');
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) };
  if (backend.length !== BACKEND_SIZE || source.sha256 !== BACKEND_HASH) {
    return { version: 1, status: 'unsupported', reason: 'unknown-backend-image', source, routines: [], callPath: [] };
  }
  const resident = boot === undefined ? { status: 'not-supplied' }
    : { image: 'SLES_009.14', size: boot.length, sha256: digest(boot) };
  if (boot !== undefined && (boot.length !== BOOT_SIZE || resident.sha256 !== BOOT_HASH)) {
    return { version: 1, status: 'unsupported', reason: 'unknown-resident-image', source, resident, routines: [], callPath: [] };
  }
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength);
  const calls = [
    [0x800de29c, 0x800de4f4], [0x800de518, 0x8006a168], [0x800de680, 0x800deab4],
    [0x800deae0, 0x8006a168], [0x8006a3a0, 0x8006b3bc],
    [0x8006b4a8, 0x8006a3c4], [0x8006b4c8, 0x8006a3c4],
    [0x8006a3d8, 0x8006a120], [0x8006a560, 0x80061818], [0x8006a568, 0x80061818],
    ...(boot === undefined ? [] : [
      [0x8006a548, 0x8007baa8], [0x8007bbb8, 0x8007ab2c],
      [0x8007b544, 0x8007a88c], [0x8007a8a8, 0x800271a8],
      [0x8007a8c0, 0x800271a8], [0x8007a8d8, 0x800271a8],
      [0x8007ac7c, 0x80079c90], [0x80079f4c, 0x800271a8],
      [0x80079f64, 0x800271a8], [0x80079f78, 0x800271a8],
      [0x8007b5ac, 0x8007aa38], [0x8007aa50, 0x800271a8], [0x8007aa60, 0x800271a8],
    ]),
  ].map(([at, target]) => {
    const instruction = decodeInstruction(view.getUint32(at - BACKEND_BASE, true), at);
    if (instruction.flow.kind !== 'call' || instruction.flow.target !== target) throw new Error('Reviewed simulation call path differs from its image');
    const slot = decodeInstruction(view.getUint32(at - BACKEND_BASE + 4, true), at + 4);
    return { at: hex(at), target: hex(target), word: hex(instruction.word), delaySlot: { word: hex(slot.word), instruction: `${slot.mnemonic} ${slot.operands}`.trim() } };
  });
  const recovered = regions.map((region) => ({ ...region, ...inspectRecoveredRegion(backend, { base: BACKEND_BASE, ...region }) }));
  let gravity = null;
  let materialTables = [];
  if (boot !== undefined) {
    recovered.push(...ballRegions.map((region) => ({ ...region, ...inspectRecoveredRegion(backend, { base: BACKEND_BASE, ...region }) })));
    const descriptor = { address: 0x800271a8, size: 44, sha256: 'ad65ab41fa9e936405c7aea1053066ce2e290f8f9d683dcf7c17349ac299c680' };
    recovered.push({ id: 'resident-rounded-fixed-multiply', image: 'SLES_009.14', kind: 'complete-leaf-routine', nativeExport: 'fifa98_fixed_multiply',
      semantics: 'Multiply signed 32-bit arguments; add 0x8000 to the 64-bit product; return product bits 16..47 with wrap. Half-way products round toward positive infinity.',
      ...inspectRecoveredRegion(boot, { base: BOOT_FILE_BASE, ...descriptor }) });
    const value = view.getInt32(0x80125d18 - BACKEND_BASE, true);
    if (value !== -33554432) throw new Error('Reviewed gravity constant differs from the image');
    gravity = { address: '0x80125d18', fileOffset: 0x80125d18 - BACKEND_BASE, word: '0xfe000000',
      signedValue: value, accelerationPerPredictionStep: -9320,
      semantics: 'Original constant; original multiply-high/shift arithmetic equals signed truncation of value/3600. A prediction step is not assigned an invented browser wall-clock frequency.' };
    materialTables = materialTableDescriptors.map(({ name, address, values }) => {
      const offset = address - BACKEND_BASE;
      const actual = values.map((_, index) => view.getUint32(offset + index * 4, true));
      if (actual.some((value, index) => value !== values[index])) throw new Error('Reviewed ball material table differs from the image');
      return { name, address: hex(address), fileOffset: offset, rows: 2, columns: 5, values: actual,
        sha256: digest(backend.subarray(offset, offset + 40)) };
    });
  }
  return {
    version: 3, status: 'reconstruction-only', profile: 'SLES_009.14-simulation-support-v3', source, resident, gravity, materialTables,
    nativeSource: 'native/match.c', nativeExports: matchNativeExports,
    routines: recovered,
    callPath: calls,
    limitations: [
      'These recovered support routines do not run a complete football match or establish a working simulation scheduler.',
      'The distance field is an original approximate planar metric; it is deliberately not replaced with Euclidean distance.',
      'Recovered ball paths cover spin-free air drag, isolated-ground bounce arithmetic and rolling drag. Contact bookkeeping, other collisions, spin, special predictor states, steering, scoring, laws, animation callbacks and match initialization remain unresolved.',
      'fifa98_ball_surface_tick is a new guarded composition requiring zero spin, a neutral predictor state and no intervening contact except the isolated floor. It is not the original full predictor or complete contact processor.',
      ...(boot === undefined ? ['Resident executable was not supplied; fixed-multiply and coupled ball-flight evidence are not claimed in this report.'] : []),
      'C arguments replace original global/structure addresses; there is no virtual console memory, CPU interpreter or translated dispatcher.',
      'Static calls establish potential reachability, not runtime call counts, timing or coverage.',
    ],
  };
}

const help = `FIFA 98 original simulation support recovery (static inspection only)

  node games/fifa98/scripts/match-recovery.mjs [--directory DISC_DIRECTORY]

Default directory: games/fifa98/.work/reference/disc
Prints reviewed region hashes, disassembly, native ABI mapping and call evidence
as JSON to stdout. Reads BECODE.BIN without executing or changing it.
`;

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    directory: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { process.stdout.write(help); return; }
  if (positionals.length) throw new Error(help);
  const directory = values.directory ?? fileURLToPath(new URL('../.work/reference/disc/', import.meta.url));
  const [backend, boot] = await Promise.all(['BECODE.BIN', 'SLES_009.14'].map((name) => readFile(path.join(directory, name))));
  const report = inspectMatchRecovery(backend, boot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`FIFA 98 match recovery: ${error.message}\n`); process.exitCode = 1; });
}
