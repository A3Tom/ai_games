import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeInstruction } from './code-map.mjs';
import { inspectRecoveredRegion } from './match-recovery.mjs';
import { inspectPlayerTable } from './player-recovery.mjs';

const BASE=0x8005ae28;
const EXPECTED={image:'BECODE.BIN',size:939136,sha256:'254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0'};
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const hex=(value)=>`0x${(value>>>0).toString(16).padStart(8,'0')}`;
export const possessionNativeExports=Object.freeze(['fifa98_possession_claim_unowned','fifa98_possession_release','fifa98_possession_release_solo']);

const regions=[
  {id:'ownership-transition',address:0x80074c64,size:500,
    sha256:'488ace54ea51ab036ee998786db76031dc5e1cc486f540ad72ad53647d5a4340',
    kind:'guarded-unowned-branch-of-routine',nativeExport:'fifa98_possession_claim_unowned',
    semantics:'Only initial owner0->nonnullactor, with A651C side effects proven absent. Update bit20 from argumentbit0,clearbit8,rotate previous-owner history when reacquiring prioractor,reset source counters,assign own/opponent team fields,then6246C(mode1) and BCDF8. Existing-owner callbacks and same-owner refresh are not implemented.'},
  {id:'ownership-precheck-callback-guard',address:0x800a651c,size:292,
    sha256:'5bfb92928e42c546ca9e85e5a425b36da83ca25cc24b00f9bbd20c3bb9fbd839',
    kind:'proven-no-op-conditional-path',nativeExport:null,
    semantics:'Complete no-op if alternateMode!=0; otherwise no-op only when opponentTeam1964 bit80clear and newActor492zero. Other paths can clear actor492 across teams and invoke action/audio callbacks; native rejects those domains atomically.'},
  {id:'claimed-team-state',address:0x8006246c,size:160,
    sha256:'1ec625cd9d5eb6100bfcba6d8762d008d7e62ad5a44fdd68e1eedf087e959c9d',
    kind:'conditional-nonzero-mode-path',nativeExport:'fifa98_possession_claim_unowned',
    semantics:'Mandatory ownership call uses argument1. Clear opponentTeam316; ownTeam316=0 only when Actor4zero and (previousOwnerzero or sharedballbit20set), otherwise1. Unclaimed argument0/event4 branch is outside this inline subset.'},
  {id:'ownership-five-row-history',address:0x800bcdf8,size:268,
    sha256:'0186e830dcb5ac6c5061fd4ce04cb099cc98c3ea8a350abb99a4fd9c16df0cd7',
    kind:'complete-routine-with-bounded-storage',nativeExport:'fifa98_possession_claim_unowned',
    semantics:'Clear source98DC; selected9C44/9C48/9C4C resets depend on rawActor4. Same last identity retains history index/rows; new identity advances0..4 cyclicindex,clears rowhalfword,writes actoridentity. Nullactor source no-op is outside nonnullclaim precondition.'},
  {id:'launch-actor-bookkeeping',address:0x80075580,size:276,
    sha256:'9febed8a11b53158eb9d295536f8183025f67eecee512cb184d60530cdaec0d5',
    kind:'unimplemented-launch-bookkeeping-evidence',nativeExport:null,
    semantics:'Updates per-side actor/controller value, launchactor pointers, opposing-team fields and launchargumentDF44. It never assigns currentownerC60C; this is not an acquisition helper.'},
  {id:'displaced-owner-notification',address:0x80087cac,size:160,
    sha256:'203e3befcbedbb546a6984e42701e74a3c75cef8337c0c6d7f6c48ac9a1325d3',
    kind:'guarded-callback-free-routine',nativeExport:'fifa98_possession_release',
    semantics:'When Actor48zero or ownTeam292equalsactor, the A7878 callback is skipped. If ownTeam296zero set Actor308 from alternateBaseSpeed[attributeByte58]; always set ownTeam296=actor. Other callback domains are rejected before native writes.'},
  {id:'matching-owner-release',address:0x80074e58,size:240,
    sha256:'6d63a441efa8602782d1ed3108e214c52dd04357218118a4b40d30fc43106e5b',
    kind:'guarded-matching-owner-release',nativeExport:'fifa98_possession_release',
    semantics:'Nonzero matchingowner release rotates previous/priorowner, clearscurrentowner/sharedbit20/counterC5F4, optionally notifies through callback-free87CAC, conditionally clearsattachment and ownTeam252, then6246C(mode1). No BCDF8 history call; mismatchedowner sourcecounterclear is outside the atomic native domain.'},
  {id:'released-controller-selection',address:0x800a7878,size:724,
    sha256:'51c9cd587233db12d67e158f307de589a6596003f8b97448c1857d0857ccaf7d',
    kind:'proven-single-controlled-actor-no-op',nativeExport:'fifa98_possession_release_solo',
    semantics:'With ownTeam1908=1 and sole196entry the released actor with raw4zero/raw48nonnull, every direct/helper candidate path rejects the sole actor. A7AEC seesNULL and returns before6004C/ownTeam280 mutation. No general controller-selection result is fabricated.'},
  {id:'preferred-uncontrolled-candidate',address:0x8005f4f8,size:260,
    sha256:'d0a8140c511147c976520d6ebb39650adf9e864380eb8aacace1dd80a49c7e50',
    kind:'read-only-candidate-rejection-proof',nativeExport:null,semantics:'No stores except stack bookkeeping; rawActor48nonnull rejects before candidate distance selection.'},
  {id:'controller-aware-candidate',address:0x8005f5fc,size:280,
    sha256:'dfe32d5e2294a2f4b7faa3ec69a99593e287648fcc64284bc8c3089c001c6144',
    kind:'read-only-candidate-rejection-proof',nativeExport:null,semantics:'No stores except stack bookkeeping; A7878 uses5F910 with requireRaw4=1, so rawActor4zero rejects even if its controller field is otherwise eligible.'},
  {id:'ball-side-candidate',address:0x8005f714,size:284,
    sha256:'52b11eddd198f380929cfb6a19e1cb20de6d6f31c82ecc0e93f4bba13425e8de',
    kind:'read-only-candidate-rejection-proof',nativeExport:null,semantics:'No stores except stack bookkeeping; rawActor48nonnull rejects before ball-side/distance selection.'},
  {id:'uncontrolled-candidate-fallback',address:0x8005f830,size:224,
    sha256:'c96af506feaef5847abe524c05b9a945ad9c499dd1d61df6052f54256ae7c30e',
    kind:'read-only-candidate-rejection-proof',nativeExport:null,semantics:'No stores except stack bookkeeping; rawActor48nonnull rejects before fallback distance selection.'},
  {id:'candidate-wrappers',address:0x8005f910,size:220,
    sha256:'a73f5c1c3895dfbea20a58a6c572810fcaf63520959be099b55e660c8dfdd99c',
    kind:'read-only-candidate-call-path-evidence',nativeExport:null,semantics:'5F910 forwards requireRaw4;5F93C uses5F4F8 then5F830;5F990 uses5F714 then5F4F8. No non-stack effects of their own.'},
  {id:'action-state-owned-ball-claim-caller',address:0x8007394c,size:192,
    sha256:'fb358c19875b0a92e9acd5274c5f09444d59d2e2b65c560465dbd7973de0270e',
    kind:'incomplete-acquisition-eligibility-caller-evidence',nativeExport:null,
    semantics:'Requires actorstate timing plus actorfield236<128 and prior actionrecordflagsbit1, then obtains animationposition, resetsball,claimsowner,and grantsattachment ifclaim succeeded. The distance threshold alone is not a complete pickup predicate.'},
  {id:'action-state-height-claim-caller',address:0x8006d8e8,size:280,
    sha256:'865f3cf9f23a783c3d2ff88e34ca14e865cbb5d9180038323963d7a63e00b306',
    kind:'incomplete-acquisition-eligibility-caller-evidence',nativeExport:null,
    semantics:'An action-state0 branch can claim at sourceballintegerY<86, with separate handling below33 and a facing/target-state check. Its enclosing dispatch/entry eligibility is not a generic acquisition predicate.'},
];

