# Idle CPU source audit: RC16 versus candidate 05d

This read-only audit identifies source-level attribution targets for the observed idle CPU regression. It does **not** establish a measured cause or accept the regression. No application, harness or raw evidence was changed, and no workload, benchmark or test was run for this audit. Profiling and operation-count evidence must be evaluated separately.

Reviewed production identities:

- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`, from the canonical baseline checkout.
- Candidate: `05d0d4b36c154329006d6772769063db874762da`, from the frozen candidate checkout.

Unless marked RC16, application line references below refer to candidate 05d. Harness references are relative to `analysis/rc17` in this analysis repository. The workload under review has fresh cached inputs, no active Session, no goals, no Stream elements or clients, and no populated maps. Source inspection can predict which paths should run; diagnostic counters must confirm those predictions.

## Findings and attribution limits

| Classification | Finding | What it establishes |
|---|---|---|
| New recurring cost | Session live-feed checks its persisted deadline before looking for active targets. | One additional settings read per eligible pilot/tick on the empty-session path, when the feed is neither closed nor already pending. This is a concrete change, not a demonstrated explanation of the CPU delta. |
| New allocation with offsetting savings | Empty binding updates allocate a projection context and result map. | No character, snapshot, name, goal or Session read is performed by that context when elements are empty. Candidate also avoids the old unconditional Stream state construction, so net cost requires measurement. |
| Unchanged startup work inside original measurement | Politics bootstrap can continue during the original 35-second idle window. | Original “idle” combines cached recurring work with initial queue drain/inference; it is not guaranteed to be post-bootstrap steady state. The same Politics implementation runs in both versions. |
| Inherited recurring work | Cached feeds rebuild their public state; Core repeats roster, metadata and OPSEC reads; Operations checks configuration every tick. | These are worthwhile attribution and future consolidation targets. Their presence alone does not explain a cross-version regression. |
| Excluded by expected cached/empty path | Goal preparation, fresh-response Session capture, asset enrichment and map/route projection contexts. | These should not execute in this measured idle state. Unexpected executions would invalidate that exclusion and require investigation. |

## New empty-session cursor read

Candidate `server/session-live.mjs:67–73` calls `deferred(store.get(key, {}), force)` before `getTargets()`. The deadline predicate is at line 12, and `key` is `session:live-feed` at line 4. RC16 `server/session-live.mjs:66–70` checks `getTargets()` first and returns immediately when it is empty; its persisted cursor read occurs only inside `run()` at lines 33–35.

The unchanged caller is `server/session-combat.mjs:146–149`: each eligible pilot's `syncRecent(id)` checks recent/active Sessions and invokes the shared `live.sync()`. `liveTargets()` at lines 33–37 queries active Sessions and constructs routes only for returned rows. Core invokes `syncRecent` for each connected pilot on the three-second tick (`server/core.mjs:329–332`). The fixture Sessions are all ended more than a day earlier (`harness/backend/fixture.mjs:34,60–63`), so this path has no Session route to construct.

For the fixture's missing cursor, candidate therefore adds a settings SQL lookup plus default-object/deadline handling while still performing the empty active-Session query. `store.get` only parses JSON when a row exists (`server/store.mjs:129`); this missing-key case does **not** add a large JSON parse. The expected extra call count scales with eligible pilots and completed ticks, not with archived Sessions. Counts must confirm the exact number and CPU sampling must establish its significance.

This reordering has an intended benefit when the cursor is deferred: it avoids reconstructing potentially long active Session routes before discovering that collection is not due. It would be premature to remove that benefit or attribute the whole idle regression to this small empty-session cost.

## Original idle window includes possible Politics bootstrap drain

`server/universe-politics.mjs` is byte-identical across the two production identities. It defines `BATCH = 1000`, `BOOTSTRAP = 2000`, and an ordinary five-minute refresh interval (`:4–5`). Its constructor installs queue tables and combat-record triggers (`:206–220`). On first refresh, it queues up to 2,000 existing rows from **each** of `combat_records` and `alliance_combat_records` (`:247–263`), drains up to 1,000 rows (`:264–270`), computes/persists inference when required (`:275–288`), and schedules another pass after three seconds if records remain (`:289`).

Core performs a startup refresh (`server/core.mjs:375–376`) and calls the same refresh from its three-second scheduler (`:325–332`). The synthetic fixture inserts the same count of personal and alliance records (`harness/backend/fixture.mjs:68–74`), with 600 per table for typical and 4,000 per table for stress (`:13–16`). The fixture is seeded before `startKairo` constructs Core (`harness/backend/worker.mjs:65–69`).

Source-derived queue arithmetic immediately after one startup drain is:

| Fixture | Initially enqueued | Startup batch | Remaining | Further batches needed |
|---|---:|---:|---:|---:|
| Typical | 1,200 | 1,000 | 200 | 1 |
| Stress | 4,000, capped at 2,000 per table | 1,000 | 3,000 | 3 |

The original backend runner waits only one second before starting its default 35-second idle meter (`harness/backend/backend.mjs:10,15–18`). It does not wait for an empty Politics queue. Consequently, subsequent scheduler passes can drain and infer during the measured interval despite zero network requests and fresh ESI/feed caches. The table is a source-derived expectation, **not a queue measurement from the original runs**; startup duration and scheduler phase determine the actual queue at meter start.

This is inherited startup behavior and a workload-phase attribution concern. It cannot by itself establish why candidate CPU was higher, since both versions use the same algorithm and input counts. Preserve the original results. Report any separately measured post-bootstrap steady-state window under its own label, with direct queue snapshots before and after the window; do not silently replace or relabel the original evidence.

## Repeated cached work inherited from RC16

### Core scheduler, character reads and OPSEC

Core retains the three-second scheduler and ten-second binding/heartbeat interval (`server/core.mjs:329–339`; RC16 `server/core.mjs:347–357`). Every three-second pass invokes Universe, Politics, protection synchronization, shared synchronization and eligible pilot synchronization. The following remain substantive cached work:

- `syncDataset`'s finalizer calls `refreshOPSEC` for protection keys even when `runDataset` returns on fresh scheduling metadata (`server/core.mjs:145–154,160–189`).
- `sync(id)` rereads characters, visits enabled datasets, and finishes with OPSEC and binding refresh (`:284–290`).
- `protectedCharacter`, `refreshOPSEC` and `syncProtection` reread roster/settings; each OPSEC refresh loads the seven protection snapshots and reconstructs standing-source data (`:299–322`; protection keys at `:26`).
- `auth.characters()` executes the character query and parses every returned scopes value on each call (`server/auth.mjs:57`). Its file is byte-identical between versions.
- `store.snapshot` decodes the body on every read, whereas `snapshotMetadata` retrieves metadata without decoding that body (`server/store.mjs:131–132`). Freshness avoids external collection, not all local decoding and evaluation.

These are inherited repetition/consolidation opportunities, not newly introduced polling frequency. Instrument calls by dataset and operation before choosing a caching boundary; freshness, access and module changes must remain visible.

### Universe feeds and operational ticks

`server/universe-feeds.mjs` is byte-identical. `tick()` prunes expiry and calls `refresh()` (`:227`). `refresh()` calls `observeNpc`, checks collectors, and returns a newly built `state()` even when cached inputs are fresh (`:219–225`). `state()` rereads cached feeds and three snapshots, rebuilds source metadata/derived arrays/counts, and copies/filters bundled points (`:187–217`). `observeNpc` also reads the kills snapshot (`:178–185`).

Expiry pruning is reached once directly from `tick` and again through `state`. Each prune reads Thera/Turnur data and calls `scheduleExpiry`, which rereads those cached arrays (`:41–65`). Empty arrays make this small, but it is recurring local work with no network activity.

Universe's tick remains `cleanupExpired(); jspace.cleanupSources(); Promise.allSettled([operations.tick(), feeds.tick()])` (`server/universe.mjs:747`). Operations' `runTick` body is unchanged: roster/configuration checks, log setup, `tail.tick`, then another roster/configuration pass for fleet eligibility (`server/universe-operations.mjs:608–626`). J-space `cleanupSources` is unchanged and throttled to 30 seconds (`server/universe-jspace.mjs:151–163`); an empty tracking-source query does not project populated maps.

The new map/request projection contexts and route preparation paths are not called by this empty-map tick. Candidate's link-query indexing may affect query execution, but this source audit makes no query-plan or timing claim for the fixture with no links.

## New preparation that does not imply eager idle reads

Goals' `prepareGoalInputs` eagerly reads the roster once, then keeps snapshots/settings/names lazy and local to the request (`server/goals.mjs:19–58`). However, `refresh()` selects relevant active goals and returns before preparation when none exist (`:179–182`). Core calls Goals refresh after dataset success or combat change (`server/core.mjs:51–54,213`), not from the cached-return branch.

`listGoals()` does prepare before its empty result query (`server/goals.mjs:88–93`), so an empty/manual Goals request can add a roster read. `goalSourceOptions()` also prepares (`:61–70`). These are request paths, not evidence of scheduled idle work. Count their execution if they appear in a diagnostic run.

`bindingProjections()` creates its input context and result map before iterating elements (`server/projections.mjs:36–59`). Empty elements therefore incur allocation and a clock read, but lazy readers never execute. This happens through `updateBindings()` (`server/core.mjs:324`) after synchronization and on the heartbeat. Candidate's Stream additionally checks unchanged bindings and returns before broadcasting (`server/stream.mjs:42`), and avoids constructing state for zero clients (`:25–28`). RC16 unconditionally called `changed()` from `setBindings` and eagerly constructed the default `broadcast` state (`server/stream.mjs:24–32,44`). The net empty-Stream cost cannot be inferred from the projection allocation alone.

Session observation capture is after an actual fresh ESI response (`server/core.mjs:193–199`); asset enrichment is also downstream of that response (`:122–124,199`). The cached deadline return precedes both (`:183–189`). With the fixture's seven-day-fresh snapshots (`harness/backend/fixture.mjs:33,40–51`) and zero unexpected dataset execution, neither is an idle attribution target.

## Diagnostic acceptance points

1. Record Politics queue counts after startup, after warmup, and around measurement windows. Separate initial queue/inference activity from an explicitly empty-queue steady-state window.
2. Count `sessionCombat.syncRecent`, `store.get('session:live-feed')`, active-Session queries and actual live-feed work. The extra cursor lookup should be visible without Session route construction or network requests.
3. Count roster queries, snapshot/metadata reads by dataset, settings reads by key, OPSEC refreshes, binding updates and Universe subtasks. Distinguish SQL operation counts from decoded JSON volume.
4. Confirm zero dataset response/enrichment/Session-capture work and zero unexpected Goals preparation on the cached empty workload. Capture Stream element/client counts.
5. Inspect CPU profile self/inclusive frames for Politics inference, cached scheduler work, feed-state construction, SQL/JSON, compilation and garbage collection. Identical operation counts do not imply identical CPU; compilation or GC is a hypothesis only if the profile supports it.
6. Keep count/profile diagnostics separate from unbiased timing. Expensive stack capture can distort the work being attributed, and overlapping asynchronous inclusive timings must not be summed as if sequential.

A cause remains unassigned until those observations explain the regression. No source finding here justifies dismissing the measured increase or accepting it as the cost of the refactor.

## Read-only identity checks

Direct byte comparison verified these identical files, with the same SHA-256 in RC16 and candidate:

| File | SHA-256 |
|---|---|
| `server/universe-politics.mjs` | `447c9bcf5773ba69fc854f318472c03695a1259300bd8f8421bc12a422a5f1ac` |
| `server/universe-feeds.mjs` | `048346eb48b714ee9c1f4782d8816a836dfd2135efe9e0bfa3cbe8dbd2ac9a1f` |
| `server/session-combat.mjs` | `c95f3e7d0b462ccbe624cab44799f3b8529e428802a329129f8a25866ee9c535` |
| `server/auth.mjs` | `5928835004bd53b0754b36aeec33a32f8c50f4e3125d4a59f960eae2ee6d5fcc` |

The `runTick` function body in `universe-operations.mjs` and `cleanupSources` body in `universe-jspace.mjs` were also directly compared and are identical; their surrounding files contain other refactoring changes.
