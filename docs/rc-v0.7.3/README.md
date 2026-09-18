# Kairo 0.7.3-rc.1 verification

**Decision: retain both the original optimisation/refactoring work and the database follow-up in RC1.** All ten required performance checks pass in each environment. Full application-output comparisons against both earlier builds, aged-history outputs and history-write outputs agree. The RC passes all 155 behaviour tests, type checking, frontend compilation, Chrome session-card checks and standalone package validation.

The RC is commit `5a58faff44e6292705550ea5e3994d341b748455` on [draft PR #5](https://github.com/BunBajiro/kairo/pull/5). It has not been merged into `main` or published as a release. The [method and workload definitions](METHOD.md) identify all three pinned builds and the external harness.

## Performance results

Ranges below are the two run medians, except idle CPU, which is measured over each 35-second observation. Lower is better. CPU is a percentage of one logical core. Timings from different environments are not compared with each other.

### Workspace

| Measurement | 0.7.2 | Pre-DB 0.7.3 | 0.7.3-rc.1 |
|---|---:|---:|---:|
| Large-workload idle CPU (%) | 15.07–15.62 | 1.29–1.57 | 1.45–1.57 |
| Typical session report (ms) | 24.83–25.46 | 18.06–20.35 | 15.44–16.33 |
| Large session report (ms) | 187.00–193.77 | 109.05–111.74 | 93.48–94.43 |
| Imports after unrelated write (ms) | 453.69–470.53 | 0.68–0.70 | 0.67–0.77 |
| Cold imports with an aged cache (ms) | 2258.38–2432.64 | 2210.40–2568.46 | 463.13–485.39 |
| Working history JSON (MiB) | 189.71 | 189.71 | 15.60 |
| 1,000 history updates (ms) | 60.78–96.99 | 130.32–130.90 | 35.74–39.73 |
| 5,000 committed event inserts (ms) | 15.84–17.04 | 16.36–17.07 | 18.17–19.92 |

Compared with 0.7.2, RC1 reduces large-workload idle CPU by **90.2%** and session-report time by **50.7%**. Compared with pre-database 0.7.3, session-report time falls **14.9%**, aged-cache cold analysis falls **80.2%**, and the 1,000-type history write probe falls **71.1%**. Percentages compare the mean of the two run medians (or the two idle observations).

[All metrics, raw samples and gates](workspace/comparison.json) · [Revision provenance](workspace/provenance.json)

### GitHub Actions

| Measurement | 0.7.2 | Pre-DB 0.7.3 | 0.7.3-rc.1 |
|---|---:|---:|---:|
| Large-workload idle CPU (%) | 14.38–14.40 | 1.25–1.26 | 1.23–1.24 |
| Typical session report (ms) | 24.17–24.41 | 18.19–18.39 | 15.00–15.51 |
| Large session report (ms) | 174.26–188.70 | 107.56–109.05 | 87.30–87.54 |
| Imports after unrelated write (ms) | 447.90–450.85 | 1.06–1.14 | 1.07–1.09 |
| Cold imports with an aged cache (ms) | 1869.80–1912.49 | 1852.51–1896.25 | 493.97–532.06 |
| Working history JSON (MiB) | 189.71 | 189.71 | 15.60 |
| 1,000 history updates (ms) | 51.56–87.80 | 61.75–68.56 | 32.47–32.95 |
| 5,000 committed event inserts (ms) | 19.76–89.50 | 19.99–24.44 | 23.82–63.59 |

Compared with 0.7.2, RC1 reduces large-workload idle CPU by **91.4%** and session-report time by **51.8%**. Compared with pre-database 0.7.3, session-report time falls **19.3%**, aged-cache cold analysis falls **72.6%**, and the 1,000-type history write probe falls **49.8%**. Percentages compare the mean of the two run medians (or the two idle observations).

[All metrics, raw samples and gates](github/comparison.json) · [Revision provenance](github/provenance.json)

## Costs and regression review

The character/type/time index is used by the actual selective session query. The previous character/time index remains available for general activity reads. The additional index improves reports on both fixture sizes; its cost is visible in the bulk insertion results above.

| Cost | Workspace RC | GitHub RC |
|---|---:|---:|
| Additional event index (MiB) | 2.29 | 2.29 |
| First open of the aged database (ms) | 904.13–1048.25 | 1280.16–1573.82 |
| Maximum 100-type synchronous history-write block (ms) | 4.14–14.87 | 2.24–2.28 |

The index adds 2.29 MiB and increases local bulk insertion time by about 1–4 ms per 5,000 events. GitHub's second RC repetition was slower: 63.59 ms versus 19.99 ms pre-DB. The 0.7.2 reference also varied sharply there (19.76–89.50 ms). The contribution of storage/checkpoint variability has not been isolated, so these observations do not establish a fixed per-event penalty or an insertion-speed improvement. The event-write probe deliberately inserts 5,000 events in a transaction; it does not represent normal single-event latency. We retain the index for its repeatable session-read benefit, with this write trade-off visible.

History and source writes now commit together in batches of at most 100 types during archive projection, yielding between batches. Median write throughput improves, while individual synchronous block peaks are not uniformly lower in the workspace. The write probe measures that storage component, not complete network archive refresh time.

The initial compaction is a one-time startup cost. Subsequent opens use the migration marker. The 91.8% reduction is in the working history JSON (189.7 MiB to 15.6 MiB for this fixture), not a promise that the SQLite file shrinks immediately: freed pages can be reused without running a blocking vacuum. Daily archive history stays separate and is retained.

No other backend p50 metric increased by both more than 10% and more than 1 ms in both repetitions versus pre-database 0.7.3. Individual advisory measurements still vary; this is not a claim that every operation became faster.

## Behaviour and data compatibility

- All nine complete application projections match both earlier builds for both workload sizes. Each comparison also includes 250 deterministic combat-matching cases. Aged-history analysis and written history/source data have matching complete-output hashes across all six runs in each environment.
- 155 behaviour tests pass, including the five new database regressions. They cover calendar boundaries, missing/duplicate days, source fields/order, nested-transaction rollback, one-time/idempotent compaction, migration failure/retry and archive interruption/resume across the batch boundary.
- No reset is required from 0.7.2 or pre-database 0.7.3. Characters, settings, notes, sessions and the daily archive are preserved. Compaction uses each saved cache row’s own period so an offline/stale cache retains consistent summary and freshness values. Alpha data preservation is desirable, not a compatibility promise for every future iteration.
- The UI behaviour, protection cadence and existing optimisation logic remain in place. Tests ship as ordinary regression source and do not run during normal startup. The RC contains no performance harness, synthetic performance fixture, traces, CI workflows, live database or development dependencies.

## Download and build provenance

[Successful RC build and checks](https://github.com/BunBajiro/kairo/actions/runs/35339984207) · [Download the tested GitHub ZIP](https://github.com/BunBajiro/kairo/actions/runs/35339984207/artifacts/10545210103) · [Successful three-build performance comparison](https://github.com/BunBajiro/kairo/actions/runs/35340471146)

The delivered `Kairo-v0.7.3-rc.1.zip` is byte-for-byte the GitHub test-build artifact, renamed for clarity. It contains 211 files, is 1,061,116 bytes, and has SHA-256 `bf2d3dc9552e2d956276ef0376dacc855b5e5f9a34414b793ab0c321c35dd6e4`. All 193 included tracked source files match the measured RC commit. The standalone smoke check serves the compiled JS/CSS, authenticates dashboard state, verifies the version and stream service, rejects private API access on the stream port, and makes no external requests. See [package verification](package-verification.json) and [smoke result](package-smoke.json).

## Scope for the next checkpoint

Keep SQLite and the current player-data model. Splitting snapshot metadata into separate persistent columns/tables remains deferred until an end-to-end scheduler measurement justifies the added synchronisation and migration complexity. Fresh cold analysis of 5,000 types remains a visible cost; if future features make that frequent, measure its query/materialisation and calculation phases before choosing the next change. Long-term daily-archive retention is a separate product/storage policy; this RC does not delete historical archive data.

These are repeatable synthetic CPU and latency measurements on the workspace and one GitHub runner. They do not measure Windows desktop/GPU behaviour, EVE/OBS interaction, physical fan speed or a real player database. The RC is ready for the user’s in-app review before any merge or release.
