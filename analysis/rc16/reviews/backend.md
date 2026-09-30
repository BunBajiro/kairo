# RC16 backend Universe / Maps review

Source: `57c8dcc7fbd8fc2b62129498d1819050c78381a1` (`0.8.0-rc.16`). Analysis only; no application source, schema, or production behaviour changed.

The main backend opportunities are repeated full projection work on Maps refresh, route context rebuilt for every itinerary segment, and history aggregation included in requests that do not need history. Existing service boundaries, route heap, physical jump grid, shared location collection, and request coalescing in the external feed collectors should be retained. Evidence does not support a global backend rewrite or a blanket increase in polling intervals.

## Evidence and limits

`harness/backend-universe.mjs` runs the unmodified RC16 services against an ephemeral SQLite database. It uses the bundled 8,490-system / 6,989-gate atlas and synthetic pilot records, dense public activity snapshots, 80 synthetic sovereignty owners, empty optional external feeds, and a fixed clock. Exact atlas counts are recorded in each JSON file. All outbound fetch/ESI calls are replaced with a rejecting/counting function; every run recorded zero attempts. No user account or private data was read.

The map fixture uses 100 nodes, 99 canonical links, and 100 signatures per map, with no observations, passages, tracked pilots, intel, or undo history. One map is an active-chain example, eight maps a larger collection, and 24 maps the supported private-map count limit (stress, not a claim about typical users). Production also creates an empty source map, included here. Maps and signatures are seeded directly in their canonical storage shapes to avoid charging fixture creation to reads. They do not exercise import, migration, expiry deletion, signature editing, or log ingestion. Visit fixtures contain 0 / 10,000 / 100,000 rows distributed across known-space systems, with no populated `universe_systems` join cache; the 100,000-row case is long-history stress, not a typical-client assumption.

The timing pass has three warmups and nine samples per case, then an independent reverse-order repeat. These are warm Linux service measurements on Node 24.19.0, not Windows end-user HTTP or frame-time telemetry. SQL instrumentation is installed only in the separate diagnostic mode. Timing excludes response serialization, which is sampled separately. The reported p95 in the raw files is the maximum of only nine observations and is descriptive, not a population-tail estimate. Measurements were scheduled in an isolated team benchmark slot. No forced GC or absolute performance promises are used.

Raw evidence:

- `raw/backend-timings.json` and `raw/backend-timings-reverse.json`: forward/reverse timing samples and environment metadata.
- `raw/backend-diagnostics.json`: query execution counts, result-row counts, JSON body/value bytes emitted by SQLite, output bytes, and no-op mutation counts. Byte counts are logical materialisation, not disk IO or SQL VM instruction counts.
- `raw/backend-diagnostics-universe-state-100000-visits.json`: targeted repeat and `EXPLAIN QUERY PLAN` output.

## Warm baseline

Ranges below span the medians of the two runs, not confidence intervals. Payload size is uncompressed JSON.

| Workload | Median service time (ms) | JSON output | Interpretation |
|---|---:|---:|---|
| Universe state, zero visits | 12.65–14.61 | 4.40 MB | Dense public snapshot baseline |
| Universe state, 10k visits | 51.66–55.10 | 6.42 MB | History now a substantial cost |
| Universe state, 100k visits | 136.45–138.77 | 6.43 MB | Output almost unchanged from 10k, work keeps growing |
| Maps state, 1 map | 3.19–3.34 | 0.160 MB | Small collection behaves well |
| Maps state, 8 maps | 48.21–48.21 | 1.277 MB | Collection-wide reconstruction |
| Maps state, 24 maps | 290.06–308.99 | 3.849 MB | Supported-limit stress, superlinear work |
| One selected map out of 24 | 11.39–14.23 | 0.160 MB | Still pays for unrelated canonical links |
| Offline housekeeping tick, 24 maps | 4.41–5.14 | — | `noSync`, no logs/fleet, fixed clock; not live scheduler CPU |
| Pure gate planner | 9.68–11.05 | 2.6 KB | Static graph and search only |
| Gate route through service, zero visits | 19.41–20.59 | 5.8 KB | Context and record preparation roughly doubles this case |
| Gate route through service, 100k visits | 57.30–65.84 | 5.8 KB | Route output independent of history; request cost is not |
| Navigation, 1 stop / 10k visits | 34.20–35.20 | 8.5 KB | Includes persistence of plan |
| Navigation, 10 stops / 10k visits | 287.82–307.36 | 79.6 KB | Repeated segment preparation |
| Navigation, 50 stops / 10k visits | 1492.26–1505.68 | 396.9 KB | Supported-stop-limit stress |
| Pure physical jump planner, 7 LY example | 87.03–102.41 | 1.4 KB | On-demand search; current 3-D grid already avoids all-pairs construction |

