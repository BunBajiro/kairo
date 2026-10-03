# GitHub Maps camera comparison and compiled Maps check

The camera lane in [GitHub run 37078241973](https://github.com/BunBajiro/kairo/actions/runs/37078241973)
passed independently. At 600 nodes, mean renderer task work fell 63.0% for zoom
and 58.0% for pan against RC16. Both candidate repetitions were faster than both
RC16 repetitions for each measured camera action. Dense rendering remains a
limitation: candidate RAF p95 was 100.0–116.6 ms for zoom and 50.0–116.7 ms for
pan on this software renderer.

The overall workflow **failed** because the separate compiled Mapper harness
attempted to remove Chrome's profile before Chrome had exited. All 17 feature
checks completed, but that does not turn the failed lane into a pass. A
cleanup-only external harness correction has passed the same 17 checks locally;
its focused GitHub follow-up remains separate evidence.

## Evidence and independent acceptance

Evidence is retained under
[github-run-37078241973](../raw/github-run-37078241973/). Relevant records are the
[camera provenance](../raw/github-run-37078241973/browser-camera/provenance.json),
[summary](../raw/github-run-37078241973/browser-camera/summary.json), four camera
worker records, [retrieval record](../raw/github-run-37078241973/retrieval.json),
and [job conclusions](../raw/github-run-37078241973/github-jobs.json).

| Identity | Value |
|---|---|
| RC16 source | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |
| Internal candidate | `05d0d4b36c154329006d6772769063db874762da` |
| Analysis commit | `82394c58d0a7d8987877835b693f31f09c3c0d7f` |
| Camera interval | 2026-10-02 23:51:59.641–23:54:00.561 UTC; 120.9 seconds |
| Runtime | Node v24.19.0; Chrome 154.0.8037.57 |
| Runner | Ubuntu 24.04; AMD EPYC 9V45; 2 exposed logical CPUs; 8,323,969,024 bytes host memory |
| Renderer | ANGLE Vulkan / SwiftShader software rendering |
| Browser viewport | 1600 × 1050, DPR 1 |
| Map viewport | 1342 × 774.109375 in every sample |

The independent review checked the following against the raw worker records,
source manifests, run provenance and current frozen camera harness files:

- Exact ABBA order: RC16, candidate, candidate, RC16, with a fresh browser,
  process and database for each entry. The second pair reverses map-size order.
- Six distinct samples in every child: idle, zoom and pan at 100 and 600 nodes.
  Every child reports source verification and completion; the parent verifies
  all child exit codes, source/assets and unchanged harnesses before completion.
- Four camera harness hashes agree with run provenance and the source files.
  Baseline and candidate manifests match their recorded clean commits and
  fingerprints. The overall source/compiled-asset verification step passed.
- All entries use the same Chrome build, viewport and fixture digest:
  `1bdcd7885c7b62164663e1b21515c9a174e047f32db858cc8d6cb187c885077f`.
  Graphs contain 100 nodes / 139 connections and 600 nodes / 823 connections.
- All timed zoom actions start at exactly the same camera transform for their
  respective size. Final zoom equals the initial zoom × 1.25³. All pan actions
  change camera position while retaining zoom; background hit-tested origins
  match across entries at each size.
- Interaction RAF samples are nonempty and positive. Camera windows contain no
  API requests. Browser errors and external requests are empty in every entry.
- Canonical graph/coordinate checks and post-unmount request ownership checks
  passed; every entry created exactly one dashboard EventSource.
- Every numeric summary mean was recomputed from the raw sample values and
  matched the retained summary. No slower repetition was discarded.

The fixture and camera actions follow the
[bounded adapter method](../harness/BROWSER-CAMERA.md). Loading is outside timed
windows; focus detail is off and node sizes remain 100%. Observers for mutations
and forced-GC retention diagnostics begin after all camera timing windows.
The frozen RC16 harnesses were not changed.

## Camera work

Means below use two fresh browser repetitions per implementation. CDP renderer
task duration measures main-thread task work inside the action window, rather
than total process CPU or elapsed user wait. Script and style are component
measurements and must not be added to task duration.

| Nodes | Action | Task ms: RC16 → candidate | Task change | Script ms: RC16 → candidate | Style ms: RC16 → candidate |
|---:|---|---:|---:|---:|---:|
| 100 | Zoom | 1,014.40 → 669.12 | −34.0% | 164.51 → 13.76 | 589.50 → 327.26 |
| 100 | Pan | 382.84 → 254.40 | −33.6% | 151.73 → 25.56 | 22.91 → 21.22 |
| 600 | Zoom | 2,764.62 → 1,022.15 | −63.0% | 616.36 → 6.76 | 1,239.26 → 608.62 |
| 600 | Pan | 2,706.08 → 1,137.72 | −58.0% | 1,097.06 → 84.62 | 111.05 → 95.93 |

At 600 nodes, script work fell 98.9% for zoom and 92.3% for pan. Candidate zoom
still spent 608.62 ms recalculating styles, about 60% of its measured renderer
task work. That remaining rendering work is a useful target for a later pass.
This comparison measures the complete candidate and does not isolate the
effect of one production change.

| Nodes | Action | RC16 task range, ms | Candidate task range, ms |
|---:|---|---:|---:|
| 100 | Zoom | 953.06–1,075.73 | 660.40–677.84 |
| 100 | Pan | 311.28–454.39 | 242.69–266.10 |
| 600 | Zoom | 2,194.38–3,334.86 | 1,014.16–1,030.13 |
| 600 | Pan | 1,947.04–3,465.11 | 904.99–1,370.44 |

RC16's two dense-map repetitions differ substantially. The ranges still do not
overlap the candidate's task ranges, but two repetitions are insufficient to
attach statistical confidence to the exact percentage improvements.

Prescribed waits are included in elapsed windows: three zoom actions include
600 ms waits, and pan includes 24 pointer moves and a final 300 ms settle. Mean
600-node elapsed windows fell 2,800.12 → 1,859.69 ms for zoom (−33.6%) and
2,953.92 → 1,675.00 ms for pan (−43.3%). At 100 nodes, elapsed improvements were
only 0.1% and 2.9%, respectively. Lower task work is not an equal percentage
reduction in every user-visible wait.

The one-second post-warm idle samples are retained but not used to claim
sustained idle savings. RC16's first 600-node sample includes the final small
fit adjustment (roughly 0.05 pixels horizontally and 0.000012 zoom), plus style
work; other samples have variable settling costs. All subsequent timed zoom
actions begin from exactly matching settled camera coordinates.

## Frame observations and cleanup diagnostics

| Nodes | Action | RC16 RAF p95 range, ms | Candidate RAF p95 range, ms |
|---:|---|---:|---:|
| 100 | Zoom | 33.4–50.0 | 33.3–50.0 |
| 100 | Pan | 16.7–16.8 | 16.8–33.3 |
| 600 | Zoom | 183.3–400.0 | 100.0–116.6 |
| 600 | Pan | 100.0–183.4 | 50.0–116.7 |

Dense-map frame intervals improve while remaining well above a smooth
interaction budget. Candidate 600-node zoom maxima were 116.7 and 133.3 ms;
pan maxima were 133.4 and 116.7 ms. Pan intervals above the harness's 33.4 ms
threshold fell from 28/24 to 15/7. The 100-node p95 observations do not establish
a frame-smoothness gain and include a higher candidate pan p95 in one repeat.
These software-rendered observations do not predict desktop GPU FPS.

Post-GC active-map JavaScript heap was 23.20–23.41 MB for RC16 and 23.39–23.64 MB
for the candidate, with 23,327 versus 23,335 DOM nodes. There is no demonstrated
active-map footprint reduction. After two mount/unmount cycles both returned to
530 DOM nodes, 402 elements, one document, no map nodes and 611 listeners. One
candidate sample began at 610 listeners and finished at 611. An invalidation
after unmount caused no Universe request.

Across those cycles, JavaScript heap grew 0.67–0.70 MB in RC16 and 0.54–0.65 MB
in the candidate. Final retained heap was 7.00–7.02 MB and 7.06–7.08 MB,
respectively (decimal MB). This supports bounded DOM and refresh-ownership
cleanup, not reduced retained heap or freedom from long-duration leaks.

The separate whole-map-root mutation observer recorded 96 style mutations for
each RC16 entry and 87/90 for the candidate. Other attribute mutations rose from
207–208 to 382–391. The candidate's child-list count of 16 includes the same
observer scope as control text updates; it does not identify graph remounts.
Mutation counts do not measure React commits. Raw long-task counts also remain
diagnostic: callback delivery across sample boundaries can assign an entry to
the next window. Neither diagnostic supplies the performance conclusion.

## Compiled Maps assertions and cleanup follow-up

The original GitHub Maps result contains exactly the same 17 checks as the
successful local rerun, no browser exceptions or external requests, and a
verified candidate fingerprint. Independent screenshot inspection confirmed the
pilot sheet's header and close control above the Display toolbar, collapsed
interiors with boundary cards retained, and the focused selection display.
The full assertion list is in
[maps-browser/result.json](../raw/github-run-37078241973/maps-browser/result.json).

The old harness wrote `complete: true` before cleanup, so that field alone did
not describe its final process status. The Actions step failed with `ENOTEMPTY`
while removing the Chrome profile. The external harness now waits for Chrome's
close event after SIGTERM, uses a bounded SIGKILL fallback, and only then removes
the profile with bounded retries. It records feature completion separately from
overall completion, Chrome exit and cleanup status, while preserving an original
assertion failure if cleanup also fails. The 17 feature assertions and
production code were unchanged.

The focused local rerun
[maps-correctness-cleanup-1](../raw/maps-correctness-cleanup-1/result.json)
passed in 18.1 seconds against the same clean candidate: all 17 checks,
source verification, feature completion, overall completion and cleanup passed;
Chrome closed with code 0 before deletion. The original GitHub workflow remains
failed and its original evidence remains unchanged. A separate focused GitHub
run is required to close the CI cleanup issue.

## Scope

The accepted camera lane corroborates the direction of the
[separate local comparison](camera-results-local.md); absolute values and
samples are not pooled across hosts or Chrome versions. There is no 0.7.3
camera measurement in this adapter. Two map sizes do not establish asymptotic
or exponential scaling, and two repetitions do not establish broad hardware
performance. Backend map-count scaling, library loading, focus-detail benefits,
collapsed groups, Session replay and other workspaces use separate evidence.
