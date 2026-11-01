# Isolated browser player controls

`scripts/control-session.mjs` composes the recovered native functions into a
single horizontal player control test. `web/control-view.mjs` supplies browser
keys/pointers, a following inspection camera, an inspection map and an explicit
viewing clock. No console code is executed or interpreted in the browser.

This is a bounded reconstruction milestone, not a match. A test-owned ball can
follow original interpolated animation markers through the source attachment
and grounded predictor branch, then release through grounded or airborne source
launch numerics. Ownership is supplied explicitly by test setup. There is no
possession acquisition, player contact, kick-animation callback, opposition, AI,
scoring, referee, match initialization or multiplayer simulation in this test.

## Original behavior retained

The composition calls the source digital-direction mapper, controller target
construction and neutral decay, basic pitch-target bounds, target-distance store,
target-speed selection, steering, speed clamps and horizontal integration.
All those numerical decisions execute as compiled C. The adapter does not
replace steering with a keyboard-to-heading assignment, normalize diagonals,
tune acceleration or substitute host trigonometry for the source heading tables.

The control target uses integer positions obtained by arithmetic right-shift of
the original fixed X/Z words. Positions and velocities retain signed32 wrapping.
The original distance-sensitive speed cap stops the test player near the target
boundary. Position itself is not forcibly clamped by new browser movement code.

Source action-table initialization and the numerical locomotion selector also
run from verified115-bank resources. The native loop phase update advances
keys for plain-loop actions. Raw action flags are shifted right8 by the original
child constructor before checking runtime loop/mirror bits. Source sparse key
application now retains previous output channels across keys and actions,
mirroring only newly supplied channels with the distinct root/nonroot formulas.
AAAAAA initializes the first pose once. This selects the source unlinked,
discrete-key, zero-heading branch; linked blends, action-relative heading,
phase alignment/search and transition callbacks remain unfinished. Phase still
restarts on action changes as inspection policy. The constructor's initial category0, action-start unit rate and
thirty-tick category deadline are preserved. On the same action, a selector
companion rate0 leaves the child rate unchanged. Looping is determined by the
action record, not the similarly named MOP header bits. Linked, paused, held
or nonloop action previews display their known first key and do not fabricate
the missing phase/callback behavior.

Player drawing uses the separate native placement helper: signed high16 of the
fixed simulation XYZ, followed by the source doubled-short conversion and
Y-minus3 offset. Source camera-origin subtraction is replaced by the new
inspection camera. Fractional motion is retained in simulation but is not
invented as rendering interpolation. See `PLAYER_PLACEMENT_RECOVERY.md`.

See [CONTROL_TARGET_RECOVERY.md](CONTROL_TARGET_RECOVERY.md),
[STEERING_RECOVERY.md](STEERING_RECOVERY.md) and
[PLAYER_RECOVERY.md](PLAYER_RECOVERY.md) for source addresses, fingerprints,
argument adaptation, exact arithmetic and independent native tests.

## Explicit inspection configuration

This test does not assert recovery of live player initialization:

- Motion profile uses attribute-byte indices48=10 and58=10, attribute flags0
  and the normal base branch. These are source-index test inputs, not a named
  player's statistics.
- Attribute byte43=40 yields the original turn coefficient10 through
  `min(byte43 >> 2, 12)`.
- Motion flag16 selects the source face-movement branch. The complete dispatcher
  normally recomputes these flags per update; the test reapplies this explicit
  configuration per step.
- Linked owner flags36=`0x900` select the source caller's horizontal movement
  and steering branches. Animation-availability bit`0x200` is clear, so the
  original animation-request helper provably returns zero without side effects.
  This is an explicit source branch, not an invented callback return.
- The desired-facing reference equals the current player position. The original
  zero-delta branch at`0x800a6020..0x800a6054` retains current facing. Live
  action/ball-dependent reference selection is not reproduced here.
- Profile2 uses controller limits1824/2544 and inner bound228, extracted from
  the original pitch initializer. Controller dimensions are half the values
  used to construct the grass mesh. Basic bound mode0 is selected explicitly;
  the compact profile's alternate behavior is not exposed by this test.
- The browser advances60 source ticks per second for inspection. This does not
  establish the original seconds-per-tick conversion. The one-tick button can
  exercise the same code without a wall clock.

Native steering returns an unsupported-animation request before committing
state if a configuration would require unrecovered callback effects. The
composition stages offsets, target, speed and steering in separate transfer
buffers and commits public state only when every helper succeeds. It never
claims callback success. Original full movement height, contacts and remaining
caller side effects remain outside this composition.

