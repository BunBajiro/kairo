# Maps and Atlas audit at the user-selected c954 checkpoint

> **Historical c954 audit:** use the [current issue ledger](resumed/CURRENT-ISSUES.md) for live status. The original pending labels below do not reopen evidence-backed decisions recorded there.

Audited 7 October 2026, after the user selected test build **#54**, source
`c954c0d808847f249df0659ed15fdce2e89f84c4`. Test build #55/source
`508f2d450c7cc17cc464cf316b80748367adc9e2` is excluded. This audit does not
adopt its changes or certify a clean RC17. PR #10 must remain withdrawn.

The active completion checkout was at 508 during this audit. All source reads
below instead use `kairo-maps-c954-frozen`, with the key files compared byte for
byte to `git show c954:<path>`. The exact c954 source/build fingerprint is
`472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27`.
The retained manifest is `../maps-final/c954-source.json`; its fingerprint matches
`../verification-next/build-receipt.json`. No source edits, tests, builds or new
benchmarks were run for this audit. Numerical summaries below only read already
saved raw observations.

## Disposition at c954

| Finding | Exact c954 state and cause | Evidence available now | Work still needed to close |
| --- | --- | --- | --- |
| M1 selected-map/request-local projection | Implemented in `server/universe.mjs:284–324` (`linkReadContext`) and `server/universe-jspace.mjs:363–436` (`projectionContext`, `project`, `libraryContext`). Canonical expiry is reconciled before documents are read; selected/global link scopes are indexed and grouped once. | Completed fa6→c954 Maps ABBA, 21 cases per process, plus exact selected-object bytes and order. Selected detail no longer grows with 1/8/24 unrelated maps in these observations. | Preserve full fields, signature associations, operational access, source map, revisions and pilot boundaries in final exact-source local and CI acceptance. This does not make full-library/summary work constant. |
| M2 signatures/endpoints | Implemented in `universe-jspace.mjs:375–416`: signature indexes and one ordered reverse-association traversal; repeated endpoint matching no longer scans all signatures. | Completed 0/100/1000 signature ×100/1000 edge cases retain ordered complete outputs. c954 tests cover two endpoints sharing a UUID without duplicate bindings. | Keep every dense and no-signature case in the final report, including mixed/adverse small cases. No additional association redesign is presently evidenced. |
| M3 refresh amplification and stale Maps publication | Existing `components/kairo/scoped-refresh.mjs` owner and `jspace-workspace.tsx` scoped summary/detail publication remain at c954. One active read and one retained invalidation; map/pilot changes fence publication. | Historical 17-check compiled Maps gate and current source correctness tests remain relevant, but the newly completed camera lane is not a replay of all Maps behavior checks. | Re-run the compiled correctness lane on the final source: delayed map/pilot responses, accepted old-scope saves, failed recovery, expiry, reconnect and bounded requests. |
| M4 / G14 expiry work depends on unrelated links | Implemented at c954, `server/universe.mjs:114–126,152–205`: three partial expression indexes; disjoint collapsed/due UNION branches; indexed next-expiry lookup. Root cause was scanning JSON links/sorting dated links despite constant selected projection output. | Fresh exact c954 query plans, mixed expiry identity equality, separate VM-step diagnostic, 36 index-cost observations and complete Maps ABBA now exist. See quantitative section. | Final-source local/CI Maps and startup gates still apply. Retain one-time index construction and extra write/page costs explicitly. No speculative expiry deadline cache is needed. |
| M5 / G13 camera style amplification | Implemented at c954, `jspace-map.tsx:129–144,253–254` and `jspace-camera-surface.mjs:18–24`. Ref-owned transform updates avoid React per frame; existing Text node gets `nodeValue`, avoiding the scene-wide style invalidation triggered by child replacement. | Completed fa6 DOM intervention plus clean RC16→c954 compiled camera ABBA supports both mechanism and current improvement; dense pan still has two long tasks in each c954 observation. | Preserve the residual rather than claiming a stall-free map. Final compiled behavior/CI camera gates and M6 disposition are still required. |
| M6 stable scene leaves / optional culling | **Open.** c954 still derives/renders the full node/edge/minimap JSX in `jspace-map.tsx:302–375` on relevant React updates. Camera frames are separated, but an unchanged refresh still produces root commits and appreciable sampled React/page work. | Exact c954 `scene-profile-20261007.json` covers 100/600 nodes, native zoom/pan and unchanged refresh. No leaf attributes or child-list changes occurred; this does not mean the React work was absent. | Isolate stable scene/leaf ownership with stable callbacks/inputs and measure unchanged refresh, changed snapshot, selection and drag. A no-change decision for extra culling may be justified separately by renderer attribution; camera-only evidence cannot close memoization. Preserve offscreen selection, keyboard navigation, pointer capture, parallel edges, asynchronous drag saves and detached windows. |
| M7 eager Atlas layouts | **Open at c954.** `universe-map.tsx:229,233–235` eagerly calculates physical and schematic arrays regardless of selected projection; distance/radar fallback also references physical points. The lazy-layout module does not exist in c954. | A complete independent four-file c954-based trial has kernel, pixel/scale/radar, heap and replay evidence. Its adoption into #55 is excluded. See trial boundary below. | Explicitly reconsider/reapply the isolated patch on the approved lineage if the coordinator chooses adoption; retain first-switch costs and rerun affected integrated gates. Alternatively document a measured decision to retain eager ownership. Do not silently count #55's implementation as present in #54. |
| M8 Atlas frame-wide point/gate scans | Conditional optimization with **bounded measured no-change rationale available**, not an adopted spatial index. c954 `universe-map.tsx:609–612` filters points/scans gates; `:774–819` builds/sorts label candidates. | Two complete instrumented c954-derived draw lanes cover 12 phases, both projections, political/activity backgrounds, native motion and actual deep system labels. The source change is diagnostic instrumentation only. Selection-only camera-batch medians are 0.192–0.688 ms, below Canvas/draw work in most phases. | Record an independent explicit disposition to retain current culling rather than create a new spatial index without demonstrated material gain. Limits: synthetic fixture and headless software rendering; selection-only helper does not remove real Canvas paint/collision cost. If a broader material frame problem is claimed, first identify that cost; do not attribute all gate-with-Canvas time to search. |
| M9 summary/full payload, notes/passages and tracked-pilot fanout | **Open, with two newly quantified causes.** (1) `forgetMapConnections` at `universe-jspace.mjs:217–228` stringifies whole unchanged documents twice; library reads still parse all bodies. (2) `projectPilots`, Operations `character/config/location`, and Auth reread the complete connected roster repeatedly. | c954 diagnostics cover 27 supported-limit cases. Isolated M9 fast-path diagnostics and three completed timing children exist; the last baseline child is incomplete, so the ABBA is not accepted. The fast path is absent at c954 and does not resolve roster fanout or large-body parsing. | Complete the narrow reconciliation trial, then use request-local roster/per-pilot projection ownership and evaluate a narrow summary input boundary. Run matched complete-output measurements and all cleanup/access-freshness tests. Detailed requirements below. |
| RT1 route preparation | Request-local planner/source validation in `universe.mjs:605–650`, `universe-routing.mjs` and `universe-navigation.mjs` remains implemented. | Historical route timings and correctness are source-bound to earlier revisions; the c954 shared Atlas name-index trial separately preserves named itinerary output. | Final fixed-clock route local/CI equality and 1/10/50-stop work/timings remain necessary. Optional jump/private/public combinations have correctness evidence, not a broad performance claim. |
| RT2 / P4 small adverse observations | Prior one-stop route maximum and no-signature/full-serialization losses remain observations. New Maps ABBA also contains mixed losses; it does not erase the historical cases. | Raw exact-source cases are retained, with serialization separated. | Keep the entire matrix and source/host boundaries. Investigate repeated material losses under the established rule; do not hide them with dense-signature gains. |

