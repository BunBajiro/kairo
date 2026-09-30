# Refactoring responsibilities and acceptance boundaries

This is a working design for the optimisation/refactoring pass, not a claim that
the production changes have been implemented. The follow-up measurements refine
these boundaries. Preserve domain ownership; extract shared work where callers
actually share a contract.

**Scope: all of Kairo, including inherited systems.** RC16 is the candidate
baseline and v0.7.3 is a historical comparison, not a limit on which code may be
improved. Review older collectors, persistence, projections, Sessions, stream
transport, authentication and frontend ownership on the same criteria as Maps.
Rank measured costs and concrete structural findings separately; justify any
retained design as well as changes. The pass is not a mandate to rewrite every
subsystem or introduce a general service framework.

| Current responsibility overlap | Proposed boundary | Evidence / acceptance |
|---|---|---|
| Each map rereads the pilot's link collection, resolves signatures and reconciles expiry. | One request-owned map read context, with links/signatures grouped by map and a single reconciliation boundary. Individual-map reads request their own scope. | Exact map/node/link/signature output, ownership, expiry and revision equivalence; unrelated-map scaling and dense-signature diagnostics. |
| Map chooser and selected-map surface share complete workspace payloads. | Explicit map-summary collection and selected-map detail contracts. | Inactive maps add minimal selected-map work; opening/switching/deleting/importing/discovery maps remains correct. |
| Parent Universe and Maps own overlapping event/poll reloads. | Scoped refresh coordination with one in-flight load and retained invalidation while mutations run. | Burst coalescing, newest revision/pilot wins, missed-event recovery, expiry and conflict handling; do not merely ignore stale replies after generating all requests. |
| Camera animation regenerates the entire map scene through React state. | Scene owns content and selection; camera owns transforms/animation, with explicit handoff at meaningful state changes. | Pointer/keyboard/focus/drag/undo/save/reduced-motion/detached-window behaviour; unchanged scene does not regenerate each camera frame. |
| Route planning constructs display context and rebuilds it for each itinerary leg. | Route-specific prepared inputs reused for one planning request, with freshness and connection validation at acceptance. | Same routes, warnings, costs, constraints and ordered stops; no unrelated lifetime-history scan. |
| Lifetime footprint summaries share a payload with travel history and discovery consumers. | Retire the standalone Journey log and lifetime-statistics UI/computation. Give Sessions ownership of future timestamped movement; expose minimal discovery membership separately. | Existing session timelines, combat windows, replay, recorded sovereignty, discovered wormholes and exports remain correct. General activity/notification events retain their existing behaviour. Legacy Journey data remains available through an explicit cold compatibility boundary. |
| Async semantic callbacks outlive the listener/storage lifecycle. | Owned task tracking, quiesce/drain order and bounded shutdown, with explicit error handling. | Real managed restart with deferred work, nested events, accepted writes and reconnect continuity; no writes after storage closure. |
| Session target preparation occurs before its feed is due. | Cadence/eligibility owns whether target materialisation is needed. | Immediate explicit/end checks, two-minute live cadence, aged-session cutoff and unchanged combat attribution. |
| Stream bindings and per-client transport rebuild equivalent projections. | One projection per shared source/update, unchanged-content suppression and one encoding per eligible client group. | Connected dashboard/OBS responsiveness and identical sanitisation, countdown/freshness, protection ordering and reconnect state. |

## Limits on consolidation

Keep SQLite, the shared ESI limiter, bounded history projection, updater worker,
integrity checks and domain-specific policy. A common transport helper must not
make commands inherit read retries or read caches. A common projection helper
must not collapse pilot/map scopes or silently treat stale intel as current.

Avoid a blanket repository abstraction, general persistent cache layer, or file
splitting whose only benefit is a lower line count. Prefer request-local reuse
before long-lived caches. Persistent derived state requires explicit ownership,
rebuild and invalidation rules, justified by remaining measured cost.

## Incremental verification

Implement in a clean RC16 branch, keeping each behavioural boundary reviewable.
Measure before/after with external harnesses and preserve decoded-result checks.
Record both the resource reduction and the responsibility made simpler. Retest
the integrated workload after combining changes. The final extracted RC17 build
must exclude all checkpoint harnesses, profiles and synthetic fixtures.
