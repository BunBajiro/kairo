# RC16 frontend review and measurements

Scope: compiled RC16 UI, fresh synthetic connected pilot, offline ESI, bundled production Universe topology. Harness and measurements live entirely under `analysis/rc16`; app sources are unchanged. User-facing RC17 remains future work.

## Reproduction

1. `npm run build`
2. `KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc16/harness/frontend-browser.mjs`
3. Optional quick diagnostic: `KAIRO_FRONTEND_SMOKE=1 KAIRO_FRONTEND_OUTPUT=analysis/rc16/raw/frontend-smoke.json KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc16/harness/frontend-browser.mjs`
4. Minimal legacy dashboard comparison: run the same script with `KAIRO_FRONTEND_OVERVIEW=1`, `KAIRO_BENCH_REPO=/absolute/path/to/compiled-checkout`, and a unique `KAIRO_FRONTEND_OUTPUT`. Run from the RC16 root. This switches store/server implementation to that checkout while using exactly the same minimal profile/location fixture. It does not compare new maps to the older Journey feature.

The harness launches production `startKairo`, a fresh data directory and Chromium profile; it destroys both when finished. Token material is deliberately unusable synthetic text. Browser HTTPS/image requests are blocked, backend fetches are denied. All measured API requests use loopback.

Counter overhead: `clearRect` wrapper counts Atlas draws; a `PerformanceObserver` collects >50 ms renderer long tasks; CDP captures network events and start/end performance counters. Interaction samples add one tiny RAF observer to collect callback intervals. Idle samples have **no RAF sampler**. A separate diagnostic CPU profile follows normal timing samples; profiled timings are not used in the results table. `TaskDuration` is a renderer-main-thread duration counter, not a measurement of whole-browser/worker/GPU or operating-system CPU usage. RAF intervals are observed callback intervals in headless Linux software rendering, not a desktop GPU FPS estimate.

Samples with `open` in their name include an explicit 1.5-second post-readiness settlement period. Use main-thread task duration and long tasks from those windows, not the wall window as a user latency measurement. Zoom samples issue six real CDP mouse clicks, each followed by 600 ms; the interaction is intentionally reproducible, not a maximum-throughput stress test. The server fixtures contain four saved maps totaling 1,025 systems, with 25/100/300/600-system views, real bundled stargate topology and deterministic square-grid positions. This is a controlled scalability case, not a claimed distribution of actual user maps.

## Findings

### P1: Maps camera scaling and broad style invalidation

`components/kairo/jspace-map.tsx:119-127` applies every smooth camera frame with `setCamera`; the RAF loops for 270 ms. Background pan also calls `applyCamera` per pointer event (`:229-234`). The entire component executes, including full node/edge JSX and fresh event closures, on each camera update (`:301-353`). Nodes and edges are always represented in the DOM, including those outside the viewport. There is no memoized scene boundary. The minimap repeats all node/edge shapes. The viewport also changes the inherited CSS custom property `--chain-zoom` on every zoom frame (`:300`), although a source search found no consumer of that property. Renderer counters show substantial style recalculation, so a React-only diagnosis would be incomplete.

Safe direction: first test removing the unused `--chain-zoom` update, then split stable scene and camera/HUD concerns, use ref-driven world transform/minimap viewport during camera motion, commit final accessible control/camera state at bounded points, then memoize node/edge leaves with stable callback contracts. Consider viewport culling or zoom-level simplification only after measuring the lower-risk split. Preserve keyboard access, selected offscreen nodes, pointer capture, group movement, asynchronous save scopes, provisional placement and camera restoration. Do not replace the Maps renderer wholesale before those changes are profiled. The optional stylesheet intervention in the analysis harness is a diagnostic experiment only; it does not alter checked-in application code or constitute a shipped improvement.

### P1: Maps refresh amplification

The Maps listener reloads the **entire map list immediately for each matching event** (`components/kairo/jspace-workspace.tsx:112-116`). The parent Universe listener separately debounces its own full intel reload by 300 ms (`components/kairo/universe.tsx:88`). Both also poll every 60 seconds (`universe.tsx:89`, `jspace-workspace.tsx:115`). `reload` uses epochs to ignore obsolete responses but does not cancel or coalesce the work already launched (`jspace-workspace.tsx:79-86`). `onChanged` after mutations can add a parent refresh; normal SSE accompanies the server mutation.

Backend review establishes that list projection rereads all per-pilot links/signatures for each map. Frontend event amplification therefore multiplies the expensive backend path as well as JSON parse/allocation and scene derivation. A shared scoped invalidation/coalescing contract and lightweight map summaries plus selected-map detail are coordinated backend/frontend work. Preserve the newest revision while writes are in flight, do not let a response for a different pilot/map win, and retain visibility wake/expiry semantics. A map revision alone is insufficient as a UI cache key: operational observations, public feeds and expiry can change independently of layout revision.

