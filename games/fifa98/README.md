# FIFA 98 native reconstruction

The target is the original PlayStation FIFA: Road to World Cup 98 gameplay,
rebuilt as native game code compiled to WebAssembly, with online opponents and
editable teams and kits. The browser runtime must run without a console emulator
or a MIPS instruction interpreter.

**Current status: one-player movement, test-owned ball carrying and grounded/airborne launches run in native WebAssembly; matches are not yet playable.**
Recovered C code now includes simulation timing, rolling player-distance updates,
airborne drag/spin and source random state, grounded and lofted target-launch numerics,
original generated flight tables, animation-driven ball attachment and sprite phase,
isolated ground bounce/rolling, model coordinate/UV conversion, the original
grass grid, original player hierarchy/weighted skinning and motion delta decoding.
A new native triangle renderer displays 201 meshes across 34 original stadium
variants and the original high-detail player using their disc textures.
Recovered movement support now includes original heading/digital-direction
tables, speed profiles, controller targets, neutral stopping, steering, speed
limits and horizontal acceleration/displacement arithmetic. The control test
combines these with the original locomotion selector, supported looping keys,
per-key mirroring and retained sparse pose channels.
These remain partial player logic.
The preview
can edit team/player names, shirt numbers, squads and texture palettes, with
local persistence and versioned mod import/export. These edits are preparation
for the port; there is no recovered match engine or playable match yet.
The supplied BIN/CUE contains compiled PS1 code and assets, without source code
or a symbol map. This directory starts the reconstruction; it is not registered
as a playable game in the collection.

## Run the browser preview

Use Node.js 24 or newer, Clang with the `wasm32` target, and LLVM's `wasm-ld`.
No npm packages, console runtime or Emscripten SDK are required for this stage.
Install Clang and LLD through your system's package manager if needed. Optional
`FIFA98_CLANG` and `FIFA98_WASM_LD` environment variables select their executables.

```bash
# Extract once; skip this if .work/reference already exists.
node games/fifa98/scripts/reconstruct.mjs extract

node games/fifa98/scripts/build-native.mjs
node games/fifa98/scripts/prepare-web.mjs
node games/fifa98/scripts/serve.mjs
```

Open **http://127.0.0.1:5198**. The server exposes only the prepared preview
directory and binds to loopback. The browser loads the original assets locally;
there are no external CDNs or emulator downloads. Native output is written to
`.engine-build/` and prepared assets to `.work/web/`; both are ignored by Git.
Preparation refuses an existing destination. For another build, choose a new
directory and pass the same path to the server:

```bash
node games/fifa98/scripts/prepare-web.mjs --out games/fifa98/.work/web-next
node games/fifa98/scripts/serve.mjs --directory games/fifa98/.work/web-next --port 5199
```

Preparation verifies extracted assets against their inventory hashes, checks
the native build against every compiled C source, and compares every indexed texture's
WebAssembly output with the independent JavaScript decoder. It publishes the
directory only after validation succeeds. The preview uses 118 extracted PSH
containers containing 3,161 bitmaps. Another five standalone disc textures have
also been decoded independently; they are not included in this extracted set.
Stadium meshes receive a second native-versus-JavaScript check of the recovered
loader arithmetic before publication. Use the original stadiums tab to select a
day/night variant, drag to orbit, or adjust the camera sliders. All five recovered
pitch-size profiles are available. The grass grid contains 192 vertices and 165
quads; margin, dry-weather texture and neutral shading are explicit inspection
choices. Original match lighting, weather selection and pitch markings are not
recovered by this preview.