## Newly recovered valid c954 observations

All paths in this section are relative to `completion/`. Existing README/status
documents describing these runs as merely queued are older than the raw files.
The raw completion/provenance fields take precedence for only the stated lane.

### Expiry and selected-detail independence: M4 / G14

`maps-final/expiry-plans-20261007.json` is complete and source-verified. It compares
fa6 and c954 over 400/3,200/9,600 links (1/8/24 maps for four pilots), preserving
mixed timezone expiry/collapsed identities. c954 plans use the collapsed and
pilot/global expiry indexes; next expiry avoids a temporary sort.

The separate Python SQLite 3.53.1 progress-handler diagnostic
`query-vm-20261007.json` records **VM instructions, not visited B-tree rows or
Node latency**. Across 400/3,200/9,600 all-live rows, c954 next-expiry/global-due/
pilot-due work stays at 15/19/25 VM steps. fa6 next-expiry steps grow
6,420→51,220→153,620. Result identities agree. The actual Node timing lane records
Node 24.19.0 / SQLite 3.53.3 separately.

`index-cost-20261007/result.json` is complete/source-verified, with three ABBA
blocks per size and fresh WAL databases. Medians across six observations per side:

| Links | c954 upgrade time | Extra database pages, bytes | Plain canonical UPSERT, fa6→c954 (µs/write) | UPSERT + next-expiry, fa6→c954 (µs/write) |
| ---: | ---: | ---: | ---: | ---: |
| 400 | 0.975 ms | 28,672 | 3.610→7.541 | 319.818→9.048 |
| 3,200 | 7.072 ms | 135,168 | 4.011→8.349 | 2,540.533→9.882 |
| 9,600 | 23.182 ms | 364,544 | 4.313→8.909 | 8,200.726→10.168 |

