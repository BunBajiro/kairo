# Candidate Sessions, Goals and asset containment review

Reviewed the uncommitted `kairo-rc17` candidate on 2026-10-02. This is a source and
correctness checkpoint, not a frozen-source performance result. No production
edits were needed during this verification. Two additional projection regression
tests were added after the initial Sessions/Goals review.

## Sessions and Journey retirement

The implementation separates active-session travel, discovered-system membership
and ordinary activity publication. It stops creating new lifetime Journey rows
outside active sessions. Retained legacy rows remain available to old sessions
and the cold Journey compatibility API.

- `captureSessionObservation` captures local response receipt time, eligible
  session, ship and sovereignty before Core awaits location metadata or names.
  Explicit session ownership also travels with location and ship activity events.
  Remote cache timestamps do not choose the session.
- Delayed observations retain their original session through end/start changes.
  A recorded first fresh position fills a missing session baseline even if it
  equals the collector's previous system. Modern sessions do not infer a start
  from another session's evidence; genuinely legacy sessions retain inference.
- Current Pilot eligibility still gates delivery after enrichment. Pausing Pilot
  suppresses pending activity, discovery and travel. Re-enabling and collecting a
  fresh same-system sample establishes the missing baseline without inventing a
  new transition. Receipt ownership intentionally does not freeze module access.
- Session reports and their route projection now share one bounded indexed visit
  read. The compatibility `visits` list includes the exact end timestamp; route,
  replay and combat presence keep the exclusive end. Pilot/session guards and
  stable `at,id` ordering remain enforced.
- The additive migration retains legacy IDs, notes, hidden-pair references,
  events and recorded sovereignty. Discovery seeding is transactional and
  idempotent. Cold Journey hide/unhide rejects new session-owned rows and uses
  legacy-only adjacency on both sides.

The real-Core regression tests cover metadata followed by names crossing
sessions A, B and C; delayed hull activity and report/replay end cursors; stale
transport samples; and module pause during enrichment. Existing replay, combat
presence, LP, collection cadence and migration tests remain green.

## Goals preparation and accounting

Each call now owns one input context. Snapshots, module/access/freshness decisions
and names are reused within that call; no decoded samples or eligibility survive
into the next call. Item totals, skill levels and combat times are prepared once
per relevant source, while goal-specific creation cutoffs and ledgers remain
independent. Goal lists join tracking rather than reading it once per goal.

Tests confirm 20 item goals share one source read and one 2,000-item quantity
pass; listing reads names once and performs no per-goal tracking query. Repeated
unchanged wallet income samples make zero ledger, goal or tracking writes.
Unavailable inputs preserve progress, and later calls observe setting changes.
Accounting failure rolls back all rows in the refresh before completion is
published. Savepoints compose with caller-owned SQL rollback, and publication
after the service's savepoint release permits reentrant goal creation without
duplicate completion. The application remains responsible for any enclosing
transaction's external side effects; this is not a general after-commit bus.

Type lookup can hand successful names to Core's existing name owner, avoiding an
independent stale names write. The legacy standalone fallback is retained.

## Independent asset helper review

`prepareAssetLocations` retains the previous collector's first-repeated-ID cycle
semantics, unresolved roots and last duplicate-ID parent lookup. The cached-root
return uses the original lookup location, including the empty-path cache-hit
case. Each containment edge is followed at most once; shared parents no longer
repeat full ancestry walks. The implementation is iterative and does not mutate
the input rows. Name resolution retains public-name lookup, station fallback,
structure scope and character identity, and denied-access fallback labels.

No blocker found in source review or the three focused asset tests, including a
10,000-item containment chain with a counted linear traversal bound.

## Stream projection review follow-up

The additional tests use explicit expected values rather than deriving expected
results from the standalone projection implementation. They verify two goal
sources with full/title/numbers variants, completion text and percentages,
cross-pilot rejection, one database read per source/pilot and fresh reads on the
next update. Training and industry checks use deliberately unsorted samples,
separate pilot sources, completed/invalid-status candidates, exact skill finish
and snapshot-expiry boundaries, elapsed-time changes, empty fresh samples,
updated names and replacement data. They also verify one snapshot read per
pilot/source and that choice preparation does not reorder stored samples.

All four tests in `stream-projections.test.mjs` passed after the two additions;
no production projection change was required.

## Verification

Node 24.19.0; **85 tests passed, 0 failed** across these nine files:

- `asset-locations.test.mjs`
- `goals-preparation.test.mjs`
- `participation-goals.test.mjs`
- `session-live.test.mjs`
- `session-replay-sovereignty.test.mjs`
- `session-replay.test.mjs`
- `session-summary.test.mjs`
- `session-travel.test.mjs`
- `sessions.test.mjs`

Command: `node --test --test-isolation=none --test-reporter=spec` followed by the
above paths under `tests/kairo/`. The initial restricted test attempt could not
listen on loopback (`EPERM`, port 18430); the same tests passed when local HTTP
listening was permitted. No assertion or production code was changed for that
environment restriction. Runtime was approximately 1.10 seconds; this duration
is diagnostic only and is not a benchmark comparison.

Final full-build, frozen-source performance and GitHub packaging gates remain
the responsibility of the combined RC17 checkpoint.
