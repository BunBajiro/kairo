# Local Maps camera comparison: RC16 and internal RC17 candidate

The matched camera workload shows lower renderer work in the internal RC17
candidate at both measured sizes. At 600 nodes, mean renderer task time fell
53.2% for zoom and 57.4% for pan; script time fell 96.2% and 88.5%, respectively.
Both candidate repetitions were faster than both RC16 repetitions for each
camera action. Dense-map rendering remains expensive: candidate zoom still had
116.7–150.0 ms RAF p95 intervals on this software-rendered host. These results
support the camera refactor, with further rendering work remaining.

The four-entry run completed successfully in 116.0 seconds on 2026-10-02. Raw
evidence is in [local-refined-camera-3](../raw/local-refined-camera-3/), including
[provenance](../raw/local-refined-camera-3/provenance.json), the four worker
records, and the generated [summary](../raw/local-refined-camera-3/summary.json).
This report covers that run only. Earlier failed adapter attempts are excluded.

## Provenance and matched workload

| Item | Value |
|---|---|
| RC16 source | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |
| Internal candidate source | `05d0d4b36c154329006d6772769063db874762da` |
| Source/build verification | Both checkouts clean; full source and compiled asset manifests verified before and after; harness hashes unchanged |
| Execution order | RC16, candidate, candidate, RC16; fresh application, database and browser profile for each entry |
| Size order | First pair: 100 then 600 nodes; second pair: 600 then 100 |
| Graphs | 100 nodes / 139 connections; 600 nodes / 823 connections; same canonical IDs, positions and connections across all entries |
| Fixture origin | Original RC16 browser fixture's breadth-first traversal from Jita, bundled gate order, 340 × 240 grid |
| Browser | Headless Chrome 153.0.8010.52; ANGLE Vulkan / SwiftShader software rendering |
| Host | Node v24.19.0; AMD EPYC 9V74; 9 exposed logical CPUs; 10,451,464,192 bytes host memory |
| Viewport | Browser 1600 × 1050 at DPR 1; map viewport 1342 × 774.109375 in every entry |
| Candidate preferences | Focus detail off; all node sizes 100% |

The source and asset fingerprints and exact harness hashes are recorded in
`provenance.json`. The canonical fixture digest was
`1bdcd7885c7b62164663e1b21515c9a174e047f32db858cc8d6cb187c885077f`.

Map loading is outside the timing windows. Each size receives a warm fit, zoom
and fit, followed by a one-second idle sample, three 1.25× zoom-button actions
with 600 ms waits, and a 24-step middle-pointer pan with 20 ms spacing and a
300 ms final settle. Pan origins are hit-tested on actual uncovered background
before measurement and must match across entries. Final zoom and changed pan
transforms are asserted. Interaction samples require nonempty, strictly positive
RAF intervals. No timed window made an API request. All graph-preservation,
source, viewport, gesture, browser-error and external-request guards passed.

This is a new bounded adapter under `analysis/rc17`; the frozen RC16 harnesses
were not edited. See [BROWSER-CAMERA.md](../harness/BROWSER-CAMERA.md) for the
reproduction command. The adapter has no 0.7.3 camera lane: a three-version
whitepaper must label this camera comparison **0.7.3 not measured**, rather than
substituting an older unrelated browser number.

## Renderer work during camera actions

Values below are means of two fresh browser repetitions per implementation.
CDP task duration measures renderer main-thread task work in the sample window;
it is neither total process CPU nor elapsed user wait. Script and style are
component metrics and must not be added to task duration.

| Nodes | Action | Task ms: RC16 → candidate | Task change | Script ms: RC16 → candidate | Style ms: RC16 → candidate |
|---:|---|---:|---:|---:|---:|
| 100 | Zoom | 1,099.06 → 715.76 | −34.9% | 151.70 → 12.00 | 598.88 → 351.59 |
| 100 | Pan | 315.16 → 247.86 | −21.4% | 105.41 → 21.71 | 20.38 → 21.65 |
| 600 | Zoom | 2,372.77 → 1,110.42 | −53.2% | 328.10 → 12.45 | 1,212.74 → 641.28 |
| 600 | Pan | 2,253.02 → 959.58 | −57.4% | 640.39 → 73.93 | 105.36 → 99.07 |

The observed task-duration ranges do not overlap between implementations:

| Nodes | Action | RC16 range, ms | Candidate range, ms |
|---:|---|---:|---:|
| 100 | Zoom | 1,058.73–1,139.39 | 689.18–742.34 |
| 100 | Pan | 313.14–317.19 | 244.29–251.43 |
| 600 | Zoom | 2,226.95–2,518.59 | 1,051.29–1,169.56 |
| 600 | Pan | 2,217.24–2,288.81 | 917.05–1,002.12 |

This is consistent with the intended reduction in camera-related JavaScript
work. It does not isolate one production change from the complete candidate.
At 600 nodes, candidate zoom still spent 641.28 ms in style recalculation within
1,110.42 ms of task work. The remaining cost warrants attention to the rendered
scene and style updates. At 100 nodes, pan style work increased by 1.27 ms even
though total task and script work decreased; the pass did not improve every
individual metric.

