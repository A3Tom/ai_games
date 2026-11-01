import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inspectRecoveredRegion } from './match-recovery.mjs';
import { decodeInstruction } from './code-map.mjs';

const BACKEND_BASE = 0x8005ae28, BOOT_BASE = 0x80011000;
const BACKEND_HASH = '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0';
const BOOT_HASH = 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
export const playerPlacementNativeExports = Object.freeze(['fifa98_player_render_position']);

/** Exact source numeric conversion before camera-origin subtraction.
 * It does not reproduce display-list sentinel filtering or an external view.
 */
export function recoverPlayerRenderPosition(fixedXYZ) {
  if (!Array.isArray(fixedXYZ) || fixedXYZ.length !== 3 || Array.from(fixedXYZ).some((value) =>
    !Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff)) throw new Error('Expected three fixed-point coordinate words');
  return Object.freeze(fixedXYZ.map((word, axis) => {
    const integer = word >> 16;
    const shifted = ((integer - (axis === 1 ? 3 : 0)) << 16) >> 15;
    return shifted << 16 >> 16;
  }));
}

const regions = [
  { id: 'player-fixed-high-halfword-snapshot-writes', address: 0x800d6358, size: 128,
    sha256: '27fb2b2ca009d1216dbf1fcdb02e47a1b29e27e778a42b3ffe4b8052572c1d64',
    semantics: 'Read signed high halves of entity fixed XYZ at offsets128/132/136, then store snapshot XYZ at368/370/372. Off-field X/Z sentinel filtering in this region is outside the numeric helper.' },
  { id: 'snapshot-position-reader', address: 0x800d6074, size: 44,
    sha256: '62dd9de830305579c18988ae5b34452b9c1a9a11cbfa715120e9aff9207e176f',
    semantics: 'Sign-extend three snapshot coordinate halfwords into the supplied twelve-byte integer XYZ array without scaling.' },
  { id: 'position-array-reader-caller', address: 0x800d9304, size: 116,
    sha256: 'a027b1bf4a5e026206a3a89de8b6dbf6f69ce2c14a86ceba6e90c08a9fae335a',
    semantics: 'Pass position array801371e8 and second-side array+132 to snapshot reader800d5f64.' },
  { id: 'first-side-render-position-writes', address: 0x800d96b4, size: 272,
    sha256: '94f8b511d00f533ba601f11bcc1a2a6985a56c1502c7cf9a477fdd8a9524045a',
    semantics: 'Read integer XYZ; subtract3 from Y; SLL16/SRA15 each coordinate; subtract camera-origin halfwords and SH into render-instance12/14/16. Native helper recovers arithmetic before camera subtraction only.' },
  { id: 'second-side-render-position-writes', address: 0x800d97ec, size: 268,
    sha256: '4846d0ba372f2877877502134d5bbfafda1510c231be9e76c0eb0bdb1a9b0115',
    semantics: 'Repeat the same coordinate conversion and camera-origin subtraction for the other side.' },
  { id: 'render-position-camera-transform-caller', address: 0x800d9e6c, size: 108,
    sha256: 'b5c907c29b1443942b1cad952371dce1c7c0092d36289fb9853d8879724b339b',
    semantics: 'Transform packed render-instance12/14/16 through the active camera into instance20/22/24. The independent preview does not reproduce this camera path.' },
  { id: 'body-draw-external-transform-caller', address: 0x800dcd40, size: 80,
    sha256: '326ff9da596b3e35d5b263cdff982912181aa69d1eddb96c1a5bfed3c33da892',
    semantics: 'Pass instance+20 to resident11910 before external matrix composition and body drawing; this is boundary evidence, not external-view parity.' },
];

