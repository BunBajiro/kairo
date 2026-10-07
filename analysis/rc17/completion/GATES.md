# RC17 completion gates — recovered 7 October 2026

This ledger is reconstructed from the retained 3 October source audit and conversation. It does not recreate lost raw measurements. The user requires the optimisation/refactor to be complete before a clean RC17 review build. The previously issued PR #10 build was premature.

This is the reconstructed initial ledger, expanded by the exhaustive trace fragments below. It is **not an exhaustive list of only fourteen tasks and is not a declaration of completion**. The original three-issue answer and clean review handoff were incomplete. References are relative to the restored analysis repository; runtime anchors are in `kairo-rc17-completion`.

## Exhaustive trace index

- [Maps, Atlas, routes and performance residuals](TRACE-MAPS-PERFORMANCE.md): M1–M9, RT1–RT2, P1–P7; includes conditional Atlas/layout/frame scans, scene memoization/culling, summary workload gaps, minor adverse rows and exact-source acceptance.
- [Whole-app frontend](TRACE-FRONTEND.md): F1–F9. Dashboard/resource/context/selector/polling/archive/Studio/stream work remains outside the original fourteen.
- [Sessions, replay and public transport](TRACE-SESSIONS.md): G2/G12, complete report and small-route residuals, replay tick/preparation and preservation contracts.
- [Services](TRACE-SERVICES.md) and [controlled service counts](services/TRACE.md): Auth flights, operation-local roster reuse, ESI cache-first market pacing, feed transport, existing lifetime/policy boundaries.
- [Retention and archive indexing](retention/TRACE.md): durable versus replaceable rows, disabled Politics backlog, aged inventory and write/read costs.
- [Startup](startup/TRACE.md): construction/import allocation, deferred first-use effects and acceptance requirements.
- [Backend, Goals and updater](TRACE-BACKEND.md): lifecycle ownership, goal accounting/serial enrichment, binding/name payload residuals and U1/U2/U2b/U3 updater findings.
- [Current master trace and disposition](TRACEABILITY.md): consolidated status and final prerequisites across every fragment above.

Current classification: some original findings survived already implemented in fa6; completion changes reconstructed on 7 October have fresh local correctness results, but final frozen-source performance and independent CI are pending. Conditional recommendations need a measured decision, not an unmeasured defer. Historical negative observations remain tied to their actual source/harness.

## Original fourteen cross-cutting gates (stable IDs)

The finding column preserves why each gate was opened in the published whitepaper. It is not a claim that all original code gaps remain in the reconstructed source. Current source changes and fresh evidence belong to the linked owner traces and master disposition; performance gates G6–G9 and G13–G14 remain pending.