### Existing good performance boundaries to preserve

- `EveClock` is isolated in its own component (`dashboard.tsx:32`); the shell has no one-second global clock render.
- Atlas camera updates are ref-based and paint directly (`universe-map.tsx:323-346`), with finite animation, hidden-surface cancellation and reduced-motion handling.
- Atlas territory geometry is worker-built and retained separately from paint revisions (`universe-map.tsx:467-494`, `universe-map-worker.mjs`); normal camera interaction does not rebuild it.
- Maps node dragging has a direct DOM preview path (`jspace-map.tsx:171-183`), retaining version/scoped async persistence. This pattern can inform camera isolation.
- Freshness scheduling is not a permanent animation loop. Atlas uses deadlines/minute ticks (`universe-map.tsx:284-299`); Maps has a stable 30-second clock plus expiry deadline (`jspace-clock.mjs:1-19`). Keep expiry visible and timely when optimizing.

### P2 / follow-up audit candidates, not all verified bottlenecks

- Atlas computes both physical and schematic point sets on mount even when physical is selected (`universe-map.tsx:231-237`). The schematic default has no pairwise collision loop; avoid overstating this as an O(n²) Atlas mount. It is a possible lazy-computation simplification only if mount profiles justify it.
- Each Atlas animation frame scans points, gates and label candidates (`universe-map.tsx:611-615,778-859`), though many draw paths already cull by viewport. Benchmark before adding spatial indexes or caches.
- Shell's 30-second `/state` fallback is unconditional, including hidden pages, and replaces all module/name/session objects (`dashboard.tsx:59-61,149`). The current improvements should avoid broad context invalidation when revisions did not change; hidden fallback needs a recovery contract so an SSE outage never silently leaves stale data.
- Replay performs timeline filter/reverse/map work every 100 ms (`session-replay.tsx:80-89,108-126`) and each tick creates a new replay frame. Measure large historical sessions before introducing cursor indexes; this harness uses ten visits only.
- `dashboard.tsx:14-20` statically imports all modules including the new Universe UI. Bundle-size evidence should decide whether lazy module loading is worthwhile. Split by real user navigation boundaries, retain cached module loading/error recovery, and avoid changing the updater's revision/recovery contract.

## Behaviour gates for later optimization

Keep existing `tests/universe-ui.mjs`, `tests/maps-expansion-ui.mjs`, and `tests/jspace-ui-workflows.mjs` as regression gates. In particular: finite zoom/focus; reduced-motion and hidden-page handling; Atlas physical versus schematic distinction; source/private map and pilot isolation; duplicate/parallel connection semantics; no premature placement writes; node drag while queued layout saves finish; undo/revision conflict behavior; keyboard navigation/menu restoration; replay sovereignty and session-scoped travel; detached tactical window ownership; dataset restart/revision UI recovery. The analysis harness itself is not a replacement for these acceptance checks.

## Final local measurements

Final raw evidence: `raw/frontend-browser.json` (all controls passed), `raw/frontend-browser.cpuprofile`; harness SHA256 `c30258dfdb20af729510f38c362bad820bff2d090752edd7e916fa223ba3dd4d`. Chromium 153.0.8010.0, ANGLE/SwiftShader software renderer, 1600×1050 at DPR 1. Three repeats per six-click zoom case. The final measurement file records canonical RC16 commit `57c8dcc7fbd8fc2b62129498d1819050c78381a1`, source-file hashes, environment and all raw observations.

| View | Renderer task time, median six-click window | Style recalculation time, median | RAF interval p95 range | >50 ms tasks, median count | Live document elements |
|---|---:|---:|---:|---:|---:|
| Atlas (5,485 known systems) | 3,060.1 ms | 398.4 ms | 33.4–49.9 ms | 0 | 1,285 |
| Maps 25 systems /34 gates | 1,166.6 ms | 537.5 ms | 16.7 ms | 0 | 1,221 |
| Maps 100 systems /139 gates | 2,263.5 ms | 1,230.8 ms | 50.0 ms | 1 | 3,560 |
| Maps 300 systems /394 gates | 3,401.0 ms | 1,895.4 ms | 116.6–116.7 ms | 30 | 9,757 |
| Maps 600 systems /823 gates | 5,302.6 ms | 2,738.7 ms | 233.3–250.0 ms | 22 | 19,278 |

The larger Maps cases block input long enough that their six-click windows stretch:600-node median elapsed time was 5,347.3 ms, despite the nominal 3,600 ms of inter-click waits. These are renderer-main-thread costs in software rendering; no claim about the user's desktop GPU frame rate is made. Panning also scales poorly:600 nodes consumed 4,224.2 ms renderer task time in 4,308.9 ms, with 33 long tasks, for 24 synthetic middle-button moves.