/** Hash-gated source evidence, with optional resident consumer verification. */
export function inspectPlayerPlacement(backend, boot) {
  if (!(backend instanceof Uint8Array) || (boot !== undefined && !(boot instanceof Uint8Array))) throw new TypeError('Player placement requires Uint8Array images');
  const source = { image: 'BECODE.BIN', size: backend.length, sha256: digest(backend) };
  const resident = boot === undefined ? { status: 'not-supplied' } : { image: 'SLES_009.14', size: boot.length, sha256: digest(boot) };
  if (backend.length !== 939136 || source.sha256 !== BACKEND_HASH || (boot !== undefined && (boot.length !== 251904 || resident.sha256 !== BOOT_HASH))) {
    return { version: 1, status: 'unsupported', reason: 'unknown-player-placement-images', source, resident, nativeExports: [], regions: [], callPath: [] };
  }
  const recovered = regions.map((region) => ({ ...region, kind: 'source-chain-evidence',
    ...inspectRecoveredRegion(backend, { base: BACKEND_BASE, ...region }) }));
  if (boot !== undefined) recovered.push({ id: 'resident-packed-position-matrix-consumer', kind: 'external-transform-boundary-evidence',
    semantics: 'Load packed signed XYZ without X/Z rescaling; negate Y into matrix translation. This does not establish the independent preview camera/model-space sign convention.',
    ...inspectRecoveredRegion(boot, { base: BOOT_BASE, address: 0x80011910, size: 56,
      sha256: '32477087e7cd8dd6bf619828019ecf012770370f29bf38fb6c7a89672c00ca60' }) });
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength);
  const callPath = [[0x800d9360, 0x800d5f64], [0x800d9ed0, 0x80011a48], [0x800dcd48, 0x80011910],
    [0x800dcd68, 0x80011ab4], [0x800dcd84, 0x80012a00]].map(([at, target]) => {
    const instruction = decodeInstruction(view.getUint32(at - BACKEND_BASE, true), at);
    if (instruction.flow.kind !== 'call' || instruction.flow.target !== target) throw new Error('Reviewed player placement call differs from source');
    return { at: hex(at), target: hex(target), word: hex(instruction.word) };
  });
  return { version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-player-placement-v1', source, resident,
    nativeSource: 'native/player-placement.c', nativeExports: playerPlacementNativeExports, regions: recovered, callPath,
    conversion: { input: 'three signed Q16.16 word bit patterns', integerExtraction: 'signed high halfword',
      horizontalMultiplier: 2, verticalIntegerOffset: -3, packedVerticalOffset: -6, output: 'three signed halfwords expanded to int32',
      operations: ['signed high16 from fixedXYZ', 'Y minus3', 'SLL16 then SRA15', 'signed SH wrap'],
      sourceFields: { entityFixedXYZ: [128,132,136], snapshotXYZ: [368,370,372], positionArray: '0x801371e8',
        renderInstanceXYZ: [12,14,16], cameraOriginXYZ: ['0x80137830','0x80137832','0x80137834'] } },
    platformBoundary: { sourceCameraSubtractionIncluded: false, originalViewTransformIncluded: false, interpolationIncluded: false,
      note: 'The helper returns original packed-position arithmetic before camera subtraction. Applying these X/Z values or returnedY to model-space inspection geometry is a separate platform translation. Resident11910 negates packedY later; this report does not claim external camera/model-space transform parity.' },
    limitations: [
      'This is a coordinate-conversion subset of the verified snapshot/render chain, not a complete snapshot serializer, display-list builder or original renderer.',
      'The source snapshot writer replaces X/Z outside[-32000,32000] with32016 sentinel and later culling filters off-field records. That filtering is excluded; controlled source bounds are far inside it.',
      'Fractional fixed-position bits are discarded before rendering. Fractional interpolation or smoothing would be an additional platform choice.',
      'Camera-origin subtraction, active camera transform, packed-coordinate culling and external body transform remain outside the native helper.',
      'The vertical source offset is minus3 before doubling, giving packedY=-6 at zero simulation Y; its later model-space sign/convention is not inferred from this subset.',
    ] };
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, boot: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node games/fifa98/scripts/player-placement.mjs [--backend BECODE.BIN] [--boot SLES_009.14]\nRead-only exact player placement evidence; no original machine code runs.'); return; }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [backend, boot] = await Promise.all([readFile(values.backend ?? path.join(root, '.work/reference/disc/BECODE.BIN')),
    readFile(values.boot ?? path.join(root, '.work/reference/disc/SLES_009.14'))]);
  console.log(JSON.stringify(inspectPlayerPlacement(backend, boot), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
