# RC17 Session, replay, discovery and public-feed trace

Audit: 7 October 2026. This supplements the completion ledger and [frontend trace](TRACE-FRONTEND.md). It distinguishes implemented changes awaiting final integrated acceptance, unresolved measured costs, conditional recommendations still needing a decision, and contracts already preserved. The short G1–G14 list did not contain every item below. None of this document grants clean-RC17 review or release approval.

Source paths below are relative to `kairo-rc17-completion`; evidence paths are relative to this analysis repository. The source was restored from published `fa6e852b76089b51cd552fa202de85ad6948b0ec`. Inspection occurred while completion changes were uncommitted over source checkpoint `68fceed9d75f4a5944ff38fe0adfaea938adff13`. Line numbers are inspection aids; function names remain the stable anchors. The master checkpoint must record the final integrated source identity. Historical evidence retains its original identities and is not acceptance of this changed tree.

## G2 — One report/replay event-membership predicate: implemented, local gate passed

**Original trace:** `analysis/rc16/reviews/followup-whole-app-architecture.md:15`; `followup-methodology.md` retained Session meaning and consumer matrix; `analysis/rc17/REPORT.md:283` marked this partial. The two readers previously duplicated the same character, time, event-cursor, late killmail and observation ownership rules.

**Current source:** `server/session-event-window.mjs:8` exports the small pure `sessionEventWindow`; `history.mjs:29` and `session-replay.mjs:31` use it. It returns only SQL and parameters. Reports still own aggregation, cash totals and 100-event pagination. Replay independently owns routine-event suppression, its 10,000-event cap, coverage and a captured global event cursor. Replay does not call `sessionReport`, build a full report, or read report-only snapshots.

**Preserved details:** character/time index selection; exact start/end cursor semantics; occurrence-time killmails in `[start,end)`; the owned end event and late accepted Pilot observations; legacy missing JSON `session_id` versus explicit JSON null; no foreign-pilot/foreign-session attribution. The visit query remains separate: report compatibility `visits` is inclusive at the end, derived route/replay is exclusive. No mechanical standardization of these different contracts occurred.

**Closure evidence:** four new assertions in `tests/kairo/session-event-window.test.mjs:30,70,87,109` cover differing report/replay presentation, same-millisecond adjacent Sessions, late ownership, replay snapshot fencing, prohibition of report construction, aliased SQL and the bounded per-pilot index. Existing travel/replay/report assertions were included in the fresh 58-assertion run described below. Final frozen-source full tests/build and CI remain pending.

The new module imports only the existing `session-travel.mjs`, which both readers already depended on. It adds no eager formatter or atlas initialization. That source fact is not a measured cold-import exemption: G7 must include the new module in its final source.

## G12 — Optional shared R2Z2 raw transport: implemented, counted and locally validated

**Original trace:** `analysis/rc16/reviews/followup-whole-app-services.md:16,24`; the recommendation was conditional on demonstrating overlapping URLs with both consumers enabled. Session's feed and opt-in Universe public combat have different acknowledgement and presentation policies.

**Measured qualifying fixture:** `analysis/rc17/completion/services/service-counts.mjs`, `before-20261007.json` and `after-20261007.json` are deterministic counts, explicitly not timing measurements. The JSON includes source-file hashes, harness hash, Node version and fixture outputs.

| R2Z2 URL/result | Before | After |
| --- | ---: | ---: |
| `sequence.json`, successful pointer | 2 | 1 |
| `100.json`, successful packet | 2 | 1 |
| `101.json`, end-of-feed 404 | 2 | 2 |
| Total provider requests | 6 | 4 |
| Session and Universe durable next cursor | 101 / 101 | 101 / 101 |
| Session accepted packet / Universe retained event | 100 / 1 | 100 / 1 |

The 404 is deliberately not cached. Its two requests preserve each consumer's retry/backoff semantics; this is not a missed successful-packet cache hit. The count harness's Session acceptance callback is not itself ESI verification. The separate real Core test exercises verified Session ingestion and personal/alliance persistence.