| Gate | Original finding | Required closure evidence |
|---|---|---|
| G1 — startup rollback | `REPORT.md:282`; `rc16/reviews/followup-whole-app-architecture.md:12`. Outer Store/Vault/Auth/ESI/Core construction precedes startup catch; Core creates Universe/history before Registry. | Locally owned staged rollback at both boundaries; injected constructor/import/migration/activation failures; close created owners once, drain appropriate accepted work, preserve original and cleanup errors; no timers/clients/workers/SQLite handles retained. |
| G2 — Session event windows | `REPORT.md:283`; architecture review:15. Report/replay still duplicate intricate cursor, occurrence-time and end boundaries. | Shared small pure predicate/parameter builder; same-timestamp, late killmail, adjacent Session and exact-end tests; replay keeps its own limits/enrichment and does not build a report. |
| G3 — cold Auth flights | `REPORT.md:284`; `rc16/reviews/followup-whole-app-services.md:13`. Discovery/JWKS cold/expired public fetches lack Auth-owned coalescing. | Shared discovery/key flights cleared on failure; concurrent-pilot cold/expired/key-rotation call counts; origin/freshness/signature/claims/PKCE/refresh rotation preserved; no automatic replay of token POSTs. |
| G4 — durable growth and replaceable retention | `REPORT.md:287`; `rc16/reviews/architecture.md:47–55`. Completed market jobs, HTTP cache keys, archive rows, Session/events/combat differ in durability. | Inventory rows/logical bytes/DB+WAL at 30/180/365 days. Bounded replaceable retention preserving last-good data, validators, active retry/cooldown and restart/resume. Evaluate archive `(region_id,date)` index with populated planner/read/write costs. Preserve durable player evidence unless separately authorised; no routine UI-path VACUUM. |
| G5 — disabled politics backlog | Earlier architecture:9–15 explicitly requests disabled-inference backlog policy and disable/re-enable large-backlog gate. Content-idempotent Combat writes alone do not close queue growth. | Include queue in G4 inventory; explicit disabled-state bounds/reconstruction policy; corrected valuations/incomplete-evidence visibility and large backlog disable/re-enable tests. Never silently discard durable evidence. |
| G6 — typical initialisation | `REPORT.md:572–578`; `rc17/reviews/idle-refinement-local.md:55–78`. fa6 local startKairo 170.569–178.849 ms versus RC16 143.519–154.216 ms. CI mixed directions do not fix it. | Isolate construction phases, remove avoidable work, fresh balanced exact-source local and independent CI original fixture. Keep import, initialisation and end-user launch distinct. |
| G7 — residual cold Core import | `REPORT.md:333–341`; `memory-results-refined.md:92–111`. Refined import 44.023–46.925 ms versus 38.274–42.346 ms, +5.164 ms/+12.81%, both pairs >10% and >1 ms. | Attribute remaining module work; targeted correction and cold import+construction retest; verify any deferred first-use work rather than merely move the stall. |
| G8 — stress state tail | `REPORT.md:572–581`; `idle-refinement-github.md:76–103`. Direct p95/max 30.40–31.70 → 34.27–43.59 ms, +25.36% by means, both pairs flagged. | Distinguish snapshot reads/JSON parse/serialization/GC/scheduler and equal payload. Controlled source/phase experiments and final exact-source unchanged original backend ABBA locally+CI. Small sample count does not dismiss signal; don't attribute fa6 cause just because it is newer. |
| G9 — original 05d idle CPU attribution | `REPORT.md:390,498–518,564–568`; `idle-refinement-local.md:117`. Original CI +19.47% stress/+27.43% typical unexplained; fa6 lower latest CPU does not prove old cause. | Preserve historical observation. Controlled RC16/05d/fa6 phase-matched counts/profiles if needed. Final-source acceptance must show adverse condition removed with a demonstrated mechanism and clear limits; no invented retrospective cause. |
| G10 — roster ownership decision | `REPORT.md:288`; services review:15. Auth roster parse/read repetition remains a deferred measured-need question. | Count representative synchronous operations and polling. Reuse within operation first; Auth-owned snapshot only if justified. Immediate callback/refresh/scope/invalid-grant/disconnect invalidation, caller-mutation isolation, no plaintext credential cache. Negative measured result can close consideration, unmeasured deferral cannot. |
| G11 — cache-hit market pacing | Services review:26,40. Market spacing occurs before ESI may hit cache. | Cached repeat-scan transport/wait fixture; if material, pace actual ESI transport. Preserve miss courtesy limits, priority fairness, cancellation, coalescing, page/order caps, staged promotion and previous-good book on failure. |
| G12 — optional public-feed transport | Services review:16,40. Session/Universe can request overlapping R2Z2 sequences when both enabled. | Mixed enabled-consumer URL/body counts, then bounded shared packet flight/cache/budget only if needed. Independent durable consumer acknowledgements, lag/backoff/cancellation/size limits and disabled behavior preserved. |
| G13 — dense camera rendering | `REPORT.md:362–368,457–460`; camera local review:75–81,94–112,173–175. 600-node scene still stalls under software rendering. | Profile exact scene and native gestures with focus detail OFF/default scales. Remove demonstrated avoidable work; repeat compiled correctness and unchanged camera ABBA. Preserve canonical topology, visual quality, hit targets. Headless evidence cannot guarantee desktop GPU FPS. |
| G14 — Maps global reconciliation | `REPORT.md:158–169,320–322`; Maps local review:104–106,178; GitHub review:50,73,100–106. Constant selected payload still pays global expiry/scheduling scans. | Attribute internal SQL scans vs returned bytes; indexed/scoped correction with immediate expiry/access/revision/direct-import semantics; 1/8/24-map measurements and payload equality. Summary/full-response work proportional to requested data remains a necessary contract cost, not permission to discard fields. |

