# Journey retirement: proposed ownership and data boundary

This design implements the agreed retirement of the standalone Journey visit log
and lifetime footprint/count statistics. It is not a completed implementation.
The dependency acceptance matrix is in
[the methodology review](../reviews/followup-methodology.md).

## Services that remain

| Capability | Owner and retained contract |
|---|---|
| Active session movement | A Sessions travel service records observations for the session eligible at observation time. Reports, combat attribution and replay share its bounded read contract. |
| Discovery | A small per-pilot system-membership service records known system IDs. No visit counts, first/last timestamps or lifetime trail is needed for discovery. |
| Activity and notifications | Pilot observations continue to publish location/ship semantic events for Overview, `/timeline` and OBS. These existing event features are independent of Journey's dedicated trail. |
| Old visit data | Retained legacy evidence continues to support old sessions, exports and the documented cold Journey compatibility API. It does not return to hot Universe or route projections. |

An ordinary in-process API is sufficient. There is no need for a general service
container, plugin protocol or separate process. Core connects observation events
to these owners and owns their lifecycle; screens do not own collection.

## Proposed storage approach to validate

Add a nullable `session_id` to the existing `visits` table. Existing rows remain
unchanged legacy evidence. Future timestamped movement rows carry their owning
session ID. The old Journey API can explicitly return retained legacy rows only,
so it neither joins separate sessions into a fictitious continuous journey nor
advertises future lifetime statistics. Existing IDs, hidden-pair references and
recorded sovereignty are retained.

The legacy-only filter must cover every Journey projection and both the target
and preceding-row queries used by its hide/unhide API. Reject new session-owned
visit IDs through that API. Otherwise displayed and mutated adjacency would
disagree when old/new rows interleave. Test equal timestamps and both pilot and
session ownership explicitly.

Seed a unique `(character_id, system_id)` discovery table from existing visits in
one transactional, idempotent migration. Fresh pilot observations maintain that
membership with insert-if-absent. It is bounded by discovered systems rather than
number of journeys. Exports include this membership, independently of visits.
Document the additive export schema version. No general history-export import
endpoint exists; validate reopened backup data rather than inventing a round trip.

Session reads select their own new rows plus legacy rows in the original time
window. Keep report's inclusive visit endpoint and route/replay's exclusive
endpoint intentional. A shared bounded read may serve both projections without
changing their public shapes. Legacy inferred starts may use legacy pre-session
evidence; modern captured starts never borrow observations from another session.

## Recording and race conditions

Capture the observation timestamp, eligible session, ship and sovereignty before
an asynchronous name lookup. Prefer recording known/fallback identity immediately
and keep optional display-name enrichment separate, if that preserves contracts.
An end or start while a lookup is pending must not transfer the observation to a
different session or move its historical timestamp.

The session's last recorded system, or its fresh captured start system, determines
whether movement is new. Comparing only with the collector's previous location
is insufficient: a session started with stale/no location must acquire its first
fresh baseline even if that system ID matches the cached pre-session sample.
Preserve a gap before this first observation. A fresh captured start should not
gain a duplicate initial visit. Reconstruct this baseline on restart from durable
session evidence, not an unbounded process cache.

Exercise pending lookup/start/end, two pilots, inactive sessions, stale starts,
fresh starts, restart, pilot/Universe module toggles, equal-time ordering, repeated
systems, historical sovereignty, legacy export and saved UI/bookmark migration.
The owned bus drain still matters for asynchronous activity/ship callbacks even
when travel recording becomes synchronous.

## Hot projections and UI

Remove Journey aggregates from Universe state, map display context and routing.
Replace discovery's `journey.systems` dependency with explicit discovered IDs.
Retire Journey preset/visit overlays and normalise saved preferences while
preserving unrelated settings. Old `#journey` navigation remains a safe alias;
Session stream binding IDs remain stable while their labels say Sessions.
Remove unmounted legacy Journey UI only after checking its exports and consumers.

The acceptance goal is less recurring work and clearer domain ownership, with
existing Sessions, notifications, routing and discovery still behaving correctly.
