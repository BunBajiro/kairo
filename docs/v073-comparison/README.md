# v0.7.3 comparison evidence

Status: workspace verification complete; independent [GitHub comparison run](https://github.com/BunBajiro/kairo/actions/runs/35333693369) in progress. Production packaging follows successful verification.

- Baseline: clean v0.7.2, `b151125cd7b26611364923f00683b1c6f1c1bdd6`.
- Candidate application: `d57cda3b44b34aa207407848eb14acab846b05cb`, tree `da34fbdff28b4a90202e8afff7efeb0322f768f2`.
- External comparison harness: `138a91f6c5d31bc133ca0b6b93bf9f0ee7cadf83`. Timing and fixture logic are unchanged from the retained baseline harness.
- Implementation and eventual packaging branch: `feature/optimisation-refactor-v0.7.3`, based directly on v0.7.2. This investigation branch remains separate and unmerged.

Both versions run sequentially on the same worker in baseline/candidate/candidate/baseline order. Each repetition includes the same smaller/larger fixtures, 35-second idle windows, three warmups and ten timed samples per operation. Raw JSON retains environment details, samples, payload sizes and completeness. Dirty flags reflect only the untracked external harness in disposable checkouts; tracked application files are clean.

## Workspace result

| Larger synthetic fixture | v0.7.2 | Candidate | Reduction in each paired run |
|---|---:|---:|---:|
| Idle CPU, % of one core | 14.66–15.27 | 1.26–1.40 | 90.8–91.4% |
| Session report, p50 ms | 181.40–189.19 | 109.80–112.04 | 38.2–42.0% |
| Imports after unrelated write, p50 ms | 469.21–483.32 | 0.68–0.70 | >99.8% |

All six targeted gates passed. Gates require a reduction of at least 50% in large-fixture idle CPU, 90% in unrelated-write import recalculation, and 20% in large-session p50 in each repetition. Other metrics are reviewed rather than assigned uncalibrated timing gates. Small warm-cache calls can add roughly 0.05–0.10 ms for dependency validation; they remain below 1 ms here. State/journey/market results show no material consistent regression. Full response sizes are unchanged.

All 150 candidate behaviour tests and seven harness tests pass. Full decoded output equality passed for nine projections at both fixture sizes: protection, snapshots, names, journey, session, market browse, market report, imports, and imports after an unrelated write. A further 250 deterministic old/new combat-matching comparisons cover repeated and quiet visits, time boundaries, overlaps, duplicate killmail IDs, future records and unknown values.

The isolated snapshot probe shows seven full snapshot reads per protection evaluation, down from 37, and no asset or journal reads. One explicit scheduling wave reads 262 full snapshots (53,036 JSON-equivalent bytes), down from 1,472 (124.51 MiB). Scheduling now uses a separate metadata query; this probe does not count those SQL reads, and JSON-equivalent bytes are not physical disk traffic.

Raw evidence: [workspace](workspace/). The standalone `comparison.json` includes every compared metric; `equivalence.json` records both revisions and the checked projections. See the original [methodology](../PERFORMANCE.md) for fixture definitions and metric limits.

## Scope and production boundary

The implementation retains the three-second scheduler, immediate protection reactions, existing UI, full response data and session/live-feed cadence. It refactors data access and matching, and gives the import cache explicit dependency and expiry handling. Regressions cover transaction rollback, a subsequent write after rollback, other database connections, access changes, concurrent book updates and expiry before the cache's 30-second maximum lifetime.

The candidate has no profiling hooks, performance workflow, synthetic fixture or captured trace. The external harness is copied only into disposable measurement checkouts. No investigation commit is merged into the implementation branch. The final build will additionally be checked against the measured runtime source files and tested after extraction without development dependencies.

These results establish repeatable improvements for the tested workloads. They do not measure Windows-specific timing, Firefox, GPU/compositor work, actual OBS/Streamlabs, live internet collection, long-term retention or physical fans. Browser main-thread metrics must not be described as total browser CPU. Preserve these limits in any release claim.
