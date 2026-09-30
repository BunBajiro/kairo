# Follow-up: backend residency and long live sessions

**Decision:** RC16's additional backend residency is substantially attributable to eagerly constructed Universe data and indexes. The static graph is lazy at import time, but **Core creation loads it before the user opens a map**. Detailed celestial data remains lazy and its 48-system LRU behaved as intended. Separately, live-feed cache hits rebuild all active session routes before checking their deadline; this is a useful targeted optimization, but it is inherited from v0.7.3 rather than introduced by RC16.

No production code was changed. No updater/archive measurements were repeated.

## Provenance and scope

- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`.
- Released baseline: `239794774320fcdebaa1d76ce8a77c5c25cfc48c` (v0.7.3).
- Harnesses: `followup/harness/memory-common.mjs`, `memory-residency.mjs`, `memory-sessions.mjs`, `memory-runner.mjs`; existing-data summarizer `memory-summarize.py`.
- Raw manifest: `raw/followup/memory-all-run.json`; aggregate: `raw/followup/memory-summary.json`. Every child sample records the actual source root/commit, production file hashes verified against its canonical Git tree, harness hashes, environment and zero external-request count. The runner manifest binds raw sample hashes; the summarizer verifies them before aggregation.
- All fourteen fresh child processes ran sequentially in an exclusive root-assigned slot, with each child holding `/tmp/kairo-rc16-benchmark.lock`. There were no failed runs or post-measurement harness fixes. Node 24.19.0, Linux x64, AMD EPYC 9V74. The normal allocation lane and the forced-GC lane each ran baseline → RC16 → RC16 → baseline. Session timing used another ABBA sequence; separate SQL diagnostics ran once per build.

Tables show the median of two independent child observations, or the median of their per-operation medians. These small-n summaries establish scale and repeatability here; they are not confidence intervals or claims about the user's Windows PC.

## Where the additional memory appears

The common fixture contains four synthetic pilots, small current profile/location snapshots, empty public activity/contact data, no assets, no live sessions and no user-created map nodes. Collectors are disabled with `noSync`; HTTP servers, the supervisor and the browser are absent. This deliberately isolates backend construction from the much richer historical workload, so it does not fully decompose every byte of the earlier end-to-end memory gap.

**Ordinary fresh-process snapshots: no forced garbage collection.** These are RSS/heap observations immediately after work, including not-yet-collected allocations; they are not retained object sizes.

| Phase | v0.7.3 RSS MiB | RC16 RSS MiB | v0.7.3 JS heap used MiB | RC16 JS heap used MiB |
|---|---:|---:|---:|---:|
| Harness baseline | 37.75 | 37.75 | 7.92 | 7.90 |
| Store opened, four pilots seeded | 39.94 | 40.13 | 8.14 | 8.12 |
| Core module imported | 55.16 | 60.13 | 14.81 | 16.74 |
| Core constructed | **55.60** | **120.13** | **15.14** | **53.60** |
| Core closed and reference released | 55.73 | 120.32 | 15.17 | 53.65 |

Ordinary Core construction took **5.37 ms** for v0.7.3 and **128.08 ms** for RC16 in these phase markers. Core module import was 28.00 ms versus 42.95 ms. These are minimal local component startup observations with cached filesystem data, not complete packaged-app startup times. Immediate `close()` snapshots do not imply a leak: `close()` does not force collection or return allocator pages to the OS.

**Separate forced-GC attribution:** every marker follows event-loop yields and two explicit GC calls. No timing values from this lane are reported or compared with ordinary latency.

| Diagnostic stage | RC16 retained heap MiB | Increment from previous stage |
|---|---:|---:|
| Store opened | 6.93 | — |
| Core module imported | 13.61 | +6.68 MiB |
| Explicit first topology load | 29.95 | **+16.34 MiB** |
| Core constructed with topology already loaded | 40.73 | **+10.78 MiB** |
| First Universe + J-space state pair for each of four pilots | 40.92 | +0.19 MiB |
| Another 80 pilot state pairs | 41.12 | +0.20 MiB |

For comparison, v0.7.3's GC-observed Core module heap is 12.03 MiB and constructed Core heap is 12.19 MiB. RC16 therefore retains about **28.54 MiB more JS heap** at constructed Core in this diagnostic. Approximately 16.34 MiB is the topology stage, 10.62 MiB is the additional constructor stage after subtracting baseline constructor growth, and 1.58 MiB is additional module-import retention. This explains much of the extra residency without labelling all RSS as retained JavaScript.

The dependency path is explicit: `server/core.mjs:38` calls `createUniverse`, and `server/universe.mjs:73` calls `getUniverseStatic()`. `server/universe-static.mjs:41–77` inflates/parses the atlas, enriches wormhole systems and creates shared lookup/adjacency views. Topology's full celestial shards are not loaded here.

Per-instance indexes are also created eagerly. `universe.mjs:77`, `universe-operations.mjs:24`, and `universe-navigation.mjs:17` each build lowercase-name maps. `universe-intel.mjs:3–12` builds exact-name and prefix maps for parsing. These are concrete consolidation candidates; the measurements do **not** attribute all 10.78 MiB to any single map or predict the saving from sharing them.

## First-use caches and bounded lifecycle probe

Each RC16 retention run validated 124 Universe state returns, 124 J-space state returns, 9,490 lightweight system lookups, 384 celestial records and ten Core recreation cycles. Character/system identity and return shapes were asserted. No-op or null responses could not silently produce a better figure.

| Diagnostic | Retained heap observation | Meaning |
|---|---|---|
| First 1,000 distinct lightweight details | 41.66 MiB, +0.54 MiB | Small per-system enriched records |
| Lightweight details across all 8,490 systems | 44.83 MiB, +3.71 MiB from pre-detail state | `lightCache` has no LRU but is bounded by the finite atlas |
| First 48 celestial details | 45.81 MiB | Around 1 MiB extra for this system sample |
| 192 celestial systems visited in total | 45.86 MiB | The 48-entry LRU prevents retaining every detailed record |
| 384 celestial systems visited in total | 45.57 MiB | Data-dependent size, no accumulation proportional to systems opened in this sample |
| Core closed after cache population | 35.04 MiB | Around 10.54 MiB of per-Core retained heap became collectible; module-level caches remain |

The limits come from `universe-static.mjs:8–12,81–99,130–134`. The light-cache growth is an intentional finite cache cost, not unbounded growth with session length. Shared module caches surviving Core closure are consistent with module/process lifetime; normal SDE activation replaces the child process.

There is a distinct **unresolved RSS observation** in the artificial same-process recreation probe. After recreate/use/close cycles 1 → 5 → 10, RC16's post-GC heap used is **35.05 → 35.19 → 35.45 MiB**, but RSS rises **137.69 → 165.01 → 197.41 MiB**. V8's allocated heap capacity (`heapTotal`) also rises **101.20 → 164.57 → 164.82 MiB**: approximately 64 MiB more heap capacity accompanies the approximately 60 MiB RSS rise. Both RC16 repetitions reproduce the RSS rise. Native contexts stay at one and detached contexts at zero. v0.7.3 changes from 12.17 → 12.38 MiB heap used and 57.02 → 57.34 MiB RSS between cycles 1 and 10.

This does not justify either “no memory growth” or “a 60 MiB JavaScript leak.” The probe demonstrates that most per-Core JS becomes collectible while V8 heap capacity and process residency expand over ten deliberately repeated constructions. Increased V8 capacity is a visible contributor to investigate; these snapshots do not allocate the RSS difference precisely among heap reservation/commit, other allocator behavior, native allocations or caches, and do not establish an eventual plateau. The actual supervisor uses a new process for replacement, so this same-process construction pattern is diagnostic rather than the normal updater path. If future consolidation introduces in-process reconstruction, require heap-capacity/native allocation attribution or an additional process-memory gate; the integrated restart lane provides the relevant current-process-lifecycle evidence.

## Long live-session scaling and duplicate work

Fixtures use 100, 1,000 and 10,000 raw visits, one minute apart, cycling through 100 systems. They represent 1.67 hours, 16.67 hours and 6.94 days of an unended session; the last is an intentionally extreme but supported long-session bound. Each visit has a distinct, continuous presence interval; all durations and the final active interval are checked. Four-pilot coverage uses one 1,000-visit live session per pilot.

The feed's actual cache state sets `nextCheckAt` one hour ahead. Thus `sessionCombat.syncLive()` is a real production cache-hit call with **zero network work**, not a stubbed replacement. Timing samples are uninstrumented: three warmups, seven samples per operation. SQL counts come from a separate diagnostic lane.

| Workload | v0.7.3 cache-hit live sync ms | RC16 cache-hit live sync ms | RC16 route alone ms | RC16 route + groups ms |
|---|---:|---:|---:|---:|
| 100 visits, one live session | 0.69 | 0.78 | 0.67 | 0.68 |
| 1,000 visits, one live session | 5.40 | 5.80 | 5.17 | 5.75 |
| 10,000 visits, one live session | **52.46** | **54.33** | 49.90 | 54.13 |
| 100 in-session visits plus 10,000 older visits | 0.57 | 0.65 | 0.51 | 0.58 |
| Four live sessions with 1,000 visits each | 22.34 | 22.16 | 4.42 per single session | 5.40 per single session |

The two builds show the same scaling shape; these figures do not support claiming a new material RC16 regression in this lane. RC16's larger route serialization size is separately observable: 3,087,894 bytes for 10,000 rows versus 2,807,894 bytes in v0.7.3, reflecting the added per-visit sovereignty field. Timing excludes serialization and HTTP.

The specific wasted work is proven by SQL counts. Three sequential cache-hit calls with the 10,000-visit session perform **three route queries returning 30,000 rows** despite no fetch. With four live sessions, they perform **12 route queries returning 12,000 rows**. `session-live.mjs:69` calls `getTargets()` before the deadline check at `:35`; `session-combat.mjs:33–37` constructs every active route and its groups. Concurrent calls still share the pending flight, so this is repeated work across sequential ticks, not evidence of concurrent duplicate downloads.

There are two important boundaries:

- **Request groups are already deduplicated.** All these fixtures yield 100 system/year/month groups. `sessionCombatQueries` uses a keyed map at `session-combat.mjs:11–23`. Repeated presence windows cannot simply be collapsed by system without losing timing semantics.
- **Session routes are not a lifetime aggregate scan.** Adding 10,000 earlier visits outside the 100-visit session still returns only 100 visits per call. `EXPLAIN QUERY PLAN` uses `idx_visits_character_at` with character and timestamp bounds, then primary-key system lookup; a temporary B-tree handles the final order term. This differs from the lifetime `GROUP BY system_id` overlay reviewed in the earlier backend lane.

Cross-build assertions cover route system/time/duration/active fields and complete combat query groups across five fixtures. They do **not** prove whole session-report, sovereignty, ship, event-cap or replay equivalence. The frontend follow-up covers bounded browser replay scaling through 1,000 visits and 200 events; it does not establish 10,000-event-cap acceptance. These route fixtures model recorded presence, not a claim that consecutive synthetic system IDs form a physical gate route.

## Priorities and retest gates

1. **Avoid target construction when live-feed cadence is not due.** Place the cheap scheduling decision before expensive route/group creation while preserving force handling, pending-flight coalescing, active-session checks and accepted killmail semantics. The inherited 10,000-visit cache-hit work costs about 54 ms on this host; a deadline guard directly addresses measured recurring work. Retest no-due calls, due calls, manual force, session start/end, failed verification and cursor advancement.
2. **Treat topology plus immutable indexes as an explicit memory budget.** Consider sharing readonly lowercase-name/prefix indexes by atlas identity, or lazily constructing subservice indexes when first needed. Preserve shared atlas immutability, custom injected atlas behavior, pilot isolation and OPSEC/location access. Do not claim the whole topology can be deferred until a browser map opens; core protection and enrichment also use it.
3. **Keep existing cache bounds unless changed deliberately.** Preserve celestial LRU behavior and allow for the finite ~3.7 MiB lightweight cache observed after exhausting the atlas. If changing cache ownership, rerun first-use and all-system probes, identity guards and child-restart isolation.
4. **Do not turn the recreation RSS observation into an unjustified release blocker or a clean bill of health.** It includes increased V8 heap capacity and unresolved process residency in an artificial path. Preserve the real process replacement model and use integrated restart measurements for ordinary update lifetime; investigate heap capacity and native allocation ownership if adding in-process reconstruction or if real replacement fails to release memory.

For the implementation retest, preserve both lanes: ordinary no-GC latency/RSS and separately labelled forced-GC diagnostics. Repeat ABBA with the same fixtures; do not compare future ordinary heap directly with these collected-heap values. Increase repetitions only for a specific remaining ambiguity. No harness in `analysis/rc16/**` belongs in RC17.

## Reproduction and portability

```bash
node analysis/rc16/followup/harness/memory-runner.mjs --run all
python analysis/rc16/followup/harness/memory-summarize.py
```

Run only in an assigned timing slot. **The runner acquires the shared flock itself; do not wrap it in a second flock.** Individual child launches have a 120-second deadline. Baseline defaults to the sibling `kairo-v073` checkout; `KAIRO_MEMORY_BASELINE_ROOT` overrides it. Its canonical file manifest is retained inside this analysis repository.

For clean RC17 retesting, set `KAIRO_MEMORY_CANDIDATE_ROOT` and optionally `KAIRO_MEMORY_CANDIDATE_COMMIT` (otherwise HEAD is read). The source tree is obtained from that commit and every production file hash is checked; a supplied `KAIRO_MEMORY_CANDIDATE_MANIFEST` can replace Git tree discovery. Results record the actual candidate source root, commit and hashes with `candidateOverride: true`. The historical runner lane name remains `rc16`; it must not be mistaken for the candidate's actual source revision.
