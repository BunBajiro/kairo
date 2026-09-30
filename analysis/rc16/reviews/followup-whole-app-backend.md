# Whole-application backend follow-up: older data modules

Read-only structural review of clean RC16 in `/workspace/scratch/a2f3334402fc/kairo-rc17`, covering persistence, assets, industry/PI, wallet, goals, refresh orchestration, module registration, projections and events. No application edits, tests or benchmarks were run. Every new finding below is **code-confirmed but not separately timed**; none is presented as a measured RC16 regression. Existing measured Maps, restart and historical findings retain their own evidence and priority.

The older modules contain worthwhile refactoring work. The most concrete addition is a shared evaluation boundary inside Goals, followed by a small asset-enrichment component and one explicit owner for application name updates. These remove repeated work and fragile coordination without replacing SQLite, the ESI collector or the module system.

## Ranked implementation candidates

### 1. P2 — Prepare goal inputs once per read/evaluation

`server/goals.mjs:55–60` reads tracking separately for every goal, obtains the same source snapshot independently for each unfinished goal, and parses the whole stored names dictionary for each tracked row. `snapshotState` returns a decoded full snapshot even when the caller only needs availability. `goalSourceOptions` first reads assets/mining/jobs/queue/skills for type choices, then reads sources again to determine availability (`36–40`).

During collection, `refresh` loads all active tracked goals, filters the changed source afterwards, and independently reads/scans the same asset, skills, queue, journal, mining or jobs data for each matching goal (`73–97`). Multiple item goals therefore repeat work over the same large asset snapshot; this is a source-size × goal-count path. It is distinct from the already measured idle scheduler's metadata optimization.

This list path is also reached from Overview: `components/kairo/operations.tsx:22–25` reloads goals/timeline when its sessions dependency changes, while the dashboard's 30-second `/state` refresh replaces that array. The frontend lane owns the selective-invalidation correction; the backend evaluation boundary remains useful when a read is genuinely required.

**Refactor boundary:** Goals owns one `prepareGoalInputs(characterId, requiredSources, now)` context for the current refresh or list request. Load tracking with the goal rows, names once, and each required snapshot once; evaluate module/scope/completeness/freshness once per source. Build quantity-by-type and skill-by-ID indexes where several goals consume the same arrays. Keep per-goal creation cutoffs, mining baseline state and completion semantics in the evaluator. `goalSourceOptions` can reuse the same prepared source inputs. Do not add a long-lived global snapshot cache or merge Goals' stale-data rules with OPSEC's stricter safety rules.

**Gate:** existing `participation-goals.test.mjs` cases for wallet, skill queue, assets, mining, manufacturing, combat and stale/truncated/disabled/unauthorized sources. Add multiple goals consuming one large source, asserting identical progress/availability and one source read per context. Use a targeted diagnostic before quoting any speedup. An index for unbounded goal lists is not yet justified by measured list size; the immediate problem is repeated large-body reads.

### 2. P2 — Give goal accounting a transaction and change-aware write boundary

`accumulate` performs a SELECT and unconditional UPSERT for every observed journal/mining/job entry, even when its observed/credited quantities did not change, then sums the entire retained credit ledger (`server/goals.mjs:63–71`). `refresh` also rewrites goal and tracking rows for unchanged progress and writes unchanged unavailable-state status (`79–101`). Normal refresh does not enclose these related writes in a transaction, although goal creation does (`115–121`).

**Refactor boundary:** keep ledger deduplication, source baseline state and goal totals together in the Goals service. Batch the synchronous accounting update in a transaction/savepoint, avoid unchanged ledger/status writes, and prepare repeated statements once. Keep the existing retained credit ledger: it prevents double-counting when ESI windows roll, so it is durable accounting data, not an evictable cache. An incremental retained total could avoid repeated historical SUMs, but should follow an actual large-ledger measurement and must commit atomically with credited entries.

Completion notification should remain a deliberate post-success step. A transaction refactor must not emit an event for rolled-back work or introduce nested BEGIN failures. Exactly-once completion is already a tested invariant; do not weaken it to achieve fewer writes. The current distinction between saving a completion and publishing its event is also worth covering with a failure-ordering test if that boundary is changed, rather than casually introducing a general outbox framework.

**Gate:** duplicate/unchanged snapshots, rolling journal/job windows, growing daily mining totals, restart baseline, partial accounting failure and rollback, and completion once. Compare write counts for repeated identical samples. No claim of present user-visible corruption or measured write latency is made here.

### 3. P2 — Extract and memoize per-sample asset topology enrichment

`server/core.mjs:122–146` creates a containment lookup, but recomputes a root walk with a fresh cycle-detection Set once while collecting locations and another two or three times while projecting each asset. This repeats shared ancestry and allocation. The path is O(number of assets × ancestry depth), with multiple traversals of the same item in one sample.

**Refactor boundary:** a focused asset-enrichment component owns a per-sample root-location index and returns enriched rows plus the distinct location IDs requiring names. Resolve each item's root once and reuse it for the root ID and label. Preserve termination on cycles, orphan locations and unknown names; do not turn malformed topology into a hang. Keep authorized station/structure requests through the existing shared ESI layer. This extraction gives core orchestration a smaller, explicit data-preparation contract instead of moving unrelated code to a generic helpers file.

