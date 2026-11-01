import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeInstruction } from './code-map.mjs';
import { inspectRecoveredRegion } from './match-recovery.mjs';
import { inspectPlayerTable } from './player-recovery.mjs';

const BASE = { backend: 0x8005ae28, boot: 0x80011000 };
const profiles = {
  backend: { image: 'BECODE.BIN', size: 939136, sha256: '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0' },
  boot: { image: 'SLES_009.14', size: 251904, sha256: 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644' },
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;

export const ballInteractionNativeExports = Object.freeze([
  'fifa98_ball_heading16', 'fifa98_ball_heading_vector16',
  'fifa98_ball_ground_launch_speed', 'fifa98_ball_ground_launch',
  'fifa98_ball_action_target',
]);

const regions = [
  { id: 'stored-action-target', image: 'backend', address: 0x8008aef0, size: 128,
    sha256: 'ba787c45d62d46f8c57c8cff7be32845ea721ad818a75c2be4a6526d5b713a8a',
    kind: 'complete-routine-with-caller-mask', nativeExport: 'fifa98_ball_action_target',
    semantics: 'Integer position X/Z plus rounded fixed products of stored distance and original1024-angle sine/cosine. Caller masks stored distance word408 with0x7ffff and sign-extends heading halfword414. Output Y is left untouched.' },
  { id: 'stored-action-target-trig', image: 'boot', address: 0x80021550, size: 316,
    sha256: 'b16ecd98fb31460184fc1cf0ad5b0e7009339787facf85965f524be7d7ea6b19',
    kind: 'equivalent-existing-native-dependency', nativeExport: 'fifa98_player_heading_vector',
    semantics: 'Original two-output1024-angle quarter-table lookup, equivalent to recovered resident276a0/276a4 pair for all angle words.' },
  { id: 'ground-target-launch-numerics', image: 'backend', address: 0x8007cc40, size: 248,
    sha256: 'b84f61a9550a29bf566b37e555037f288ebf93ff83f486d7550c0ad63777b0a9',
    kind: 'complete-routine-with-bounded-input-domain', nativeExport: 'fifa98_ball_ground_launch',
    semantics: 'Integer horizontal source length, original parameter-to-speed formula, signed cap test, heading16 and original corrected trig products. Native specializes cap argument to wrapper25Q16; computed speeds above25 become35Q16. Vertical velocity is always0.' },
  { id: 'ground-launch-speed', image: 'backend', address: 0x8007d40c, size: 124,
    sha256: 'a232f56bcd6d5168c8367490c485dd4e09889272c7014ca9ddb753b9a0c791ee',
    kind: 'complete-routine-with-bounded-input-domain', nativeExport: 'fifa98_ball_ground_launch_speed',
    semantics: 'parameter0 selects15Q16. Positive parameter uses fixedMultiply(distanceQ16,5242), divides by65536-exp(fixedMultiply(-677890,parameterQ16)>>9), then signed-shifts quotient by2. Domain0..3167 prevents rate-product signed overflow; source positive-exponential paths are not needed.' },
  { id: 'full-resolution-heading', image: 'backend', address: 0x80124500, size: 320,
    sha256: 'b5f3110311b93fe59e8e0d7c5410c5dbd2c1c9ea81bedad96a5cdd00e3e2761d',
    kind: 'complete-routine-with-bounded-input-domain', nativeExport: 'fifa98_ball_heading16',
    semantics: 'Fold unsigned magnitudes, divide minor<<32 by major, interpolate original Q16-angle table with low-product truncation and apply the8 original quadrant cases. Equal magnitudes, including zero/zero, select8192. Native rejects INT_MIN magnitudes.' },
  { id: 'corrected-sine16', image: 'boot', address: 0x800271d4, size: 132,
    sha256: 'dfba29db09dec9404ed46d463e400d8a2ec38efbe8f07dc4cc1b46a0cdf44e5c',
    kind: 'complete-leaf-routine', nativeExport: 'fifa98_ball_heading_vector16',
    semantics: 'Source coarse sine plus signed low-word correction from coarse cosine and the low6 angle bits.' },
  { id: 'corrected-cosine16', image: 'boot', address: 0x80027258, size: 136,
    sha256: 'c6b22244091b1bc6b03c7c1a9ab1997e940a238036cb60985d6068613e72816c',
    kind: 'complete-leaf-routine', nativeExport: 'fifa98_ball_heading_vector16',
    semantics: 'Source coarse cosine plus signed low-word correction from negated coarse sine and the low6 angle bits.' },
  { id: 'integer-planar-length', image: 'boot', address: 0x8002146c, size: 228,
    sha256: '4fd5ba8b8dcdbe2910c368dbb761a0c60c177e7c5ccbc65c8c535121f7c1f83e',
    kind: 'inlined-support-routine-evidence', nativeExport: null,
    semantics: 'Use signed1024-angle heading with swapped X/Z, fold to first quadrant, choose cosine or sine denominator, divide (absolute chosen integer axis<<15) by(trigQ16>>1). This is not the steering approximate distance.' },
  { id: 'negative-exponential', image: 'backend', address: 0x8007cfc0, size: 216,
    sha256: 'b20d949f71ec3995c93aa2e76e73c470992b8e1152cbbb7e424bd4b91518eee7',
    kind: 'conditional-numeric-path', nativeExport: null,
    semantics: 'Only zero/negative inputs: zero returns1Q16, less than-681391 returns0, other negative inputs combine original radix32 lookup factors with rounded products, then original rounded reciprocal. No generic positive exponential or logarithm implementation is claimed.' },
  { id: 'positive-bounded-fixed-divide', image: 'boot', address: 0x80027100, size: 168,
    sha256: '222c6061d3c5233b248d226bc0b557409ac6911d6aee7bb023783f1fa4cc2204',
    kind: 'bounded-arithmetic-support-evidence', nativeExport: null,
    semantics: 'For the launch domain numerator>=0 and denominator1..65536, the original16 binary quotient steps equal floor((uint64(numerator)<<16)/denominator) modulo32bits. Other signed/overflow/divide-by-zero behavior is outside this inline adaptation.' },
  { id: 'resident-quarter-trig', image: 'boot', address: 0x800276a0, size: 108,
    sha256: 'dde38410a6251eda61218b54a741ba767775554f49ae4899c8fec54bf5252781',
    kind: 'existing-native-dependency', nativeExport: 'fifa98_player_heading_vector' },
  { id: 'source-rounded-reciprocal', image: 'backend', address: 0x80124640, size: 56,
    sha256: 'ed3fa46a1a62d42eec3d1dfbe6bf62c91b6b1e46e2778c8ed0b85db1f5a6bb41',
    kind: 'existing-native-dependency', nativeExport: 'fifa98_signed_reciprocal' },
  { id: 'ground-launch-containing-wrapper', image: 'backend', address: 0x80075694, size: 336,
    sha256: '03ee394f3d8d1790eed6ad2def7acf4e53a5d4b14310fe2d2f56215297dae64b',
    kind: 'static-call-path-evidence', nativeExport: null,
    semantics: 'Launch from current global ball Q16 position; convert target integer X/Z to Q16, targetY0; pass original integer parameter and cap25Q16. Ownership/event updates and predictor initialization are not implemented by the native numeric helper.' },
  { id: 'original-action-call-guard', image: 'backend', address: 0x8006bf10, size: 236,
    sha256: '77598e0b6c533f173d022f0cacba53dccc96fdbb4d6af730395b68331a974fa7',
    kind: 'static-call-path-evidence', nativeExport: null,
    semantics: 'Signed actor halfword+406 is original launch parameter. -1 takes another branch;0 calls position-set80074704 instead of launch; other values call wrapper75694 after target construction8aef0. This does not establish a named pass/shoot mapping or a default parameter.' },
  { id: 'ground-launch-reset-spin-prefix', image: 'backend', address: 0x800749a8, size: 68,
    sha256: '665b057183d82227c55c8b768b8e5e09b88cdee3e877c01dd2ca64ea1d53df38', kind: 'partial-initializer-source-evidence', nativeExport: null,
    semantics: 'The ground wrapper calls this reset before computing velocity. It constructs ball base8013c680 and stores spin0 at749e8; remaining reset/predictor state is outside the native numeric helper.' },
];

const tableDescriptors = {
  atan8: { image: 'boot', address: 0x80048e30, count: 257, element: 'u8', sha256: '03ab75ced39a3c62580ab3e24c4e54867b63bbdd1135da55cdf6bd678f74f221' },
  atan16: { image: 'backend', address: 0x80130f74, count: 257, element: 'u32', sha256: 'a3ab1c0b30ea38a25c2d7f7c7b13969a0e3448547b839c92b1ae5789c3942b64' },
  sine: { image: 'boot', address: 0x8004904c, count: 257, element: 'u32', sha256: 'c3b03a2581960f9b22f2f29fb52f30bf36eb87c3896c8e4f62c708b3c247f880' },
  exponential: { image: 'backend', address: 0x80125eb8, count: 113, element: 'u32', sha256: 'a3a10c51cad4d18da9c84cefffe9fab256083139be227bd76ea6a692be70cf8d' },
};

/** Read-only, exact-image-gated static recovery evidence and source tables. */
export function inspectBallInteractionRecovery(backend, boot) {
  if (!(backend instanceof Uint8Array) || !(boot instanceof Uint8Array)) throw new TypeError('Ball interaction recovery requires Uint8Array backend and resident images');
  const images = { backend, boot };
  const sources = Object.entries(profiles).map(([id, profile]) => ({ id, image: profile.image, size: images[id].length, sha256: hash(images[id]) }));
  if (sources.some((source) => source.size !== profiles[source.id].size || source.sha256 !== profiles[source.id].sha256)) {
    return { version: 1, status: 'unsupported', reason: 'unknown-ball-interaction-images', sources, nativeExports: [], routines: [], tables: {}, callPath: [] };
  }
  const routines = regions.map((region) => ({ ...region, ...inspectRecoveredRegion(images[region.image], { base: BASE[region.image], ...region }) }));
  const tables = Object.fromEntries(Object.entries(tableDescriptors).map(([id, descriptor]) => [id,
    { image: descriptor.image, ...inspectPlayerTable(images[descriptor.image], { base: BASE[descriptor.image], ...descriptor }) }]));
  const be = new DataView(backend.buffer, backend.byteOffset, backend.byteLength);
  const readConstant = (address, value) => {
    if (be.getUint32(address - BASE.backend, true) !== value >>> 0) throw new Error('Reviewed ball-launch constant differs');
    return { address: hex(address), value, word: hex(value) };
  };
  const constants = {
    oneQ16: readConstant(0x80127080, 65536), exponentRateQ16: readConstant(0x801270c4, -677890),
    distanceRateQ16: readConstant(0x801270cc, 5242),
    wrapperCapQ16: 25 * 65536, fallbackSpeedQ16: 35 * 65536, zeroParameterSpeedQ16: 15 * 65536,
  };
  const callSites = [
    ['backend', 0x8006bf60, 0x8008aef0], ['backend', 0x8008af18, 0x80021550],
    ['backend', 0x8008af24, 0x800271a8], ['backend', 0x8008af3c, 0x800271a8],
    ['backend', 0x8006bf8c, 0x80075694], ['backend', 0x800756f8, 0x800749a8],
    ['backend', 0x80075714, 0x8007cc40], ['backend', 0x800757b8, 0x80076300],
    ['backend', 0x8007cca0, 0x8002146c], ['backend', 0x8007ccac, 0x8007d40c],
    ['backend', 0x8007ccd4, 0x80124500], ['backend', 0x8007cce0, 0x800271d4],
    ['backend', 0x8007ccec, 0x800271a8], ['backend', 0x8007ccfc, 0x80027258],
    ['backend', 0x8007cd08, 0x800271a8], ['backend', 0x8007d44c, 0x8007cfc0],
    ['backend', 0x8007d460, 0x80027100], ['backend', 0x8007d06c, 0x80124640],
    ['boot', 0x80021488, 0x80026fd0], ['boot', 0x800271ec, 0x800276a4],
    ['boot', 0x800271f8, 0x800276a0], ['boot', 0x80027270, 0x800276a0],
    ['boot', 0x8002727c, 0x800276a4],
  ];
  const callPath = callSites.map(([image, address, target]) => {
    const bytes = images[image], offset = address - BASE[image];
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const item = decodeInstruction(view.getUint32(0, true), address);
    const delay = decodeInstruction(view.getUint32(4, true), address + 4);
    if (item.flow.kind !== 'call' || item.flow.target !== target) throw new Error('Reviewed ball-interaction call differs');
    return { image, at: hex(address), target: hex(target), word: hex(item.word), delaySlot: `${delay.mnemonic} ${delay.operands}`.trim() };
  });
  return {
    version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-ground-target-launch-v1', sources,
    nativeSource: 'native/ball-interaction.c', nativeExports: ballInteractionNativeExports,
    routines, tables, constants, callPath,
    abi: {
      heading16: { arguments: ['dxWord', 'dzWord', 'atan16_u32_257'], return: 'signed angle period65536, X=sin/Z=cos; INT32_MIN invalid' },
      actionTarget: { arguments: ['integerPositionXYZ3', 'storedDistanceWord408', 'signedHeadingHalfword414', 'sineQ16_u32_257', 'outXYZ3'],
        return: '1 success,0 invalid; writes only X/Z, preserves outputY', distanceMask: '0x0007ffff',
        headingBounds: [-32768,32767], sideEffects: 'No source action selection, contact, ownership or launch effects.' },
      headingVector16: { arguments: ['angleWord', 'sineQ16_u32_257', 'outXZ2'], return: '1 success,0 null' },
      groundLaunchSpeed: { arguments: ['distanceInteger', 'originalParameter', 'exponential_u32_113', 'outSpeed1'], return: '1 success,0 invalid' },
      groundLaunch: { arguments: ['positionQ16_XYZ3', 'targetInteger_XYZ3', 'originalParameter', 'atan8_u8_257', 'atan16_u32_257', 'sineQ16_u32_257', 'exponential_u32_113', 'out6'],
        output: ['velocityXQ16', 'velocityY0', 'velocityZQ16', 'selectedSpeedQ16', 'sourceIntegerLength', 'signedHeading16'],
        return: 'source fallback flag0 ordinary/1 speed35 fallback; -1 invalid, output unchanged' },
      bounds: { parameter: [0, 3167], integerLength: [0, 32767], targetIntegerXZ: [-32768, 32767], forbiddenDeltaWord: '0x80000000' },
      original: { launchParameterActorHalfwordOffset: 406, ballFixedPosition: '0x8013df0c', ballVelocity: '0x8013c6a4', targetIntegerToQ16Shift: 16, resetSpinValue: 0, resetSpinWrite: '0x800749e8' },
      workspace: 'Use separate ranges in the existing control workspace; table storage requires692 words after rounding atan8 bytes up to65 words. No source or machine addresses are retained at runtime.',
    },
    inspectionFixture: { parameter: 10, label: 'Explicit numeric test parameter10; no original player/action/default association established.' },
    limitations: [
      'The exact launch numerics are recovered. The original action state machine, kick/ball contact detection, possession, animation event timing, spin setup, ownership flags and trajectory-predictor initialization are not implemented by this helper.',
      'Original wrapper launches from the current ball position. Any preview that places a ball at a selected player position is an explicit inspection input, not a recovered contact or ball attachment.',
      'Original action caller builds a target using8008aef0 and stored action parameters. A controller target used for inspection is not evidence that this action uses live controller targets.',
      'No named pass/shoot/dribble mapping or default positive launch parameter has been established. Parameter10 is an explicit test fixture. The traced action caller bypasses launch entirely for0 and-1.',
      'The parameter bound prevents signed overflow of the source exponent product; target and distance bounds exclude source wrapping outside this reviewed domain. There is no approximate fallback for rejected inputs.',
      'The API arrays must be valid native storage. Return guards and diagnostic output fields are ABI adaptations. Tables must come from the fingerprinted original source report.',
      'This is original numeric reconstruction toward interactions, not a complete playable match or recovered pass/shoot action.',
    ],
  };
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, boot: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node games/fifa98/scripts/ball-interaction-recovery.mjs [--backend BECODE.BIN] [--boot SLES_009.14]\nRead-only source evidence and original lookup data for bounded grounded target-launch numerics.'); return; }
  const directory = fileURLToPath(new URL('../.work/reference/disc/', import.meta.url));
  const [backend, boot] = await Promise.all([readFile(values.backend ?? path.join(directory, 'BECODE.BIN')), readFile(values.boot ?? path.join(directory, 'SLES_009.14'))]);
  console.log(JSON.stringify(inspectBallInteractionRecovery(backend, boot), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
