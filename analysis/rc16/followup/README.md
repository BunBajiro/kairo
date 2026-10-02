# RC16 follow-up and whole-application refactoring handoff

30 September 2026 · Internal analysis · Production source unchanged

**Five local follow-up lanes and the corrected legacy backend comparison are complete and independently reviewed.** They confirm repeated Maps work, contention from navigation/map workloads, an asynchronous shutdown gap, and specific memory/session costs. The original checkpoint's frozen evidence remains intact. The dedicated CI runs remain partial: the [second run](https://github.com/BunBajiro/kairo/actions/runs/36718342385) confirms Maps, memory, restart and browser controls, but reproduces dashboard SSE loss. Its diagnostic proves Core destroys a still-draining 3.26 MB asset frame at the existing 1 MB backlog cutoff. The corrected backend CI lane is incomplete because v0.7.3 was not built before HTTP bootstrap. See the [retained failures and confirmed diagnosis](../reviews/followup-github.md); no complete CI pass is claimed.

The refactoring pass covers **all of Kairo**, including foundations that predate RC1–RC16. Measured hot paths establish priorities; source and ownership review establish where services should share a contract. Coverage does not mean every subsystem needs a rewrite, nor that every structural suggestion has a measured speedup.

## What the additional evidence establishes

| Area | Result on this host | Implementation consequence |
|---|---|---|
| Selected-map independence | An identical 229,559-byte selected map takes 2.92–4.52 ms with one map and 12.92–13.52 ms with 24. Its canonical-link read grows from 99 to 2,376 rows although only 99 belong to it. | Make selected reads scoped; share one request-owned projection/lifecycle context. |
| Map collections and signatures | A 24-map list takes 342–372 ms and emits 59,400 canonical-link rows for 2,376 stored links. Dense 1,000-signature/1,000-edge projection performs exactly one million predicate visits. | Batch canonical reads once and build an ordered signature-to-edge index. Separate chooser summaries from selected detail. Counts prove duplicated work; they do not promise equivalent total speedup. |
| Mixed operation | Adding four 50-stop plans and four map-edit/read bursts raises common dashboard p95 from 77–78 ms to 987–1,012 ms; maximum server loop delay grows from 115–120 to 887–984 ms. All intended requests and protection/recovery controls pass locally. Both CI quiet windows instead lose dashboard SSE; the separate trace confirms the production queue cutoff. | Prepare routing inputs once per request and coalesce scoped work. Preserve current source freshness and protection ordering. This is synthetic protocol contention, not a desktop/OBS guarantee. |
| Stream projection | Every window has 29 unchanged binding updates and 29 repeated stream state messages among 34, with actual session/wallet/ship bindings. | Share source projections and suppress redundant content work while preserving expiry, liveness, state versions and recovery. Equal dashboard data often has changed freshness metadata. |
| Managed restart | The real supervisor/child/Core preserves accepted HTTP writes, active Session, cookie/CSRF and one activated generation. Forced late names resolution after SQLite close loses the ship event and produces three post-close SQL errors. | Introduce explicit ownership and bounded draining of accepted asynchronous work. The deliberate late schedule/100 ms exit grace reproduces a gap; it is not normal restart timing. |
| Backend memory | In the minimal forced-GC diagnostic, constructed Core retains 12.19 MiB in v0.7.3 versus 40.73 MiB in RC16. Topology loading and additional constructor indexes explain much of the increase. | Treat topology/index ownership as a budget; share immutable preparation where contracts match. Keep the bounded 48-system celestial cache. Same-process reconstruction grows RSS/reserved V8 capacity despite much smaller retained-heap growth; do not call memory flat or diagnose a leak from that alone. |
| Long Sessions | A real not-yet-due live-feed check still builds a 10,000-visit route, costing about 54 ms. v0.7.3 has the same pattern. Route queries themselves are time-bounded and combat request groups are already deduplicated. | Check cheap cadence/eligibility first; preserve every timed presence interval. This is an inherited refactoring opportunity, not an RC16 regression. |
| Browser ownership/replay | Twelve navigation/pilot/replay cycles leave DOM/listener counts stable, one EventSource and no after-unmount Universe requests. Collected JS and embedder heap rise modestly. Validated replay covers 10/100/1,000 visits and bounded start/midpoint playback. | Retain current cleanup boundaries; prioritise the original measured Maps camera/refresh costs. Replay indexing can share timeline preparation, but this ascending single sweep is not a balanced causal size estimate or a full-session playback test. |

The Maps count contrasts distinguish unrelated content and constant total links; changing map/node metadata is disclosed. Browser replay with 100 and 1,000 visits revisits only 11 distinct physical systems, so it tests repeat history/event processing, not growing scene geography. The 10,000-visit backend case represents a deliberately extreme 6.94-day active session.