Structure/station lookups are currently serial per unresolved location (`131–143`). PI details are likewise serial per colony (`152–163`). They can delay completion of a three-task `sync` batch (`302–308`), but their normal cardinalities/network costs have not been measured in this lane. Do not add aggressive parallelism merely because the loops are serial. If real workloads identify this as material, consider bounded enrichment scheduling under the existing ESI limit; OPSEC's separate priority path must remain independent.

**Gate:** nested ship/container assets, shared ancestors, unknown/orphan roots, cycles, absent structure scope, permission failures, same final names/root IDs, and no increase in external calls for already resolved locations. First verify deterministic graph work reduction; asset nesting depth in normal EVE use was not assumed here.

### 4. P2/P3 — Consolidate the application name-directory mutation contract

Core keeps an in-memory `namesMap` and persists merges through `rememberNames` (`server/core.mjs:22,59–67`). Goal type lookup separately reads/modifies/writes the stored dictionary (`server/goals.mjs:42–53`), while its HTTP handlers manually repair the core copy using `Object.assign(core.names(), ...)` (`server/index.mjs:244–252`). Those compensating updates are present, so this review does **not** claim an existing lost-name bug on these routes. They nevertheless distribute one consistency rule across storage, lookup and HTTP wiring, and expose a mutable core object to callers.

**Refactor boundary:** type lookup returns verified identity/category information; one application name-directory merge method updates memory and persistence. Route both existing handlers through that owner. Preserve ESI's separate per-ID public cache, TTLs, batching and private-character request keys (`server/esi.mjs:29–46,217–233`); the application label directory and HTTP cache have different roles and should not be collapsed blindly.

**Gate:** type lookup followed immediately by `/state`, goal list and stream projection; restart persistence; overlapping name merges; lookup failure; and no cross-character private request reuse. This is a small ownership improvement suitable alongside the Goals refactor, with no speedup claim.

### 5. P1/P2 existing cross-application work — keep the inherited paths in scope

These are not new discoveries, but they apply to older modules and must remain on the RC17 plan:

- **Drain owned event work during shutdown:** the measured late callback gap includes the skill milestone subscriber (`server/modules/milestones.mjs:5–7`), not only Universe history. The bus currently consumes asynchronous callback errors without tracking outstanding work (`server/bus.mjs`). Use the existing architecture/restart evidence and drain/close contract; avoid a second event system.
- **Prepare stream sources once and skip unchanged publication:** no-dataset-work `sync()` and the heartbeat rebuild all bindings; identical elements repeat snapshot/event aggregation, and `setBindings` always publishes (`server/core.mjs:302–308,342,352–357`; `server/projections.mjs:35–45`; `server/stream.mjs:44`). Wallet, industry, training, goals and session widgets all cross this boundary. Reuse per-source projection inputs, preserve deadline/freshness/OPSEC updates and serialize outgoing SSE once per audience. See `reviews/architecture.md` A4 for the established findings and gates.
- **Classify retention by ownership:** HTTP response/retry caches and completed market jobs are replaceable; visits, goal credit ledgers, session/combat records and daily archive data support durable user features. Existing architecture A5 already identifies general cache growth. Do not solve it by deleting user history or rebuilding the database.

## Reviewed areas with no additional refactor justified now

| Area | Review conclusion |
|---|---|
| SQLite/store foundation | Retain the shared WAL connection, foreign keys, parameterized statements and transactional schema migrations. Snapshot metadata access already avoids decoding large data for scheduling (`store.mjs:107–126`). A wholesale ORM/repository/schema conversion has no supporting evidence. |
| Wallet collection | The catalog already declares wallet/journal/transactions/orders in the common collector. Journal milestones use stable IDs and event dedupe; original journal dates are retained (`modules/milestones.mjs:12`). Share goal evaluation inputs rather than creating a separate wallet polling engine. |
| Industry collection | Jobs, blueprints, mining and PI use the same declarative collector. Preserve active→ready/delivered milestone detection and manufacturing/mining goal semantics. PI's serial detail requests merit measurement only if user workloads show a delay. |
| ESI scheduling and transport | Preserve dataset request flights, metadata-based deadlines, shared priority/concurrency limits, 250-page bound, per-ID names cache, freshness provenance, cooldowns and separate non-replayed command semantics. Existing scheduling/ESI tests cover these boundaries. |
| Module registry | One real optional event module is present. Dynamic registration and disposal should participate in the event-lifecycle fix, but a new plugin architecture or registration abstraction is not warranted by this scope. |
| Goals persistence and source semantics | Existing foreign-key cascades and per-entry credit keys are useful. Completed milestones intentionally remain complete; stale/incomplete sources retain progress. Keep these behaviours while reducing duplicated reads/writes. |
| Timeline, notes, sessions and export reads | Timeline/notes/session-list reads already have limits or pagination. Full export intentionally materialises durable records and could become large; this is not a periodic hot path. No automatic truncation, history removal or export redesign is justified by this code-only review. |

## Proposed place in the incremental plan

Keep measured Maps/invalidation, route preparation and shutdown correctness work first. Add **Goals input/accounting consolidation** as the clearest older-backend increment, with the name-directory mutation cleanup in the same ownership boundary. Asset topology extraction is a separate small increment, verified by output equality and graph-work counts. Retain cross-module stream/event/retention work already on the plan. Each changed component gets its relevant existing behaviour tests plus a narrowly targeted count/timing check; untouched modules do not need ceremonial rewrites or new abstraction layers.
