import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeInstruction } from './code-map.mjs';
import { inspectRecoveredRegion } from './match-recovery.mjs';

const BACKEND_BASE = 0x8005ae28;
const BOOT_FILE_BASE = 0x80011000;
const profiles = {
  backend: { image: 'BECODE.BIN', size: 939136, sha256: '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0' },
  boot: { image: 'SLES_009.14', size: 251904, sha256: 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644' },
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;

export const playerNativeExports = Object.freeze([
  'fifa98_player_heading_vector', 'fifa98_player_digital_direction',
  'fifa98_player_motion_profile', 'fifa98_player_target_speed',
  'fifa98_player_motion_integrate',
]);

const regions = [
  { id: 'resident-heading-vector', image: 'boot', address: 0x80021550, size: 316,
    sha256: 'b16ecd98fb31460184fc1cf0ad5b0e7009339787facf85965f524be7d7ea6b19',
    kind: 'complete-leaf-routine', nativeExport: 'fifa98_player_heading_vector' },
  { id: 'digital-controller-direction', image: 'backend', address: 0x8009eda0, size: 56,
    sha256: 'c4c17b04dfe2672fd1f2a9e14c8e5918aa88d37b1ccebce912d03e22e2f3b4be',
    kind: 'complete-leaf-routine', nativeExport: 'fifa98_player_digital_direction' },
  { id: 'player-horizontal-motion-containing-routine', image: 'backend', address: 0x8008d2dc, size: 1444,
    sha256: '42e304cfe03236a1dc8ce8f94fe6591279b10cd77a3c1e80f9dbb5345a5e431d',
    kind: 'containing-routine-evidence', nativeExport: null },
  { id: 'player-horizontal-integration-subset', image: 'backend', address: 0x8008d564, size: 604,
    sha256: '5b2342547dbc6ec6e39661bacd1a30166a9d2548274db95aaea86b0ab4e685e2',
    kind: 'arithmetic-subset-of-routine', nativeExport: 'fifa98_player_motion_integrate' },
  { id: 'player-profile-initializer-subset', image: 'backend', address: 0x800a5288, size: 276,
    sha256: '5e355f79456a93af90bc589f8f65628e4b87e78919d5e89243fbf6ae8c0ca99f',
    kind: 'data-selection-subset-of-routine', nativeExport: 'fifa98_player_motion_profile' },
  { id: 'player-base-speed-selector', image: 'backend', address: 0x800b8f74, size: 52,
    sha256: '041310886474923a0fc7b367a0d6ee158c9b507daf5501727cbbd3b89f7dc6c2',
    kind: 'supporting-source-evidence', nativeExport: null },
  { id: 'player-controller-target-speed', image: 'backend', address: 0x800a5628, size: 252,
    sha256: '26e2e6a981188f6bdfd5960a710a9d855f74c567da55c716cb66266c22e10244',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_player_target_speed' },
  { id: 'position-heading-ray-advance', image: 'backend', address: 0x8008aef0, size: 128,
    sha256: 'ba787c45d62d46f8c57c8cff7be32845ea721ad818a75c2be4a6526d5b713a8a',
    kind: 'inlined-support-routine', nativeExport: 'fifa98_player_motion_integrate' },
  { id: 'speed-heading-component-store', image: 'backend', address: 0x8008b050, size: 116,
    sha256: '2635119f44f4f0f182d77243c56ef4d01e0ccfd567cbf92b63753685d192052b',
    kind: 'inlined-support-routine', nativeExport: 'fifa98_player_motion_integrate' },
  { id: 'player-motion-caller', image: 'backend', address: 0x8008dc80, size: 844,
    sha256: 'bc0a9f554d15c94bd063525d783f13ac69957db03ea2d9d5202da36ffc21149f',
    kind: 'static-call-path-evidence', nativeExport: null },
];

const tables = [
  { id: 'quarterSine', image: 'boot', address: 0x8004904c, count: 257, element: 'u32',
    sha256: 'c3b03a2581960f9b22f2f29fb52f30bf36eb87c3896c8e4f62c708b3c247f880' },
  { id: 'acceleration', image: 'backend', address: 0x80128f44, count: 20, element: 'u32',
    sha256: '888f97f629ce3a63dc1fef985fd271dbef3a472aa28af17e771a943451dc3966' },
  { id: 'speedAddend', image: 'backend', address: 0x80129084, count: 20, element: 'u32',
    sha256: '01978b2f7520510f95d3a634af1b93f06e83489a71a6c37406e20a617284750b' },
  { id: 'normalBaseSpeed', image: 'backend', address: 0x80129034, count: 20, element: 'u32',
    sha256: '1720e5f1aef6621ac20ba38d7ed4fcc16d5e417fa7f2d0206a59c0c5b3f4e379' },
  { id: 'alternateBaseSpeed', image: 'backend', address: 0x80129354, count: 20, element: 'u32',
    sha256: '18e4efbe208dd02c805a9eb8b6566de917063b6294945cefc6dff29414f5c4af' },
  { id: 'digitalDirectionIndices', image: 'backend', address: 0x80127fb8, count: 16, element: 'u8',
    sha256: 'da136bc422201687aeab8203c2da3295c13a330393a3d0e84bc5e0aac9021dc8' },
  { id: 'digitalDirectionX', image: 'backend', address: 0x80127fc8, count: 9, element: 'i8',
    sha256: 'b5009514e9be8d3d857a0991a3b0f54252d6f33c73371f6215a80d20ee1a9b74' },
  { id: 'digitalDirectionZ', image: 'backend', address: 0x80127fd4, count: 9, element: 'i8',
    sha256: 'c9bdc060066914305a4ed187bd6a8dbb73c0fe33e5142b3776265df35435cf3f' },
];

/** Read validated source data; this never executes original instructions. */
export function inspectPlayerTable(input, { base, address, count, element, sha256 } = {}) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Player table input must be a Uint8Array');
  const width = element === 'u32' ? 4 : ['u8', 'i8'].includes(element) ? 1 : 0;
  if (!width || !Number.isSafeInteger(count) || count < 1 || count > 65536
    || !Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(address)
    || address < base || address % width || address - base > input.length - count * width) {
    throw new Error('Invalid player table format or range');
  }
  const fileOffset = address - base, size = count * width;
  const bytes = input.subarray(fileOffset, fileOffset + size);
  if (digest(bytes) !== sha256) throw new Error('Player table fingerprint does not match reviewed bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = Array.from({ length: count }, (_, index) => element === 'u32'
    ? view.getUint32(index * 4, true) : element === 'i8' ? view.getInt8(index) : view.getUint8(index));
  return { address: hex(address), fileOffset, count, size, element, sha256, values };
}

/** Exact-image-gated controller/profile/horizontal-motion recovery evidence. */
export function inspectPlayerRecovery(backend, boot) {
  if (!(backend instanceof Uint8Array) || !(boot instanceof Uint8Array)) throw new TypeError('Player recovery requires Uint8Array backend and resident images');
  const images = { backend, boot };
  const sources = Object.entries(profiles).map(([id, expected]) => ({ id, image: expected.image, size: images[id].length, sha256: digest(images[id]) }));
  if (sources.some((source) => source.size !== profiles[source.id].size || source.sha256 !== profiles[source.id].sha256)) {
    return { version: 1, status: 'unsupported', reason: 'unknown-player-recovery-images', sources, routines: [], tables: [], callPath: [] };
  }
  const recovered = regions.map((region) => ({ ...region, ...inspectRecoveredRegion(images[region.image], {
    base: region.image === 'boot' ? BOOT_FILE_BASE : BACKEND_BASE, ...region,
  }) }));
  const data = Object.fromEntries(tables.map((table) => [table.id, { ...table,
    ...inspectPlayerTable(images[table.image], { base: table.image === 'boot' ? BOOT_FILE_BASE : BACKEND_BASE, ...table }),
  }]));
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength);
  const callPath = [
    [0x8006a538, 0x8009f1c0], [0x8009f224, 0x8009edf8], [0x8009f0b8, 0x8009eda0],
    [0x8006a5c4, 0x80061368], [0x800617dc, 0x800a6f60], [0x800617cc, 0x8008787c],
    [0x800a729c, 0x800a5b18], [0x80087a38, 0x800a5b18], [0x800a5d28, 0x800a5628],
    [0x800a6060, 0x8008dc80], [0x8008dd0c, 0x8008d2dc],
    [0x8008d5b4, 0x800271a8], [0x8008d788, 0x8008aef0], [0x8008d7b8, 0x8008b050],
    [0x8008af18, 0x80021550], [0x8008b078, 0x80021550],
    [0x800a5348, 0x80124640], [0x800a5380, 0x80124640],
  ].map(([at, target]) => {
    const instruction = decodeInstruction(view.getUint32(at - BACKEND_BASE, true), at);
    if (instruction.flow.kind !== 'call' || instruction.flow.target !== target) throw new Error('Reviewed player call path differs from the image');
    return { at: hex(at), target: hex(target), word: hex(instruction.word) };
  });
  const roundedReciprocal = (value) => {
    const magnitude = BigInt(value), quotient = 0xffffffffn / magnitude;
    return Number(quotient + (0xffffffffn % magnitude > magnitude / 2n ? 1n : 0n));
  };
  const rate = data.acceleration.values[10], alternateRate = data.speedAddend.values[10] >> 1;
  return {
    version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-player-motion-v1', sources,
    nativeSource: 'native/player.c', nativeExports: playerNativeExports, routines: recovered, tables: data, callPath,
    abi: {
      motionState: ['fixedX', 'fixedZ', 'currentSpeed', 'velocityX', 'velocityZ', 'heading'],
      motionParams: ['postClampTargetSpeed', 'selectedAcceleration', 'deceleration', 'inverseSelectedAcceleration', 'inverseDeceleration', 'ticks', 'heading'],
      profileOutput: ['normalMaximum', 'alternateMaximum', 'normalAcceleration', 'alternateAcceleration', 'deceleration', 'inverseNormalAcceleration', 'inverseAlternateAcceleration', 'inverseDeceleration'],
      originalMotionOffsetInEntity: 124,
      originalMotionFields: { fixedXZ: [4, 12], integerXYZ: [28, 32, 36], fractionXYZ: [40, 44, 48],
        heading: 136, speed: 160, velocityXZ: [164, 168], desiredSpeed: 176,
        normalMaximum: 184, alternateMaximum: 180, deceleration: 192, normalAcceleration: 196,
        alternateAcceleration: 200, inverseNormalAcceleration: 204, inverseAlternateAcceleration: 208, inverseDeceleration: 212 },
      tickSource: { address: '0x8013b448', origin: 'central-simulation fractional carry', selectionAt: '0x800a605c', timeConversion: 'ticks shifted left16 at0x8008d338; no wall-clock rate is inferred' },
    },
    sourceInputExample: {
      label: 'Synthetic attribute-index fixture using original profile coefficients; not a named player or active match setting',
      attributeByte48: 10, attributeByte58: 10, attributeFlagsWord64: 0, alternateBaseBranch: false,
      profile: [data.normalBaseSpeed.values[10], data.normalBaseSpeed.values[10] + data.speedAddend.values[10], rate,
        alternateRate, rate, roundedReciprocal(rate), roundedReciprocal(alternateRate), roundedReciprocal(rate)],
    },
    limitations: [
      'The horizontal integrator is an exact arithmetic subset after original desired-speed clamps and steering; the complete player motion routine is not ported.',
      'Digital direction mapping and target-speed selection do not establish the full direction-to-heading, neutral-stop, animation, contact or player-selection path. Do not wire these as complete match controls.',
      'Original table indices are raw attribute byte offsets48/58; mapping them to named roster statistics or active player records remains unverified.',
      'Original profile selector0x800a86bc is supplied as an explicit branch argument, not replaced by a guessed goalkeeper/control rule.',
      'Animated Y, model side effects, contacts, flags/range clamps, steering, AI, actions and match initialization remain unresolved.',
      'Arguments/data replace original pointers and globals; native C uses no virtual console memory, interpreter, CPU dispatcher or PS1 runtime.',
    ],
  };
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, boot: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node games/fifa98/scripts/player-recovery.mjs [--backend BECODE.BIN] [--boot SLES_009.14]\nRead-only static evidence and verified source tables; no original code is executed.'); return; }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [backend, boot] = await Promise.all([
    readFile(values.backend ?? path.join(root, '.work/reference/disc/BECODE.BIN')),
    readFile(values.boot ?? path.join(root, '.work/reference/disc/SLES_009.14')),
  ]);
  console.log(JSON.stringify(inspectPlayerRecovery(backend, boot), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
