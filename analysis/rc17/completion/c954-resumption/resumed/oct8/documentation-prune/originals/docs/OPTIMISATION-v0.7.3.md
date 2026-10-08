# v0.7.3 implementation and verification plan

Base: clean v0.7.2 (`b151125cd7b26611364923f00683b1c6f1c1bdd6`). The internal investigation is retained separately on `perf/benchmark-baseline`; its instrumentation is not part of this branch or package.

| Change | Approach | Behaviour to preserve |
|---|---|---|
| Snapshot/scheduler work | Separate protection inputs and scheduling metadata from full UI snapshots; reuse prepared store statements | Three-second cadence, immediate evidence changes, scope/owner checks, fail-closed deadlines and OBS ordering |
| Import analysis cache | Track relevant database dependencies transactionally, include character access and time boundaries, retain single-flight calculation | Prices, rankings, fees, buyer/seller identity, all watched orders, expiry, saved plans and quotes |
| History storage | Keep daily archives separate from a bounded 30-day analysis projection; compact saved caches once; prepare history writes and commit each 100-type archive batch atomically | Existing window calculations, missing/duplicate-day rules, freshness, row ordering, source labels and interruption/retry behaviour |
| Session event queries | Add `(character_id,type,at)` alongside the existing general event index | Full event/ship/wallet results, tie ordering and ordinary event writes |
| Session reports | Reuse joined system metadata, prepare repeated queries once, index combat timestamps and merged windows by system | Presence before buffering, half-open intervals, quiet/repeated visits, deduplication, exclusive kill/loss values and output ordering |

Frontend state restructuring, market query consolidation and widget timer changes are deferred: the baseline evidence gives them lower priority and does not justify changing the interface in this pass.

Verification gates:

1. Existing behaviour tests, focused boundary/invalidation regressions, TypeScript and compiled UI checks pass.
2. Use the same external fixture/harness for baseline and candidate in disposable measurement checkouts. Run sequentially in both the workspace and one GitHub runner, with repeated backend observations and browser scenarios. Record both application and harness revisions.
3. Require consistent improvement in idle CPU/stalls, import analysis after unrelated writes and large-session latency; investigate material regressions in other operations. Compare data outputs as well as timings. Preserve the full response data rather than shrinking workloads.
4. After verification, set the application version to 0.7.3-rc.1, build the production frontend, package the standalone runtime and test the extracted ZIP without development dependencies. Confirm that profiling tools, fixtures, traces and workflows are absent.
5. Hand over a draft review PR and the verified build. Merge only after the user approves following in-app review.

## Implementation verification

The measured candidate is `d57cda3b44b34aa207407848eb14acab846b05cb`. The [retained comparison evidence](https://github.com/BunBajiro/kairo/tree/perf/benchmark-baseline/docs/v073-comparison) stays on the internal investigation branch. Both workspace repetitions and both GitHub repetitions pass the three conservative performance gates; all 150 behaviour tests and full response equivalence pass. A further 250 old/new combat-matching comparisons preserve boundary and deduplication behaviour.

In the larger workspace fixture, idle CPU drops from 14.66–15.27% to 1.26–1.40% of one logical core, session p50 drops from 181–189 ms to 110–112 ms, and imports after unrelated writes drop from 469–483 ms to below 1 ms. These are synthetic measurements, not a guarantee about physical fans, GPU work or every user workload. Small warm-cache validation adds about 0.05–0.10 ms in some repetitions.

Version identifiers and package exclusions are applied after the backend comparisons pass. The five optimised runtime modules are checked byte-for-byte against the measured candidate when verifying the extracted production ZIP. Profiling code is never copied into the implementation checkout.

## Database follow-up and RC verification

The RC combines all of the original optimisations above with the approved database changes. SQLite and the existing player-data model remain in place. Splitting snapshot metadata into a new persistent schema is deferred until an end-to-end measurement justifies its extra synchronisation complexity.

Five additional regression tests cover bounded/sparse/duplicate history, paired history/source rollback inside an outer transaction, non-destructive/idempotent startup compaction, atomic migration failure/retry, and archive interruption/resume across the 100-type batch boundary. All 155 behaviour tests pass locally. Normal application startup does not run these tests.

The external RC verification compares three pinned builds: clean 0.7.2 (`b151125`), pre-database 0.7.3 (`ff8bbc5`), and this RC. Repeated sequential backend runs and aged-history/write-cost probes run both in the workspace and on GitHub. Full results and provenance are retained on the internal [database investigation branch](https://github.com/BunBajiro/kairo/tree/perf/database-review-v0.7.3/docs/rc-v0.7.3); its harness and raw measurements are excluded from the RC.

## Approved stable release

The user tested 0.7.3-rc.1 (`5a58faff44e6292705550ea5e3994d341b748455`), confirmed it runs well, and approved merging it into `main` on 2026-09-18. Stable 0.7.3 changes only version labels and release documentation relative to that reviewed RC; application logic, dependency versions, regression tests and database migrations remain identical.

Both repetitions in both the workspace and GitHub pass all ten required three-build performance gates per environment. The [full RC report](https://github.com/BunBajiro/kairo/tree/perf/database-review-v0.7.3/docs/rc-v0.7.3) retains raw results, full-output comparisons, index/write costs and package provenance. Only the implementation PR is merged; the investigation branches remain separate.
