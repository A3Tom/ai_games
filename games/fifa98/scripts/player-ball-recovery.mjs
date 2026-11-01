import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeInstruction } from './code-map.mjs';
import { inspectRecoveredRegion } from './match-recovery.mjs';
import { inspectPlayerTable } from './player-recovery.mjs';

const BASE = 0x8005ae28;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hex = (value) => `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
const profiles = {
  backend: { image: 'BECODE.BIN', size: 939136, sha256: '254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0' },
  boot: { image: 'SLES_009.14', size: 251904, sha256: 'dcb426566cb9f37d1e7fecf2f8c9a90d8198fcdbc33fcdfd143fac4cf9254644' },
};
export const playerBallNativeExports = Object.freeze([
  'fifa98_player_ball_marker', 'fifa98_player_ball_attach', 'fifa98_player_ball_follow',
]);

const regions = [
  { id: 'interpolated-world-ball-marker', address: 0x800d3e78, size: 460,
    sha256: 'aeec3e86f523aeea32311ff0fad8829135cd1cc3c9c3cead23d87db3722d2fdb',
    kind: 'numeric-state-subset-of-routine', nativeExport: 'fifa98_player_ball_marker',
    semantics: 'Interpolate packet halfwords14/16/18 (prefix6..8), subtract current rootX/Z, mirror relativeX, rotate with source action heading sine/cosine and add animation world X/Z. Original cache/child/root-displacement updates become explicit already-resolved inputs.' },
  { id: 'interpolated-current-root-prefix', address: 0x800d3c34, size: 580,
    sha256: 'b05363d54867fe60dc42c6812382a3a9319abf91733a103825b15d76e37e1d24',
    kind: 'arithmetic-subset-of-routine', nativeExport: 'fifa98_player_ball_marker',
    semantics: 'The current rootprefix3..5 uses the same clamped key pair and fraction as the marker. Source mirror negates rootX. Delta-root movement, retained root history and callback/cache flags are outside this marker-only adaptation.' },
  { id: 'runtime-prefix-key-selection', address: 0x800d3adc, size: 140,
    sha256: 'c7aa856f5529c492ae60f0ff30adf57d6c545689d1d0254a5d127968139f0f11',
    kind: 'static-input-contract-evidence', nativeExport: null },
  { id: 'animation-world-marker-getter', address: 0x800d4a7c, size: 96,
    sha256: 'c9ab40862f58ff56e221a5d5fb7dfbd09821346fd8d37a80aa770ccc104c754f',
    kind: 'static-call-path-evidence', nativeExport: null },
  { id: 'owned-ball-integer-attachment', address: 0x8007514c, size: 204,
    sha256: '3c01b74ad861d007ecfb65a999b9b6c2af6230dab12ad1c920b085f834827ad5',
    kind: 'complete-state-update-routine', nativeExport: 'fifa98_player_ball_attach',
    semantics: 'Require nonnull owner equal to current-update actor and attachment actor; copy current integerXYZ to previous, write supplied integerXYZ to current+anchor, and setballflag40h. Native includes caller entityflag1000h and high16/Y-8-floor0 conversion.' },
  { id: 'movement-to-attachment-caller', address: 0x8008df38, size: 100,
    sha256: 'd5ded269da9e87684a91ed478dd65cb42986c26fc778f64a9164c120c50b3ff8',
    kind: 'static-call-path-evidence', nativeExport: null },
  { id: 'controlled-animation-position-heading-sync', address: 0x800ba290, size: 404,
    sha256: 'befcb15889d9bbf1a386b30d72ce82473251704bc0a4595fc80c6974dad8fc44',
    kind: 'static-input-contract-evidence', nativeExport: null,
    semantics: 'BA334..380 reconstruct controlled movement fixedXYZ and synchronize animationworldXZ. Heading update when entityflags&2100h==100h uses motion+132 for low8entityflags0, otherwise+136, adding signed actionrow+6.' },
  { id: 'animation-heading-coefficients', address: 0x800d38ec, size: 60,
    sha256: '75c22d53817b27e4ffdb42556c2f0a5f048f8f4f2146c3b18fd8a5485d4bff96',
    kind: 'inlined-support-routine-evidence', nativeExport: null,
    semantics: 'On heading change store angle64, call resident21550 with negative angle, placing sine atstate72 and cosine atstate68.' },
  { id: 'animation-world-xz-synchronization', address: 0x800d3928, size: 112,
    sha256: 'e7a3ae270903c9724896a838abfe50819a2a210934a1289ec30f592f0288eb3c',
    kind: 'static-input-contract-evidence', nativeExport: null },
  { id: 'owned-ball-linear-predictor', address: 0x8007b790, size: 792,
    sha256: '8c6a2f21a33503409a4766892fd5f4a7d55dd880d559fa1f7d569461f167c452',
    kind: 'guarded-numeric-subset-of-routine', nativeExport: 'fifa98_player_ball_follow',
    semantics: 'Anchor-directed velocity uses original reciprocal(ticksQ16), source +/-15XZ and+/-10Y component clamps, then constant-velocity trajectory samples. GroundY0/no other contacts only. Ring counters, collision callbacks and complete predictor state are excluded.' },
  { id: 'owned-ball-predictor-branch', address: 0x8007bae0, size: 168,
    sha256: 'c55f249ce2e31f15556c872de5c11278cc0088880d3d83cbe5de8d3e7afe6ef3',
    kind: 'static-call-path-evidence', nativeExport: null,
    semantics: 'Onlyballflag40h set with blocker8013DEF8h zero selects owned prediction. Reset predictor with zero spin/velocity then run7B790 for currentwhole ticks; clear40h before common trajectory consumer.' },
  { id: 'predictor-initial-fixed-position', address: 0x80076300, size: 64,
    sha256: '0564cdd3bc0689332fbbad0a5886a0b99a25f8c3401a8d78db35ec4acc0e7720',
    kind: 'static-input-contract-evidence', nativeExport: null,
    semantics: 'Prediction starts from existing fixed ballXYZ8013DF0Ch, preserving fractional bits. Restored integer position is not the predictor fixed start.' },
  { id: 'predicted-sample-position-consumer', address: 0x800766a4, size: 192,
    sha256: '7bf828d75c28a35c1477bde8fb7f914506bc8914adca0462634ac16826d06f24',
    kind: 'arithmetic-subset-of-routine', nativeExport: 'fifa98_player_ball_follow',
    semantics: 'Transfer each sample to currentfixedXYZ, retain previousfixedXYZ, take signed high16 current/previous integerXYZ and form velocity as consumed position difference. Other events/counters/phase scheduling are excluded.' },
  { id: 'source-attachment-flag-events', address: 0x800b95e0, size: 216,
    sha256: 'e80e65bf97997de494a841d90fa497086224c26e94c3bd63e29f9ec1d608e18c',
    kind: 'unimplemented-action-callback-evidence', nativeExport: null,
    semantics: 'Runtimecallbackstate20 bit8000h sets entityflag1000h; bit4000h samples marker then clears entityflag1000h. Callback also performs selection/action behavior outside this bounded carry test.' },
  { id: 'source-action-window-phase-flags', address: 0x800d4780, size: 164,
    sha256: '0d34dac1b28d4a23e4e38ebc54880826094ad6433a42b3bc1a507b23420d1052',
    kind: 'unimplemented-action-event-producer-evidence', nativeExport: null,
    semantics: 'Compare currentphase against signed clipheader+8<<8 and (signed clipheader+10-2)<<8. Start can setA000h, end can clear8000h and set24000h, subject to source runtime suppression flags. This identifies attachment-window event provenance, not contact acquisition.' },
  { id: 'source-action-window-crossing-callbacks', address: 0x800d41a4, size: 268,
    sha256: '55615cc84ae8d69b6536417cec4c0e733151e2f14ac8d167fe06ea0942ded27f',
    kind: 'unimplemented-action-event-producer-evidence', nativeExport: null },
  { id: 'source-linear-norm-bound-support', address: 0x80124678, size: 84,
    sha256: 'a3300bfcda7dbbe08545bc9aa6070b27c47f7ea4bdda078db7073d36f9d3243c',
    kind: 'bounded-arithmetic-support-evidence', nativeExport: null,
    semantics: 'Highest-set-bit selects an original positive slope/intercept pair. These source tables bound the approximate norm over squared input0..550Q16, proving the later30Q16 speed-cap branch unreachable without substituting mathematical sqrt.' },
  { id: 'selector-category-flags-byte-alias', address: 0x800b92bc, size: 804,
    sha256: 'e1b0003f0f647a81e4a2386dca20a5b8daecfe5fa8ca57a3df6cbf63c0f796c6',
    kind: 'static-input-contract-evidence', nativeExport: null,
    semantics: 'Selector reads category withLBU object+36 atB92C0 and writes selectedcategory withSB object+36 atB9424. This aliases the low8bits of the same flagsword tested byBA290 heading synchronization; the current selector category determines facing versus movement-heading choice.' },
];

/** Exact-image-gated static evidence. This never executes original code. */
export function inspectPlayerBallRecovery(backend, boot) {
  if (!(backend instanceof Uint8Array) || !(boot instanceof Uint8Array)) throw new TypeError('Player-ball recovery requires Uint8Array backend and resident images');
  const images = { backend, boot };
  const sources = Object.entries(profiles).map(([id, expected]) => ({ id, image: expected.image, size: images[id].length, sha256: digest(images[id]) }));
  if (sources.some((source) => source.size !== profiles[source.id].size || source.sha256 !== profiles[source.id].sha256)) {
    return { version: 1, status: 'unsupported', reason: 'unknown-player-ball-images', sources, nativeExports: [], routines: [], tables: {}, callPath: [] };
  }
  const routines = regions.map((region) => ({ ...region, ...inspectRecoveredRegion(backend, { base: BASE, ...region }) }));
  const tables = { sine: inspectPlayerTable(boot, { base: 0x80011000, address: 0x8004904c, count: 257, element: 'u32',
    sha256: 'c3b03a2581960f9b22f2f29fb52f30bf36eb87c3896c8e4f62c708b3c247f880' }) };
  const normSlopes = inspectPlayerTable(backend,{base:BASE,address:0x8013137c,count:32,element:'u32',
    sha256:'857d78e6038ffcd652f971d4c44d22a8693a65def03845dd71fb12db0da66797'});
  const normOffsets = inspectPlayerTable(backend,{base:BASE,address:0x80131400,count:32,element:'u32',
    sha256:'4e2fb44872932d7af0b3d42d1090427ea10896ad92c23b7ad90daaa2e5a3fd7d'});
  const maximumSquared = 550n*65536n;
  const normIntervals = Array.from({length:26},(_,bit)=>{
    const intervalEnd=(1n<<BigInt(bit+1))-1n;
    const maximumInput=intervalEnd<maximumSquared?intervalEnd:maximumSquared;
    const slope=normSlopes.values[bit],offset=normOffsets.values[bit];
    if(slope>0x7fffffff||offset>0x7fffffff)throw new Error('Source norm bound requires positive slope/intercept');
    return {highestBit:bit,maximumInput:Number(maximumInput),maximumNorm:Number((maximumInput*BigInt(slope)>>16n)+BigInt(offset))};
  });
  const maximumNorm=Math.max(...normIntervals.map((row)=>row.maximumNorm));
  if(maximumNorm!==1540977||maximumNorm>=30*65536)throw new Error('Reviewed source norm bound differs');
  const normBound={maximumSquaredQ16:Number(maximumSquared),maximumNormQ16:maximumNorm,sourceCapQ16:30*65536,
    proof:'For each highest-set-bit interval, positive source slope makes its upper endpoint the maximum; zero returns0. All26 interval maxima stay below30Q16.',
    intervals:normIntervals,tables:[normSlopes,normOffsets].map(({values,...table})=>table)};
  const view = new DataView(backend.buffer, backend.byteOffset, backend.byteLength);
  const callSites = [[0x8008df44,0x800ba290], [0x8008df6c,0x800d4a7c], [0x8008df94,0x8007514c],
    [0x800d4aa4,0x800d3e78], [0x800d3eb0,0x800d3adc], [0x800d3ecc,0x800d3c34], [0x800d3c70,0x800d3adc],
    [0x800ba310,0x800d38ec], [0x800ba37c,0x800d3928], [0x800d3910,0x80021550],
    [0x8007bb4c,0x80076300], [0x8007bb60,0x8007b790], [0x8007b7f0,0x80124640],
    [0x8007b80c,0x800271a8], [0x8007b828,0x800271a8], [0x8007b844,0x800271a8],
    [0x8007ba0c,0x80079c90], [0x800b9650,0x800d4a7c], [0x800b9678,0x8007514c]];
  const callPath = callSites.map(([address,target]) => {
    const item = decodeInstruction(view.getUint32(address - BASE,true),address);
    const delay = decodeInstruction(view.getUint32(address - BASE + 4,true),address+4);
    if (item.flow.kind !== 'call' || item.flow.target !== target) throw new Error('Reviewed player-ball call differs');
    return { at: hex(address), target: hex(target), word: hex(item.word), delaySlot: `${delay.mnemonic} ${delay.operands}`.trim() };
  });
  return {
    version: 1, status: 'reconstruction-only', profile: 'SLES_009.14-owned-ball-attachment-v1', sources,
    nativeSource: 'native/player-ball.c', nativeExports: playerBallNativeExports, routines, tables, callPath,normBound,
    abi: {
      marker: { arguments: ['prefixA_i32_9','prefixB_i32_9','fraction16','playerFixedXZ_u32_2','sourceHeading1024','mirror0or1','sine257_u32','outFixedXYZ3'], return: '1 success,0 invalid without writes',
        selection: 'selectMotionKeys(clip,phase) gives original clampedA/B and fraction16; interpolate rootprefix3..5 and markerprefix6..8 from the same pair',
        heading: 'When controlled entityflags&2100h==100h (or sourceforce argument): low8flags/category0 selects player.facing (motion+132), nonzero selects player.heading (motion+136); then add signed actionrow.headingOffsetRaw. Selector category is the same low8flags field. Other modes can retain the prior cached angle.' },
      attach: { arguments: ['markerFixedXYZ3','ownershipTokens3','entityFlagsWord','ballIntegerState10'], return: '1 applied,0 source identity/flag guard false,-1 null; output unchanged on rejection',
        ownership: ['owner','currentUpdateActor','attachmentActor'], ball: ['integerX','integerY','integerZ','previousIntegerX','previousIntegerY','previousIntegerZ','anchorX','anchorY','anchorZ','flags'] },
      follow: { arguments: ['ballIntegerState10','ticks1to6','blockerWord','ballFixedState9'], return: '1 applied,0 source pendingflag40/blocker guard false,-1 unsupported; both states unchanged on rejection',
        fixedState: ['fixedX','fixedY','fixedZ','velocityX','velocityY','velocityZ','previousFixedX','previousFixedY','previousFixedZ'],
        guards: 'GroundY0 for current and anchor; signed16anchor; previousintegerXYZ equal currentfixed high16; no signed delta/position overflow; no other contacts; spin reset0 by caller',
        componentCapsQ16: [15*65536,10*65536,15*65536] },
      original: { owner: '0x8013c60c', currentUpdateActor: '0x8013c634', attachmentActor: '0x8013df30',
        currentIntegerXYZ: '0x8013de44', previousIntegerXYZ: '0x8013de50', anchorIntegerXYZ: '0x8013df34',
        fixedXYZ: '0x8013df0c', ballFlags: '0x8013df48', blocker: '0x8013def8', entityAttachmentFlag: 4096,
        pendingBallAttachmentFlag: 64, markerIntegerYSubtract: 8, sourceResetSpin: 0 },
    },
    eventProvenance: { clipHeaderStartHalfword: 4, clipHeaderEndHalfword: 5, startPhase: 'signedHalfword<<8', endPhase: '(signedHalfword-2)<<8',
      entityAttachSetFromRuntimeFlag: 32768, entityAttachClearFromRuntimeFlag: 16384, implemented: false },
    limitations: [
      'This connects original animation marker, owned-ball guards and isolated ground following. Genuine acquisition/contact, possession changes, ball action dispatch, opponents and laws remain unrecovered.',
      'An owned-ball test must explicitly supply owner identity equality and entityflag1000h. These fixtures are not generated by a recovered proximity/contact rule.',
      'The traced callback eventflag producer is documented but not dispatched. Current ordinary control clips with clipheader8/10=-1 do not establish attachment-window events; do not infer automatic ownership or ball attachment from their marker channels.',
      'Marker calculation is source interpolation of reference channels, separate from the currently displayed discrete skeletal key. This is not skeletal interpolation or a tuned ball-ahead offset.',
      'Follow is the original bounded linear predictor numeric path with groundY0 and no other contacts. It excludes predictor rings, event records, field/post/net/player contacts, phase scheduling and ownership callbacks.',
      'After component caps15/10/15, squared speed<=550Q16. Fingerprinted source norm slopes/intercepts bound its actual approximate norm to1540977Q16<30Q16, so the source30 cap cannot run. No host sqrt approximation is introduced.',
      'Leaving owned mode or launching must explicitly release test ownership. This does not implement source ownership helpers74C64/75580 or their action/team callbacks.',
    ],
  };
}

async function main() {
  const { values } = parseArgs({ options: { backend: { type: 'string' }, boot: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) { console.log('Usage: node games/fifa98/scripts/player-ball-recovery.mjs [--backend BECODE.BIN] [--boot SLES_009.14]\nRead-only source evidence for original bounded owned-ball marker/attachment/following.'); return; }
  const directory = fileURLToPath(new URL('../.work/reference/disc/',import.meta.url));
  const [backend,boot] = await Promise.all([readFile(values.backend ?? path.join(directory,'BECODE.BIN')),readFile(values.boot ?? path.join(directory,'SLES_009.14'))]);
  console.log(JSON.stringify(inspectPlayerBallRecovery(backend,boot),null,2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode=1; });
