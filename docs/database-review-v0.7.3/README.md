# Database review at the v0.7.3 checkpoint

**Recommendation: keep SQLite and the useful parts of the current data model; do a small, targeted follow-up at this checkpoint.** The review justifies bounding the market-history working set and testing a selective event index for the next application build. It does not justify a whole-database rebuild, engine replacement or normalising every JSON document.

**Alpha policy, clarified by the user during this review:** preserving existing data is desirable but optional while Kairo is in alpha. A data reset or fresh schema is acceptable when it simplifies a justified change. Data preservation becomes a requirement from production onwards. Migration compatibility must not become an artificial reason to retain a poor design during alpha; communicate any reset with the affected build.

This is an assessment, not an implementation. The clean v0.7.3 alpha review ZIP and its implementation branch remain unchanged and remain compatible with v0.7.2 data. Experimental indexes, metadata projections and transaction batches existed only in disposable synthetic databases. [Review PR #6](https://github.com/BunBajiro/kairo/pull/6) must remain isolated and unmerged. A clean compiled runtime build does not itself mean the project has left alpha.

## Scope and evidence

Reviewed application: `ff8bbc530ce278a883f8b1831407095a14d3277d` (clean v0.7.3 alpha candidate). Probe: `6cb8f4d151b60cb0afb20a252908edfbbdfac49d`. Both the workspace and the [GitHub review run](https://github.com/BunBajiro/kairo/actions/runs/35337389294) completed successfully on Node 24.19.0 / SQLite 3.53.3.

The review covers schema/migrations, module ownership, SQL plans from actual session/journey/market functions, large-snapshot metadata reads, aged market-history JSON and history-write transaction boundaries. The earlier [full v0.7.2 versus v0.7.3 comparison](../v073-comparison/README.md) remains the end-to-end release evidence. That comparison already reproduced about 91% less large-fixture idle CPU without changing the persistent schema: expensive access patterns were a major cause, rather than evidence that the engine had become unsuitable.

The new probes use the larger synthetic fixture: four characters, 50,000 activity events, 2,000 visits, 4,000 records in each combat table and 5,000 market types. No installed user data or EVE credentials were read. Raw [workspace](workspace.json), [GitHub](github.json) and [provenance](provenance.json) files retain samples, SQL, arguments and plans. The [probe source](../../tests/performance/database-review.mjs) is reproducible with:

```sh
node tests/performance/database-review.mjs /path/to/clean-v0.7.3 /path/to/results
```

## What remains a good fit

The schema contains 29 application tables and nine explicit secondary indexes, in addition to primary-key/unique indexes. It is already substantially relational: order books, visits, sessions, events, daily histories, combat records and saved plans have distinct responsibilities. JSON is mainly used for external payloads, settings, snapshots and historical context. This is not one oversized generic table carrying every feature.

Actual query plans use the intended composite indexes for character/time event ranges, visit ranges, alliance/system/time combat records and hub/type/region market joins. Broad aggregate queries still do work proportional to the relevant rows; the presence of a scan or temporary sort alone is not a reason to add an index or redesign the schema.

The database uses WAL, foreign-key enforcement, a 3-second busy timeout, FULL synchronous durability and the default 1,000-page automatic WAL checkpoint. The synthetic database passes `quick_check`. These checks do not diagnose the condition or size of the user's actual database.

SQLite remains appropriate for a local application with one owning process and modest writer concurrency. Its own guidance specifically supports application-local storage. A future multi-user hosted service needs a separate concurrency/deployment assessment when its requirements are known. [SQLite usage guidance](https://www.sqlite.org/whentouse.html)

WAL helps database reader/writer coexistence; it does not make JavaScript calls nonblocking. Kairo uses Node's synchronous database API, so long queries and write batches share the event loop with HTTP, scheduling and OBS work. The archive decoder already runs in a worker; the subsequent database writes/projection run on the main thread. [Node DatabaseSync](https://nodejs.org/api/sqlite.html#class-databasesync), [SQLite WAL](https://www.sqlite.org/wal.html)

## Findings and priority

| Area | Evidence | Decision |
|---|---|---|
| Market-history working set | Cold analysis becomes 2.9–5.1× slower with one year of history despite identical output | Highest priority for a focused follow-up now |
| Event filtering | A character/type/time index improves dense-session timings in both environments | Worth a narrow index change after write-cost and ordinary-workload checks |
| Snapshot metadata | Current metadata reads still parse a large JSON body; separated fields are much cheaper in a read probe | Valid next candidate; require end-to-end benefit and correct write handling; an alpha reset can replace migration work |
| History write batching | GitHub improves, workspace results are mixed; two related rows currently autocommit separately | Improve transaction ownership/atomicity when touching history; do not claim a universal speed-up |
| Cache/history lifecycle | Several derived stores grow without an explicit retention policy | Define ownership and retention before more large features accumulate |
| Migrations and data access | Core migrations are versioned; module migration atomicity and distributed SQL ownership need clearer contracts | Incremental maintainability work before substantial module expansion |
| Engine replacement or full schema rebuild | No evidence that it is needed for the local workload | Not warranted |

### 1. Historical data is being carried through a short-window calculation

`server/market-history.mjs` keeps older EVE Ref rows in `market_history_days` and also appends them to each `market_history.body` JSON array. On a later refresh it explicitly preserves dates before the current 30-day window. `server/imports.mjs` reads and parses these bodies to calculate current 3-, 7- and 30-day recommendations. This is a concrete example of historical storage and a derived working cache acquiring overlapping responsibilities.

The probe kept the latest 30 days and all other inputs identical, added 335 older days, invalidated the analysis cache and then restored the 30-day case. Each phase includes a warmup and three uncached observations; results below are the p50 values. Full returned analysis JSON is identical across all three phases in each environment.

| 5,000 stored type histories | Workspace | GitHub |
|---|---:|---:|
| 30 days, first phase | 457 ms | 762 ms |
| 365 days | 2,320 ms | 2,180 ms |
| 30 days, restored control | 524 ms | 584 ms |

The stored history JSON grows from **15.6 MiB to 189.7 MiB** in this constructed workload. This is JSON payload volume, not the whole database file size or a measurement of the user's history.

Recommended change: give any long-term daily history a canonical home and keep the repeatedly read projection bounded to the windows consumers actually need. EVE Ref already has daily rows. Define whether older custom-hub/ESI history is an expendable cache or retained history; use the appropriate bounded cache or archive accordingly. Preserving/backfilling accumulated alpha data is optional. Preserve the application's missing-day semantics, UTC boundaries, freshness/source metadata and quote/plan calculations.

During alpha, implement the clean working-set model and reset/rebuild derived data if that is simpler than supporting the old layout. A fresh schema is also acceptable if it materially simplifies the chosen implementation. Before production, establish data-preserving upgrades and retention guarantees. Merely adding indexes cannot avoid parsing irrelevant historical JSON already selected by an exact primary-key lookup.

### 2. Some session queries need a more selective event index

Current session queries use `events(character_id, at DESC)`. That is appropriate for timelines and broad session totals, but wallet totals and ship-change lookups additionally filter by `type`. On the dense fixture, they inspect unrelated events within the selected time range.

A disposable `events(character_id, type, at)` index lets these two queries seek the relevant event type directly. The experiment uses existing/index/index/existing order, one warmup and five timed complete reports per phase, including JSON serialization. Every report output remains identical.

| Dense session report p50 | Workspace | GitHub |
|---|---:|---:|
| Existing indexes, two phases | 104–109 ms | 133–150 ms |
| Experimental event index, two phases | 82–104 ms | 109–110 ms |

Paired reductions range from **5–21% locally and 17–28% on GitHub**. The magnitude varies; this is a promising targeted improvement, not a claim that every normal session gains that much. Diagnostic plans confirm the selective lookup. The existing broad timeline index is still used for all-type aggregates.

Before implementation acceptance, measure event insertion/index size and representative smaller sessions as well as rerunning existing boundary, deduplication, accounting and pagination tests. Adding one index should not become an excuse to blanket-index every column or duplicate whole event payloads into a new ledger.

### 3. Snapshot metadata is logically separate but still physically embedded

v0.7.3 avoids decoding large data arrays into JavaScript during scheduling, but `snapshotMetadata()` uses `json_extract` against the stored body. A 20,000-asset sample has a 3,109,032-byte body. Repeated metadata lookups take approximately **3.59 ms locally / 4.56 ms on GitHub**, compared with **0.0020 / 0.0023 ms** from an experimental separately indexed metadata projection.

These are 15-sample read microbenchmarks, not a measured reduction in whole-application CPU. The projection was populated only for the experiment; it does not implement live synchronisation, migrations or rollback handling. SQLite documents that text JSON functions translate their input before processing it, consistent with the residual cost. [SQLite JSON performance](https://www.sqlite.org/json1.html#performance_considerations)

If the remaining scheduler cost merits further work, store scheduling/access fields as directly readable metadata while retaining the payload format. Any implementation must handle immediate writes, raw-SQL changes, rollback, owner/scope changes and fail-closed deadlines correctly. Existing alpha snapshots can be rebuilt instead of migrated when that is simpler. A stale metadata cache would be an unacceptable trade-off. Avoid converting every JSON field or adopting a general snapshot cache without evidence.

### 4. Bulk-write boundaries deserve attention, with restrained performance claims

`saveHistory()` writes the history and its source metadata in two statements without a shared transaction unless the caller provides one. The projection loop yields every 100 types, but those writes otherwise autocommit individually. In contrast, raw archive-day imports and order-book replacements already use transactions; these are useful existing boundaries to retain.

The probe calls the same `saveHistory()` function for 1,000 types with 30 days each, comparing current behaviour with transactions around 100-type groups. Both cases yield after each group, preserve FULL durability settings and produce equal rows.

| Total time across two phases | Workspace | GitHub |
|---|---:|---:|
| Current autocommit calls | 97–147 ms | 100–412 ms |
| Experimental 100-type transactions | 105–107 ms | 73–87 ms |

The worst synchronous 100-type block ranges from about 6–16 ms locally without batching and 13–16 ms with batching; GitHub shows 9–53 ms versus 6–7 ms. Results are sensitive to warm state, checkpoints and storage. The data supports clearer bounded transaction ownership, particularly to keep history/source updates atomic; it does not establish a consistent local speed-up.

A worker-based database service could isolate heavy import work, but it is a larger architectural change. Test actual imports, cancellation, partial progress, OPSEC responsiveness and event-loop stalls first. Do not hold a shared transaction open across asynchronous network calls or weaken durability merely to improve a timing number.

### 5. Growth policies and ownership matter more than clearing old migration code

Code review found no general eviction policy for expired ESI-cache rows or old market jobs, and no automatic pruning of daily market history. Journey summaries aggregate lifetime visits; exports load broad histories into memory. These are growth risks, not demonstrated current bottlenecks in this probe. Accumulated alpha data may be reset; that does not remove the need to choose clear retention behaviour for the app going forward.

Distinguish durable history/configuration from replaceable working data. Give caches a documented size/age policy that respects conditional requests, stale fallback, rate-limit backoff and offline use. A blind `DELETE WHERE expires < now` would change behaviour. Keep historical records separately from bounded presentation/analysis projections.

The core migration markers are cheap indexed startup checks. Alpha permits consolidating legacy migrations into a fresh schema baseline if a redesign makes that useful, but removing the current seven markers is not a performance fix. Core migrations are already mostly transactional, but the extension registry calls a module's migration and then writes its version marker without a central transaction around both. Give future module migrations a clear atomic, versioned contract before adding more complex extensions, and require reliable upgrades before leaving alpha.

SQL ownership is distributed across 17 runtime files (225 prepare/exec call sites in a static count). That count is not evidence of slowness. It does make shared derived data, cross-module writes and invalidation harder to reason about. Extract small domain-specific read/write helpers when changing those paths, with explicit transaction and dependency ownership. The v0.7.3 import invalidation layer already illustrates why those contracts matter. A wholesale ORM/repository rewrite has no measured justification here.

For future industry features, introduce dedicated relational tables when assets, blueprints, jobs and materials need selective joins or aggregate queries. Keep simple configuration and opaque upstream payloads as JSON where that remains appropriate. Growth should be driven by actual query needs, rather than a demand that every existing table be redesigned first.

## Proposed follow-up and acceptance

1. **First:** separate retained history from the bounded import-analysis working set. Confirm the aged-history result, rankings, prices, fees and source/freshness labels remain identical, including sparse days, midnight transitions and custom hubs.
2. **Second:** evaluate and add the selective event index if gains survive smaller workloads and write-cost checks. Preserve existing timeline/session behaviour and output.
3. **Alongside those touched paths:** make history/source writes atomic and bounded; define canonical versus derived data ownership.
4. **Then, if measurements warrant it:** implement directly readable snapshot metadata and compare full idle/scheduling behaviour, with rollback/access/freshness regression coverage.
5. **Before a large new module:** establish module migration and cache-retention contracts. Revisit broader read models or a database worker only where end-to-end evidence supports the complexity.

All accepted changes should stay on an implementation branch, work correctly from a fresh database, pass the current behaviour suite and output-equivalence checks, and be measured against the unchanged v0.7.3 candidate. Preserving existing alpha data is optional; resets are acceptable and should be stated clearly in the build handoff. Prefer the simplest sound implementation over expensive backward-compatibility work at this stage. Require data-preserving upgrades from production onwards. The evidence still supports a focused pass rather than a whole-schema rewrite.

## Limits

This is a code and controlled-workload review, not an inspection of the user's database. The fixture intentionally concentrates events in one session. Its cache, goal and raw daily-history tables start empty; therefore cache eviction, whole-archive import scaling, complete storage amplification, long-term retention and multi-character writer contention remain code-review risks rather than measured conclusions.

History-growth measurements isolate the JSON working-set cost; they do not simulate a year of every Kairo activity. There are three timed history observations per phase and five session observations, with no statistical confidence intervals. Snapshot metadata is a microbenchmark, SQL profiling has its own overhead, and whole-app CPU reductions from the proposed changes have not been measured. Windows disk behaviour, live ESI/OBS, actual user data, power/fans and hosted multi-user operation are outside this review.
