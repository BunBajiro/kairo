# Bounded Maps camera comparison

This external adapter keeps the old RC16 harnesses frozen. It reuses the original
browser fixture's breadth-first traversal from Jita, bundled gate order and
340 × 240 grid positions, retaining the 100- and 600-node cases (two maps, 700
nodes total). The same canonical graph and coordinates must survive every run
and all camera actions. Map loading is outside the timed camera windows.

Run only after the coordinator grants the local timing lane:

```sh
KAIRO_BASELINE_MANIFEST=/absolute/rc16-source.json \
KAIRO_CANDIDATE_MANIFEST=/absolute/rc17-source.json \
KAIRO_CHROME_PATH=/tmp/kairo-chromium \
node analysis/rc17/harness/browser-camera-run.mjs "$RC16_ROOT" "$CANDIDATE_ROOT" "$OUTPUT_DIR"
node analysis/rc17/harness/browser-camera-summary.mjs "$OUTPUT_DIR"
```

The runner acquires `/tmp/kairo-rc16-benchmark.lock` itself; do not wrap it in
another `flock`. Both frozen checkouts must be compiled before capturing their
manifests. Full source/asset manifests and harness hashes are verified before
and after. Each ABBA entry uses a fresh app process, browser profile and synthetic
database. The second pair reverses the map-size order. Expected total runtime is
roughly 90–120 seconds, subject to host speed; correctness waits fail rather than
silently skipping work.

At each map size, warm fit and zoom prepare the camera, followed by one-second
idle, three 1.25× zoom-button actions (600 ms between actions), and the original
24-step middle-pointer pan. Timings use CDP renderer TaskDuration, ScriptDuration,
RecalcStyleDuration, LayoutDuration, counts, and sampled long tasks. An RAF
interval observer runs only in interaction windows. Final zoom and changed pan
transforms are asserted so a missed gesture cannot look like an optimisation.
The candidate's focus setting remains off and all node sizes remain 100%.
The pan origin is chosen before timing by real hit-testing of uncovered viewport
background; its viewport-relative coordinates must match across the four runs.
This avoids an inherited fixed point selecting a connection after zooming a dense
map. The 24 pointer moves, spacing and displacement remain the original workload.

After **all** timed windows, a separate MutationObserver reports style/attribute
and child-list mutations during the same zoom/pan actions. This does not count
React commits, and its observations are not timing evidence. Settled forced-GC
heap/native DOM snapshots are taken on the 600-node map and on Overview before
and after two mount/unmount cycles. The final scene must contain no Maps nodes
and a scoped map invalidation must trigger no unmounted Universe request. Exactly
one dashboard EventSource is required. No Session replay pass is included.

This is a paired camera workload, not the original full browser benchmark.
Absolute timings must not be pooled with older checkpoint or other-host results.
Two browser repetitions per application give bounded comparative evidence, not
a confidence interval or an exhaustive leak test. Linux headless software
rendering cannot establish desktop GPU frame rates or total app/process CPU.