**Current source:** `server/public-feed-transport.mjs:14` owns bounded flights, raw bytes, a serial provider queue and packet reuse. `server/core.mjs` constructs one owner, wraps the Session and Universe fetchers, and closes it after its consumers drain. Each actual underlying fetcher identity has a separate cache/queue/flight map. Only fixed-origin numeric R2Z2 packet and pointer public GETs qualify; requests with bodies, credential-including policy, Authorization/Cookie headers, other methods or other origins pass through without sharing.

**Preserved consumer policy:** fresh Response objects/body copies; original status, status text and headers; decoded fetch bytes are not decompressed again; Universe's content-length check and 2 MiB stream cap versus Session's 4 MiB cap; independent 12-second Universe and 15-second Session cancellation signals; Session acknowledgement only after verified acceptance versus Universe normalization; lag, independent cursors, disabled consumers, pointer renewal and backoff. One waiter leaving does not cancel another; the last leaving aborts upstream. A fresh successful pointer invalidates reusable packets for that fetcher. Failed/oversized/aborted responses and non-2xx status bodies are never retained as packet cache entries.

**Bounds:** maximum 32 successful packet entries / 8 MiB per fetcher, 30-second reuse eligibility, 16 pending accepted tasks (including canceled work that has not exited), 4 MiB transport body ceiling, 110 ms provider-start spacing and 15-second upstream timeout. Expiry is checked on access; idle bytes can remain until another access or Core close, still within the byte/entry bound. This is not an eager 30-second deletion promise or a global parsed killmail cache. Body collection is serialized, so request/body-work savings do not establish a latency gain.

**Closure evidence:** `tests/kairo/public-feed-transport.test.mjs` initially contained 12 top-level tests plus two consumer-cancellation subtests; the late queue-bound correction adds one top-level regression. Coverage includes decoded gzip-labelled Responses, independent signals and limits, content-length rejection, oversized/interrupted streams, 404/429/503 headers, failed-flight retry, age/entry/byte bounds, rotation, fetcher/credential isolation, queue pacing/admission/cancel, actual consumer failed verification/disable/lag, close, and actual Core wiring. The original cases passed in the fresh 58-assertion run. After the queue-bound correction below, all 15 transport assertions and 19 Core lifecycle/construction assertions passed in a fresh 34-assertion run. Final integrated tests and CI remain pending.

**Late independent review correction, locally resolved:** counting only the coalescing Map did not strictly bound the serial queue: repeated cancellation/retry of one queued URL could replace its Map entry while older canceled tasks remained behind a blocked different URL. `server/public-feed-transport.mjs` now charges a provider-owned task Set until each task exits in `finally`; admission uses its size, and close awaits all accepted tasks, including replaced canceled entries. A deterministic blocked-head regression verifies same-key retries cannot exceed the bound, canceled copies make no provider calls, and fresh work recovers after actual drain. A second reviewer confirmed the narrow fix. Source/test hashes below are updated to this correction; the earlier service-count JSON remains evidence of its own pre-correction source, not relabelled current-source evidence. The correction does not change ordinary successful two-consumer sharing.

## S1 — Residual complete Session report cost: open measured finding outside G8