## Recovery record: lost diagnostics and restored fixes

These describe source changes and prior conversational observations, not recovered raw proof. The Maps fixes have now been restored. Any lost raw evidence must be rerun and retain a new identity.

- G13: `paintChainCamera` retained the zoom output's sole Text node and updated `nodeValue`, avoiding `textContent` replacement. An isolated CDP intervention on the same 600-node graph showed 152,358/152,356 recalculated style elements and 14 ancestor `:has()` invalidations in unchanged probes, versus 174/181 elements and 0 invalidations with the stable Text node. Those aggregates were printed in conversation; original trace files are lost. Neither CSS nor graph changed. Added label/node-identity test.
- G14: 3 partial SQLite indexes (global dated expiry, pilot dated expiry, collapsed links); split due/collapsed queries with `UNION ALL` and duplicate exclusion; indexed collapsed branch prevents SQLite choosing broad character/kind scan. Direct SQL/import changes remain immediately visible; no cross-request cache. Added indexed-plan and timezone/unknown-lifetime collapsed-link tests. Prior synthetic 9600-link query diagnostic reported equal result identities and 364,544 extra bytes. Original raw JSON lost.
- Fresh targeted tests on 7 October passed: 3 camera, 4 Maps reads, 20 Universe service, 4 JSpace retention. They validate reconstructed source behavior, not rendering/SQL elapsed-time improvements. Root is recording the final integrated test/build identity separately.

## State-tail diagnostic recovery

Before loss, the first root diagnostic `startup-state.mjs` was copied to `snapshots/startup-state.initial.mjs`; the recorded SHA-256 was `21e148ea7776de7e860978d83bba9ed7cc579b5fc6e61d77647926b15b53ad69`. That original file and its raw measurements have not been recovered. The newly reconstructed scripts have different identities.

Its results were qualified: it hashed/byte-counted every 3.47 MB response while profiling, and called optional fa6 `quiesce()` absent in RC16, so residual protection/heartbeat timers differed. Its lower fa6 tail did not establish a cause or dismiss CI.

Replacement worker/runner/summary were prepared with source+harness hashes, no per-sample hash/byte walk, scoped preflight and final digest, GC phase overlap, snapshot costs, tick intervals, active/noSync common configuration, separate optional final CPU profile,4×25 sample windows after 36 s warmup, and fresh source order RC16/fa6/allocation-only/allocation-only/fa6/RC16 for each mode. The isolated allocation source changed only `server/market-categories.mjs` and `server/universe-intel.mjs` from fa6, with unchanged compiled files.

One short sanity run passed before loss: fa6 active 10 samples, real tick, unchanged payload, zero network, source verified. Full 12-process crossover was started and last visible output was `STATE DIAGNOSTIC active rc16-1`. No completion, raw output or crossover result is retained. Do not mark it complete.

## Historical observations are not new redesign mandates

- Initial 059 extreme Session-route regression was fixed by 05d local+CI. Preserve that functional/performance gate if changing Session paths.
- Initial 059 idle-loop/HTTP-tail adverse observations remain historically valid; latest fa6 CI improves those metrics. Check final common backend instead of treating every earlier metric as an independent current bug.
- Slightly higher latest Session/state medians remain in final tables even when below repeated threshold. That threshold prioritises investigation, not suppression.
- Near-neutral heap and bounded recreate/mount samples do not demonstrate an unresolved leak; durable retention is a separate mechanism. Do not invent a general memory-saving claim.
- Single-pair one-stop route maxima, submillisecond small-map/route differences and necessary full-response serialization are retained bounded observations; conditional measurements determine further action.
- Mechanical browser cleanup/build-identity recovery applies to exact 05d only. New final source requires its own correctness/build/evidence gates. Original failed runs remain failed.

## Final prerequisite before clean handoff

Each gate needs completed implementation or measured, explicit disposition. Freeze exact final source/harness, run affected correctness/types/build and local+CI performance with original contracts, independently inspect all adverse metrics, and update canonical report without relabelling old timings. Only then prepare clean package, test extracted runtime/browser, and provide a successful review build under a draft PR. No main merge/final 8.0 without subsequent explicit user review approval.
