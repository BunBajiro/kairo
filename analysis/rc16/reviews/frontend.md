# RC16 frontend review and measurements

Scope: compiled RC16 UI, fresh synthetic connected pilot, offline ESI, bundled production Universe topology. Harness and measurements live entirely under `analysis/rc16`; app sources are unchanged. User-facing RC17 remains future work.

## Reproduction

1. `npm run build`
2. `KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc16/harness/frontend-browser.mjs`
3. Optional quick diagnostic: `KAIRO_FRONTEND_SMOKE=1 KAIRO_FRONTEND_OUTPUT=analysis/rc16/raw/frontend-smoke.json KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc16/harness/frontend-browser.mjs`
4. Minimal legacy dashboard comparison: run the same script with `KAIRO_FRONTEND_OVERVIEW=1`, `KAIRO_BENCH_REPO=/absolute/path/to/compiled-checkout`, and a unique `KAIRO_FRONTEND_OUTPUT`. Run from the RC16 root. This switches store/server implementation to that checkout while using exactly the same minimal profile/location fixture. It does not compare new maps to the older Journey feature.

The harness launches production `startKairo`, a fresh data directory and Chromium profile; it destroys both when finished. Token material is deliberately unusable synthetic text. Browser HTTPS/image requests are blocked, backend fetches are denied. All measured API requests use loopback.

Counter overhead: `clearRect` wrapper counts Atlas draws; a `PerformanceObserver` collects >50 ms renderer long tasks; CDP captures network events and start/end performance counters. Interaction samples add one tiny RAF observer to collect callback intervals. Idle samples have **no RAF sampler**. A separate diagnostic CPU profile follows normal timing samples; profiled timings are not used in the results table. `TaskDuration` is renderer main-thread task CPU, not whole-browser/worker/GPU CPU. RAF intervals are observed callback intervals in headless Linux software rendering, not a desktop GPU FPS estimate.

Samples with `open` in their name include an explicit 1.5-second post-readiness settlement period. Use main-thread CPU and long tasks from those windows, not the wall window as a user latency measurement. Zoom samples issue six real CDP mouse clicks, each followed by 600 ms; the interaction is intentionally reproducible, not a maximum-throughput stress test. The server fixtures contain four saved maps totaling 1,025 systems, with 25/100/300/600-system views, real bundled stargate topology and deterministic square-grid positions. This is a controlled scalability case, not a claimed distribution of actual user maps.

## Findings pending measurements

### Maps camera path: priority determined by scale results

`components/kairo/jspace-map.tsx:119-127` applies every smooth camera frame with `setCamera`; the RAF loops for 270 ms. Background pan also calls `applyCamera` per pointer event (`:236-240`). The entire component executes, including full node/edge JSX and fresh event closures, on each camera update (`:301-353`). Nodes and edges are always represented in the DOM, including those outside the viewport. There is no memoized scene boundary. The minimap repeats all node/edge shapes.

Safe direction: split stable scene and camera/HUD concerns, use ref-driven world transform/minimap viewport during camera motion, commit final accessible control/camera state at bounded points, then memoize node/edge leaves with stable callback contracts. Consider viewport culling or zoom-level simplification only after measuring the lower-risk split. Preserve keyboard access, selected offscreen nodes, pointer capture, group movement, asynchronous save scopes, provisional placement and camera restoration. Do not replace the Maps renderer wholesale before those changes are profiled.

### Maps refresh amplification: high-confidence structure, measurement below

The Maps listener reloads the **entire map list immediately for each matching event** (`components/kairo/jspace-workspace.tsx:112-116`). The parent Universe listener separately debounces its own full intel reload by 300 ms (`components/kairo/universe.tsx:88`). Both also poll every 60 seconds (`universe.tsx:89`, `jspace-workspace.tsx:115`). `reload` uses epochs to ignore obsolete responses but does not cancel or coalesce the work already launched (`jspace-workspace.tsx:79-86`). `onChanged` after mutations can add a parent refresh; normal SSE accompanies the server mutation.

Backend review establishes that list projection rereads all per-pilot links/signatures for each map. Frontend event amplification therefore multiplies the expensive backend path as well as JSON parse/allocation and scene derivation. A shared scoped invalidation/coalescing contract and lightweight map summaries plus selected-map detail are coordinated backend/frontend work. Preserve the newest revision while writes are in flight, do not let a response for a different pilot/map win, and retain visibility wake/expiry semantics.

### Existing good performance boundaries to preserve

- `EveClock` is isolated in its own component (`dashboard.tsx:32`); the shell has no one-second global clock render.
- Atlas camera updates are ref-based and paint directly (`universe-map.tsx:323-346`), with finite animation, hidden-surface cancellation and reduced-motion handling.
- Atlas territory geometry is worker-built and retained separately from paint revisions (`universe-map.tsx:467-494`, `universe-map-worker.mjs`); normal camera interaction does not rebuild it.
- Maps node dragging has a direct DOM preview path (`jspace-map.tsx:171-183`), retaining version/scoped async persistence. This pattern can inform camera isolation.
- Freshness scheduling is not a permanent animation loop. Atlas uses deadlines/minute ticks (`universe-map.tsx:284-299`); Maps has a stable 30-second clock plus expiry deadline (`jspace-clock.mjs:1-19`). Keep expiry visible and timely when optimizing.

### Lower-priority audit candidates, not yet verified bottlenecks

- Atlas computes both physical and schematic point sets on mount even when physical is selected (`universe-map.tsx:231-237`). The schematic default has no pairwise collision loop; avoid overstating this as an O(n²) Atlas mount. It is a possible lazy-computation simplification only if mount profiles justify it.
- Each Atlas animation frame scans points, gates and label candidates (`universe-map.tsx:611-615,778-859`), though many draw paths already cull by viewport. Benchmark before adding spatial indexes or caches.
- Shell's 30-second `/state` fallback is unconditional, including hidden pages, and replaces all module/name/session objects (`dashboard.tsx:59-61,149`). The current improvements should avoid broad context invalidation when revisions did not change; hidden fallback needs a recovery contract so an SSE outage never silently leaves stale data.
- Replay performs timeline filter/reverse/map work every 100 ms (`session-replay.tsx:80-89,108-126`) and each tick creates a new replay frame. Measure large historical sessions before introducing cursor indexes; this harness uses ten visits only.
- `dashboard.tsx:14-20` statically imports all modules including the new Universe UI. Bundle-size evidence should decide whether lazy module loading is worthwhile. Split by real user navigation boundaries, retain cached module loading/error recovery, and avoid changing the updater's revision/recovery contract.

## Behaviour gates for later optimization

Keep existing `tests/universe-ui.mjs`, `tests/maps-expansion-ui.mjs`, and `tests/jspace-ui-workflows.mjs` as regression gates. In particular: finite zoom/focus; reduced-motion and hidden-page handling; Atlas physical versus schematic distinction; source/private map and pilot isolation; duplicate/parallel connection semantics; no premature placement writes; node drag while queued layout saves finish; undo/revision conflict behavior; keyboard navigation/menu restoration; replay sovereignty and session-scoped travel; detached tactical window ownership; dataset restart/revision UI recovery. The analysis harness itself is not a replacement for these acceptance checks.