The targeted stylesheet experiment is unusually useful here. Four consecutive 600-node three-click samples used A/B/B/A, with B temporarily registering `--chain-zoom` as a non-inheriting numeric CSS property (syntax `<number>`, initial value `1`). The final A removes the declaration again. No application source or persisted user data changes.

| Phase | Renderer task time | Style recalculation | Script time | RAF interval p95 |
|---|---:|---:|---:|---:|
| A: original inheritance | 2,474.8 ms | 1,208.9 ms | 419.0 ms | 216.7 ms |
| B: registered non-inheriting numeric property | 1,609.7 ms | 7.9 ms | 582.3 ms | 100.0 ms |
| B: repeat | 1,535.4 ms | 6.9 ms | 572.5 ms | 100.0 ms |
| A: original restored | 2,522.6 ms | 1,263.7 ms | 457.8 ms | 216.7 ms |

This local intervention implicates the CSS custom-property invalidation path. Registration, typing and inheritance changed together; the experiment does not independently isolate inheritance alone. It reduced style-recalculation time by about 99.4% and total renderer task time by about 37.1% across these sample pairs. It also allowed more animation callbacks to run within the fixed-duration animation, so script-time totals do not fall in direct proportion. The remaining 100 ms p95 frames show that property cleanup alone will not resolve large-map interaction. Test a real narrowly scoped patch before projecting these results onto RC17 or desktop hardware.

Idle and replay observations:

- Settled Atlas: 105.2 ms task time across 12.0 s (0.88% of one renderer-main-thread time budget), 1 canvas repaint, no API requests in that sample. This window also contained one >50 ms task. One isolated repaint across the window is inconsistent with a continuing animation loop.
- Maps 600: 964.6 ms across 35.0 s (2.76%); one `/state` fallback request plus normal freshness/clock activity. It does not have a permanent map camera animation in source. Maps 300's shorter idle sample coincided with all three fallback requests (`/state`, `/universe`, `/universe/jspace`), so its 5.32% busy fraction must not be compared directly to a quiet window.
- Ten-visit replay at 60×: 4,272.6 ms task time over 12.07 s, 213 canvas draws, p95 observed RAF 16.8 ms, no >50 ms task. Paused replay: 44.1 ms over 8 s and one repaint coincident with `/state`; no sustained redraw loop.

Refresh burst:ten identical scoped `kairo:universe-changed` events produced **ten** full `/universe/jspace` responses plus **one** parent `/universe` response. Total transfer was 7,813,659 bytes (includes response headers), with 205.9 ms renderer task time in the 2.54 s observation window. JSpace response-header elapsed times rose from 21.7 ms to 186.8 ms through the queue. Those timings include request queuing and HTTP processing; they are not isolated backend function timings. The backend review measures those functions separately. All ten unchanged map-list responses were still generated and transferred even though request epochs ensure only the newest result is accepted.

Incidental regular polling remained enabled during interaction tests: the first 600-node zoom repeat overlapped two API requests, and the first B style-probe phase overlapped one `/state` request. The other repeats corroborate the result without those overlapping requests; counts and timings are preserved in raw data.

The first exploratory run found a defect in the measuring harness's RAF observer when two observed samples were adjacent. It is preserved as `raw/frontend-exploratory-raf-observer.*`, with an explanatory note. The observer was corrected to bind its sample identity, and final samples assert monotonically increasing RAF timestamps. **The results above use only the complete corrected rerun.**

## Same-environment stable dashboard comparison

