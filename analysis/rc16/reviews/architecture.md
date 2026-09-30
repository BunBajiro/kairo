# RC16 backend ownership and operational review

Scope: Core, shared ESI, SQLite, Markets, Sessions, semantic events and HTTP lifecycle. Read-only production review against RC16; no production modifications. Deterministic shutdown scenarios and query-plan probes used in-memory/stub state, with no timing or CPU benchmark. Performance impact below remains to be measured by the checkpoint harness.

## Findings, in priority order

### A1. Suppress identical combat writes before they feed the new politics queue

**Code-confirmed amplification; new RC16 consumer of inherited writes.** `server/combat.mjs:36–40` calls `record()` for every retained public reference that has a price, even when that price has not changed. `record()` unconditionally updates `combat_records` and attempts the deduplicated semantic-event insert (`server/combat.mjs:18–27`). RC16 now installs persistent INSERT/UPDATE triggers on that ledger and `alliance_combat_records` (`server/universe-politics.mjs:212–214`). Each unchanged record therefore becomes politics queue work again. Queue uniqueness limits simultaneously duplicated entries; it does not stop them returning after a drain.

The queue continues accepting writes when Universe or inference is disabled, while the consumer returns early (`server/universe-politics.mjs:247–250`). This is retained work, not a bounded disabled-module cache. `createUniversePolitics` currently caps compacted evidence and history, but not this queue.

**Target:** make combat storage idempotent at the content level; update only changed value/source/record fields, while retaining missing-event repair. Consider trigger predicates for the politics-relevant fields and an explicit disabled-inference backlog policy. Coordinate with the Universe review before changing queue semantics.

**Gate:** replay an identical 200-reference public page, then a corrected valuation; verify identical ledger/report/toast results, missing-event repair, corrected values, and reduced SQLite writes/queue inserts. Exercise disable/re-enable with a large backlog; incomplete evidence must remain explicit. Do not simply discard queued evidence.

### A2. Give asynchronous semantic events an owned shutdown lifecycle

**Deterministically reproduced lifecycle gap; not a measured CPU regression.** The bus starts async listeners and discards their promises/errors (`server/bus.mjs:1–7`). Universe history awaits name resolution before inserting visits or publishing a ship event (`server/universe-history.mjs:9–33`). Unregistering listeners prevents future dispatch but does not wait for callbacks already in flight. `core.close()` awaits collector maps, not bus callbacks (`server/core.mjs:369–370`), and HTTP shutdown subsequently closes SQLite (`server/index.mjs:544–558`). A name request initiated by an event listener is not necessarily part of a tracked collector promise.

Preserved reproduction: [architecture-shutdown.mjs](../harness/architecture-shutdown.mjs), with [raw results](../raw/architecture-shutdown.json). Emit `data.ship` into the real bus/history subscriber with deferred `esi.names`, unregister the subscriber, then settle names. All three assertions-based scenarios passed: successful resolution publishes once after disposal; closing in-memory SQLite before resolution causes a late publish attempt with `ERR_INVALID_STATE: database is not open`; rejecting names produces a captured listener error. An observational wrapper records and rethrows callback errors to the unchanged bus, which silently consumes them. There were zero network attempts and zero unhandled rejections. This proves the callback ownership gap and resulting closed-database error under controlled ordering; it does not launch a complete supervisor restart. The same pattern also exists in the skill milestone subscriber (`server/modules/milestones.mjs:5–7`), so it is a shared ownership issue.

**Target:** a tracked bus task set with a deliberate quiesce/drain phase before store closure and diagnostic visibility for failures. Preserve accepted history events rather than silently dropping them. Avoid making nested event emission synchronously await itself. This is more relevant now that dataset activation intentionally restarts the process.

**Gate:** hold name resolution through shutdown, release it, and verify one retained event, no writes after database close, bounded shutdown, and no replay duplicates. Cover rejected lookups and nested semantic events.

### A3. Move live-session cadence checks ahead of route materialization

**Code-confirmed unnecessary work, inherited from v0.7.3.** Core calls `sessionCombat.syncRecent()` every three seconds (`server/core.mjs:347–350`). `createSessionLiveFeed.sync()` calls `getTargets()` before `run()` checks its durable two-minute/cooldown deadlines (`server/session-live.mjs:33–35,66–70`). `getTargets()` loads every open session, parses context, reconstructs every visit interval and builds per-system/month queries (`server/session-combat.mjs:33–37`). Consequently a live session can rebuild its whole route about forty times per two-minute poll period even when no network work is due. The shared pending promise prevents concurrent duplication, but does not bypass the next three-second call after it settles.

`syncRecent()` also queries all relevant historical rows every three seconds (`server/session-combat.mjs:146–149`). An in-memory EXPLAIN using the current schema selects `idx_sessions_character_started (character_id=?)` and a temporary sort; the end-time predicate cannot use that index's second column. This is a scaling lead, not proof that another index is worthwhile.

**Target:** check global live-feed deadlines before building targets, while preserving forced/end-of-session checks; only consider a route cache or recent-session index if fixture measurements justify them. No reason to replace the scheduler wholesale.

**Gate:** count target/route reconstructions across a complete two-minute interval with long live sessions and many archived sessions; verify unchanged feed cursor, immediate explicit/end rechecks, expiry at 24 hours, scope/disable handling and transit/buffer rules.

### A4. Projection and SSE work remains broader than its consumers need