These are isolated expression-index costs, not whole application launch or
Universe command latency. The ordinary write cost approximately doubles in this
small operation, while indexed scheduling removes much larger growth.

`maps-abba-20261007/provenance.json` is complete with order fa6/c954/c954/fa6;
every child records source/harness stability. Two run medians, milliseconds:

| Selected detail fixture | fa6 | c954 |
| --- | ---: | ---: |
| 1 map | 2.502 / 2.274 | 1.965 / 1.432 |
| 8 maps | 3.425 / 3.293 | 1.752 / 1.823 |
| 24 maps | 6.965 / 6.940 | 1.768 / 1.918 |

The entire selected object is equal in raw bytes, ordered arrays and property
order: 229,559 bytes, SHA256
`5064dfaae3e14d49957e6d37c7f3772cb036d7c3f382a84f192848e7f92a8968`.
This validates the narrow independence mechanism. It is not a claim that every
case improves: 24-map full service is 42.833/40.918 ms fa6 versus 37.389/52.539 ms
c954; serialization is 21.494/21.797 versus 24.014/32.981 ms. The second
0-signature/1,000-link c954 median is 12.140 versus 11.652 ms fa6; the second
100-signature/100-link median is 3.066 versus 1.928 ms. Retain all 21 cases and
these adverse directions when applying the acceptance rule.

### Camera intervention and remaining scene work: M5 / G13 / M6

`maps-final/camera-label-20261007.json` is a complete fa6 same-application
replace/retain/retain/replace intervention, **not c954 performance acceptance**.
With identical start/end camera and 23% visible label, replacement generated
130,604 style resolutions in each arm versus 208/198 retaining the Text node.
Tracing affects frame counts; durations must not be converted into speedups.

`camera-abba-20261007/provenance.json` and four children are complete and
source-verified for clean RC16 and c954, same 100/600-node graphs, native gestures,
viewport, full detail and default scales. For the 600-node fixture:

| Metric, two observations | RC16 | c954 |
| --- | ---: | ---: |
| Zoom script, ms | 409.911 / 463.326 | 11.849 / 11.101 |
| Zoom style recalculation, ms | 1,448.281 / 1,421.061 | 13.068 / 11.008 |
| Zoom renderer task, ms | 2,475.898 / 2,583.331 | 1,008.489 / 1,008.783 |
| Zoom long tasks, count | 12 / 13 | 0 / 0 |
| Pan script, ms | 780.683 / 825.906 | 71.260 / 75.505 |
| Pan renderer task, ms | 3,006.853 / 2,432.718 | 926.253 / 905.086 |
| Pan long tasks, count | 27 / 24 | 2 / 2 |

The improvement is real within this headless fixture; dense pan retains a
material renderer workload. c954 zoom layout duration is also higher
(7.035/7.224 versus 2.957/4.213 ms), and no uniform per-metric improvement is claimed.
Camera windows are fixed gesture sequences plus settle, not equal FPS/whole-CPU
meters. All raw timings and method limits remain authoritative.

`scene-profile-20261007.json` is a separate complete instrumented c954 lane.
At 600 nodes, zoom/pan/unchanged refresh produce 1/4/5 root React commits with
zero scene leaf-attribute or child-list changes. Pan's trace contains 137.5 ms
UpdateLayoutTree, 170.1 ms Paint and 580.7 ms Layerize cumulative event durations;
these categories are not asserted disjoint CPU totals. They show why leaf
memoization alone is not a general solution to renderer cost.

