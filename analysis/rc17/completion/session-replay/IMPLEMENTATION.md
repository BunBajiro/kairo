# Session eligibility and replay completion trial

7 October 2026. This is a source trial over internal RC17 `a27d36c`, not clean-RC17 acceptance. Source is not yet frozen; recorded hashes identify the files used by each diagnostic. PR #10 remains withdrawn. The parent checkpoint owns final manifest/build/CI attribution.

## S3: historical Session enumeration

`server/session-combat.mjs:syncRecent` now executes `SESSION_COMBAT_RECENT_SQL`: separate open/recent-ended ranges joined with `UNION ALL`, then the same open-first/start-descending order. `server/store.mjs` adds the narrow `(character_id,ended)` index in the additive `session-combat-eligibility-v080` migration. No retained Session is removed, no newest-eight cap is introduced, no scheduler/force/deadline/provider logic is changed, and no target/route cache is added.

The old SQL leaves equal-start ties unspecified. Its pre-migration `(character_id,started DESC)` plan returns those ties in rowid order. The new query makes that tie explicit, preserving the observed old ordering even when the added index would change the old SQL's accidental plan/tie ordering. The regression's old-query oracle freezes that original index path; it does not compare against the old SQL after allowing the new index to alter its tie order.

`eligibility-diagnostics.json` contains the full populated, analysed plans for 100/1,000/10,000 archives per pilot × one/four pilots. Over 41 simulated ticks at the three-second cadence, the old/new IDs and order match exactly. Exact 24-hour exclusion, a near-cutoff Session expiring during the interval, equal starts and a long open Session are present. Before: `SEARCH ... (character_id=?)`. Candidate: two searches bounded by `character_id` plus `ended=?` / `ended>?`. Both still sort the eligible result. Internal SQLite rows examined were not measured.

The index adds 335,872 bytes for 10,005 Session rows and 1,376,256 bytes for 40,020 rows in the deliberately minimal Session-only database (~24%, not a whole-app percentage). This is a real cost; adoption remains contingent on the ordinary runtime and write/upgrade trial below.

`eligibility-actual-source-counts.json` exercises the real collector with 10,000 archived Sessions per pilot, four pilots, 1,000 visits per long active Session, recent Sessions and exact/near-cutoff rows. Over the simulated full two minutes it records 41 ticks, 164 eligibility queries, 572 eligible IDs/Session reads, 28 route reads returning 16,024 rows, 68 empty history-provider responses and three live-provider responses. Live cursor remains 100 after the pointer and two 404s. Diagnostics count returned rows, not internal rows visited. They establish remaining due-route work rather than justify an invalidation-sensitive route cache. Every ordinary lane must retain this shape/control comparison.

**Prepared, not run:** `eligibility-workload.mjs` defaults to a real two-minute, three-second cadence, recording actual deadlines, CPU, event-loop delay and memory. Diagnostic mode (`KAIRO_SESSION_DIAGNOSTIC=1`) uses a fake clock and SQL wrappers; these modes must not be mixed in elapsed comparisons. Run each of the six archive/pilot cases against fixed baseline and candidate sources under the shared timing lock. `index-write-trial.mjs` prepares matched fresh databases and separately measures index creation, 500 inserts per pilot and 500 end updates per pilot, plus file size and durable row digests. Use baseline/candidate/candidate/baseline order. Retain/reject the index only after those costs and ordinary tick savings are documented. No measurements in this document establish a host latency improvement.

## R1: replay tick preparation

`components/kairo/session-replay-timeline.mjs` prepares one replay-local immutable snapshot: numeric visit/event/travel/gap times, stable event sorting, unique-system first-visit boundaries and timeline ticks. Binary boundary lookup selects events, next/previous transitions and trail prefixes. A compact max-end interval tree retains the original last-matching-visit rule even for overlapping/equal-time legacy rows. Recent events allocate at most five elements. Travel and trail arrays are reused until their prefix changes, and backward seeks rebuild only the necessary prefix. Unordered travel input retains original order; malformed overlap in gap rows falls back to a prepared numeric scan. The helper does not retain prefixes for every time position or a global/pilot cache.

`session-replay.tsx` consumes that preparation without changing playback cadence, hidden-tab/pause behavior, speed, request/pilot fencing, captured sovereignty, coordinate handling, event-cap coverage, or the fixed-live-snapshot contract. Backend `server/session-replay.mjs` is unchanged. `sessionReplaySpace` remains a visit-change effect, not a per-tick traversal. Atlas scene/drawing costs remain separate from timeline work.

The deterministic `replay-counts.json` compares outputs to the previous direct scans at 1,201 simulated 100-ms ticks at 60× plus end/backward/midpoint/start seeks:

| Visits / distinct systems / events | Previous row timestamp reads | Indexed reads | Previous travel Date.parse calls | Indexed travel Date.parse calls |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 11 / 200 | 4,030,151 | 42,853 | 1,203,795 | 0 |
| 1,000 / 1,000 / 10,000 | 27,649,327 | 56,287 | 1,203,795 | 0 |
| 4,000 / 4,000 / 10,000 | 38,488,927 | 61,121 | 4,818,795 | 0 |

Getter counts are actual row timestamp property reads during selection; assertion comparison is excluded. They do not count private numeric index accesses, retained bytes or elapsed work. They do establish output equivalence and eliminated repeated parsing/scanning for these inputs.

**Prepared, syntax-checked, not run:** `compiled-replay-trial.mjs`, derived from the accepted existing browser harness, runs `KAIRO_REPLAY_CASE=repeat-small`, `repeat-cap` or `distinct-cap`. All use 1,000 visits; the small case uses 200 events, both cap cases use 10,000 events, and the distinct case uses 1,000 real known-system coordinates. The distinct route does not claim confirmed gate transitions. It retains source/asset/harness hashes, ordered-route/coverage verification, start and midpoint playback, pause, backward key seeks, exact/natural end, pilot fencing, unmount requests and retained ownership checks. It separates script/layout/style/task timings and draw counts. Run each case against exact compiled baseline/candidate builds in matched ABBA order under the shared timing lock. Browser runs and preparation/retained-memory comparison are required before R1 closure; this helper's operation counts alone do not certify rendering speed or total retained-memory improvement.

## Validation and remaining acceptance

`targeted-tests.log`: **33 tests passed**, zero failures, covering the two new test files plus existing live-feed and backend replay tests. New coverage includes 20,028 retained Session rows, migration reopen, indexed range plans, all recent IDs, immediate end visibility, old-order equivalence, arbitrary replay seeks, zero-length/equal-time/overlapping visits, gaps, ordered events/travel, missing coordinates, captured sovereignty, immutable snapshots and a 10,000-event/1,000-system oracle. Existing tests retain force/deadline/pending, disabled/reauth, 24-hour in-flight cutoff, ESI verification, live snapshots and event-cap behavior.

Final type checks, integrated tests, exact builds and compiled runs belong to the frozen combined source. Neither S3 nor R1 is marked closed until the listed measured decisions pass. F2/F6 archive response ordering/presentation remain owned by the frontend work; G2 event membership is preserved and not double-counted as new work.
