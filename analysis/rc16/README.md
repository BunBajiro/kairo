# Kairo RC16 performance and refactoring checkpoint

30 September 2026 · v0.8.0-rc.16 · Internal analysis only

**Recommendation: retain the earlier database/cache optimisations and the updater design. Concentrate RC17 on Maps rendering and refresh work, repeated backend projections, route preparation, and owned shutdown.** The evidence supports focused changes; it does not support replacing SQLite or broadly slowing ESI polling.

**Follow-up and expanded scope:** the [follow-up checkpoint](followup/README.md) adds Maps-independence, mixed-workload, managed-restart, memory and replay evidence, the Journey retirement decision, and whole-application refactoring coverage. The pass covers Kairo's existing foundations as well as RC1–RC16 features. A malformed storm cache was discovered in the original legacy idle fixture; those frozen results below are qualified. The [corrected backend comparison](reviews/followup-legacy-corrected.md) is now complete locally and in [focused CI run 37073070547](https://github.com/BunBajiro/kairo/actions/runs/37073070547), after building both applications. CI independently confirms higher startup, residency and idle stalls, without a general state-HTTP slowdown. The two earlier full follow-up runs remain failed: their separate trace proves the dashboard backlog cutoff destroys a large asset frame. The [CI review](reviews/followup-github.md) preserves those failures alongside the successful corrected backend lane. Application source remains unchanged.