Detailed evidence: [Maps](../reviews/followup-maps.md), [mixed workload](../reviews/followup-mixed.md), [restart](../reviews/followup-restart.md), [memory/Sessions](../reviews/followup-memory.md), [browser](../reviews/followup-frontend.md), and [independent methodology](../reviews/followup-methodology.md). New raw data is retained under [raw/followup](../raw/followup/).

## Correcting the common-workload baseline

The follow-up exposed an invalid storm-cache shape inherited from the original legacy fixture: `data:[]` where RC16 expects `{storms:[],points:[]}`. A background feed-state projection rejected inside `Promise.allSettled`; the original network/completion guards missed it. Released v0.7.3 has no equivalent Universe feed branch. Consequently, the original local and GitHub idle observations are **partial RC16 background workloads**, not a complete healthy warm-cache baseline.

A new backend-only ABBA copy corrects that shape and checks successful production feed state and tick subtasks. All four backend runs completed, each with typical/stress profiles and zero external requests. Every RC16 idle observation recorded 12 successful real ticks, no rejected subtasks, ready storms and 2,384 bundled points. Application and all eight harness/helper hashes verified before and after execution.

| Corrected stress workload | v0.7.3 | RC16 |
|---|---:|---:|
| Idle CPU, % of one logical core | 1.364–1.551% | 1.662–1.666% |
| Idle RSS | 101.57–101.70 MiB | 171.95–172.55 MiB |
| Maximum idle event-loop delay | 39.55–42.30 ms | 58.92–59.64 ms |
| `startKairo` initialisation | 15.99–16.15 ms | 154.20–164.52 ms |
| Authenticated state HTTP p50 | 39.68–40.07 ms | 41.95–44.06 ms |

The 7.84% stress HTTP increase does not meet the repeated 10% plus 1 ms signal rule. Session reports and selective import-cache reuse remain effective. Higher startup and residency remain concrete leads; these snapshots do not diagnose a leak. The tick audit adds small RC16-only bookkeeping and the feed-state validation warms that projection before idle; report those controls rather than attribute every changed number solely to the fixture correction.

See the [corrected comparison](../reviews/followup-legacy-corrected.md) and [raw provenance/results](../raw/followup/legacy-corrected/). This supersedes the original healthy-idle interpretation while preserving frozen evidence. Direct original state/session/OPSEC/market/database probes retain their checked meanings. The unaffected database lane was not repeated. This is a fixture correction, not a production fix.

## Journey retirement without hidden dependencies

Retire the standalone Journey log, My footprint/visit counters and exploration percentages, including their all-time aggregation on ordinary Universe/routing reads. The retained capabilities have different owners:

- **Sessions** own future timestamped movement and bounded raw/route queries for reports, replay and combat presence. Keep old stored evidence and old inferred-start behavior. Share the duplicate report/route window read while preserving the raw list's inclusive end and route's exclusive end.
- **Discovery** retains minimal per-pilot system identities. Previously discovered disconnected wormholes survive; public-only reports still expire. Global history must never seed private Maps or become a verified routing network.
- **General activity** keeps the existing Overview/timeline events and OBS notifications. Those semantic events can still contain movement outside Sessions. Retiring the dedicated visit log does not mean all movement evidence disappears.
- **Compatibility and upgrades** preserve documented Journey APIs/export and existing data through explicit adapters/policy. Normalise old saved presets, indicators, tabs and bookmarks; preserve active Session widgets and relabel their old Journey wording. Do not retain global collection merely to keep a deprecated adapter alive.

Recording must capture Session ownership and observation time before asynchronous enrichment. A Session started with stale/missing location needs its first fresh observation even when its system matches a pre-session snapshot; preserve the preceding gap and avoid duplicating a fresh captured start. Test Session end/start, Pilot disable/re-enable, restart and two-pilot isolation together.

The exhaustive [consumer and upgrade matrix](../reviews/followup-methodology.md) covers producers, legacy HTTP/export, saved views, discovery, hidden links, Maps tracking, Session/combat/replay, stream projections and browser behavior. The [proposed storage/service boundary](JOURNEY-RETIREMENT.md) keeps old visit IDs and adds explicit Session ownership. A separate [cadence and shared-index design](../reviews/followup-session-design.md) specifies the narrower measured improvements.

## Whole-application coverage and prioritisation