The **Player controls** tab lets you move one player on the original grass.
Select **Start control test**, then use arrow keys, W/A/S/D or hold the direction
buttons. Release to slow down; reset returns to the centre. While paused, focus
the pitch and press Space to advance a single source tick. Direction combinations,
neutral decay, target bounds, turning and acceleration use the recovered C
functions. Standing, walking, jogging and running use the original source action
selector and loop phase arithmetic. The child constructor's flag conversion
and original mirrored key application now allow the supported turning clips to
advance. Sparse output channels are retained across keys and clips in the
unlinked, discrete, zero-heading branch. Phase alignment, heading offsets,
callbacks and linked blending remain unfinished; action changes restart phase
as explicit inspection policy.
The test runs sixty source ticks per second for inspection, without claiming
recovery of the original wall clock. Its motion/attribute configuration is an
explicit source test fixture, not a named player or complete match initialization.
Original integer-to-render placement is recovered separately, including the
two-to-one coordinate conversion.

Press **C** or **Carry test ball** to start a test-owned ball at the player.
Original interpolated animation markers, attachment guards and bounded ground
follow arithmetic move it with the player. This supplies ownership explicitly;
it does not acquire a loose ball through contact. Press **B** or **Launch test
ball** to release that ball from its current fixed position. Without a test-owned
ball, launch places a new test ball at the player. Choose **Ground**, **Lofted**,
**Curved loft** or **Reverse curved loft**. Original generated flight tables,
vertical launch solver, spin selection, air motion and isolated ground physics
advance it to rest. Targets use the movement target, or a source-bounded forward
target when stationary; the original action target producer remains unfinished.
Sprite heading and four-state animation use consumed displacement and the
original visual scheduler. The camera can follow either object or show both.
Ground parameter10, loft duration index60, material0/0 and inspection cadence
are explicit fixture choices. Contact acquisition, kick-animation timing,
opponents, scoring, match rules and online simulation remain unfinished.
See [native/CONTROL_TEST.md](native/CONTROL_TEST.md).
Source sprite and palette evidence is in
[native/BALL_VISUAL_RECOVERY.md](native/BALL_VISUAL_RECOVERY.md); mirrored and
retained sparse-key evidence is in
[native/ACTION_TRANSITION_RECOVERY.md](native/ACTION_TRANSITION_RECOVERY.md).
Attachment and launch evidence is in
[native/PLAYER_BALL_RECOVERY.md](native/PLAYER_BALL_RECOVERY.md) and
[native/BALL_FLIGHT_RECOVERY.md](native/BALL_FLIGHT_RECOVERY.md).

The **Player motions** tab renders the original high-detail body and separate
head model with the original texture templates. The bright template colours
are source data; original face and kit composition remain unrecovered. The
`hhead.psh` face slots also contain shared template pixels, rather than forty
finished face images to select directly.
Select any of 503 clips, scrub its
keys, rotate the player or preview consecutive keys. Motion decoding, hierarchy
and weighted-vertex arithmetic execute in WebAssembly. The inspection cadence
is twelve keys per second; it is not a recovered match clock. The preview uses
unmirrored key poses, without interpolated transitions or gameplay motion
selection. Preparation compares all 12,192 skinned poses against an independent
JavaScript implementation before publishing, including all 12,192 head
attachments. Sparse clips retain the original `AAAAAA` key-zero base pose;
the supplied initializer's exact hash is checked in preparation and the browser.

The texture workshop supports palette changes, not arbitrary replacement kit
art or team-to-kit assignment. A zero colour word is transparent; nonzero
colours preview as opaque. Original polygon blend modes and the original match
drawing pipeline remain unresolved; the inspection camera uses new platform
rendering. Team and player changes are sidecars, not binary disc patches,
and do not affect a match until the native engine consumes them. The editor
starts with the original 1997 database; it does not fetch current squads/kits.

Export mods before moving browsers or clearing storage. Imports are validated
against the exact three-database fingerprint and known texture palette sizes.
The original databases, textures and BIN/CUE are never edited. The full roster
and asset files remain local generated data.

## Inspect and extract the reference

Run from the repository root with Node.js 24 or newer. No dependency installation
or native toolchain is needed for these tools.

```bash
node games/fifa98/scripts/reconstruct.mjs inspect
node games/fifa98/scripts/reconstruct.mjs extract
```