This report analyses canonical RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` against released, post-optimisation v0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Application code, dependencies and version are unchanged. All 637 runtime tests, application type checks, and both production frontend builds passed locally and on GitHub.

The investigation branch is `perf/rc16-checkpoint-v0.8.0`; [draft PR #8](https://github.com/BunBajiro/kairo/pull/8) retains the investigation for review. Main and the Universe feature branch remain untouched. The original local checkpoint and independent [GitHub workflow](https://github.com/BunBajiro/kairo/actions/runs/36708404690) are complete. GitHub passed at measured harness commit `0344ff4ec069080a87e19294fa8fddc28f737327`; later investigation commits contain analysis material only. The principal scaling and lifecycle findings reproduce. The local state-HTTP slowdown does not reproduce, and GitHub observes a small Overview-idle overhead absent from the overlapping local ranges. See [GitHub confirmation](reviews/github-confirmation.md), together with the legacy-fixture qualification below.

## What survived the feature sprint

The previous checkpoint's targeted improvements remain present in the code and effective in the repeated common-workload measurements. Selective import-cache invalidation, the 30-day working history projection, atomic bounded history writes, prepared snapshot access, and the session-event index have all been retained.

The old reports and raw workspace/GitHub evidence were recovered from both investigation branches. Their absolute timings provide historical context; the table below comes from a fresh, same-machine **v0.7.3 → RC16 → RC16 → v0.7.3** comparison. Numbers from different dates or machines are not divided together.

| Original large legacy workload | Post-optimisation v0.7.3 | RC16 | Finding |
|---|---:|---:|---|
| Idle CPU, % of one logical core | 1.32–1.35% | 1.62–1.64% | About +0.29 percentage points; modest absolute increase |
| Idle process RSS | 82–101 MiB | 168–171 MiB | Meaningful extra residency; no leak conclusion |
| Largest observed idle loop delay | 36.2–36.8 ms | 55.4–56.9 ms | Higher burst cost in both short observations |
| Authenticated state HTTP p50 | 40.2–40.3 ms | 44.7–45.6 ms | +12.2% locally; not reproduced on GitHub |
| Session-report p50 | 92.6–99.5 ms | 84.9–90.3 ms | Earlier large-report benefit retained |
| Imports after unrelated write | 0.70 ms | 0.69–0.71 ms | Selective cache reuse retained |
| Cold imports after aged-cache migration | 450–458 ms | 448–472 ms | Broadly unchanged |
| 1,000 history updates | 34.9–35.1 ms | 33.9–34.4 ms | No observed degradation |
| Working history JSON | 15.60 MiB | 15.60 MiB | Bounded working set retained exactly |

**Idle-fixture qualification:** the original local and GitHub harness seeded `storms.data` as `[]`; RC16 requires `{storms:[],points:[]}`. Its background feed projection rejected inside `Promise.allSettled`, beyond the original completion checks. v0.7.3 has no equivalent Universe feed service. The original idle CPU/RSS/delay rows therefore describe a partial RC16 background workload, not a fully healthy warm-cache path. Frozen evidence remains intact. The [corrected backend follow-up](followup/README.md) adds real feed/tick-success guards; use its completed comparison for implementation acceptance. Direct common operations and the separate database probes retain their checked meanings.

The corrected stress comparison records idle CPU **1.364–1.551% → 1.662–1.666%**, RSS **101.57–101.70 → 171.95–172.55 MiB**, and maximum idle loop delay **39.55–42.30 → 58.92–59.64 ms**, with 12 successful real Universe ticks and no rejected subtasks in every RC16 idle observation. It retains higher residency/startup work; the modest HTTP increase is below the checkpoint's repeated 10% plus 1 ms signal rule. Small tick-audit overhead and feed-state warmup are disclosed; these local magnitudes are not portable budgets. The corrected two-CPU GitHub runner separately records stress CPU 1.538–1.543% → 2.217–2.257%, RSS 107.63–125.97 → 222.00–222.06 MiB and maximum idle delay 41.98–42.86 → 80.81–83.23 ms. Its HTTP medians are 49.64–51.37 → 48.45–50.38 ms; local and CI numbers are not pooled.

The original typical session-report increase (about 15.0 to 16.5–16.8 ms) does not persist in the corrected comparison, which records 15.51–16.81 versus 14.60–15.49 ms. Server `startKairo()` initialisation remains higher: corrected stress observations are 15.99–16.15 versus 154.20–164.52 ms. This call excludes module imports and supervisor launch; it is not a full boot-time measurement.

The large state payload barely changed, so the local HTTP slowdown cannot be explained by a large transfer-size increase. Its direct projection/serialization timings are mixed, and GitHub's paired HTTP measurements show no slowdown. Treat HTTP as an environment-specific profiling lead, not an established general RC16 regression. Likewise, the increased memory footprint should be inventoried by static indexes, caches and lifecycle before proposing lazy loading or calling it a leak.

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

The follow-up product decision supersedes caching the lifetime aggregate: retire the standalone Journey log, My footprint/visit counts and exploration percentages, and remove their aggregation from ordinary Universe/routing reads. Give Sessions an explicit bounded travel service and future session-owned movement recording; give discovery a minimal per-pilot identity contract. Preserve old session evidence, documented compatibility/export behavior, and the separate general activity/OBS event contract, which can still record events outside Sessions. The [dependency and upgrade matrix](reviews/followup-methodology.md) defines the required caller migration. Existing heap-based routing and jump spatial indexing should remain.

[Backend review and source references](reviews/backend.md) · [Timing data](raw/backend-timings.json) · [Reverse-order data](raw/backend-timings-reverse.json)

## Browser findings: Maps interaction is the clearest frontend target

The compiled RC16 browser run exercises real controls in headless Chromium with software rendering. The table contains three repeated six-click zoom samples per map size; the RAF column is an observed callback-interval statistic, **not a Windows desktop FPS claim**.

| Map systems | Main-thread task time per zoom sample | Observed RAF p95 range | Renderer tasks over 50 ms |
|---|---:|---:|---:|
| 25 | 1.15–1.24 seconds | 16.7 ms | 0 |
| 100 | 2.22–2.40 seconds | 50.0 ms | 0–3 |
| 300 | 3.37–3.48 seconds | 116.6–116.7 ms | 30–31 |
| 600 | 5.17–5.33 seconds | 233.3–250.0 ms | 21–26 |

The 600-node scripted pan also consumed about 4.22 seconds of main-thread task time. Large views therefore incur real interaction work, even when most scene content has not changed. Two concrete contributors are visible: each camera animation updates React state and regenerates scene elements, and it writes an inherited `--chain-zoom` CSS property each frame.

A reversible **analysis-only** browser experiment isolated the CSS contribution. In an A–B–B–A sequence on the same 600-node map, temporarily registering that property as a non-inheriting numeric property reduced three-click style-recalculation time from **1,209/1,264 ms to 7.9/6.9 ms**. Total main-thread work fell from **2,475/2,523 ms to 1,610/1,535 ms**; observed RAF p95 fell from about 217 to 100 ms. Removing that registration restored the slowdown. The probe changes registration/type metadata as well as inheritance, so it isolates the custom-property style path rather than inheritance alone. Source review found no consumers of the property. This is strong evidence for a small first change, followed by measuring the remaining React/scene cost. No application source was modified by the experiment.

Refresh amplification is separately confirmed. Ten identical change events triggered **ten complete Maps requests plus one Universe request**, returning about **7.45 MiB** of loopback responses in the four-map fixture. Ignoring stale responses does not avoid server work or transport. Coalesce matching changes, share scoped invalidation ownership, and request compact map summaries plus selected detail. Preserve the newest revision and pilot/map identity while writes are in flight.

The existing efficient boundaries should remain. Atlas and paused replay did not continuously repaint during their idle samples; each observed one paint, with paused replay's paint coinciding with the fallback state refresh. Some idle windows include ordinary periodic state/Universe/Maps polling, so they are not evidence of an endless animation loop. Atlas/ref-based camera and territory-worker ownership are useful existing patterns to preserve when shared frontend services change.

A measurement-observer bug in an exploratory browser run was detected and fixed: adjacent samples could retain a prior RAF observer. Final samples use a frozen corrected harness, bind observers to their own sample, and assert strictly increasing timestamps. Exploratory output is retained separately and is not the source of these final figures.

The minimal Overview comparison used the same compiled-browser fixture in balanced order: locally, v0.7.3 consumed 0.224–0.259% of the renderer-main-thread observation budget, RC16 0.243–0.250%, with no long tasks and three requests in each 35-second sample. Those local ranges overlap. GitHub measured 0.184–0.218% versus 0.246–0.256%, a small increase of about 17.6 ms renderer work per 35 seconds, or 0.050 percentage points. This does not establish broad idle equivalence or a large renderer-idle regression. It is distinct from the backend idle CPU increase above.

The statically loaded page JavaScript grew from 831,476 to 1,370,976 bytes; gzip size rose from 238,885 to 388,505 bytes (+62.6%). Navigation-boundary lazy loading is worth considering after the interaction/refresh fixes. It is a payload fact, not a measured 62.6% load-time regression.

[Frontend review](reviews/frontend.md) · [Final browser data](raw/frontend-browser.json)

## Updater: retain the design and budget its peak work

The actual CCP build 3552227 archive (99,197,259 bytes) completed the unchanged production worker/install pipeline in **10.97 seconds**, using **14.49 CPU-seconds**. Peak process-plus-worker RSS reached about **386 MiB**. The service thread's event-loop utilisation was 2.12%; p99 delay was 5.89 ms with a 5 ms histogram resolution. This supports worker isolation in this test; it does not measure contention while a large map and OBS are active.

The retained generation was 21.97 MiB. Temporary archives, spools and staging files were cleaned up. Actual worker cancellation completed in 6.78 ms and left only the small status file. The local archive avoids Internet throughput effects.

One hundred concurrent metadata checks coalesced to one fetch; 1,000 checks inside the cache window fetched nothing. A simulated startup plus 24 hourly checks retained one timer. There is no evidence here that ordinary update checks need to be slowed further. Do not remove integrity checks, rollback or generation cleanup to improve a benchmark.

Worker allocation/compression tuning is a later measured opportunity, after the recurring map work. Any updater changes should be retested under a loaded application with real managed activation/reconnect and old-generation cleanup.

[Updater review](reviews/updater.md) · [Archive measurement](raw/updater-archive.json) · [Provenance](raw/updater-provenance.json)

## Operational ownership and consolidation

**Resolve asynchronous shutdown ownership before final release.** The real semantic bus starts asynchronous callbacks without retaining a drainable task set. A deterministic probe held a history name lookup across listener disposal: it subsequently attempted a publish, and closing the in-memory database first produced a swallowed `ERR_INVALID_STATE` error. This proves the ownership gap; it does not establish its frequency or reproduce a full supervisor failure.

Introduce a bounded quiesce/drain phase before closing storage. Preserve accepted history events, handle rejected lookups, and avoid deadlocking nested semantic events. The new planned dataset restarts make this shared lifecycle boundary especially important. Turn the diagnostic into a behaviour regression test in the implementation branch.

The [follow-up](followup/README.md) has now measured connected protocol traffic and live-session cache-hit work, and extends the structural review across legacy Kairo services. Other candidates need explicit contracts and measured gains before expansion:

- Identical public combat valuations currently rewrite ledger rows; new politics triggers turn those writes into additional queued work. Make content changes idempotent while preserving corrected values and missing-event repair.
- Live-session route targets are rebuilt on the three-second tick before the two-minute feed deadline is checked. Move cheap eligibility/deadline checks earlier, retaining explicit and end-of-session rechecks.
- Unchanged widget projections still broadcast, and full names dictionaries are serialised per client. The follow-up connected protocol workload confirms repeated binding/state content; consolidate shared projection/SSE ownership while preserving freshness, protection and liveness.
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
| 5 | Retire lifetime Journey presentation/aggregation; separate session travel, discovery and general activity services | Old/new Sessions, replay/combat, saved settings, discovery, compatibility/export and observation-boundary races preserve their approved contracts |
| 6 | Whole-Kairo data preparation, lifecycle and policy consolidation, including existing Core/ESI/auth/market/asset/goal/UI paths | Separate measured costs from structural-only candidates; domain-specific behavior and meaningful no-change decisions; no general rewrite without evidence |

Start that work from **clean canonical RC16**, retaining this branch as external evidence. Rerun common and new workloads in balanced order with the same fixture/runtime/browser within each environment. Compare output correctness alongside time and memory. Keep the existing 637 runtime tests and Universe/Maps/replay/reconnect acceptance checks, adding focused regressions for changed contracts.

The final RC17 review package must contain no analysis harnesses, performance fixtures, traces or investigation workflows. Test the extracted package and hand it over for human end-use review. Merge 0.8.0 only after the user's approval. This checkpoint implements none of those production changes.

## Evidence and limits

All local timing lanes run sequentially. Source identities, fixture definitions, commands, sample limits and exclusions are documented in [METHOD.md](METHOD.md), with an [independent methodology review](reviews/methodology.md). Short synthetic samples are not production percentile guarantees. Linux headless measurements do not establish Windows/GPU power, physical fan activity, EVE/OBS contention or long-term memory retention.

GitHub independently confirms the retained database/cache benefits, higher backend residency and initialisation cost, large-workload idle stalls, map/route work amplification, Maps style-path cost, refresh multiplication and async-disposal gap. Its own paired comparisons qualify the local HTTP and sparse Overview findings, as documented in the [confirmation report](reviews/github-confirmation.md). Raw files are preserved separately under [raw/github-run](raw/github-run), with source/harness hashes, run metadata, artifact digest and job logs. The real-archive updater install/cancellation remains local-only; GitHub repeats its lightweight cache/scheduler checks. No cross-host absolute timing ratio is used.