Forward-run median JSON serialization adds 19.51 ms to zero-history Universe state, 27.55 ms at 100k visits, and 12.77 ms to the 24-map response. These costs are separate from the service-time column and matter when comparing to endpoint latency. Exact payload metadata and all samples are retained.

## P1: Maps refresh amplifies both query work and payloads

`server/universe-jspace.mjs:366–409` projects every private map on every collection read. Each `project` asks `getLinks` for that map, rereads/clones its document, obtains a whole operations state, and reads undo history. `server/universe.mjs:268–284` first loads *all* links owned by the pilot, parses them, filters by map, and then issues one signature lookup for each bound endpoint. `operations.state` independently obtains signatures again. The `shared` argument on `project` is currently unused.

| Collection | SQL executions | Link rows emitted | Total JSON body/value bytes emitted | Writes during read |
|---|---:|---:|---:|---:|
| 1 map | 234 | 198 | 243,179 | 0 |
| 8 maps | 1,816 | 7,128 | 4,178,404 | 0 |
| 24 maps | 5,432 | 59,400 | 28,075,636 | 0 |

For 24 maps there are only 2,376 actual link records, but the request reads that set 25 times (including the source map). It also performs 4,752 signature point lookups, 25 expired-link scans, and 25 next-expiry queries. The point lookups emit another 1.09 MB of signature bodies, and operations emits the same scope's signatures again. This is measured collection-size amplification, not a hypothetical complexity concern. The single-map endpoint is cheaper but still reads all 2,376 pilot links.

The real callers multiply this cost: `components/kairo/jspace-workspace.tsx:112–117` reloads the full collection on matching `kairo:universe-changed` events without debounce/coalescing, as well as every 60 seconds while visible. Parent Universe also refreshes its full state on a 300 ms debounced event stream and 60-second fallback (`components/kairo/universe.tsx:83–89`). The frontend review owns burst/freshness measurements; do not treat the event rate as fixed at one minute.

Recommended bounded work:

1. Create an explicit request projection context: reconcile expired links once, load/group canonical links once per pilot request, and reuse the already-read per-map signatures and validated map document. Keep ownership checks at the boundary and preserve map-specific signature binding rules.
2. Give selected-map reads a scope-aware canonical-link query, with a measured supporting index if needed. The existing `(character_id,kind,updated_at)` index can find the pilot's links but cannot select a map from JSON; do not assume it eliminates unrelated-map parsing.
3. Coalesce frontend invalidations and keep at most one current reload in flight, with a pending refresh when needed. This is a joint backend/frontend priority.
4. Evaluate collection summaries plus selected-map detail as a follow-on contract improvement. It removes the inactive-map payload rather than merely speeding its generation, but requires deliberate UI/cache semantics. `jspaceDestinations` currently calls `jspace.state(id).maps.find(...)` (`server/universe.mjs:588–597`), so it should use selected-map projection as well.

Post-change evidence should show links/signatures materialised once per necessary scope, and selected-map latency/payload largely independent of unrelated maps. Preserve expiry side effects, source-map reconciliation, per-map operations ownership, stale-signature semantics, and optimistic revision conflicts.

## P1: One itinerary repeatedly rebuilds identical route context

`server/universe-navigation.mjs:114–154` calls the full service planner for every pending stop (up to 50). Each call invokes `liveContext`, creates enriched objects for every atlas system, fetches links, and builds a fresh travel graph (`server/universe.mjs:558–586`, `server/universe-routing.mjs:148–215,271–290`). Jump alternate-midpoint construction also calls `getRouteSystems(id)` for each midpoint, which rebuilds the same context again.

The 10/50-stop fixtures perform 432/2,072 SQL executions and emit 8.14/38.56 MB of JSON body/value data. They execute the history aggregate once per segment (10/50 times). The warm 50-stop request takes approximately 1.5 seconds in both orders. Although `plan` is async, the callback is synchronous; awaiting resolved segment results provides microtask continuation, not an explicit opportunity for the HTTP loop to process timers. This is an event-loop responsiveness risk inferred from the code and measured request duration; this lane did not separately measure HTTP concurrency.

Recommended work: prepare one immutable route context and eligible graph per itinerary calculation (and one enriched-system set for midpoint searches), then reuse it across segments. Keep current final revision/connection validation, freshness/expiry bounds, per-direction Ansiblex rules, public-source eligibility, avoidance settings, and physical coordinates. The current heap and jump spatial grid are good foundations; replacing the search algorithm is lower priority than removing duplicated setup. Consider cooperative yielding or worker execution only if long searches still block after setup reuse is measured.