/** Read-only original-image-gated state-transition evidence; no original code runs. */
export function inspectPossessionRecovery(backend){
  if(!(backend instanceof Uint8Array))throw new TypeError('Possession recovery requires Uint8Array backend bytes');
  const source={image:EXPECTED.image,size:backend.length,sha256:digest(backend)};
  if(source.size!==EXPECTED.size||source.sha256!==EXPECTED.sha256)return{version:1,status:'unsupported',reason:'unknown-possession-image',source,nativeExports:[],routines:[],callPath:[]};
  const routines=regions.map((region)=>({...region,...inspectRecoveredRegion(backend,{base:BASE,...region})}));
  const view=new DataView(backend.buffer,backend.byteOffset,backend.byteLength);
  const calls=[[0x80074cb8,0x800a651c],[0x80074e18,0x8006246c],[0x80074e20,0x800bcdf8],
    [0x80074d50,0x80087cac],[0x80074e34,0x800bcc60],[0x800739c4,0x80074c64],
    [0x8006d994,0x80074c64],[0x8006d9e4,0x80074c64],
    [0x80075758,0x80075580],[0x800758d0,0x80075580],
    [0x80074eec,0x80087cac],[0x80074f2c,0x8006246c],
    [0x80087ce4,0x800a7878],[0x800a7a90,0x8005f910],[0x800a7aa8,0x8005f93c],
    [0x800a7ae0,0x8005f990],[0x8005f924,0x8005f5fc],[0x8005f958,0x8005f4f8],
    [0x8005f96c,0x8005f830],[0x8005f9b4,0x8005f714],[0x8005f9c8,0x8005f4f8],
    [0x800a7b20,0x8006004c]];
  const callPath=calls.map(([address,target])=>{
    const item=decodeInstruction(view.getUint32(address-BASE,true),address);
    const delay=decodeInstruction(view.getUint32(address-BASE+4,true),address+4);
    if(item.flow.kind!=='call'||item.flow.target!==target)throw new Error('Reviewed possession call differs');
    return{at:hex(address),target:hex(target),word:hex(item.word),delaySlot:`${delay.mnemonic} ${delay.operands}`.trim()};
  });
  return{version:1,status:'reconstruction-only',profile:'SLES_009.14-unowned-ownership-transition-v1',source,
    nativeSource:'native/possession.c',nativeExports:possessionNativeExports,routines,callPath,
    tables:{alternateBaseSpeed:inspectPlayerTable(backend,{base:BASE,address:0x80129354,count:20,element:'u32',
      sha256:'18e4efbe208dd02c805a9eb8b6566de917063b6294945cefc6dff29414f5c4af'})},
    abi:{arguments:['actor5','sourceBit20Argument','state10','teams8','history15'],
      actor:['identity','rawField4','rawField492','alternateMode','opponentTeamFlags1964'],
      state:['owner','previousOwner','priorOwner','sharedBallFlags','counterC5F4','counterC5EC','counterC5F0','counterC630','counterC63C','attachmentActor'],
      teams:['own240','own280','own292','own252','own316','opponent292','opponent252','opponent316'],
      history:['field9C44','field9C48','field9C4C','field98DC','index0to4','row0Half','row0Actor','row1Half','row1Actor','row2Half','row2Actor','row3Half','row3Actor','row4Half','row4Actor'],
      return:'1 applied,0 unsupported identity/owner/callback-domain,-1 null or malformed history; atomic rejection',
      guards:'actoridentity nonzero,ownerzero,historyindex0..4,rowhalfwords0..65535,and (alternateMode!=0 OR(actor492==0 AND opponentflags1964 bit80clear))',
      retainedFields:['state.priorOwner','state.attachmentActor','teams.own280','history rows not advanced'],
      original:{owner:'0x8013c60c',previousOwner:'0x8013c610',priorOwner:'0x8013df4c',sharedBallFlags:'0x8013df48',attachmentActor:'0x8013df30',
        counters:['0x8013c5f4','0x8013c5ec','0x8013c5f0','0x8013c630','0x8013c63c'],
        historyFields:['0x80139c44','0x80139c48','0x80139c4c','0x801398dc','0x801398c8'],historyRowBase:'0x801398a0',historyRowStride:8},
      runtime:'All original pointer comparisons become opaque identity words and explicit native arrays; no runtime source addresses, virtual memory map or machine state.',
      release:{arguments:['actor4','state10','teams8','notice2'],
        actor:['identity','rawActor4','rawActor48','attributeByte58'],notice:['ownTeam296','actor308'],
        return:'1 applied,0 unsupported identity/owner/callback-domain,-1 null or used attribute index outside0..19; atomic rejection',
        guards:'Nonzero actoridentity equals currentowner. If rawActor4zero and ownTeam252!=identity, require rawActor48zero OR ownTeam292==identity. AttributeByte58 requires0..19 only when notification runs and ownTeam296zero.',
        changes:'Clear C5F4; previousOwner=actor,priorOwner=oldPreviousOwner,currentOwner=0;clearsharedbit20;optionalnotification own296/actor308;clearattachmentonlyifactor;clearown252onlyifnotactor;own316=1/opponent316=0.',
        preserved:'Five-row BCDF8 history, ownTeam240/280/292, other state counters and unrelated flagbits. Existing mismatched-owner source behavior is not included.',
        tableDependency:'Reuse existing compiled player_motion_profile alternateBaseSpeed table80129354; no named-stat/player mapping inferred.',
        solo:{export:'fifa98_possession_release_solo',arguments:['actor4','state10','teams8','notice2','roster2'],
          roster:['ownTeam1908Count','soleOwnTeam196Identity'],
          guards:'Count1,soleIdentityequalsactor,rawActor4zero,rawActor48nonnull,plus matchingowner/usedattribute bounds.',
          proof:'The direct A7878 loop rejectsraw4zero;5F4F8/5F714/5F830 rejectraw48nonnull;5F910->5F5FC requiresraw4nonnull. All candidate helpers are read-only, so all A7878 routes selectNULL and return before any controller transfer or own280 mutation.',
          return:'1 applied,0 unsupported solo/identity/owner-domain,-1 null or used attribute index outside0..19; atomic rejection'} }},
    limitations:[
      'This is an original unowned-to-actor ownership transition, not a contact/acquisition decision. Calling it for an explicit test setup must remain labeled as such.',
      'Upstream action-state eligibility remains incomplete. Neither actor236<128 nor ballheight<86 is a justified universal pickup rule; both observed callers have preceding action/timing/entry conditions.',
      'The no-op A651C domain excludes team/offside/action/audio callbacks. Transfers from an existing owner and same-owner refresh use other source branches and are rejected.',
      'This transition does not grant attachment permission, set current-update actor or entityflag1000, choose an animation, or infer an action event. Those are separate original caller/runtime fields.',
      'The source launch helper75580 never writes the current owner. It must not be substituted for acquisition or a complete ownership release.',
      'No friendly player-role meaning is assigned to rawActor4/492 or numeric team/history fields. Bounds/return values are native ABI guards, not new gameplay rules.',
      'The release API covers matching-owner74E58 only and skips A7878 callbacks. It is not full launch75924, acquisition, an existing-owner transfer or a substitute for action eligibility.',
      'Original74E58 clears C5F4 for a nonnull mismatched actor before returning. The transactional native API instead rejects that unsupported domain before any writes.',
      'Release does not call BCDF8; prior/previous owner words rotate, while the separate five-row history remains unchanged. Its notice fields do not grant attachment or invoke an action.',
      'The solo release extension proves A7878 is a no-op only for one roster entry equal to the raw4zero/raw48nonnull released actor. It is not a general controller handoff or an eleven-player match release.',
    ]};
}

async function main(){
  const{values}=parseArgs({options:{backend:{type:'string'},help:{type:'boolean'}}});
  if(values.help){console.log('Usage: node games/fifa98/scripts/possession-recovery.mjs [--backend BECODE.BIN]\nRead-only evidence for the bounded original unowned-to-actor ownership transition.');return;}
  const directory=fileURLToPath(new URL('../.work/reference/disc/',import.meta.url));
  console.log(JSON.stringify(inspectPossessionRecovery(await readFile(values.backend??path.join(directory,'BECODE.BIN'))),null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch((error)=>{console.error(error.message);process.exitCode=1;});