## Browser behavior and checks

C or **Carry test ball** starts a test-owned ball at the player's fixed X/Z,
with zero velocity, spin and source visual accumulator. On each source update,
the original neighboring key prefixes and fraction produce the world ball
marker. Original high16/Y-minus8-floor0 conversion, equal nonnull ownership
guards and pending flag40 select the grounded follow branch. The original
rounded reciprocal and component clamps move the ball toward its source anchor;
the adapter does not teleport it to an invented player-relative offset. This
fixture supplies three equal opaque ownership tokens and entity attachment
flag1000h; it does not implement contact acquisition or action-window callbacks.
The locomotion selector updates source owner byte36. Under the fixture's
`flags&2100h==100h`, category byte0 selects current facing; a nonzero category
selects movement heading. Both add the original signed action heading offset
for the marker's negative-angle rotation. Marker prefixes remain unmirrored
inputs; the native helper mirrors them once. Positive marker-anchor Y requires
unrecovered contact behavior and is rejected before public ball state commits.

B or **Launch test ball** releases a test-owned ball from its existing fixed
position. Without a test-owned ball it starts a fresh ball at the player's fixed
X/Z and zero Y, preserving the earlier explicit launch fixture. Neither operation
replaces a recovered kick animation event. When the movement target equals the
integer player position, the source analog target constructor receives current
facing and nonzero magnitude to supply a bounded forward target. Otherwise the
actual controller target is used.

The ground fixture selects positive source parameter10, material row0/column0,
options0, seed0 and zero spin. Parameter10 is an inspection input, not a named
power/statistic. Zero spin is also written by the source launch wrapper's reset.
The original launch's25-speed test can select its35-speed fallback; no new
speed clamp or tuning curve is added.

Lofted tests use original duration index60 and wrapper spin selectors2 (zero,
no random draw),0 (sample source spin table) or1 (sample and negate). Source
mutable flight-factor and heading-compensation tables are generated from their
original recurrences, not read from uninitialized overlay globals. The original
vertical solver, speed caps and heading correction produce velocity; source
airborne drag, curve, spin decay, gravity and isolated floor bounce then apply.
Duration60 is not a recovered action default or a seconds conversion. The original
stored action target constructor is also recovered separately; live controller
targets remain explicit inspection inputs for these launch tests.

The free ball advances one source tick at a time. Owned-ball groups use the
original constant-velocity no-contact predictor subset. Both stop before an
unhandled pitch-boundary contact, with position and velocity retained; they never
invent a wall bounce, goal or restart. The source sprite uses original placement
and billboard geometry with the new inspection camera. Sprite roll phase uses
the original main-path scheduler: source displacement norm of the last consumed
sample, multiplied by the number of consumed ticks, with the original piecewise
rates and four-state mask. Heading uses that same final horizontal displacement
and retains its prior value at zero displacement. These calculations run once
per consumed group; they do not use the predictor's next drag-updated velocity.
The original1024-angle heading is not obtained by shifting the separate
full-resolution launch angle. The camera can follow the player, follow the ball,
or widen to show both. The small map and framing use new platform geometry;
they do not modify simulation state or claim an original match camera.

See `BALL_INTERACTION_RECOVERY.md`, `BALL_MOTION_RECOVERY.md`,
`BALL_FLIGHT_RECOVERY.md`, `PLAYER_BALL_RECOVERY.md`,
`BALL_VISUAL_RECOVERY.md`, `BALL_VISUAL_PHASE_RECOVERY.md` and
`ACTION_TRANSITION_RECOVERY.md` for detailed source branches, argument domains
and omitted dependencies.

Arrow keys and W/A/S/D feed the original low-nibble mapper. Opposing directions
remain intact until the original mapper decides their result. Each physical key
and pointer is tracked separately. Tab changes, focus loss and document hiding
clear input; tab changes and hiding also pause the test. A long hidden interval
cannot become a burst of catch-up movement. Reset returns the explicit fixture
to its initial state, and failed loads or rendering disable dependent controls.

Control-session tests cover acceleration, neutral stopping, reversal, original
target limits, opposing inputs, failed-step atomicity, snapshot immutability,
reset and two sessions sharing native transfer storage. Separate input tests
cover aliases, repeats and multiple pointers; scene tests distinguish world
displacement from camera framing and verify no source geometry is mutated.