## P2: History aggregation leaks into unrelated read paths

`liveContext` aggregates every visit for the pilot, loads every system note, and loads all public/private overlay inputs (`server/universe.mjs:215–244`). Universe state then independently calls `journeyData` (`server/universe.mjs:303–313`; `server/places.mjs:14–19`), which performs a second per-system aggregate with joins. System detail and routing call this same broad context even when they do not need visit summaries.

The 10k→100k state payload grows by only 10,970 bytes while median service time rises approximately 2.5×. The route result remains 5,790 bytes in both zero/100k cases while its median rises about 3×. This supports removing history from route preparation and sharing history summaries within a state request before attempting schema surgery.

Observed plans use `idx_visits_character_at(character_id,at DESC)` then a temporary B-tree for grouping; Journey additionally uses a temporary B-tree for sorting. Therefore the visits are not completely unindexed, but the existing index does not provide the group order. A covering `(character_id,system_id,at)` index or maintained per-system rollup is a candidate for a separately measured experiment, not a guaranteed solution. Route-specific input projection avoids the work altogether. Persisted rollups require explicit rebuild/invalidation ownership and are justified only if request-local reuse and narrower reads leave meaningful history cost.

For full Universe state, split durable dataset-derived overlays from per-request freshness/location where that reduces allocation. Any cache must expire at source and connection deadlines and invalidate on pilot/settings/notes/history changes; a cache keyed only to one snapshot timestamp would be incorrect.

## P2: Expiry and generic record access need a small shared boundary

The existing timer-based lifecycle is useful, but every link read invokes `cleanupExpired` and its `finally` reschedules by querying the earliest expiry (`server/universe.mjs:106–108,135–143,173–190,268–270`). `EXPLAIN QUERY PLAN` shows the earliest-expiry query scans `universe_records` and uses a temporary sort. The 24-map GET repeats that work 25 times despite no expired data and no writes. The offline housekeeping tick also repeats global cleanup, once per three-second core scheduler pass when enabled (`server/core.mjs:347–350`; `server/universe.mjs:655`).

A request-level reconciliation boundary plus a known next deadline can avoid redundant sweeps while retaining strict on-read expiry checks. A scoped record-access helper can own prepared queries and batched signature resolution for Universe, JSpace, and Operations. This is a focused consolidation; their independent domain ownership should remain. If expiry lookup remains significant, benchmark typed/indexed lifecycle columns or an expression index against actual writes and cleanup cases. Do not add a schema-wide repository abstraction simply to reduce source-file count.

## Retain / defer

- Retain canonical selected-location composition and the shared location subscriber (`server/universe.mjs:608–619`, `server/universe-jspace-tracking.mjs:7`); there is no extra JSpace ESI polling loop to eliminate.
- Retain lazy bundled topology and bounded detail cache (`server/universe-static.mjs`), request flights/provider deadlines in `server/universe-feeds.mjs`, one eligible fleet refresh per operations tick, and close/wait handling for ongoing collectors. This lane does not prove all collector costs, but the architecture already contains necessary safeguards.
- Do not lower refresh frequency globally to hide invalidation cost. Batch/refine invalidations and remove redundant materialisation first.
- Politics trigger/queue retention and duplicate combat upserts are owned by `reviews/architecture.md`. They are an additional cross-service concern, distinct from this Maps/read-path evidence.
- There is no equivalent Universe/Maps feature baseline in 0.7.3. Compare shared old/new core workloads using the historical lane, and use these RC16 results as the same-fixture baseline for subsequent optimisation. Do not call the full feature delta a like-for-like regression.

## Verification for the optimisation stage

Re-run identical forward/reverse fixtures with the same SDE and Node runtime, compare output invariants and route results, then re-run existing route/JSpace/expiry/signature/revision tests. Add meaningful cases for a changed source during a long route, expired links during coalesced refresh, and selected-map edits while a collection reload is in flight. Review actual HTTP/event-loop and browser burst improvements with the frontend lane. Keep all checkpoint fixtures/instrumentation under `analysis/rc16`; none should enter the RC17 production artifact.

Reproduction:

```bash
node analysis/rc16/harness/backend-universe.mjs diagnostics
node analysis/rc16/harness/backend-universe.mjs timings
node analysis/rc16/harness/backend-universe.mjs timings --reverse
node analysis/rc16/harness/backend-universe.mjs diagnostics universe-state-100000-visits
```
