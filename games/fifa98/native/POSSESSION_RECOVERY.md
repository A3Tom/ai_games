# Original bounded ownership transitions

`possession.c` recovers the original80074C64h ownership transition when the ball
has no current owner and the original precheck has no callbacks or team-wide
effects. It includes mandatory team-state helper8006246Ch in its claimed mode
and complete five-row ownership history800BCDF8h. It supplies the original owner
state changes for an explicit possession setup; it does **not** decide that a
player has contacted or acquired a ball. The same native file also recovers
matching-owner release80074E58h when its notification path requires no action
callback, including a separately proved single-controlled-actor no-op branch.
Claim and the two release entry points remain distinct guarded APIs.

`scripts/possession-recovery.mjs` exports
`inspectPossessionRecovery(backend)` and `possessionNativeExports`. Only
BECODE.BIN, size939136, base8005AE28h, SHA-256
`254e1c45e20df8415c00ac60933e997e61f16cc560db34d00ef0aaefda5ea1d0`
produces reviewed claims. The report contains fifteen source-region fingerprints,
twenty-two call edges, original fields and explicit missing acquisition conditions.
It executes no original instructions. Native identities are opaque tokens and
state arrays, not addresses in an emulated console memory map.

| Source region | Bytes | SHA-256 |
| --- | ---: | --- |
| 80074C64h ownership | 500 | `488ace54ea51ab036ee998786db76031dc5e1cc486f540ad72ad53647d5a4340` |
| 800A651Ch precheck | 292 | `5bfb92928e42c546ca9e85e5a425b36da83ca25cc24b00f9bbd20c3bb9fbd839` |
| 8006246Ch team fields | 160 | `1ec625cd9d5eb6100bfcba6d8762d008d7e62ad5a44fdd68e1eedf087e959c9d` |
| 800BCDF8h history | 268 | `0186e830dcb5ac6c5061fd4ce04cb099cc98c3ea8a350abb99a4fd9c16df0cd7` |
| 80075580h launch actor bookkeeping | 276 | `9febed8a11b53158eb9d295536f8183025f67eecee512cb184d60530cdaec0d5` |
| 80087CACh old-owner notification | 160 | `203e3befcbedbb546a6984e42701e74a3c75cef8337c0c6d7f6c48ac9a1325d3` |
| 80074E58h matching-owner release | 240 | `6d63a441efa8602782d1ed3108e214c52dd04357218118a4b40d30fc43106e5b` |
| 800A7878h controlled-actor selection | 724 | `51c9cd587233db12d67e158f307de589a6596003f8b97448c1857d0857ccaf7d` |
| 8005F4F8h preferred candidate | 260 | `d0a8140c511147c976520d6ebb39650adf9e864380eb8aacace1dd80a49c7e50` |
| 8005F5FCh controller-aware candidate | 280 | `dfe32d5e2294a2f4b7faa3ec69a99593e287648fcc64284bc8c3089c001c6144` |
| 8005F714h ball-side candidate | 284 | `52b11eddd198f380929cfb6a19e1cb20de6d6f31c82ecc0e93f4bba13425e8de` |
| 8005F830h fallback candidate | 224 | `c96af506feaef5847abe524c05b9a945ad9c499dd1d61df6052f54256ae7c30e` |
| 8005F910h candidate wrappers | 220 | `a73f5c1c3895dfbea20a58a6c572810fcaf63520959be099b55e660c8dfdd99c` |

## Original ownership behavior and supported guard

80074C64h first copies argumentbit0 into shared ballflags bit20h and clears
bit8. If the requested actor is already current owner, it calls800BCC60h with
argument0. That refresh path is not implemented here.

For a different actor, it calls800A651Ch. This precheck is a complete no-op if
global8013FE2Ch is nonzero. With that mode word zero, the supported no-op domain
requires opponent-team+1964 bit80h clear and new actor+492 zero. Otherwise the
source can clear actor+492 across teams, run800A645Ch, invoke800B14D8h and an
indirect callback. The native helper rejects such inputs before any state write.
No friendly player-role meaning is assigned to raw actor+4 or+492.