| Application area | Evidence boundary | Refactoring decision |
|---|---|---|
| Core scheduling, shared snapshots, assets, wallet, training, industry and goals | Common state/HTTP and mixed operation are measured; individual feature refresh costs require the broader source/consumer audit | Consolidate repeated reads and derived preparation at request/update boundaries. Preserve module/scopes/freshness and accepted event semantics; do not infer per-feature speedups from one full-state timing. |
| ESI/auth, protection and notification transport | Real synthetic auth-vault/ESI path and protocol protection controls; existing tests/source review | Keep credential/scoping, shared limiter and fail-closed behavior. Read caching/retries and write commands have distinct contracts even if transport helpers are shared. |
| Markets, imports and persistent storage | Historical/common workload, database hashes and retained optimisation review | Keep selective invalidation, 30-day working history, bounded writes and SQLite. Further consolidation needs a concrete duplication or maintenance problem; a new generic cache/store layer is not justified. |
| Sessions, activity, combat and discovery | Bounded query/live-feed/replay measurements plus dependency audit | Extract explicit recording, travel-query, activity and discovery contracts; retire old lifetime work, preserve accepted evidence and combat policy. |
| Atlas/Maps/navigation and frontend shell | Map/route/component and browser measurements; wider workspace/UI ownership audit | Share scoped load/projection preparation and isolate scene/camera lifetime. Apply useful ownership patterns across the shell, without pretending all screens were browser-benchmarked. |
| Dataset updater, packaging and runtime lifecycle | Original real archive pipeline plus actual managed-restart diagnostic | Retain worker isolation, integrity checks, rollback and fresh-process activation. Fix asynchronous task ownership across Core/modules, not only the observed history callback. |

The [older-backend structural audit](../reviews/followup-whole-app-backend.md) adds concrete work beyond the sprint features: prepare Goals' source/tracking/name inputs once per evaluation, make credit-ledger writes transactional and change-aware, resolve each asset's containment root once per sample, and give name-directory updates one owner. These are code-confirmed repetitions/ownership problems, **not separately timed speedups**. Preserve goal cutoffs, rolling ledgers, exactly-once completion, nested asset cycles/orphans and scope/freshness behavior; require targeted counts/equivalence before claiming improvement.

The [whole-frontend review](../reviews/followup-whole-app-frontend.md) confirms inherited duplicate startup reads and an unchanged `/state` → timeline/goals cascade in both versions. A small scoped-read/invalidation owner can remove that redundancy while retaining fallback recovery. It also identifies an unguarded extension pilot-response race, broad context/row-model recomputation, and separate administrative polling loops. Those latter costs are source-only; the race needs a deterministic reproduction, and individual screen gains need measurement. Keep backend protection/collection independent of dashboard visibility.

The [service/network review](../reviews/followup-whole-app-services.md) covers inherited ESI/Auth, vault, market workers, provider scheduling and startup. Narrow candidates include common ESI header/rate-limit policy, Auth-owned cold metadata/key flights, and a history-worker completion contract that awaits actual exit. Preserve command uncertainty, per-pilot keys, provider-specific cooldowns and existing coalescing. Roster caching, cached-market pacing and sharing optional public-feed transport remain conditional candidates, with no measured gain claimed.

The [whole-application architecture review](../reviews/followup-whole-app-architecture.md) extends the reproduced shutdown gap into an explicit dependency order: accepted HTTP/dataset work must finish while Combat, Universe, ESI and semantic subscribers remain available. It separately identifies source-only construction rollback, Stream subscription disposal and report/replay event-window duplication. The [lifecycle design](../reviews/followup-lifecycle-design.md) keeps the existing bus and service owners, with bounded drain/error visibility and a positive managed-restart acceptance gate.

Each candidate must be labelled **measured cost**, **reproduced correctness risk**, or **structural review only**. Meaningful no-change decisions—existing database/cache improvements, limiter policy, route algorithms, celestial bounds and working frontend cleanup—are part of the pass.

Prioritise by measured recurring cost, operational correctness risk and shared ownership complexity. Use small in-process service APIs with explicit pilot/map/session scope, time/freshness and lifecycle contracts. File splitting, arbitrary deduplication and new internal HTTP layers are not useful goals by themselves. The [responsibility map](REFACTORING.md) and [independent service/acceptance matrix](../reviews/followup-methodology.md) define the intended boundaries.

## Incremental implementation and acceptance

1. Establish owned asynchronous work and a positive deferred-response shutdown/restart gate; the current expected-failure diagnostic is not that gate. Fix the diagnosed dashboard SSE backlog cutoff while preserving bounded slow-client handling and reconnection/fresh-state behavior before declaring transport acceptance.
2. Introduce shared data preparation and scoped contracts for Maps, itinerary planning and measured Core/projection work. Follow with Goals evaluation/accounting and asset enrichment as distinct older-backend increments, guarded by semantic/work-count checks. Measure each increment before adding persistent caches.
3. Retire lifetime Journey consumers and migrate retained Session/discovery/activity callers with upgrade compatibility. Follow with the measured cadence and repeated-read work where contracts are clear.
4. Address Maps camera/scene and refresh ownership, then apply justified shared UI loading patterns. Preserve keyboard, drag, selection, detached views, revisions, writes, expiry and teardown.
5. Recombine the changes and repeat common workloads plus operational/browser acceptance. Compare preserved meaning as well as latency/memory; intentional product retirement can change output shape.

Implement from clean canonical RC16. Keep analysis tools external to production, use balanced same-environment comparisons and retain corrected/failed exploratory evidence. No checkpoint harness, profile, fixture or investigation workflow belongs in the final RC17 package. Validate that extracted package before human review; the 8.0 merge remains subject to the user's clearance.