However, unchanged refresh still has considerable sampled JS work. Summing only
CPU-profile sample weights by source URL gives page/framework 19.2/39.0 ms at
100 nodes and 56.8/103.1 ms at 600 nodes; GC sample weight is 8.3/33.5 ms. These
are sampled attribution under a profiler, not an elapsed benchmark or proof that
every sample belongs to a particular leaf. Root commit count also cannot count
individual component renders. A small memoization trial should isolate the
scene's share before rejecting M6 as unnecessary. Keep same-result refresh and
real result changes distinct; a cross-request cache keyed only by map revision
would miss time-sensitive/operational/tracked-pilot changes.

### Atlas layout trial is separate from c954: M7

`atlas/lazy-trial-20261007/{KERNEL-RESULTS,BROWSER-RESULTS}.md` and immutable
completion files bind exact c954 baseline to a four-file trial fingerprint
`1edc5371100e52e655d8d1e0569f3c89b8d1873e6875c079f76131c3d442aaa1`.
The trial adds `universe-map-layouts.mjs`, its type declaration/tests, and changes
`universe-map.tsx`; none of that source is part of c954. #55's subsequent
integration is explicitly disregarded.

The independent trial remains evidence, not an instruction to resume from #55.
Across 24 fresh timing children plus eight heap children, physical-first
derivation is 14.610→6.878 ms median; first schematic switch is
0.002→7.861 ms; cumulative first+switch 14.612→14.618 ms. Schematic-first
13.789→10.080 ms shifts first physical switch 0.002→2.215 ms. The current-system-
identity owner retains at most two arrays and resets on replacement. All 48
settled Canvas hashes/scales/counts match; radar and separately source-bound
replay behavior passed. Retained first-layout Chrome heap decreases roughly
0.30–0.35 MiB, disappearing after both layouts are used.

Whole-browser results are mixed: schematic mount median 292.01→302.78 ms;
warm physical switch 43.48→46.33; warm schematic 40.84→44.35 ms. Retain these
costs and label the improvement as removal of unused initial derivation, not
uniform browser acceleration or lower total two-layout work. Any chosen
reintegration requires a new verified source checkpoint and affected gates.

### Atlas scan/label attribution: M8

`atlas/draw-diagnostic-20261007/{browser,labels}/result.json` are complete with
source/compiled/end cleanup checks and zero errors/external traffic. Their
fingerprint `2f1a545d12073fcf42c26e80db973bedd1df649f1f504877e92066a33f2d2617`
is **instrumented c954**, differing only in `universe-map.tsx`; it is not the
unmodified c954 production build and not #55/lazy-layout source.

The first run's claimed system-label coverage was wrong (zero candidates);
`COVERAGE.md` preserves that limitation. The completed supplement requires
actual candidates, observing physical 6–139 and schematic 15–153 across the
political/activity phases. All 8,490 systems/5,485 known points/6,989 gates are
present; no scene reduction was used.

Boundary-clock draw medians span 1.5–3.4 ms. Visible-point filter medians are
0.1 ms; gate-with-Canvas 0.5–0.9 ms at overview/closer views and 0.6 ms at deep
labels. Deep label-with-Canvas medians are 0.6–1.2 ms. The separate selection-only
camera-batch means have phase medians 0.192–0.688 ms (max batch mean 1.016 ms).
That helper is an attribution experiment, not an optimized application. It
supports retaining the simple scan/culling design for the measured workload:
an added spatial index cannot remove actual paint, labels, overlap checks or
geometry-worker costs. Record that bounded decision explicitly rather than
claiming scans do not exist or every possible workload is fast.

## M9 concrete remaining implementation and gates

`maps-final/summary-diagnostic-c954.json` and the separate isolated fast-path
diagnostic are complete/source-verified. Fixtures use 1/8/24 maps, 100 nodes,
500 comments and 1,000 passages per wide document (each below the supported
4 MB document bound), plus a 100-connected/tracked-pilot roster case. The total
24-map wide input is 85,713,968 bytes; returning the complete full response
legitimately serializes 87,284,760 bytes. This must not be fixed by dropping fields.

1. **Avoid unconditional no-op reconciliation serialization.** c954 summary of
   that wide library parses 85,714,734 map characters and internally stringifies
   171,428,702 map characters while outputting only 7,332 bytes. The diagnostic
   attributes 189.4 ms to those stringifies (instrumented, not a clean latency).
   `maps-final/m9-fastpath.patch` checks current topology/reference invariants
   before falling back to the existing normalizer. Its trial fingerprint
   `6fc9ef60655a3e77f0021a44f729d006542c5d2f4872f808d0470f069045736c`
   differs from c954 only in `universe-jspace.mjs` and its read tests. It removes
   those no-op stringify calls, **but is not integrated**. Preserve no-op writes/
   revisions; missing activity, `locked:false`, empty archive, dangling
   comments/passages and connection activity must still trigger cleanup.