The source can transfer from an existing owner. It rotates prior owner fields,
may notify the displaced actor through80087CACh, and can clear the old actor's
attachment permission. These branches are not silently skipped: this native
entry requires current owner0 and a nonzero requested actor identity.

Within that exact unowned branch:

1. Clear source counter8013C5F4h.
2. If the new actor equals previous-owner8013C610h, replace that previous-owner
   field with prior-owner8013DF4Ch. Otherwise preserve both history identities.
3. Store new current owner8013C60Ch; clear counters8013C5ECh,8013C5F0h,
   8013C630h and8013C63Ch.
4. Store the actor at own-team+240. Clear own-team+292 if own-team+280 is null
   or if+292 equals the new actor. Preserve it in the other case.
5. Clear opponent-team+292 and+252. Clear own-team+252 only if it equals the
   new actor.
6. Call8006246Ch with argument1, then800BCDF8h.

The attachment actor8013DF30h is deliberately preserved in this unowned branch.
74C64h does not set current-update actor8013C634h, entityflag1000h, an animation
window, a ball marker, or a generic attachment permission. Those are separate
original caller/runtime obligations. The preceding already-owned ball test can
use this native transition to initialize owner state while still declaring its
other fixture inputs explicitly.

## Mandatory team state and ownership history

8006246Ch's argument1 path clears opponent-team+316. It sets own-team+316 to0
only if raw actor+4 is zero and either the **updated** previous-owner is zero or
the **updated** shared ballflags bit20h is set; otherwise it writes1. The native
implementation preserves this ordering, including the previous-owner rotation.
The source argument0/event4 path is not claimed by this inline mode1 helper.

800BCDF8h has no external calls. For a nonnull actor it:

- Clears global801398DCh.
- If raw actor+4 is nonzero, clears80139C44h when nonzero and80139C48h only when
  exactly1. Other numeric values of80139C48h are preserved.
- Clears80139C4Ch only when exactly1, independently of actor+4.
- Reads current unsigned-halfword index801398C8h and its actor record. If that
  record already equals the actor, it preserves the index and all rows.
- Otherwise advances0..4 cyclically, writes0 to the new row's halfword and the
  actor identity to its word. Original rows start801398A0h with eight-byte stride.

The native five-row representation excludes unused row padding. It validates
index0..4 and all row halfwords0..65535 atomically before writes.

## Native ABI and verification

The claim export is:

```
fifa98_possession_claim_unowned(actor5, sourceBit20Argument,
                               state10, teams8, history15)
```

| Buffer | Ordered fields |
| --- | --- |
| actor5 | identity, raw actor+4, raw actor+492, alternate-mode word, opponent-team+1964 flags |
| state10 | owner, previousOwner, priorOwner, sharedBallFlags, C5F4, C5EC, C5F0, C630, C63C, attachmentActor |
| teams8 | own+240, own+280, own+292, own+252, own+316, opponent+292, opponent+252, opponent+316 |
| history15 | 9C44, 9C48, 9C4C, 98DC, index, row0half, row0actor, …, row4half, row4actor |

The argument retains source AND1; its label describes the resulting bit20h,
not an inferred passing, pickup or possession button. Return1 means applied,
0 means an unsupported identity/owner/callback domain, and-1 means null or
malformed storage. Every rejection leaves all buffers unchanged. Native arrays
must be valid and distinct; there is no hidden retained ownership state.

Thirteen native tests read the already built main Wasm, check source/Wasm hashes
and no runtime imports, and cover all team/recapture branches, five-row wrap and
same-identity retention,24000 independent state fixtures, bit masking and atomic
guards. The release tests add all conditional notification/callback branches,
all twenty table entries, owner-history rotation, preserved five-row history,
18000 independently formulated state fixtures, and atomic release rejection.
Solo release adds a structural candidate-filter proof, another12000 state
fixtures and unsupported roster/controller-domain guards.
They also inspect the actual local source image without embedding its bytes.
Two static tests require unknown images to produce no reviewed claims.
No tests invoke a compiler or linker.

