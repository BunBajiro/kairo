# v0.7.3 implementation and verification plan

Base: clean v0.7.2 (`b151125cd7b26611364923f00683b1c6f1c1bdd6`). The internal investigation is retained separately on `perf/benchmark-baseline`; its instrumentation is not part of this branch or package.

| Change | Approach | Behaviour to preserve |
|---|---|---|
| Snapshot/scheduler work | Separate protection inputs and scheduling metadata from full UI snapshots; reuse prepared store statements | Three-second cadence, immediate evidence changes, scope/owner checks, fail-closed deadlines and OBS ordering |
| Import analysis cache | Track relevant database dependencies transactionally, include character access and time boundaries, retain single-flight calculation | Prices, rankings, fees, buyer/seller identity, all watched orders, expiry, saved plans and quotes |
| Session reports | Reuse joined system metadata, prepare repeated queries once, index combat timestamps and merged windows by system | Presence before buffering, half-open intervals, quiet/repeated visits, deduplication, exclusive kill/loss values and output ordering |

Frontend state restructuring, market query consolidation and widget timer changes are deferred: the baseline evidence gives them lower priority and does not justify changing the interface in this pass.

Verification gates:

1. Existing behaviour tests, focused boundary/invalidation regressions, TypeScript and compiled UI checks pass.
2. Use the same external fixture/harness for baseline and candidate in disposable measurement checkouts. Run sequentially in both the workspace and one GitHub runner, with repeated backend observations and browser scenarios. Record both application and harness revisions.
3. Require consistent improvement in idle CPU/stalls, import analysis after unrelated writes and large-session latency; investigate material regressions in other operations. Compare data outputs as well as timings. Preserve the full response data rather than shrinking workloads.
4. After verification, set the application version to 0.7.3, build the production frontend, package the standalone runtime and test the extracted ZIP without development dependencies. Confirm that profiling tools, fixtures, traces and workflows are absent.
5. Hand over a draft review PR and the verified build. Keep `main` unchanged pending human review.