`inspect` prints a JSON inventory without writing files. `extract` creates
`games/fifa98/.work/reference/` with:

- `disc/`: the boot executable, both code overlays, SYSTEM.CNF, and indexed EA archives.
- `members/`: the exact bytes of named archive resources. Nested archives retain
  their original bytes alongside a `<filename>.members/` directory.
- `report.json`: extents, hashes, executable metadata, resource signatures,
  archive indexes, warnings, and the verified code-layout evidence.

The extraction output is ignored by Git and contains only local reference data.
The tools preserve the source files and refuse existing output destinations.
Choose a new destination for another extraction:

```bash
node games/fifa98/scripts/reconstruct.mjs extract --out /tmp/fifa98-reference
node games/fifa98/scripts/reconstruct.mjs inspect --bin /path/to/disc.bin --cue /path/to/disc.cue
```

The supplied CUE names a longer BIN filename than the actual `Fifa98.bin`. The
default command explicitly selects that BIN and reports the mismatch without
rewriting either source file. Other input must also use a single MODE2/2352 track
beginning at INDEX 01 00:00:00; other disc layouts are rejected.

The tools decode ISO9660 data, EA BIGF/C0FB archive indexes, SHPP/GIMX textures
(including their RefPack-compressed pixels), and the observed FCDB/STR0/STR1
roster structures. A structural reader also parses PCMD model records, including
the direct geometry used by stadiums. Unmirrored player key poses now apply the
original joint hierarchy, scale and weighted-vertex arithmetic. Gameplay motion
scheduling, mirrored/turning paths, streamed video and XA audio still need recovery.
Form2 audio/video sectors require a separate media decoder rather
than treating them as 2048-byte data sectors. Inspection failures appear in the
report; an invalid selected archive prevents publishing a partial extraction.

## Verified findings for this disc

The reference contains 237 ISO files. Recursive inspection validates 178 EA
archives (166 C0FB and 12 BIGF), containing 960 indexed members. Extraction writes
179 original disc files plus those 960 members, about 30 MiB in this checkout.

| Code image | Bytes | Load address | Entry called by bootstrap |
| --- | ---: | --- | --- |
| `SLES_009.14` | 251,904 | `0x80011800` | `0x80014fb8` |
| `FECODE.BIN` | 733,204 | `0x8005ae28` | `0x8007694c` |
| `BECODE.BIN` | 939,136 | `0x8005ae28` | `0x800dde64` |

The two overlays share a load address and replace one another. Code recovery
must keep their contexts separate. The bootstrap's full SHA-256, expected image
sizes, constant-loading instructions, direct call sites, entry bounds and heap
boundaries are checked before identifying this layout. Unknown builds return
`unsupported` without guessed overlay addresses. The report includes the exact
supporting instruction words; no instructions are executed.