## Matching-owner release and callback-free notification

The release export is:

```
fifa98_possession_release(actor4, state10, teams8, notice2)
```

It reuses `state10` and `teams8` above. Its distinct `actor4` layout is
`[identity, rawActor4, rawActor48, attributeByte58]`; `notice2` contains
`[ownTeam296, actor308]`. These are explicit numerical fields, not original
machine addresses. Arrays must have valid distinct storage.

At80074E58h the source returns immediately for a null actor. A nonnull actor
clears C5F4 even if it is not the current owner; this API deliberately restricts
its domain to a nonzero matching owner and rejects mismatches **before any
writes**. That transactional guard is a new native API boundary, not a claim
that the complete original routine had no mismatched-owner side effect.

Inside the matching-owner branch, source80074E84h..80074EB8h preserves the old
previous owner in priorOwner, writes the released actor to previousOwner,
clears currentOwner and clears sharedBallFlags bit20h. C5F4 becomes zero.
Other flag bits and the other state counters remain unchanged.

Source80074EC4h..80074EF0h calls80087CACh only when raw actor+4 is zero and
own-team+252 does not already equal the actor. In that notification helper:

1. If raw actor+48 is nonzero and own-team+292 differs from the actor, it calls
   action helper800A7878h. The bounded API rejects this callback domain
   atomically; it never fabricates or silently skips an action callback.
2. If own-team+296 is zero, source loads attribute byte58 through actor+36,
   indexes the twenty reviewed words at80129354h, and writes that value to
   actor+308. Otherwise actor+308 is preserved.
3. It writes the actor identity to own-team+296 in either case.

The native implementation reuses the existing compiled
`fifa98_player_motion_profile(0,index58,0,1)` alternate-base table selection
and takes its first output. Its other returned profile arithmetic has no
external effects and is discarded. This avoids adding a duplicate source
table or a guessed numerical parameter. `attributeByte58` must be0..19 only
when the source notification would perform that lookup; when notification is
skipped or own-team+296 is already nonzero, the source does not read the index.
The report separately verifies that source table's eighty bytes with SHA-256
`18e4efbe208dd02c805a9eb8b6566de917063b6294945cefc6dff29414f5c4af`.
No mapping from this raw attribute to a named roster rating is inferred.

After notification, source80074EF4h..80074F28h clears attachmentActor only if
it equals the released actor. It **preserves** own-team+252 if that field
equals the actor, and clears the field otherwise, including another identity.
Own-team+240,+280,+292 and opponent-team+252,+292 are preserved by this release
branch. Its final8006246Ch(mode1) necessarily writes own-team+316=1 and
opponent-team+316=0: previousOwner is nonzero and shared bit20h was just cleared.

80074E58h never calls800BCDF8h. Previous/prior owner words rotate, but the
separate five-row history and its counters stay unchanged. Native release
therefore takes no history buffer and introduces no synthetic history entry.

Return1 means applied,0 means unsupported identity/owner/callback domain, and
−1 means null storage or a used attribute index outside0..19. All rejected
calls preserve the supplied outputs. A successful release does not choose a
launch, resolve contact, dispatch an animation or implement full80075924h.
An inspection adapter can compose this release with the existing numeric
launch and retain the resulting owner/team/notification snapshot, while
clearly keeping the test-launch setup separate from the missing action path.

## Coherent single-controlled-actor release

The controlled-player target-speed path800A5628h reads actor+48 as a nonnull
controller. Using a rawActor48zero release fixture for that same actor would
conflict with this existing condition. The additional export admits the
original nonzero controller field under a narrow source-proven condition:

```
fifa98_possession_release_solo(actor4, state10, teams8, notice2, roster2)
```

`roster2=[ownTeam1908Count,soleOwnTeam196Identity]` must contain count1 and the
released actor's identity. Actor+4 must be zero and actor+48 must be nonzero.
The matching-owner and conditional attribute-index guards still apply. These
are explicit one-player inspection preconditions, not a full eleven-player
team or a manufactured controller-transfer result.

Release clears currentOwner before entering80087CACh. When its ordinary
callback condition is true, source800A7878h receives this actor and mode1.
Inspection of its complete control flow establishes that every candidate
search returns null under the supplied one-player conditions:

| Source route | Why the sole actor cannot become a candidate |
| --- | --- |
| Direct roster scan at800A7908h | Candidate actor+4 is zero, rejected at800A7948h |
| 8005F93Ch → 8005F4F8h, then8005F830h | Both reject nonzero actor+48 before candidate distance selection |
| 8005F990h → 8005F714h, then8005F4F8h | Both reject nonzero actor+48 before candidate side/distance selection |
| Mode9 route8005F910h → 8005F5FCh | Wrapper passes requireRaw4=1; actor+4zero rejects even if the controller ID otherwise qualifies |

Each helper searches the same own-team roster, returns only a roster entry
or null, and has no non-stack stores or external calls. The wrappers add no
state changes. The direct search also normalizes a starting index against the
count, so a one-entry roster cannot select any other actor. Other source state
may choose among these routes but cannot make any route admit the sole actor.

Thus800A7AECh receives null and returns before8006004Ch or the own-team+280
clear at800A7B28h. This proves a no-op for the original selection function;
the native helper does not invent a callback return, execute a callback, or
pretend to implement general controller selection. Its common release code
then performs all original notification, owner, team and attachment effects
described above. The ordinary `fifa98_possession_release` guard remains strict
and continues to reject an unproved action-callback domain.

The solo export returns1 applied,0 unsupported solo/owner domain, or−1 for
null storage/used attribute-index rejection. It preserves outputs on every
rejection. Source read-only selection, ownership eligibility in a complete
match, and subsequent launch/action scheduling are separate concepts; proving
the first is a no-op does not recover the latter two.

## Acquisition and complete launch remain separate recovery work

80075580h is launch bookkeeping. It derives a per-side value from actor/team
fields, updates last-launch actor references, clears selected team pointers,
and stores its second argument at8013DF44h. It **never writes current owner
8013C60Ch**. It is not an acquisition helper or a complete release operation.

The acquisition caller scan found source predicates inside action-state
dispatchers, rather than a justified universal pickup radius:

- 8007394Ch..80073A08h checks action timing, an action-record flagbit1 and
  actor+236<128; it then gets an animation position, resets the ball, optionally
  calls80087D4Ch, claims ownership and grants attachment if successful. Its
  preceding state/action eligibility still needs recovery.
- 8006D8E8h..8006D9F8h is an action-state0 branch with ball integer-Y thresholds
  114,86 and33, plus facing and target-state checks. It cannot be turned into
  an unconditional low-ball pickup test.
- 80082918h claims after800881A4h,8006EB00h and8008A800h. The latter is a
  goal-area/side predicate, not an actor-to-ball pickup distance; the full
  caller's action and spatial entry conditions remain unresolved.

Other direct74C64h callers include8006C95Ch,8006D39Ch,8006DC6Ch,800817F8h,
80084BF8h,80090430h and80091518h. Some are scripted action/restart paths. The
next milestone must recover one entire eligibility path, or consume a proven
original player-contact result, before enabling automatic acquisition.

The collision callback slot80125D94h is initially zero;80074430h writes it,
but this scan found no direct JAL to that setter. That observation does not
establish the absence of indirect registration or a separate player-contact
system. Source geometry helpers initially investigated elsewhere describe
goalpost/net/roof contacts and do not establish player acquisition.