**Provenance:** `analysis/rc17/reviews/idle-refinement-local.md:84–109`, raw `analysis/rc17/raw/refinement-backend-1`; `idle-refinement-github.md:78–85`, raw `analysis/rc17/raw/github-run-37083252892`. Both compare RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` with `fa6e852b76089b51cd552fa202de85ad6948b0ec`. Earlier `05d0d4b` adverse report values remain in `REPORT.md:422–438` and `backend-results-github.md`; they are not erased by later evidence.

| Accepted historical observation | RC16 | Candidate |
| --- | ---: | ---: |
| Local typical Session report p50 | 15.292–15.381 ms | 15.612–15.710 ms |
| Local stress Session report p50 | 84.272–87.559 ms | 88.586–97.832 ms |
| Local stress Session report p95 | 101.935–106.172 ms | 97.711–107.594 ms |
| GitHub stress Session report p50 | 105.61–108.43 ms | 110.91–115.55 ms (+5.81% of means) |
| GitHub stress Session report p95 | 140.91–141.98 ms | 144.73–148.72 ms (+3.74% of means) |

The GitHub report rows are adverse despite not meeting the old combined repeated >10%/>1 ms threshold. G8's state-projection p95 diagnosis does not automatically close them. Typical report tails improved and local stress tails overlap; retain those qualifications.

**Source anchors and possible causes:** `history.mjs:26–36` reads count, event page, raw visits and cash before `sessionDetails`; `session-details.mjs:44,70,105,145` performs route, ship and combat work. Ownership fields increase serialized Session payload by 5,400 bytes typical / 36,000 stress in the existing fixture. Additional filtering, parsing, materialization and serialization are plausible cost contributors, not established attribution. This is the whole RC16→fa6 change; the data do not prove the idle refinement caused the report delta. The newly shared G2 predicate is an ownership refactor, not proof of a timing fix.

**Concrete next work and closure:** instrument counts/rows/bytes and separate event queries, route projection, combat qualification, remaining details and JSON serialization outside timed runs on the same populated fixtures. Retain nonempty combat, event counts, ownership and full relevant field assertions. Change only the repeatedly demonstrated cost owner; then run balanced ordinary measurements on frozen source locally and on the affected CI environment. Keep all Session p50/p95 values in final acceptance, even if no additional rewrite is justified by the resulting attribution. Do not delete history or narrow output to manufacture parity.

## S2 — Small route and route-to-combat grouping overhead: conditional decision still needed

**Provenance:** `analysis/rc17/reviews/memory-results-refined.md:53–90`, accepted `analysis/rc17/raw/local-refined-memory-3/memory/`; immutable completion SHA-256 `9681b510fcb6f0697b7df73e97c3a1dfda086c65464b167e2e360a300a79ef9e`. RC16 versus `05d0d4b36c154329006d6772769063db874762da`.

The local 1,000-visit direct-route median was 5.021–5.252 → 5.284–5.783 ms, about +0.397 ms / +7.72%. The 100-visit route-plus-combat-groups result was about +0.100 ms. The 10,000-visit direct-route regression was already corrected: 48.957–50.917 → 47.127–47.197 ms; route plus groups also improved. `memory-results-github.md` / `raw/github-run-37078241973/memory` found the 1,000-visit route essentially flat (3.638–3.646 → 3.570–3.670 ms, −0.62%). Do not call the historical fixed 10,000-row regression still open, or claim uniform speedup across small fixtures.

**Source:** `session-details.mjs:44` (`sessionRoute`) and `session-combat.mjs:11` (`sessionCombatQueries`). Route output must retain timed loops and every visit; only request groups deduplicate system/year/month. Redundant normalization copies were already removed. Current prepared-row foreign-owner filtering remains required.

**Decision/closure:** retain 100, 1,000 and 10,000 visits, short window with 10,000 older visits and four-pilot cases in the final matched route/group lane. Count bounded SQL and projection/group operations separately. A repeated localized overhead justifies a narrow allocation/query change; mixed sub-millisecond results justify a documented measured no-change disposition, not an unsupported zero-cost assertion. Preserve full route fields, names, synthetic starts, sovereignty and combat windows in tests; benchmark route/group hashes alone do not prove those fields.

## S3 — Repeated recent-Session enumeration over archived Sessions: conditional index/cache decision open

**Original trace:** `analysis/rc16/reviews/architecture.md:27–35` (A3), especially the separate `syncRecent` query finding at `:31` and complete two-minute gate at `:35`. The cheap live-feed deadline guard addresses route rebuilding before a feed is due; it does not eliminate this separate historical-Session enumeration. The current `server/core.mjs:348–351` ticker still calls `sessionCombat.syncRecent(c.id)` every three seconds for connected, non-reauthentication pilots.

**Exact current query:** `server/session-combat.mjs:146–149` (`syncRecent`) first checks current Combat/pilot eligibility, then executes:

```sql
SELECT id FROM sessions
WHERE character_id=? AND (ended IS NULL OR ended>?)
ORDER BY ended IS NULL DESC,started DESC
```

The second parameter is `iso(now()-DAY)`. It returns only open or recently ended Sessions, but selecting them requires examining historical candidates for the pilot. The schema's `idx_sessions_character_started` at `server/store.mjs:31` indexes `(character_id,started DESC)`; its second column does not bound the `ended` predicate. The original A3 in-memory EXPLAIN selected this index on character only and used a temporary sort. No new populated/analysed plan or elapsed benefit has been measured in this audit. Source-backed repeated work is established; an additional index or route cache is still a conditional recommendation, not a proven speedup or an already-closed gate.

**Missing workload:** the existing 100 in-window visits plus 10,000 older **visits** fixture measures bounded travel-window extraction. It does not vary the number of archived **Session rows**, exercise this query across a complete two-minute feed interval, or establish the value of an `ended` index. The preceding C1 cadence tests and G12 transport counts also do not provide that disposition.

**Concrete measurement and decision:** build isolated fixtures with representative archived Session cardinalities (for example 100, 1,000 and 10,000 per pilot), one and four connected pilots, a long active Session, and recent ended Sessions on both sides of the exact 24-hour boundary. Preserve meaningful start/end context and visit/combat data. Observe the full two-minute interval at the existing three-second cadence, recording actual tick count, `syncRecent` query calls and returned eligible IDs, per-Session `sync` calls, route/group reconstructions, provider calls and cursor changes. Keep SQL/EXPLAIN diagnostics separate from ordinary elapsed/CPU/event-loop measurements; report internal rows examined only if a real supported counter provides them. Retain the populated planner output before and after any candidate index, including sort work, plus database/index size and insert/end-update cost.

Compare a narrow recent-Session index/query candidate only after the baseline shows material repeated enumeration cost. The `OR` and ordering may require a measured split open/recent query or carefully chosen indexes; do not assume `(character_id,ended)` alone removes both scan and sort. Separately count due route/group rebuilding: a route cache is justified only if reuse remains meaningful after the existing deadline fix, and requires explicit invalidation for accepted delayed observations, changes to the active route/end time and eligibility. Avoid caching stale target arrays or replacing the scheduler. Close S3 with a documented accept-or-reject decision and retained matched evidence for each proposed index/cache change; "conditional" by itself is not a disposition.

**Semantic closure:** the exact eligible Session IDs and ordering must match the original query, including equal timestamps and every recent ended Session (no newest-eight cap). End-of-Session history must still recheck immediately through `sessionChanged`, exact 24-hour expiry must become static, and an in-flight history collector crossing that deadline must stop accepting new records. Explicit/forced live checks must still respect provider cooldowns and share pending work; current-pilot connection, reauth, Combat disable and mid-flight end/pause changes must take effect. Keep verified-ingestion cursor acknowledgement, quiet/repeated transit, occurrence times and presence-qualified ±10-minute buffers unchanged. Existing `tests/kairo/session-live.test.mjs:27–174` and `tests/kairo/sessions.test.mjs` supply behavioral controls; add only the targeted enumeration/index/cache contract tests required by a measured change. No source change or runtime measurement was made for S3 during this audit.

## R1 — Replay tick preparation/indexing: source-confirmed repeated work, conditional recommendation open

**Original trace:** `analysis/rc16/reviews/followup-frontend.md:44–46`, with fixture limits at `:13–21,34–42`; `followup-methodology.md` consumer matrix and final browser-evidence paragraph. This is not G13's Maps camera cost.

**Current source:** `components/kairo/session-replay.tsx:102–126`. The timeline memo parses/sorts visits and events once, but every 100 ms playback update still copies/reverses visits to find the current visit, filters all events for the latest five, scans for next visits/events, maps/filters visited systems, and parses/filter travel timestamps. Controls also derive ticks and gaps during renders (`:134–136`). Counts scale with retained timeline size; their elapsed contribution has not been isolated.

**Evidence limit:** the original compiled browser sweep used 10/100/1,000 visits and 2/20/200 events. The 100/1,000-visit routes revisit only 11 distinct systems. No long tasks and RAF p95 16.7–16.8 ms in those bounded windows are valid observations, but not evidence for a 10,000-event-cap timeline or growing geography. Midpoint work included script, style and drawing; no source establishes timeline scans alone as its cause. Six-second windows at 60× advance six simulated minutes, not the entire long Session.

**Concrete decision/change:** first count tick work for repeated-system and larger-geography timelines, including backward seeks and equal timestamps. A pure prepared timeline can own numeric times and binary upper-bound lookups, with forward cursor advancement or cached prefix state where demonstrated useful. Keep it local to replay; do not add a shared app framework. Any implementation must preserve the last matching equal-time visit, gaps, exact ended position, reverse scrubbing, previous/next event rules, ordered recent events, timed loops, fixed live snapshots, pause/hidden-tab behavior, pilot fencing and captured sovereignty.

**Closure:** output-equivalence tests over monotonic playback, jumps backward/forward, zero-duration/equal-time rows, missing coordinates and end boundaries, with operation counts demonstrating work removed. Then an exact-built-source compiled browser comparison including 1,000 visits/11 systems, a larger distinct-system scene and near-cap events, retaining ordered routes, coverage, play/pause/seek/end and teardown gates. Attribute JavaScript versus scene/drawing costs separately. A measured no-change decision is possible if added indexing would not help the real workload; the existing narrow browser run alone is insufficient to make it.

Session archive response ordering and nested merges/presentation growth are separately tracked as **F2 and F6** in [TRACE-FRONTEND.md](TRACE-FRONTEND.md). Do not double-count them here. The Session-dependent dashboard invalidation cascade is **F1**.

## C1 — Live cadence and combat-history eligibility: implemented contract; preserve final acceptance

**Trace:** `analysis/rc16/reviews/followup-session-design.md:7–34`; `followup-whole-app-services.md:11,18–24`; `analysis/rc17/REPORT.md:180–210`; accepted local/GitHub memory reviews.

`server/session-live.mjs:67` checks closed → pending → source cooldown → normal deadline before `getTargets`. A force bypasses only the normal deadline, coalesces an existing flight and does not defeat source backoff. Due calls build current eligible targets; no target array is retained across requests. `session-combat.mjs:33` builds live targets; `:139–151` keeps independent history collection and checks every Session ended within the last 24 hours. Ending a Session invokes history collection immediately, with `justEnded` bypassing its prior history retry deadline but not the provider's cooldown. It does not force the incremental public feed.

Existing limits remain explicit: Session 120-second cadence, 200 ms per-packet spacing, 300 packets / 45-second budget, 4 MiB body and 15-second request deadline. Universe is opt-in, independently keeps 12-second / 2 MiB limits, up to eight packets with 110 ms spacing, 15-second metadata freshness and 1-second continuing / 6-second end-of-feed deadline. G12 did not unify these policies or cursors. The shared provider budget can delay a real request; it does not reduce refresh frequency to claim a saving.

**Evidence:** accepted no-due diagnostics removed three route reads / 30,000 rows for three 10,000-visit calls, now zero, while due/forced paths retain real work. The robust claim is eliminated target work, not the microsecond no-op ratio. `tests/kairo/session-live.test.mjs:27–174` covers exact 24-hour cutoff, due/force/pending rules, eligibility changes, verification failure, end during network/spacing, expired cursor restart, malformed/oversized packets, close, all recent ended Sessions and archive-deadline crossing. This file was not in this agent's fresh 58-assertion run; its frozen-source rerun belongs in the final integrated gate. It is not evidence of a newly discovered cadence bug.

## C2 — Legacy ownership, discovery and retirement matrix: source implemented; validation claims must remain bounded

**Trace:** `analysis/rc16/reviews/followup-methodology.md:75–136`; `followup-memory.md`; `analysis/rc17/reviews/sessions-goals.md`. The narrow benchmark fixtures never established full report/replay/export equivalence. This is an acceptance qualification, not a reason to discard the existing explicit behavioral tests or invent a new blanket migration rewrite.

| Contract | Current source owner | Existing targeted acceptance and remaining final gate |
| --- | --- | --- |
| Historical IDs/time/order/sovereignty, notes/hidden links and additive membership migration | `store.mjs:93–107`; `discovery.mjs:4,10` | `session-travel.test.mjs:50` reopens twice and checks retained legacy rows, annotations, per-pilot membership and no duplicate backfill. Run on frozen source; preserve a stopped-app/export record comparison in final migration acceptance. No generic export→import route is claimed. |
| Discovery outside Sessions; timestamped movement only within eligible Sessions; general activity retained | `universe-history.mjs:6`; `session-travel.mjs:36,47` | `session-travel.test.mjs:79,97,115,132,196,232,268,295,310,320`: module scope, same-system baseline, restart, delayed/failed names, receipt ownership, stale samples, pause/re-enable, explicit unowned activity. These passed in the fresh focused run. |
| Legacy missing ownership versus explicit unowned new events; same-time adjacent Sessions | `session-travel.mjs:7,12,20`; shared `session-event-window.mjs:8` | Travel tests `:162,196` and new predicate tests preserve IDs/timestamps, missing JSON owner versus JSON null, foreign owner exclusion, legacy inferred start, inclusive raw versus exclusive route end. Fresh focused run passed. |
| Presence-qualified combat and quiet/repeated transit | `session-details.mjs:44,93,105`; `session-combat.mjs:11` | `sessions.test.mjs:22,31,40,47,130,150,155` covers exact boundaries, qualification before ±10-minute buffers, merged nonrecursive windows, exclusive losses, year/month grouping, late records and rate limits. Fresh focused run passed. |
| Explicit private discovery membership; no permanent public-only knowledge | `server/discovery.mjs:4,10`; `components/kairo/universe-presentation.mjs:43` (`knownWormholeSystemIds`); `components/kairo/universe-map.tsx:117` (`discoveryPoints`) | `universe-presentation.test.mjs:39,50` checks expired public-only endpoints and retained explicit membership. Final integrated rerun pending. Replay's scoped discovery is independent. |
| Replay cap, honest gaps/coordinates, fixed snapshots and no writes | `session-replay.mjs:19,28,29,69,110` | `session-replay.test.mjs:123,165,188,204,240` checks >one report page, actual 10,000 cap/omission counts, routine suppression, snapshot, ownership, restart and K/J-space rewinds. Fresh focused run passed. This backend coverage is distinct from R1's unmeasured near-cap browser cost. |
| Historical sovereignty, saved legacy workspace aliases and stream labels | `server/visit-sovereignty.mjs`; `components/kairo/session-replay-sovereignty.mjs`; workspace navigation/view normalization | Existing `session-replay-sovereignty.test.mjs`, `workspace-navigation.test.mjs`, view-config and stream tests provide specific gates; final integrated rerun and compiled UI acceptance pending. They were not all rerun by this agent. |
| Cold legacy Journey adapter/export remains supported; no new continuous lifetime ledger | `places.mjs` (`journeyData`, legacy-only adjacency); `index.mjs:254–256,439` | `session-travel.test.mjs:212` checks interleaved owned/legacy rows, equal-time adjacency and latest-500 behavior. Raw export still includes events, visits, Sessions, discovery and hidden links. Final HTTP/export ownership gates remain required. |

`history.mjs:31–33` reads the visit window once and passes prepared rows into `sessionDetails`; route projection maintains its distinct exclusive end. The original two-query report responsibility duplication is addressed. The SQL plan test excludes old out-of-window history; it does not mean every report field is bounded independently of Session length.

The existing benchmark route hashes cover system/time/duration/active and combat request groups, not every returned JSON field. Historical local/fa6 backend count/shape gates also are not full object equality: candidate Session ownership fields intentionally change payload bytes. Final acceptance should combine those workload controls with the named semantic tests and exact-source compiled browser gates rather than falsely claim byte identity.

## C3 — Durable Session evidence and replaceable public caches: linked to G4

**Trace:** `analysis/rc16/reviews/followup-whole-app-backend.md:55,67`; methodology migration/export matrix; whole-app services consumer ownership. Visits, Session/event/combat records and private discovered-system identities are durable user evidence. Public overlay cache rows and short transport raw packets are replaceable. Retention work must not infer permission to remove durable records, cap a full export, or erase old sovereignty/legacy starts merely because their lifetime summary view was retired.

`index.mjs:245,317–319` already bounds timeline and archive/report pages. `index.mjs:439` intentionally materializes the full private export on demand. Universe combat retains at most 500 normalized events within its public two-hour maximum window, independent of personal/alliance records. G12's bounded cache does not solve or worsen durable database policy by redefining those records as disposable. G4 owns the inventory, 30/180/365-day modeling, narrow cache cleanup and archive-index evidence. No additional Session history deletion or export redesign is supported by this audit.

## Fresh validation provenance and final prerequisites

On 7 October 2026, after reconstruction of G2/G12, the following command passed **58 assertions, zero failures** (including two subtests):

```sh
node --test --test-isolation=none tests/kairo/session-event-window.test.mjs tests/kairo/session-replay.test.mjs tests/kairo/session-travel.test.mjs tests/kairo/sessions.test.mjs tests/kairo/public-feed-transport.test.mjs
```

`git diff --check` passed at that point. This was a focused source test run, not a production build, timing run, or final integrated acceptance. Its console result was observed during reconstruction; the root's final gate must retain its own complete log and source manifest. Later coordinated Core descriptor-map edits reported eight separate scheduling/OPSEC/data-access assertions passing; those do not replace a final combined run.

| Reconstructed file | SHA-256 at audit |
| --- | --- |
| `server/session-event-window.mjs` | `56a067117c91d2ad1f8fbc77b607478fcd0596e0929e155aa52ad3cd5158d84f` |
| `server/public-feed-transport.mjs` | `5ccf94acfe02ced5eef1de35febbacfe91e74970e9c5397aaff1f17948e57748` |
| `tests/kairo/session-event-window.test.mjs` | `72f10220cb516b8c17250c1e23b474acfbc6fbb78c1d90506bb9c35cb3062d44` |
| `tests/kairo/public-feed-transport.test.mjs` | `69939aaf299f1b046a29649ec0315800fdca45df66585a7dc8ffd1a8ea3e2581` |

After the late queue-bound correction, the following fresh command passed **34 assertions, zero failures**, retained in `analysis/rc17/completion/services/transport-bound-tests-20261007.log`:

```sh
node --test --test-isolation=none tests/kairo/public-feed-transport.test.mjs tests/kairo/lifecycle.test.mjs tests/kairo/core-construction-rollback.test.mjs
```

This run includes 15 transport assertions, eight Core lifecycle assertions and 11 Core construction/rollback assertions. `git diff --check` passed afterward. The Core file SHA-256 at this targeted run was `ae872f977507be838988d7e412287865bf9b0c2e0572595853580d3b065e09fa`. It is not covered retroactively by the root's earlier 871-test result.

A fresh read-only review of restored `server/index.mjs`, `server/obs.mjs`, `server/registry.mjs` and fault tests found no source blocker in actual caller paths: cleanup keeps primary error identity/code, acquired handles and accepted HTTP/event work have owners, Store closes last, and OBS's 6-second stalled-close failure is visible and idempotent. This review does not reassert lost pre-reset test counts or fault cases.

No new timed lane was run during this trace audit. The next checkpoint is explicitly work in progress: G2/G12 final integrated acceptance, S1 attribution/disposition, S2 matched measurement/disposition, S3 full-interval archived-Session index/cache decision, R1 counted/compiled evidence, linked frontend findings, and the other ledger gates must be settled before a clean RC17 review package. Historical `05d0d4b` Mapper acceptance and retained raw artifacts cannot certify changed production source or compiled assets.