2. **Remove request-local roster rereads.** c954 `server/auth.mjs:84` queries and
   parses every connected character on every call. `universe-jspace-tracking.mjs`
   `character:24`, `allowed:58–64`, `projectPilots:114–122` repeat this per map and
   pilot; Operations `character:40`, `config`, `location:265`, `pilots:293`, and
   `readContext:579–607` also call through it. At 24 maps/100 pilots the full
   diagnostic makes 7,507 calls returning 750,700 roster rows, with 924.5 ms
   instrumented Auth time. Selected detail makes 607 calls/60,700 rows and
   73.9 ms Auth time. The stringify trial leaves counts unchanged. Pass a
   request-owned roster/by-ID and per-pilot access/location context through the
   existing projection owner; do not make a lifetime cache that can retain
   disconnected/reauthed pilots or expired location. Avoid coupling mutations to
   stale read contexts.
3. **Dispose of residual wide-summary body parsing with evidence.** Even the
   fast path parses the same 85.7 MB of map bodies. A narrow summary projection
   should expose descriptors and cleanup-sensitive topology/references, loading
   the full body only when reconciliation actually requires a write. This needs
   careful ownership because pruning, legacy normalization, imported canonical
   links and direct SQL changes must still be visible immediately. SQL JSON
   extraction itself reads/decodes source JSON, so merely moving parsing into
   SQLite is not proof of work removal. Isolate that cost before choosing a
   metadata boundary/migration; compare index/upgrade/write/retained overhead as
   well as summaries. Current wide-summary service remains about 504 ms in the
   first clean c954 timing child, so compact output alone does not close M9.

The four-file folder `summary-abba-20261007/` is **not a completed crossover**.
`baseline-1.json`, `candidate-1.json`, and `candidate-2.json` are complete;
`baseline-2.json` is `complete:false`, without end source verification, and there
is no accepted complete provenance file. Earlier status text calling it queued
and isolated trial medians must not be promoted into a final adoption claim.
Retain the partial attempt; perform a new complete ABBA with exact inputs and
all result hashes after the chosen changes are ready.

Required tests/measurements for M9 closure:

- Preserve complete selected/full/summary bytes, order, source map, access and
  expiry across 1/8/24 maps, wide notes/passages and 1/100 tracked-pilot variants.
  Report separate service/serialization latency, JSON and Auth work counts,
  ordinary CPU/heap, and input/output size. Counts and diagnostic timings must
  remain separate from uninstrumented acceptance.
- Exercise disconnect/reauth/scope loss, Universe/Pilot toggle, location/online/
  ship freshness and log-vs-ESI authority between requests. No later request may
  reuse a formerly authorized location/roster result. Preserve paused tracking,
  ordering and pilot-name fallback.
- Exercise expiry deletion during a read, timezone and collapsed-unknown
  lifetimes, grace/prune, import/duplicate, legacy cleanup, undo and direct
  canonical updates. Existing `universe-jspace-reads.test.mjs:104–155` covers
  several boundaries but does not cover the new owner by itself.
- Run the full frozen Maps matrix and compiled Maps behavior after integration,
  then the required independent CI/final source gates. Save a separate checkpoint
  before any change is offered for user review.

## Boundaries retained for the overall trace

The Atlas shared immutable name index **is** part of c954, unlike lazy layouts.
`atlas/RESULTS-20261007.md` binds all five trial server files to c954 and reports
Universe construction 28.544→21.225 ms median, about 2.145 MiB lower live collected
heap, and about 0.635 MiB higher post-close process index residency. The existing
lazy formatter is retained with its measured cold first-use cost; these decisions
do not close whole-Core startup/heap or frame optimization gates.

Historical route maximum, small Maps losses and full-payload costs must remain in
the final report. The c954 camera and Maps results are valuable exact-source local
evidence, not completion of backend, frontend, updater, memory, mixed, restart or
independent CI gates. G8/G9 causal work, broader frontend Context propagation,
Sessions/replay and final package verification are owned by their separate traces.
No success in this document authorizes a clean RC17 or restoration of PR #10 to
user review.