The minimal connected-pilot Overview fixture was run in fresh browser/app processes in A/B/B/A order, with 35-second windows. Both stable and RC16 used the same browser, renderer flags, seed and final harness. Both compiled checkouts used the shared installed dependency tree in this workspace; these are source-version comparisons under the current runtime, not attempts to reproduce the original checkpoint hardware/runtime byte for byte. The stable source is `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. These sparse fixtures are comparable **to each other**, not numerically to the much richer original v0.7.3 checkpoint's 0.82% GitHub Overview figure.

| ABBA phase | Renderer task time / 35s | Renderer busy fraction | Long tasks | API requests | Document elements |
|---|---:|---:|---:|---:|---:|
| baseline-1 (0.7.3) | 78.3 ms | 0.2237% | 0 | 3 | 376 |
| candidate-1 (0.8.0-rc.16) | 85.1 ms | 0.2431% | 0 | 3 | 402 |
| candidate-2 (0.8.0-rc.16) | 87.5 ms | 0.2500% | 0 | 3 | 402 |
| baseline-2 (0.7.3) | 90.8 ms | 0.2593% | 0 | 3 | 376 |

The ranges overlap. This controlled check does not demonstrate a broad dashboard-idle regression. It concentrates attention on the newly added map workloads and their refresh amplification. Two repeats per version are a sanity check, not a confidence interval or a full long-duration idle/thermal test.

The compiled eagerly loaded page-JavaScript chunk grew from 831,476 bytes (238,885 gzip) at stable v0.7.3 to 1,370,976 bytes (388,505 gzip) in RC16: +64.9% raw / +62.6% gzip. This is measurable bundle growth, not proof of a user-visible startup regression on loopback. The shell imports Universe and Maps transitively even on Overview; lazy navigation-module loading is a reasonable P2 consolidation. Preserve module error recovery and revision behavior.

Transient end-window JS heap snapshots were about 4.18 MB for stable and 4.78–4.80 MB for RC16 in these sparse runs. They are not retained-heap/leak measurements: no forced GC or heap dominator analysis was performed. All four runs had zero renderer exceptions, zero backend fetch attempts and zero successful external browser responses.

`raw/frontend-summary.json` is generated by `harness/frontend-summarize.py`; it includes final sample aggregation, all four Overview rows, and SHA256/size/gzip information for both compiled asset trees. `harness/frontend-overview-abba.mjs` reproduces the four-run sequence after both checkouts have been built.

## GitHub Actions replication — run 36708404690

Reviewed the completed artifact in `raw/github-run`: the 37-sample full suite plus all four Overview ABBA runs completed without a failure, with all three control counters zero. Every run records the frozen `c30258df…` harness hash; canonical source commits and the four recorded production-file hashes match their corresponding local run. Browser asset blocking recorded 312 attempts in the full suite and no successful external responses.

CI used Node 24.19.0, Chrome 153.0.8010.52, two logical CPUs on an AMD EPYC 7763 runner, and ANGLE/SwiftShader at 1600×1050/DPR 1. Local used Chrome 153.0.8010.0 and a different CPU/allocation. Compare each environment internally; do not pool the timings or treat the RAF intervals as desktop GPU FPS.

| CI view | Median task duration, six-click window | Median style-recalculation duration | RAF interval p95 range |
|---|---:|---:|---:|
| Atlas | 3,197.1 ms | 390.6 ms | 50.0–66.7 ms |
| Maps 25 systems | 1,257.0 ms | 643.7 ms | 50.0 ms |
| Maps 100 systems | 2,448.9 ms | 1,418.6 ms | 66.7–83.3 ms |
| Maps 300 systems | 4,034.4 ms | 2,270.5 ms | 150.0 ms |
| Maps 600 systems | 5,780.4 ms | 2,924.1 ms | 283.3–333.2 ms |

The local scalability finding replicates, with worse absolute interaction intervals on CI, including the small-map case. The 600-node window stretches to 5,967.8 ms. The live document still contains 19,278 elements.

The numeric non-inheriting CSS-property registration probe also replicates. Original/restored phases averaged 3,723.4 ms task duration and 1,809.9 ms style duration; the two registered phases averaged 2,512.0 ms and 6.16 ms. That is 32.5% less task duration and 99.66% less style-recalculation duration. Probe p95 intervals improved from 416.6/500 ms to 216.6/266.6 ms, but remain poor. All four CI probe phases had zero API requests, strengthening the CSS-path conclusion. Registration, typing and inheritance remain a combined intervention, not independently isolated changes.

The refresh burst again issued exactly ten full Maps GETs and one Universe GET, transferring the same 7,813,659 bytes. An incidental `/state` fallback added 173,456 bytes, so the complete CI window reports 7,987,115 bytes and 333.9 ms task duration. Keep the incidental response separate when comparing the burst itself.

Idle painting remains bounded: settled Atlas had zero canvas draws over 12 s; paused replay had zero over 8 s. Maps 600 used 1,134.2 ms task duration across 35 s (3.24%), with two normal `/state` requests and two long tasks. These observations do not imply that the UI does no periodic work.

There is one small disagreement with the overlapping local Overview ranges:

| CI Overview ABBA | Task duration / 35 s | Renderer busy fraction |
|---|---:|---:|
| Stable A1 | 76.1 ms | 0.2175% |
| RC16 B1 | 86.2 ms | 0.2463% |
| RC16 B2 | 89.7 ms | 0.2564% |
| Stable A2 | 64.6 ms | 0.1844% |

CI therefore shows a small Overview increase: mean 17.6 ms extra task duration per 35 s, or 0.050 percentage points of renderer busy time (about 25% relative to a tiny baseline). Every case still has three API requests and no long tasks. Two repeats per version and overlapping local ranges do not establish a large or sustained idle regression. They do warrant preserving this same-fixture check in the eventual RC17 comparison. The priorities remain Maps style/camera work and refresh/projection consolidation; CI does not reverse the local recommendations.
