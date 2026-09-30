# Kairo RC16 performance and refactoring checkpoint

30 September 2026 · v0.8.0-rc.16 · Internal analysis only

**Recommendation: retain the earlier database/cache optimisations and the updater design. Concentrate RC17 on Maps rendering and refresh work, repeated backend projections, route preparation, and owned shutdown.** The evidence supports focused changes; it does not support replacing SQLite or broadly slowing ESI polling.

This report analyses canonical RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` against released, post-optimisation v0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Application code, dependencies and version are unchanged. All 637 runtime tests, application type checks, and both production frontend builds passed locally.

The investigation branch is `perf/rc16-checkpoint-v0.8.0`. Main and the Universe feature branch remain untouched. Local backend/updater analysis is complete; final browser measurements are being collected. GitHub publication was initially held by automatic approval review; the user explicitly approved the internal upload and benchmark run on 30 September. The second-environment workflow is being prepared/run; no successful GitHub performance confirmation is claimed yet.

## What survived the feature sprint

The previous checkpoint's targeted improvements remain present in the code and effective in the repeated common-workload measurements. Selective import-cache invalidation, the 30-day working history projection, atomic bounded history writes, prepared snapshot access, and the session-event index have all been retained.

The old reports and raw workspace/GitHub evidence were recovered from both investigation branches. Their absolute timings provide historical context; the table below comes from a fresh, same-machine **v0.7.3 → RC16 → RC16 → v0.7.3** comparison. Numbers from different dates or machines are not divided together.

| Large legacy workload | Post-optimisation v0.7.3 | RC16 | Finding |
|---|---:|---:|---|
| Idle CPU, % of one logical core | 1.32–1.35% | 1.62–1.64% | About +0.29 percentage points; modest absolute increase |
| Idle process RSS | 82–101 MiB | 168–171 MiB | Meaningful extra residency; no leak conclusion |
| Largest observed idle loop delay | 36.2–36.8 ms | 55.4–56.9 ms | Higher burst cost in both short observations |
| Authenticated state HTTP p50 | 40.2–40.3 ms | 44.7–45.6 ms | +12.2%; repeatable advisory regression |
| Session-report p50 | 92.6–99.5 ms | 84.9–90.3 ms | Earlier large-report benefit retained |
| Imports after unrelated write | 0.70 ms | 0.69–0.71 ms | Selective cache reuse retained |
| Cold imports after aged-cache migration | 450–458 ms | 448–472 ms | Broadly unchanged |
| 1,000 history updates | 34.9–35.1 ms | 33.9–34.4 ms | No observed degradation |
| Working history JSON | 15.60 MiB | 15.60 MiB | Bounded working set retained exactly |

Typical session reports rose from about 15.0 to 16.5–16.8 ms; this smaller cost remains visible despite the faster large fixture. Server `startKairo()` initialisation rose from about 11–18 to 160–173 ms. That is roughly 150 ms extra inside this call, excluding module imports and supervisor launch; it is not a full boot-time measurement.

The large state payload barely changed, so the HTTP slowdown cannot be explained by a large transfer-size increase. Its direct projection/serialization timings are mixed. Profile the HTTP/scheduling phases before choosing a fix. Likewise, the increased memory footprint should be inventoried by static indexes, caches and lifecycle before proposing lazy loading or calling it a leak.

The database probes retain identical complete cold-import and saved history/source hashes across all four runs. Both builds retain exactly 16,355,000 working-history JSON bytes. Migration, event-batch writes and history writes show no structural regression. **A broad database redesign is not justified by this checkpoint.**

[Full legacy comparison](reviews/legacy-comparison.md) · [Raw comparison](raw/legacy-abba/comparison.json) · [Historical evidence](reviews/historical.md)

## New backend costs: repeated work dominates

These features did not exist in v0.7.3, so these are RC16 scaling measurements, not historical percentage regressions. The table shows two run medians, with scenario order reversed. Component timings exclude separately recorded JSON serialization.

| Production operation | Fixture | Observed median range |
|---|---|---:|
| Full Universe state | No visits | 12.6–14.6 ms |
| Full Universe state | 10,000 visits | 51.7–55.1 ms |
| Full Universe state | 100,000 visits | 136.4–138.8 ms |
| Complete Maps workspace | 1 populated map | 3.2–3.3 ms |
| Complete Maps workspace | 8 populated maps | 48.2 ms |
| Complete Maps workspace | 24 populated maps | 290.1–309.0 ms |
| Selected map detail | One of the 24 maps | 11.4–14.2 ms |
| Pure stargate route | Jita → Amarr | 9.7–11.1 ms |
| Service stargate route | Same route, 100,000 visits | 57.3–65.8 ms |
| Itinerary planning | 10 stops; 10,000 visits | 287.8–307.4 ms |
| Itinerary planning | 50 stops; 10,000 visits | 1,492–1,506 ms |

The 24-map fixture is deliberate stress: 100 nodes, 99 links and 100 signatures per map, plus the production discovery source. It is within supported limits; it is not described as a typical user's workspace.

The strongest causal evidence is the read-count diagnostic. A full 24-map response performs **5,432 SQL executions**, emits the same **2,376 links as 59,400 result rows**, and makes **4,752 signature point lookups**. The browser often needs selected-map detail and a compact chooser, yet the list path projects every map. Request-level batching and a summary/detail contract are therefore higher-value than adding a broad cache blindly.

Routing also constructs full live context, including travel history that an ordinary route does not use. A 50-stop itinerary repeats that preparation for every leg, including 50 history aggregations. Build one bounded context/graph per planning request and keep unrelated history out of route preparation. Preserve route policy, dynamic access, wormhole expiry/mass, map scope, warnings and itinerary ordering.

For Universe state, share one history aggregation across consumers and invalidate it from actual visit/annotation changes if caching is warranted. Existing indexes still require grouping/sorting; an extra index must earn its write/storage cost in a measured before/after test. Existing heap-based routing and jump spatial indexing should remain.

[Backend review and source references](reviews/backend.md) · [Timing data](raw/backend-timings.json) · [Reverse-order data](raw/backend-timings-reverse.json)

## Browser findings

Final browser measurements are pending. The completed code review and diagnostic smoke identify two coordinated targets: Maps rebuilds its scene through React camera-state updates, while matching change events immediately reload the complete map list. The final report will distinguish measured interaction cost, idle work, payloads and request amplification.

[Frontend review](reviews/frontend.md)

## Updater: retain the design and budget its peak work

The actual CCP build 3552227 archive (99,197,259 bytes) completed the unchanged production worker/install pipeline in **10.97 seconds**, using **14.49 CPU-seconds**. Peak process-plus-worker RSS reached about **386 MiB**. The service thread's event-loop utilisation was 2.12%; p99 delay was 5.89 ms with a 5 ms histogram resolution. This supports worker isolation in this test; it does not measure contention while a large map and OBS are active.

The retained generation was 21.97 MiB. Temporary archives, spools and staging files were cleaned up. Actual worker cancellation completed in 6.78 ms and left only the small status file. The local archive avoids Internet throughput effects.

One hundred concurrent metadata checks coalesced to one fetch; 1,000 checks inside the cache window fetched nothing. A simulated startup plus 24 hourly checks retained one timer. There is no evidence here that ordinary update checks need to be slowed further. Do not remove integrity checks, rollback or generation cleanup to improve a benchmark.

Worker allocation/compression tuning is a later measured opportunity, after the recurring map work. Any updater changes should be retested under a loaded application with real managed activation/reconnect and old-generation cleanup.

[Updater review](reviews/updater.md) · [Archive measurement](raw/updater-archive.json) · [Provenance](raw/updater-provenance.json)

## Operational ownership and consolidation

**Resolve asynchronous shutdown ownership before final release.** The real semantic bus starts asynchronous callbacks without retaining a drainable task set. A deterministic probe held a history name lookup across listener disposal: it subsequently attempted a publish, and closing the in-memory database first produced a swallowed `ERR_INVALID_STATE` error. This proves the ownership gap; it does not establish its frequency or reproduce a full supervisor failure.

Introduce a bounded quiesce/drain phase before closing storage. Preserve accepted history events, handle rejected lookups, and avoid deadlocking nested semantic events. The new planned dataset restarts make this shared lifecycle boundary especially important. Turn the diagnostic into a behaviour regression test in the implementation branch.

Other consolidation opportunities are narrower and have not yet been assigned measured gains:

- Identical public combat valuations currently rewrite ledger rows; new politics triggers turn those writes into additional queued work. Make content changes idempotent while preserving corrected values and missing-event repair.
- Live-session route targets are rebuilt on the three-second tick before the two-minute feed deadline is checked. Move cheap eligibility/deadline checks earlier, retaining explicit and end-of-session rechecks.
- Unchanged widget projections still broadcast, and full names dictionaries are serialised per client. Measure connected dashboard/OBS workloads before changing shared projection/SSE ownership.
- Give replaceable HTTP/job caches explicit retention policies. Keep durable player history distinct from disposable cache data; do not add routine blocking vacuum work.
- Extract common ESI transport policy helpers for reads and commands, while preserving their different retry/cache semantics. Update architecture documentation to reflect the supervisor/child model and Universe history ownership.

[Architecture review](reviews/architecture.md) · [Shutdown reproduction](raw/architecture-shutdown.json)

## Proposed RC17 implementation sequence

| Order | Work | Required evidence before accepting it |
|---|---|---|
| 1 | Owned async shutdown/drain | Deferred lookup, rejection, nested event and managed restart tests; no accepted writes after store closure |
| 2 | Maps camera/scene isolation and scoped refresh coalescing | Repeated browser interaction and burst measurements; keyboard, drag, selection, save ordering, revision and expiry behaviour preserved |
| 3 | Batch Maps projection reads; compact chooser/selected detail | Link/signature reads scale with data once per request; complete decoded map data and access scopes remain equivalent |
| 4 | Reuse itinerary context/graph; remove unrelated route history | Same routes, costs, warnings and dynamic policy, with material latency reduction on 10/50-stop fixtures |
| 5 | Share visit aggregates; investigate state/RSS overhead | Concrete dependency invalidation, migration/write-cost checks, phase profiling; no broad cache rewrite without evidence |
| 6 | Selected no-op write, cadence and transport-policy consolidation | Domain-specific behaviour tests and counters; measured benefit before expanding scope |

Start that work from **clean canonical RC16**, retaining this branch as external evidence. Rerun common and new workloads in balanced order with the same fixture/runtime/browser within each environment. Compare output correctness alongside time and memory. Keep the existing 637 runtime tests and Universe/Maps/replay/reconnect acceptance checks, adding focused regressions for changed contracts.

The final RC17 review package must contain no analysis harnesses, performance fixtures, traces or investigation workflows. Test the extracted package and hand it over for human end-use review. Merge 0.8.0 only after the user's approval. This checkpoint implements none of those production changes.

## Evidence and limits

All local timing lanes run sequentially. Source identities, fixture definitions, commands, sample limits and exclusions are documented in [METHOD.md](METHOD.md), with an [independent methodology review](reviews/methodology.md). Short synthetic samples are not production percentile guarantees. Linux headless measurements do not establish Windows/GPU power, physical fan activity, EVE/OBS contention or long-term memory retention.

The independent GitHub confirmation remains pending completion of the authorised workflow. Current findings are a substantial local baseline and code/operation review, not a claim of two-environment verification.
