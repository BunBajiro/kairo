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

## Implementation verification

The measured candidate is `d57cda3b44b34aa207407848eb14acab846b05cb`. The [retained comparison evidence](https://github.com/BunBajiro/kairo/tree/perf/benchmark-baseline/docs/v073-comparison) stays on the internal investigation branch. Both workspace repetitions and both GitHub repetitions pass the three conservative performance gates; all 150 behaviour tests and full response equivalence pass. A further 250 old/new combat-matching comparisons preserve boundary and deduplication behaviour.

In the larger workspace fixture, idle CPU drops from 14.66–15.27% to 1.26–1.40% of one logical core, session p50 drops from 181–189 ms to 110–112 ms, and imports after unrelated writes drop from 469–483 ms to below 1 ms. These are synthetic measurements, not a guarantee about physical fans, GPU work or every user workload. Small warm-cache validation adds about 0.05–0.10 ms in some repetitions.

Version identifiers and package exclusions are applied after the backend comparisons pass. The five optimised runtime modules are checked byte-for-byte against the measured candidate when verifying the extracted production ZIP. Profiling code is never copied into the implementation checkout.