Mean one-second idle task samples were 2.30 → 2.88 ms at 100 nodes and
12.45 → 10.96 ms at 600 nodes. These small, variable idle values do not establish
an idle improvement or regression. Neither implementation recalculated styles
in an idle sample.

Elapsed action windows contain intentional waits. Mean 600-node zoom elapsed
time was 2,412.47 → 1,865.62 ms (−22.7%); pan was 2,508.62 → 1,333.22 ms (−46.9%).
The 100-node zoom window changed only 0.5% because its prescribed waits dominate.
Task-work reductions must not be presented as equivalent reductions in every
user-visible action's duration.

## Frame intervals and remaining rendering limits

These are observed per-run RAF p95 ranges, not confidence intervals or desktop
GPU frame-rate estimates. The two repetitions retain their exact samples in
`summary.json`.

| Nodes | Action | RC16 RAF p95, ms | Candidate RAF p95, ms |
|---:|---|---:|---:|
| 100 | Zoom | 33.4 | 33.3–33.4 |
| 100 | Pan | 16.7–16.8 | 16.7–16.8 |
| 600 | Zoom | 183.4–216.6 | 116.7–150.0 |
| 600 | Pan | 100.1–116.6 | 33.4–50.0 |

The candidate substantially improves dense-map pan intervals. Its two 600-node
pan runs had 3 and 7 intervals over 33 ms, compared with 26 and 27 for RC16.
However, the candidate's maximum pan intervals were still 116.6 and 133.2 ms;
zoom maxima were 149.9 and 166.7 ms. This case remains visibly stall-prone under
the measured software renderer. At 100 nodes, lower main-thread work did not
produce a clear change in the sampled p95 interval.

Raw long-task observations are retained as diagnostics. Their observer gates
callback delivery by the current sample rather than filtering each entry's
start timestamp, so an entry delivered across a sample boundary may be assigned
to the next window. This report does not use those counts to establish an
improvement. CDP duration deltas and RAF observations support the conclusions
above independently.

## Ownership, DOM and memory diagnostics

Mutation observation and forced-GC snapshots run after **all** timing windows.
They therefore do not contaminate the measured camera comparisons. The
mutation observer covers the whole map root. Style mutations were 96–100 for
RC16 and 84 for the candidate, while other attribute mutations increased from
207–216 to 373. The recorded child-list count was 0 versus 14; this scope includes
control text updates and does not identify graph-node remounts. None of these
numbers measures React commits or proves a reduction in scene reconstruction.

With the 600-node map active, post-GC JavaScript heap was 23.19–23.50 MB for RC16
and 23.32–23.56 MB for the candidate (decimal MB). DOM node counts were 23,327 and
23,335, respectively. The candidate's additional controls remain present in
these counts. This run provides no evidence of reduced active-map heap or DOM
footprint.

After two further map mount/unmount cycles, both implementations returned to
Overview with 530 DOM nodes, 402 elements, one document and zero map nodes.
Final listener count was 611 in all entries; one candidate entry began at 610
and ended at 611. A scoped map invalidation after unmount caused no Universe
request, and every entry used exactly one dashboard EventSource.

JavaScript heap grew across those bounded cycles in both implementations:
RC16 gained 0.65–0.66 MB and the candidate gained 0.57–0.71 MB. Final retained
heap was 6.95–7.02 MB for RC16 and 7.01–7.18 MB for the candidate. The result
supports the tested DOM and request-ownership cleanup. It does not establish
lower retained heap or the absence of a long-duration memory leak.

## Failed adapter attempts and limits

Two earlier attempts remain available for audit and contribute no measurements
to this comparison:

- `raw/local-refined-1/browser-camera`: the inherited fixed pan point landed on
  a connection after zooming the dense fixture. The unchanged-camera guard
  failed correctly. The adapter now hit-tests uncovered background before the
  timing window and requires matching relative coordinates across entries.
- `raw/local-refined-camera-2`: the adapter dispatched a synthetic select-change
  event when the desired map was already selected during the diagnostic phase.
  That is not a native select interaction. The helper now avoids the unchanged
  selection event and retains the full map-readiness assertion.

Both corrections were confined to the external adapter; neither changed the
production candidate or weakened the camera/graph checks.

Two fresh repetitions on one host establish a bounded paired result. They do
not establish statistical confidence, asymptotic scaling, broad hardware
coverage, app-wide CPU use or leak freedom. Only 100 and 600 populated nodes are
measured; these points cannot determine whether scaling is exponential. Map
library loading, backend list/detail costs, focus-detail benefits, collapsed
groups, Session replay and other application workspaces have separate evidence.
Absolute values here must not be pooled with GitHub-hosted or older checkpoint
timings. The useful follow-up for camera work is to profile dense-scene style
and rendering costs on representative desktop GPUs, while retaining this
matched workload and its correctness guards.
