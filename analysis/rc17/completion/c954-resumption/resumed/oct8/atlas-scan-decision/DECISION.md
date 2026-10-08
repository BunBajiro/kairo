# M8 Atlas viewport scans — bounded no-change decision

**Retain the existing linear point/gate selection for RC17.** The saved diagnostics support this scoped decision without demonstrating a material reason to add a spatial index. They do not measure an index candidate, establish an index speedup, or close combined final-source/browser acceptance. M6 J-Space scene memoization is a separate finding.

The independent offline audit is in `audit.py` and `audit.json`. It checks original evidence and canonical source bytes; it does not run Kairo, Chromium or a performance workload. The source comparison is pinned to `22773cc7cb6e83ac51e412565ba65c101613536a`, with selected continuation `9afa9a7` as the pre-lazy-layout reference. The complete `paintRef.current` function is byte-identical between those commits. Applying the saved diagnostic instrumentation patch in memory to the pre-lazy map reproduces the exact instrumented map hash in the c954 source manifest. The projection math, operations, navigation, label/portal helpers, schematic layout and bundled Atlas also match saved source hashes. The intervening Atlas change concerns lazy projection ownership; it does not alter these scan predicates or drawing order.

## What was checked

Both original lanes report complete, source-verified, compiled-source-verified and cleanup-verified execution, with no recorded browser errors or external requests. Their matching source/build fingerprints and receipt hashes recompute correctly, and every pinned harness hash matches its recovered script. The original compiled binaries and referenced build log are no longer present locally for fresh byte rehash; this audit verifies their saved manifest/receipt chain and the source/completion checks recorded by the original harness. It does not relabel the historical compiled runs as a current-source execution.

The records contain **12 phases, 1,472 instrumented draw observations, 152 sampled camera positions and 3,800 selection-helper repetitions**. Every phase distribution was recomputed from raw frames. Each camera statistic averages 25 repetitions, and phase p50/p95 use the original nearest-rank rule. Camera coordinates and selected counts match every tenth draw frame. The original browser harness checked only point/gate counts against draw counters. This audit additionally reconstructs the ordered selected ID/edge arrays offline from the exact unchanged Atlas and predicates, matching all 152 saved ordered hashes. That strengthens consistency of the helper evidence; it is not pixel equality against a new index implementation.

| Phase | Draws / cameras | Selection camera-mean p50 / p95, ms | Instrumented draw p50 / p95, ms | System-label candidates | Label section p50, ms |
|---|---:|---:|---:|---:|---:|
| Physical overview, power blocs | 109 / 11 | 0.312 / 0.760 | 2.9 / 4.8 | 0–0 | 0.1 |
| Physical overview, activity | 101 / 11 | 0.292 / 1.016 | 3.4 / 6.4 | 0–0 | 0.6 |
| Physical zoomed, power blocs | 130 / 13 | 0.312 / 0.744 | 1.8 / 2.6 | 0–0 | 0.5 |
| Physical zoomed, activity | 132 / 14 | 0.308 / 0.992 | 2.5 / 4.8 | 0–0 | 0.6 |
| Schematic overview, power blocs | 109 / 11 | 0.304 / 1.004 | 2.6 / 4.6 | 0–0 | 0.1 |
| Schematic overview, activity | 105 / 11 | 0.688 / 0.864 | 3.1 / 6.9 | 0–0 | 0.6 |
| Schematic zoomed, power blocs | 130 / 13 | 0.324 / 0.916 | 1.5 / 2.2 | 0–0 | 0.5 |
| Schematic zoomed, activity | 131 / 14 | 0.236 / 0.816 | 1.9 / 3.2 | 0–0 | 0.5 |
| Physical labels, power blocs | 133 / 14 | 0.196 / 0.884 | 1.6 / 3.4 | 6–43 | 0.6 |
| Physical labels, activity | 130 / 13 | 0.192 / 0.768 | 2.0 / 3.5 | 28–139 | 0.9 |
| Schematic labels, power blocs | 132 / 14 | 0.212 / 0.976 | 1.7 / 2.4 | 15–56 | 0.8 |
| Schematic labels, activity | 130 / 13 | 0.216 / 0.780 | 2.2 / 3.1 | 52–153 | 1.2 |

The fixture is the bundled 8,490-system Atlas, with 5,485 known-space points and 6,989 gates, plus synthetic populated kills/jumps. Browser version is HeadlessChrome 138.0.7204.0. All individual samples remain available: the maximum selection-helper repetition was 4.7 ms, the maximum camera mean 1.016 ms, and the maximum instrumented draw observation 13.2 ms. The table's p95 camera means are not per-frame or individual-call p95 latency. Sample sizes per phase are 11–14 camera positions, often making nearest-rank p95 equal the maximum camera mean.

## Attribution and coverage limits

The first eight phases had **zero system-label candidates**. Their old generic “label-scale zoom” check is overbroad; the saved `COVERAGE.md` correction is valid. The separate four-phase deep-zoom supplement has nonzero candidates in every frame, ranging from 6 to 153. This exercises actual system-label selection and subsequent sorting/collision code, but the recorded count is candidates before collision, not a count of painted labels or a worst-case dense-label workload. The label boundary also includes territory/region labels. Original scale ranges vary between sequential backgrounds because motion continues; these phase differences are not a controlled causal activity-versus-politics comparison.

`visibleMs` brackets the point filter, while `gatesWithCanvasMs` includes the complete gate loop, Canvas path/stroke calls and hover-neighbor work. `systemsWithCanvasMs` includes visible-system/portal painting and candidate construction; `labelsWithCanvasMs` includes sorting, collision, text metrics and text painting plus territory/region labels. The warmed selection helper instead repeats point/gate predicates with selected-array allocations and excludes Canvas, React, workers and label collision work. These are diagnostic attribution quantities, not ordinary end-to-end frame speed; they cannot be subtracted to predict index gains. Boundary clocks have approximately 0.1 ms granularity in these records.

## Reason for the disposition and reopening trigger

Across the observed camera phases, point/gate selection camera-mean p50 is 0.192–0.688 ms. The draw handler retains painting, labels, collision checks and other work that a viewport index would not remove. No index build/update cost, retained-memory cost, ordinary paired speed comparison or index correctness has been measured. The evidence therefore supports keeping the simple existing selection for this workload rather than adding an unproven ownership/invalidation path.

The current point scan preserves Atlas point order and a 35-pixel margin. The gate scan keeps original gate order and retains crossings whose endpoints may both be offscreen. Any future index must preserve those rules, stable label-priority ties and hit/drawing order across projection changes, radar and Atlas replacement; indexing only visible endpoints would be insufficient. Reopen this decision if representative current-source profiling shows repeated material viewport-selection cost, a larger graph or denser overlays change the workload, or ordinary interaction latency remains unacceptable after its actual dominant work is identified. Then measure an isolated index with matched output/pixels, construction/update/memory costs and ordinary ABBA timings. This bounded decision makes no arbitrary-scale or all-hardware frame-rate claim.
