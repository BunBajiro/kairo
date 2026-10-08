# R1 replay: exact-a7 bounded acceptance

8 October 2026. **Retain the existing replay timeline preparation.** The fresh compiled gate passes output parity, source/build provenance and cleanup. Distinct-geography playback improves in both nearest pairs; repeated-geography playback is broadly neutral. No ordinary task row meets the predeclared repeated >10% and >1 ms adverse rule. This supports the R1 component decision, not clean RC17 or final combined release acceptance.

The candidate is clean `a7b1bf97b0073695926c443e52d523638e59e48d`; the baseline changes only `components/kairo/session-replay.tsx` to the preserved direct-scan implementation (`ebae48030dc69cbea81daaef2d091c0832e464adeaf9c06d3ddcd71dba4622a9`). The helper may exist in the baseline source but is not called by that component. Both independent roots passed type checks and fresh production builds. Source/build manifests, loaded-asset hashes and exact status/file-delta checks passed before/after all workers. Node24.19.0 and pinned HeadlessChrome138.0.7204.0 were used; exact executable hash and CDP revision are in `attempt1/completed.json`.

## Whole-window ordinary results

All shapes have 1,000 visits. `repeat-small` has 11 distinct systems/200 events, `repeat-cap` 11/10,000 and `distinct-cap` 1,000/10,000. ABBA used four fresh processes per shape. Each has the unchanged historical preparation window and two six-second 60× playback windows, at start and fixed midpoint. Table values are the mean of two observations per arm (also their two-point median); percentages are candidate minus baseline. These windows include Atlas drawing, React, layout/style and browser task work, not only timeline lookup.

| Shape | Window | Baseline task ms | Candidate task ms | Task delta | Nearest AB / BA | Script delta |
|---|---|---:|---:|---:|---:|---:|
| repeat-small | prepare | 252.874 | 257.472 | +1.82% | +20.78% / -14.03% | +6.56% |
| repeat-small | playback-start-60x | 1533.126 | 1570.530 | +2.44% | +1.66% / +3.23% | +5.21% |
| repeat-small | playback-middle-60x | 2188.414 | 2244.067 | +2.54% | +11.68% / -5.56% | +0.24% |
| repeat-cap | prepare | 265.160 | 309.493 | +16.72% | +0.00% / +36.30% | +3.34% |
| repeat-cap | playback-start-60x | 1964.101 | 1973.602 | +0.48% | -1.25% / +2.22% | -3.09% |
| repeat-cap | playback-middle-60x | 2465.579 | 2437.158 | -1.15% | -6.23% / +4.40% | -7.73% |
| distinct-cap | prepare | 279.508 | 262.279 | -6.16% | +6.14% / -17.28% | -7.55% |
| distinct-cap | playback-start-60x | 1953.462 | 1810.918 | -7.30% | -3.04% / -11.58% | -8.49% |
| distinct-cap | playback-middle-60x | 2436.261 | 2200.306 | -9.69% | -14.76% / -4.58% | -8.54% |

Retain the adverse rows: capped repeated preparation increases 44.333 ms /16.72% in the arm means, but its nearest pairs are +0.001 ms and +88.667 ms (+36.30%). Small preparation's first pair is +47.839 ms/+20.78%; its opposite pair is −38.642 ms. Small midpoint's first pair is +240.261 ms/+11.68%, with the opposite pair −128.954 ms. Small playback script increases5.21% at start. These are observed costs, not declared measurement error. No row triggers the repeated material task rule, and no rerun was selected to replace them. `SUMMARY.json` retains all task/script/layout/style/heap/draw values, both pairs and every raw sample, including long-task and frame summaries.

## Output and ownership gates

All16 workers pass the15 post-timing rendered parity controls,240 checks total, against an independent direct-scan oracle built from the actual saved HTTP replay body. Home, exactly500 minutes and End match current location/time/range, newest-five event summaries/time/location/order, timeline tick count, and enabled/disabled previous/next event/system targets. All controls run after the three ordinary sample windows. Existing preparation checks retain route cardinality/order/hash and natural/backward/end, pilot and unmount behavior. No application exceptions, stale unmounted requests or forbidden server requests occurred. One EventSource per worker is retained. These checks do not claim pixel/trail rendering proof or replace existing tie/gap/overlap helper tests.

Every worker's result is written as complete only after actual Chromium exit, app close and scratch cleanup succeed. The wrapper verifies that receipt; all16 passed. There was no failed or replaced worker. Original historical harness bytes remain unchanged; this lane's worker SHA is `5c2e075f7c8cd7d1d427dcb49f9ccf64ec63bcdfdf43cbe13080d0dfa582c1ea`.

## Separate retention and sampled attribution

Forced-GC retention is a separate distinct-cap worker per arm with a warmed navigation cycle and one two-cycle batch. Baseline cleared heap rises from8,999,836 to9,562,144 bytes (+562,308); candidate from9,005,664 to9,562,536 (+556,872). Both end with583 DOM nodes,613 listeners and432 rendered Overview elements; no replay controls/canvases remain. Listener sets and targets remain stable. The candidate ends392 bytes above baseline. This is matched near parity with a shared warmed-batch increase, not proof of zero leaks or a long-run plateau.

Two playback CPU profiles per arm are independently validated and hashed. Exact compiled replay-hook ranges are retained in `SUMMARY.json`: inclusive sampled weight is33.383/42.028 ms baseline versus6.543/6.541 ms candidate at start/midpoint. This is consistent with removal of repeated row scans/parses and the earlier deterministic operation-count oracle. It is a separate instrumented observation, not an ordinary percentage or an exact cost census. The exact canvas draw callback remains dominant:295.723/286.015 ms baseline and288.059/262.470 ms candidate self weight, excluding its native descendants. `measureText` remains substantial. No renderer rewrite follows from the R1 decision.

`attempt1/completed.json` records all16 workers, their profile/response hashes and source fingerprints. `SUMMARY.json`, reproducible `summarize.py` and the bank inventory point to the unabridged evidence. Final combined source tests/build/package/CI remain owned by the release gate.
