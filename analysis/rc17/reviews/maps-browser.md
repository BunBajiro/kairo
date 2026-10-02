# RC17 Maps and dashboard browser correctness

## Result

The compiled candidate initially passed 16 bounded browser checks on 2 October 2026.
`npm run check:kairo` and the verified production build also passed. The browser
was Chrome 153.0.8010.52 using the restored local SwiftShader wrapper, at
1600 × 1000. This is correctness evidence, not a timing benchmark.

This run used the in-progress candidate before the final RC17 version bump
(the compiled footer still reads `0.8.0-rc.16`). It was not a frozen Git commit,
and the harness did not capture a source digest. Final source identity, the
completed SSE changes, and the packaged review build require the root's final
freeze and verification; this report does not claim to certify that later build.

Harness: `analysis/rc17/harness/maps-correctness.mjs`.
Successful evidence: `analysis/rc17/raw/maps-correctness-extended-2/result.json`,
with `collapsed.png` and `focus.png`. Both screenshots were visually inspected.
There were no captured browser runtime exceptions and no attempted external
server fetches. External browser image requests were blocked.

## Coverage

- One selected-pilot `/state` read during initial dashboard startup; default-off
  focus detail and independent node sizes initially at 100%.
- A real SSE connection is destroyed after a wallet snapshot changes without a
  broadcast. Reconnection fetches the missed state, keeps the Maps workspace,
  and does not display a dataset-update success notice.
- Independent 50% K-space and 150% J-space sizes; SVG connection ports stay
  attached to scaled cards; dragging persists canonical world coordinates.
- A new camera, after reloading saved 150% preferences for both node classes,
  fits every visible card within the viewport.
- An active animated zoom hands control to a pointer pan; its old animation
  cannot overwrite the final pan. Fit remains correct afterwards.
- Custom collapse removes interior DOM, retains real entry/exit nodes, and
  leaves all eight canonical nodes and seven canonical connections intact.
- A ready alternate pilot inside a collapsed group keeps its real system
  visible and can be followed. Pausing tracking removes that protection after
  clearing independent framing by remounting.
- Saved groups and sizes survive remount. Searching for a hidden group member
  reveals it and frames its final scaled dimensions. Opted-in focus detail keeps
  the selected system at full detail and preserves dragging.
- Ten invalidations coalesce into one active summary/detail read plus one
  retained pair; no concurrent summary reads occur.
- Pilot switching clears the scene and isolates preferences and saved groups.
- Real HTTP responses are held after the server has produced them, then released
  across map or pilot switches. Old detail cannot restore the wrong scene.
- A layout save accepted by the server persists on its original pilot/map while
  its delayed response cannot disturb the newly selected pilot's empty map.
- Controlled extension payloads verify that switching pilot hides old rows while
  loading and ignores a delayed superseded response. No test module or endpoint
  was added to production.

## Source review and limits

The display projection copies display nodes without changing canonical positions
or connections. Group precedence is deterministic, membership lists are bounded,
and camera transforms update explicit DOM references. Focus projection runs after
the camera settles, not on each animation frame.

Region and constellation groups currently save the systems present when created,
up to the 600-member limit. They do not automatically include systems added later.
The UI describes these as saved members. The browser checks use a custom group;
the separate pure-model tests cover geographic precedence and overlap.

Dashboard startup now leaves the first state request to the existing selected-pilot
effect. Its request sequence and pilot checks still reject obsolete responses.
Extension results are keyed by both module and pilot, with effect cancellation.

The first extended attempt is retained at
`analysis/rc17/raw/maps-correctness-extended/result.json`. It passed the initial six
listed checks and exercised ready alternate follow, then failed an incorrect
fixture expectation: replacing an ESI snapshot with an older stale sample does
not invalidate the map roster's still-valid last-location observation. The
successful attempt uses the real `pilot.tracking` command to pause the pilot and
tests that state transition. No production change was needed for this correction.

The first build attempt hit the sandbox's local-listen restriction during
prerender. Repeating the same build with authorised loopback access passed.
The build reported the existing large-chunk advisory; this review makes no bundle
size or performance claim from that advisory.

## Sheet stacking regression found by the full integration gate

The later full Universe integration run exposed a real regression: the new map
toolbar's stacking level (10) was above the existing workspace sheet (8), so the
toolbar covered the Map pilots heading and close button. The failed run and
screenshot remain under `analysis/rc17/raw/integration/universe-ui/`.

The production fix gives the toolbar stacking level 6: above the canvas, below
workspace sheets. The Display popover also now handles Escape and returns focus
to its trigger. No integration assertion or pointer hit-testing guard was bypassed.

The rebuilt `0.8.0-rc.17` candidate passes TypeScript and the verified build.
The external harness now contains a seventeenth check: on an empty map it closes
Map pilots using the real pointer target, repeats with the Display popover also
mounted, dismisses Display using Escape with focus return, and separately
dismisses the sheet using Escape. The other 16 checks still run in full.

Unlike the earlier run, this harness now records and verifies the complete
application source and compiled asset manifest before and after execution. Its
base is commit `ea769f9f9a1821496db5cc789c70d66751ba5710`, with the two-file sheet
fix explicitly recorded as uncommitted changes. Fingerprint:
`7e1aaeefaa28d131d858e8dc86355f7fb56ce6f5c60366ebcd46309349502c93`.
This is not a claim that the base commit alone contains the fix.

The first successful 17-check evidence is retained under
`analysis/rc17/raw/maps-correctness-sheets/`. Its sheet screenshot caught the
entrance fade mid-animation; a separate rerun under
`analysis/rc17/raw/maps-correctness-sheets-settled/` waits for the fade before
capturing the same overlap case.