**Code-confirmed inherited work; prioritize only if connected-client measurements warrant it.** Every completed `sync()` calls `updateBindings()` even if all datasets were skipped as not due (`server/core.mjs:302–308`); heartbeat also rebuilds bindings every ten seconds (`352–357`). `setBindings()` always increments the stream version and broadcasts, even when bindings are unchanged (`server/stream.mjs:44`). This evaluates invisible configured elements as well (`core.mjs:342`). A session-report binding scans events grouped by type on each evaluation (`server/projections.mjs:41`); multiple elements sharing a source repeat the work.

Separately, each dataset snapshot sends the entire growing name dictionary (`server/core.mjs:266`), and JSON serialization occurs inside each client's send loop (`27–34`). The same per-client serialization exists in stream broadcasting (`server/stream.mjs:24–30`). These are avoidable amplification points, not evidence to shrink public responses or discard fields.

**Target:** skip unchanged binding broadcasts; reuse shared source projections within one update; serialize an SSE event once for all eligible clients. A names revision/delta contract is a larger optional follow-up, requiring frontend coordination. Keep a cheap deadline refresh for countdown/freshness and immediate OPSEC transitions.

**Gate:** one/two dashboard tabs plus OBS, with 0/10/50 elements and duplicated session widgets; measure query counts, bytes, CPU and event-loop tails. Preserve exact sanitization, timers, stale transitions, reconnect state and OPSEC ordering. The v0.7.3 report explicitly deferred widget timer changes, so do not label this a new regression.

### A5. Separate durable history from evictable caches in one retention policy

**Code-confirmed growth; no measured user database size.** Daily archive history intentionally persists (`server/market-history.mjs:28–47`); completed market jobs accumulate, though only eight are shown (`server/markets.mjs:24,30,46`). Shared HTTP cache rows have no general expiry pruning (`server/store.mjs:12`, `server/esi.mjs:13–15,59,133,147`); expired bodies are retained for validators/stale fallback, and unique historical names-batch, killmail, route and retry keys can accumulate. Disabled hubs retain books (`server/markets.mjs:43`) by documented design. These should not be confused with the already bounded 30-day market working projection or user-owned session/combat history.

The daily archive query filters `(region_id,date)` while the primary key is `(region_id,type_id,date)` (`server/store.mjs:59–60`; `server/market-history.mjs:43`). A simple current-schema EXPLAIN selects the primary key on `region_id` only, potentially reading all aged rows in that region to produce a 30-day projection. Actual populated/analysed planner choice and benefit of another index must be measured.

**Target:** first inventory rows/bytes by domain with 30/180/365-day fixtures. Introduce explicit retention for replaceable job/HTTP-cache data where justified; keep sufficient validators and last-good fallback. Evaluate an archive-query index together with write cost. Do not purge durable player history or recreate the database because cache tables grow. No routine full VACUUM on the UI path.

**Gate:** offline/stale fallback, retry/cooldown persistence, corrected archive dates, restart/resume and history-source output remain equivalent; measure file/WAL size plus import/read/write latency.

### A6. Consolidate ESI transport policy without combining read and command semantics

**Confirmed duplication introduced with commands; maintainability opportunity.** `request()` and new `mutate()` duplicate compatibility headers, authentication/401 refresh, Retry-After parsing, rate groups, global limits and counters (`server/esi.mjs:81–147` versus `168–202`). The shared four-slot queue is already correctly reused. Reads identify as Kairo/0.7.3 (`83`), while commands identify as 0.8 (`174`), illustrating policy drift rather than a performance problem.

**Target:** small common header/rate-limit/response-policy helpers and explicit cancellation ownership. Keep request-cache/coalescing/stale fallback entirely out of commands. Commands intentionally retry only an explicit 401 and preserve uncertainty after an ambiguous transport failure. ESI currently has per-request timeouts but no close/cancel method (`server/esi.mjs:90,177,241`), so inspect slow queued-read shutdown alongside A2 before promising a fixed restart duration.

**Gate:** existing ESI tests plus read/command cooldown parity, per-character cache isolation, 401 retry count, no automatic replay after timeout, and shutdown with queued requests. Do not add concurrency or aggressive retries for benchmark scores.

## Prior checkpoint protections retained

- `import-cache.mjs`, `market-history-store.mjs`, `market-history.mjs`, `markets.mjs`, `session-combat.mjs`, `projections.mjs` and `auth.mjs` are byte-identical to the recovered v0.7.3 files inspected here.
- `imports.mjs` changes only static-data path selection; transactional dependency revisions, single-flight calculation, unrelated-write immunity and time-bound invalidation remain (`server/imports.mjs:13–15,78–92`).
- `store.mjs` adds only the sovereignty-at-visit migration relative to recovered v0.7.3; prepared snapshot statements and metadata-only scheduling reads remain (`105–121`). The `(character_id,type,at)` event index remains (`87–95`).
- `session-details.mjs` adds recorded visit sovereignty; joined visit metadata and the per-system sorted combat-window matcher remain (`43–65,102–139`).
- Daily archive rows still feed bounded 30-day working projections, with prepared atomic batches (`server/market-history-store.mjs:45–59`; `market-history.mjs:43–47`).

These checks establish implementation continuity, not a timing result. RC16's new consumers and larger fixtures can still increase workload. Compare equivalent behavior and data volume; do not attribute a regression to the retained database design without isolating its caller.

## Structural recommendation

Keep the shared SQLite connection, ESI limiter, semantic bus and separate private-dashboard/OBS boundaries. Consolidate lifecycle ownership, content-change invalidation and cache-retention rules at those boundaries. Extract route handlers or source adapters only where this makes a tested ownership contract simpler; file size alone is not a refactoring justification. `docs/ARCHITECTURE.md` also needs updating: it still describes one process and lists the removed Journey module while RC16 has a supervisor/child runtime and Universe history.