The joined databases are `ZRESTDB.BIG/fcdb.dbi` (`FCDB`),
`ZRESTDB.BIG/fcdbpeng.dbi` (`STR1`), and `ZENGDB.BIG/fcdb_eng.dbi` (`STR0`).
They contain 109 league/group lists, 361 team records and 6,033 player records.
Every nonzero squad slot resolves to a player ID. Some league/group lists also
refer to 14 IDs without full team records; those references stay explicit.
The independent parser checks the supplied PS1 bytes against structures
documented by the [fifa98edit source](https://github.com/ma-akad/fifa98edit/blob/master/__init__.py#L573-L865).
It does not assume all PC data/game behavior applies to PS1.

Decoded player-texture containers include `ZFPLYTEX.BIG/*.psh` and
`ZGAPLAYR.BIG/jplyjers.psh` (`SHPP`/`GIMX`). Team/player IDs and squad slots are
joined; individual statistic meanings, palette-ID colours, team kit assignment
and texture-to-model mapping remain unresolved.

## Static recovery and native source

```bash
node games/fifa98/scripts/code-map.mjs > games/fifa98/.work/code-map.json
```

The static map keeps resident, frontend and backend contexts separate. For
this disc it finds 213, 867 and 1,645 function candidates respectively. These
are conservative control-flow candidates, not 2,725 recovered source functions.
Indirect calls/jump tables and instruction-like data need manual review.

Hash-verified review regions include the frontend menu-loop candidate
`0x80078c10`, the backend entry's loop `0x800de184–0x800de304`, and player-asset
setup `0x800d7578`. That setup loads `ZGMPLYR3.BIG`, which contains PCMD/STADEX
player models such as `nhigh.pc` and `nmedium.pc`.

`scripts/models.mjs` parses all ten files in that archive to exact EOF, including
materials, node records, weighted/direct vertex rows, and indexed triangles or
quads. The high-detail player has 160 weighted rows contributing to 113 unique
vertices and 154 polygons. Each vertex's observed weights sum to `100 * 65536`.
The original resident model loader establishes direct-coordinate conversion,
clamped/flipped UVs and the quad diagonal, now compiled in `native/model.c`.
Recovered skeleton transforms and weight application now produce animated
key poses through `recoverPlayerGeometry` and `native/model.c`. The
two trophy meshes have direct geometry with no weighted rows.

The original integer routines, their exact image/byte hashes, arithmetic,
call-site evidence and edge cases are described in [native/RECOVERY.md](native/RECOVERY.md).
Model-loader evidence is in [native/MODEL_RECOVERY.md](native/MODEL_RECOVERY.md).
Separate head loading and attachment evidence is in
[native/HEAD_ATTACHMENT_RECOVERY.md](native/HEAD_ATTACHMENT_RECOVERY.md).
Grass-grid evidence is in [native/PITCH_RECOVERY.md](native/PITCH_RECOVERY.md).
The module has no WebAssembly imports and executes compiled C directly.

The backend's frame loop leads through the match scheduler to simulation tick
`0x8006a3c4`. Two recovered routines on that path now run natively: the 16.16
time accumulator and a rolling update of each side's symmetric 11-column player
distance matrix. The original planar metric is preserved, including its integer
rounding and wrapping; it is not a Euclidean replacement. Their globals become
explicit C arguments. These support routines do not constitute a match engine.
The zero-spin airborne ball path also preserves the original rounded fixed-point
drag, gravity and position arithmetic. One bounded wrapper stops before ground
contact; another adds the recovered isolated-ground restitution and rolling-drag
branches using the original 2×5 material tables. It can advance a test trajectory
through bounces to rest. These explicit compositions omit original event records,
predictor special states, spin, posts, nets, walls and player collisions.
Full evidence and next recovery targets are in
[native/MATCH_RECOVERY.md](native/MATCH_RECOVERY.md).
The separate [ball motion](native/BALL_MOTION_RECOVERY.md) recovery now completes
the airborne spin routine and its six-word source random generator. The
[grounded launch](native/BALL_INTERACTION_RECOVERY.md) recovery adds the original
target-to-velocity calculation, corrected heading/trig, bounded fixed divide
and negative exponential table path. These remain numeric routines with explicit
arguments; original ownership, event/predictor initialization and player contact
must be recovered before they become a complete football action.

`scripts/animation.mjs` decodes 503 original motion clips containing 12,192 keys.
It preserves the original absolute channels, signed packed deltas and sparse
translation/quaternion masks, including the observed 121-channel variant.
The prepared `animation-index.json` records clip hashes, paths and counts.
The original pose-to-joint table and local quaternion matrix arithmetic are also
recovered. Preparation compares native and JavaScript local coefficients for
every decoded key and mapped joint, then the resulting weighted geometry.
The native decoder preserves signed packed deltas across little-endian halfwords.
Source-phase selection and verified prefix consumers are documented separately
in [native/MOTION_PLAYBACK.md](native/MOTION_PLAYBACK.md). Root-motion application,
turning, mirroring and original interpolation paths remain unfinished.
See [native/MOTION_RECOVERY.md](native/MOTION_RECOVERY.md); no guessed pose is used.

`scripts/player-recovery.mjs` verifies the original movement call path, ten code
regions and eight data tables before reporting typed native interfaces. The
horizontal integrator preserves piecewise acceleration/deceleration, split-step
displacement and the original quarter-sine heading table. Controller target-speed
selection preserves the original analog thresholds and flag update. The separate
control-target and steering modules now provide the missing direction-to-target,
neutral decay, heading, turning and speed-limit arithmetic for the isolated test.
Contacts, full action callbacks and the match dispatcher remain unfinished.
See [native/PLAYER_RECOVERY.md](native/PLAYER_RECOVERY.md),
[native/CONTROL_TARGET_RECOVERY.md](native/CONTROL_TARGET_RECOVERY.md),
[native/STEERING_RECOVERY.md](native/STEERING_RECOVERY.md),
[native/LOCOMOTION_ANIMATION_RECOVERY.md](native/LOCOMOTION_ANIMATION_RECOVERY.md)
and [native/PLAYER_PLACEMENT_RECOVERY.md](native/PLAYER_PLACEMENT_RECOVERY.md).

```bash
node games/fifa98/scripts/match-recovery.mjs
```

This command prints hash-gated disassembly, verified call sites and native ABI
mappings without executing console code. The prepared preview also includes
`match-recovery.json` for inspection.

## Remaining work toward a native match

1. Recover functions, globals and data structures in the boot and code overlays,
   starting at the verified entry points. Separate game logic from platform calls.
2. Continue translating identified original routines into maintainable native
   source and verifying their behavior using independently derived fixtures.
   The freestanding module establishes the initial WebAssembly build.
3. Complete player animation scheduling, turning and mirrored poses, and
   implement browser audio, original input handling and match timing.
4. Recover and validate match initialization, simulation, AI, physics and rules
   until one full authentic match works locally.
5. Feed the versioned roster/palette edits into the recovered game, add full
   kit-art replacement and verify changes in actual matches.
6. Reuse `packages/multiplayer` for lobby membership, readiness and invitations.
   Add opponent matching and a suitable real-time transport/synchronization design.
   The existing relay has no matchmaking and allows only 60 messages per minute
   per connection; it cannot carry match controls unchanged.

A static recompiler may assist code recovery, but its execution model needs
review. [PSXRecomp](https://github.com/RetroPortingToolKit/psxrecomp/blob/master/docs/EXECUTION_MODEL.md)
includes hardware simulation and interpreter fallbacks. Its experimental
[WebAssembly work](https://github.com/RetroPortingToolKit/psxrecomp/pull/14) does
not establish an interpreter-free FIFA 98 port. Neither is a runtime dependency
of these tools. Container documentation is available in
[PSX-SPX](https://psx-spx.consoledev.net/cdromfileformats/).

## Validation

```bash
node --test --test-isolation=none games/fifa98/scripts/*.test.mjs
# After building the native module:
node --test --test-isolation=none games/fifa98/native/*.test.mjs
```

Synthetic fixtures cover source preservation, ISO sector and extent checks,
archive bounds and paths, exact extraction and hashes, verified layout decoding,
unknown-build rejection, interrupted extraction, changed input, compressed
textures, database joins, PCMD model structures, mod validation and the local
preview server.
Native tests cover the recovered routines, all 65,536 palette colour words,
model coordinate/UV boundaries, shared triangle edges, depth across texture
batches, perspective-correct texture lookup, transparency and buffer limits.
They also cover original ball drag/gravity, isolated ground contacts, all material
table entries, bounce-to-rest trajectories, local quaternion coefficients,
hierarchical weighted geometry, packed motion deltas, source-phase selection,
player speed/control arithmetic and pitch generation across normal and extreme
integer inputs. Tests use no commercial
game assets. Separate local validation against the supplied reference verifies
asset hashes and native texture/model/pose conversion; this does not establish gameplay
compatibility or a working match engine.
