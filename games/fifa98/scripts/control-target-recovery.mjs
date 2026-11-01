import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeInstruction } from './code-map.mjs';
import { inspectRecoveredRegion } from './match-recovery.mjs';
import { inspectPlayerTable } from './player-recovery.mjs';

const BACKEND_BASE = 0x8005ae28, BOOT_BASE = 0x80011000;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
const profiles = {
  backend: { image: 'BECODE.BIN', size: 939136, sha256: '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0' },
  boot: { image: 'SLES_009.14', size: 251904, sha256: 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644' },
};

export const controlTargetNativeExports = Object.freeze([
  'fifa98_control_heading', 'fifa98_control_decay', 'fifa98_control_pitch_bound',
  'fifa98_control_target', 'fifa98_control_target_delta',
  'fifa98_control_workspace', 'fifa98_control_workspace_words',
]);

const regions = [
  { id: 'resident-fixed-ratio-heading', image: 'boot', address: 0x80026fd0, size: 304,
    sha256: '26550e479e15aa55b56c8618fb87ce9b1ec4c52a2ce6c800cf41e34b46ea6dc7',
    kind: 'complete-routine-with-bounded-input-domain', nativeExport: 'fifa98_control_heading',
    semantics: 'Original signed quadrant folding and fixed-ratio rounding into the original byte lookup; equal magnitudes, including zero/zero, produce base angle128. Native rejects null/INT_MIN magnitudes before table access.' },
  { id: 'resident-wide-numerator-helper', image: 'boot', address: 0x800211b8, size: 88,
    sha256: 'ae6b0afb579a2e31a7b994baa8cf32a8d2fe41ae3dabb231051c10bc9c779989',
    kind: 'inlined-support-routine-evidence', nativeExport: null,
    semantics: 'Heading caller passes shift32, forming unsigned x<<32. Other helper shift inputs are outside this recovery.' },
  { id: 'resident-wide-divide-helper', image: 'boot', address: 0x80021248, size: 64,
    sha256: '1d61b42252bde2ba721d92d602fb94e5dd0344b9b9f9f2053cbab05574af76e2',
    kind: 'inlined-support-routine-evidence', nativeExport: null,
    semantics: 'Within heading folded domain0<=x<z<=INT_MAX, this helper returns floor((uint64(x)<<32)/z); native uses direct unsigned integer division rather than an instruction/bit-step runtime.' },
  { id: 'controller-target-constructor', image: 'backend', address: 0x800a598c, size: 396,
    sha256: '78c4e0cd0b3c95f8f3faa97dbe6a04b057dac1b9f38e53d80992a71aee4870d6',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_control_target',
    semantics: 'Analog mode exactly1 uses signed angle16 and original rounded trig products with192; other modes use digital sign offsets or neutral32*ticks decay. Add offsets to integer player X/Z, set Y0, then select original pitch-bound helper.' },
  { id: 'scalar-input-neutral-decay', image: 'backend', address: 0x800a4ff0, size: 104,
    sha256: 'd3358a760436c1e2f1cdb02a7585b2adf4c33b028681ff267e5ddc3b33a601cb',
    kind: 'complete-leaf-routine', nativeExport: 'fifa98_control_decay',
    semantics: 'Same-sign nonzero input adds to previous; opposite-sign input replaces; zero input decays previous toward zero. All word wraps and signed branch comparisons are retained.' },
  { id: 'basic-pitch-target-bounds', image: 'backend', address: 0x800b679c, size: 104,
    sha256: '1d20a4b9bd127a2b9435437231f59509fdf049b362d45ecd90b0b6aea60f76ce',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_control_pitch_bound',
    semantics: 'Signed clamp of integer X/Z against original positive/negative bounds; Y is untouched.' },
  { id: 'alternate-pitch-target-bounds', image: 'backend', address: 0x800b6804, size: 172,
    sha256: '738924198107cad169db63fbf1339d042412fbfbcb2433e082e86f591bcce0ec',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_control_pitch_bound',
    semantics: 'Only if wrapped signed abs(X)>innerX-16, clamp X/Z to bounds-16. The inner strip deliberately leaves Z unbounded by this helper.' },
  { id: 'stored-target-planar-deltas', image: 'backend', address: 0x8008e040, size: 156,
    sha256: 'b299b8533126d12b017a1c993d95f1f7ff49b9a2062ecd2c734ce73ded17667d',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_control_target_delta',
    semantics: 'Store own target XYZ with Y0, select own target pointer, clear motion flag10000h, and compute wrapped X/Z deltas plus original approximate metric. Pointer becomes explicit native target fields; original distance return is exposed as state[3].' },
  { id: 'controller-limit-conversion', image: 'backend', address: 0x800b5be0, size: 284,
    sha256: 'd408a89a8872c3b1f5af00fa6db64edb0e9c33f51acdfce8a356f8395b0b75f2',
    kind: 'partial-initializer-source-evidence', nativeExport: null,
    semantics: 'Convert initialized profile dimensions to controller X/Z limits by signed division by2; innerX derives from another half-dimension. Profile dimensions must not be passed as controller limits without this conversion.' },
  { id: 'pitch-dimension-selector', image: 'backend', address: 0x800b595c, size: 644,
    sha256: '2a0faa7de533b3e5fef844498c164a0d411ccb8f6aaae0cf5178262d2be173d1',
    kind: 'partial-initializer-source-evidence', nativeExport: null },
  { id: 'state700-controller-target-caller', image: 'backend', address: 0x80070768, size: 344,
    sha256: '821fdede0f7753d2e7b35cc66757edd56ba7fb42bfcff74eaf8ceca153819e43',
    kind: 'static-call-path-evidence', nativeExport: null },
  { id: 'existing-original-quarter-sine-lookup', image: 'boot', address: 0x80021550, size: 316,
    sha256: 'b16ecd98fb31460184fc1cf0ad5b0e7009339787facf85965f524be7d7ea6b19',
    kind: 'existing-native-dependency', nativeExport: 'fifa98_player_heading_vector' },
  { id: 'existing-original-fixed-multiply', image: 'boot', address: 0x800271a8, size: 44,
    sha256: 'ad65ab41fa9e936405c7aea1053066ce2e290f8f9d683dcf7c17349ac299c680',
    kind: 'existing-native-dependency', nativeExport: 'fifa98_fixed_multiply' },
  { id: 'existing-original-planar-metric', image: 'backend', address: 0x800618f4, size: 76,
    sha256: '6b760a5fc78b1f622cd50c8e1b7383f05f7484a51c4affc615b45e05229f5662',
    kind: 'existing-native-dependency', nativeExport: 'fifa98_planar_distance' },
];

/** Read-only exact-image evidence; does not run original instructions. */
export function inspectControlTargetRecovery(backend, boot) {
  if (!(backend instanceof Uint8Array) || !(boot instanceof Uint8Array)) throw new TypeError('Control-target recovery requires Uint8Array backend and resident images');
  const images = { backend, boot };
  const sources = Object.entries(profiles).map(([id, expected]) => ({ id, image: expected.image, size: images[id].length, sha256: digest(images[id]) }));
  if (sources.some((source) => source.size !== profiles[source.id].size || source.sha256 !== profiles[source.id].sha256)) {
    return { version: 1, status: 'unsupported', reason: 'unknown-control-target-images', sources, nativeExports: [], routines: [], tables: {}, boundsProfiles: [], callPath: [] };
  }
  const recovered = regions.map((region) => ({ ...region, ...inspectRecoveredRegion(images[region.image], {
    base: region.image === 'boot' ? BOOT_BASE : BACKEND_BASE, ...region,
  }) }));
  const tables = {
    quarterAtan: inspectPlayerTable(boot, { base: BOOT_BASE, address: 0x80048e30, count: 257, element: 'u8',
      sha256: '03ab75ced39a3c62580ab3e24c4e54867b63bbdd1135da55cdf6bd678f74f221' }),
    quarterSine: inspectPlayerTable(boot, { base: BOOT_BASE, address: 0x8004904c, count: 257, element: 'u32',
      sha256: 'c3b03a2581960f9b22f2f29fb52f30bf36eb87c3896c8e4f62c708b3c247f880' }),
  };
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength);
  const constant = (address, expected) => {
    const instruction = decodeInstruction(view.getUint32(address - BACKEND_BASE, true), address);
    if (instruction.mnemonic !== 'addiu' || instruction.rs !== 0 || instruction.rt !== 2 || instruction.signed !== expected) throw new Error('Reviewed control-bound constant differs from the image');
    return { value: expected, at: hex(address), word: hex(instruction.word) };
  };
  const rawProfiles = [
    [0x800b5a84, 4080, 0x800b5a94, 5664], [0x800b5aa0, 3840, 0x800b5ab0, 5376],
    [0x800b5ad0, 3648, 0x800b5adc, 5088], [0x800b5abc, 3600, 0x800b5acc, 4800],
    [0x800b59b0, 2160, 0x800b59bc, 2784],
  ];
  const boundsProfiles = rawProfiles.map(([atX, x, atZ, z], profile) => ({ profile,
    bounds: [x / 2, z / 2, profile === 4 ? 152 : 228], alternateBounds: profile === 4,
    sourceDimensions: [constant(atX, x), constant(atZ, z)],
    sourceInnerDimension: constant(profile === 4 ? 0x800b59f0 : 0x800b5b38, profile === 4 ? 304 : 456),
    semantics: 'Controller limits are half of these source dimensions, as verified in controller-limit-conversion; mode5 can retain state and is not supplied by this stateless report.' }));
  const callSites = [
    [0x800707c0, 0x800a598c], [0x800707cc, 0x8008e040],
    [0x800a59e8, 0x80021550], [0x800a59f4, 0x800271a8], [0x800a5a04, 0x800271a8],
    [0x800a5a84, 0x800a4ff0], [0x800a5a98, 0x800a4ff0],
    [0x800a5ae0, 0x800b679c], [0x800a5af0, 0x800b6804],
  ];
  const callPath = callSites.map(([at, target]) => {
    const instruction = decodeInstruction(view.getUint32(at - BACKEND_BASE, true), at);
    if (instruction.flow.kind !== 'call' || instruction.flow.target !== target) throw new Error('Reviewed controller call differs from the image');
    return { at: hex(at), target: hex(target), word: hex(instruction.word) };
  });
  return {
    version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-control-target-v1', sources,
    nativeSource: 'native/control-target.c', nativeExports: controlTargetNativeExports, routines: recovered, tables, boundsProfiles, callPath,
    abi: {
      workspaceWords: 2048,
      heading: { inputs: ['dxWord', 'dzWord', 'quarterAtanBytePointer'], return: 'signed original angle or INT32_MIN for null/INT_MIN magnitudes; period1024, X=sin,Z=cos; zero/zero128 retained' },
      offsets: ['previousX', 'previousZ'], control: ['analogMode', 'magnitude', 'signedAngle16', 'digitalX', 'digitalZ', 'ticks', 'alternateBounds'],
      bounds: ['xLimit', 'zLimit', 'alternateInnerX'], target: ['integerX', 'zeroY', 'integerZ'],
      deltaState: ['storedTargetX', 'storedTargetY', 'storedTargetZ', 'distance', 'deltaX', 'deltaZ', 'motionFlags'],
      originalFields: { motionSubobjectOffsetInEntity: 124, entityTargetOffsets: [52, 60],
        controllerFields: { analogMode: 52, magnitude: 44, angle16: 48, digitalXZ: [20, 24] },
        integerPositionOffsetsInMotion: [28, 32, 36], motionFlags: 92, targetStorage: [52, 56, 60], targetDistance: 96, targetDeltaXZ: [100, 104],
        ticksAddress: '0x8013b448', boundaryModeAddress: '0x8013fe2c',
        boundAddresses: ['0x8013fd7c', '0x8013fd80', '0x8013fd90'] },
    },
    limitations: [
      'These helpers construct original control targets and headings; they do not implement complete steering, animation/action selection, player contacts, AI, laws, scoring, the match scheduler or match initialization.',
      'Controller present/entity valid preconditions become valid native arrays; original callback pointers and self-target pointer fields are not virtualized.',
      'The heading helper rejects INT_MIN magnitude inputs; original wrapped signed abs can escape its reviewed lookup domain for those values. No approximate angle is substituted.',
      'Profile5 retained-state behavior is not inferred. The supplied boundsProfiles0..4 are explicit source selections with their original dimension conversion.',
      'Tables are verified and extracted from original resident bytes, not replaced by host floating-point atan/sin or embedded in native source.',
      'Native return1/0 guards and workspace storage are ABI adaptations; original numerical side effects remain as documented.',
    ],
  };
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, boot: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node games/fifa98/scripts/control-target-recovery.mjs [--backend BECODE.BIN] [--boot SLES_009.14]\nRead-only source evidence, controller bounds and original heading tables.'); return; }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [backend, boot] = await Promise.all([readFile(values.backend ?? path.join(root, '.work/reference/disc/BECODE.BIN')),
    readFile(values.boot ?? path.join(root, '.work/reference/disc/SLES_009.14'))]);
  console.log(JSON.stringify(inspectControlTargetRecovery(backend, boot), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
