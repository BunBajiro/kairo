# Historical performance checkpoint recovered

Recovered on 2026-09-30. This is evidence and measurement setup only; no optimisation implementation or release is included.

## Exact source and evidence

| Role | Pinned GitHub commit | Local evidence |
|---|---|---|
| Original optimisation investigation | `14a53a8f002c956a5da88e216f63b9d51cba018f` (`perf/benchmark-baseline`) | `historical/docs/v073-comparison/` |
| Final database/RC investigation | `b75ce9452d161a2bf91b66d7c64f33bbc8292224` (`perf/database-review-v0.7.3`) | `historical/docs/rc-v0.7.3/`, `historical/tests/performance/` |
| Final measured/reviewed v0.7.3 RC | `5a58faff44e6292705550ea5e3994d341b748455` | Referenced by retained historical provenance |
| Released v0.7.3 source | `239794774320fcdebaa1d76ce8a77c5c25cfc48c` | `/workspace/scratch/a2f3334402fc/kairo-v073` |
| RC16 measured source | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | Current analysis checkout; production files checked against `rc16-source-manifest.json` |

The stable source was reconstructed from exact local Git blobs where available and GitHub blob responses otherwise. All 195 tracked files match their GitHub blob SHA-1 identifiers. This is a verified source tree, not a claim that the local synthetic Git history is GitHub history. The application can be benchmarked without inventing local commit provenance.

The final historical checkpoint recovery contains 69 evidence/harness files, all byte-for-byte checked against their source blob hashes. The earlier optimisation recovery adds 23 files, including both raw browser reports. The original pre-database store is retained as `historical/server/store.mjs` (Git blob `cd0cbc36257f1291fb0f9f4848e1ebb8b797c96a`) to seed identical legacy databases for the aged-history probe. Manifests record origins and hashes. The recovered reports remain untouched, including their historical statements about PR/release state at the time of measurement.

## The correct prior performance anchor

Use the final **database-inclusive v0.7.3 RC** as the prior backend anchor. The earlier optimisation report predates the additional database changes and reports a slower session projection. Stable promotion changed version labels/documentation; it retained the reviewed RC's application logic.

The final report compared clean 0.7.2 (`b151125cd7b26611364923f00683b1c6f1c1bdd6`), pre-database 0.7.3 (`ff8bbc530ce278a883f8b1831407095a14d3277d`), and final RC1. Original measured harness revision was `1a1866bd0cf5f54cf522374277d6930f1baf105a`; the recovered later investigation commit contains the retained results and harness.

### Prior final backend results

Ranges are the two run medians, except idle CPU, which is each 35-second observation. CPU is percent of one logical core. These are historical observations, not budgets for today's hardware.

| Metric | Prior workspace v0.7.3 RC | Prior GitHub v0.7.3 RC |
|---|---:|---:|
| Large-workload idle CPU | 1.45–1.57% | 1.23–1.24% |
| Typical session report | 15.44–16.33 ms | 15.00–15.51 ms |
| Large session report | 93.48–94.43 ms | 87.30–87.54 ms |
| Imports after unrelated write | 0.67–0.77 ms | 1.07–1.09 ms |
| Cold imports, aged history | 463.13–485.39 ms | 493.97–532.06 ms |
| Working history JSON | 15.60 MiB | 15.60 MiB |
| 1,000 history updates | 35.74–39.73 ms | 32.47–32.95 ms |
| 5,000 committed event inserts | 18.17–19.92 ms | 23.82–63.59 ms |
| First open of aged database | 904.13–1048.25 ms | 1280.16–1573.82 ms |
| Maximum 100-type synchronous history-write block | 4.14–14.87 ms | 2.24–2.28 ms |
| Additional selective event index | 2.29 MiB | 2.29 MiB |

Sources: `historical/docs/rc-v0.7.3/README.md`, `METHOD.md`, and all `workspace/*` / `github/*` JSON reports. Both environments passed their ten required gates. Full response equivalence passed against each prior build, as did 250 deterministic combat-matching comparisons per baseline and 155 behaviour tests.

The prior work specifically addressed repeated snapshot JSON decoding, overly broad import-cache invalidation, repeated combat scans in session reports, a selective event index, and a bounded 30-day history working projection with batched archive writes. It deliberately retained SQLite and deferred broad schema splitting, frontend state restructuring, market-query consolidation, and widget timer changes pending stronger evidence.

### Prior browser observations

The database follow-up did not repeat browser performance measurement because its frontend application logic was unchanged. The applicable browser evidence comes from the earlier optimisation study. GitHub used Chrome 152.0.7977.82, a visible 1600×1050 viewport, a large fixture, two seconds settling and one 35-second observation per scenario/version, with ESI scheduling disabled.

| Scenario | Candidate renderer busy | Candidate server CPU | Requests per 35 seconds | DOM nodes |
|---|---:|---:|---:|---:|
| Overview | 0.82% | 0.81% | 6 | 467 |
| Assets | 0.33% | 0.49% | 1 | 505 |
| Markets | 0.52% | 0.63% | 10 | 636 |
| Archived session | 0.55% | 0.51% | 3 | 1,138 |
| Empty stream | 0.05% | 0.39% | 0 | 11 |
| Ten stream widgets | 0.33% | 0.45% | 0 | 71 |

Both versions had matching request/DOM counts and no long tasks during those idle windows. Small renderer changes were mixed, so that report did **not** claim a frontend speed-up. These cases predate Universe maps, Atlas, J-Space and SDE update UI, so they cannot establish performance of those new workflows.

## Recovered method and limits

- Backend: three warmups, ten measured samples, full JSON serialization, separate-process authenticated loopback HTTP, 35-second idle windows with the real scheduler, and a new child process per profile. Original final order was baseline → pre-DB → RC → RC → pre-DB → baseline.
- Typical fixture: 1 character, 2,000 assets, 10,000 events, 300 visits, 600 combat records in each combat table, 50 sessions and 1,000 market types per hub.
- Stress fixture: 4 characters with 20,000 assets each, 50,000 events, 2,000 visits, 4,000 combat records in each combat table, 200 sessions and 5,000 market types per hub.
- Database: identical legacy fixture, 365 history days across 5,000 types, actual startup compaction, one warmup plus three cold import observations, five measured 5,000-row committed event transactions, and three measured 1,000-type history writes yielding every 100 types. Full output hashes are retained.
- Historical runtime: Node 24.19.0 for workspace and performance CI. Timing comparisons across machines were explicitly excluded. Short windows, synthetic fixtures, ten samples, and one browser observation per scenario do not establish rare-tail latency, Windows performance, memory leaks, physical fan speed, power draw, GPU/compositor cost, OBS interaction or live-network behavior.
- The 91.8% history reduction refers to working JSON bytes. It did not claim immediate SQLite file shrinkage or remove daily archive history. Event-index storage and variable write costs remained visible trade-offs.

## Current remeasurement setup

The adapted runner lives in `harness/legacy/`; the recovered harness stays unchanged in `historical/tests/performance/`. All runtime imports resolve explicitly against a supplied source root. The runner verifies 195 stable source files and RC16 application blobs before measuring. RC16's investigation-only `AGENTS.md` and `.github/workflows/test-build.yml` guard edits are the only permitted source exemptions and are recorded in provenance.

The current order is stable v0.7.3 → RC16 → RC16 → stable v0.7.3 on one machine, sequentially. Original workload sizes, 3 warmups, 10 samples, serialization and 35-second idle windows remain. The taxonomy JSON is byte-identical between stable and RC16.

The comparison is labelled **controlled legacy warm-cache**:

- The real 3-second core scheduler remains enabled, including RC16 Universe ticks and relationship refresh work.
- Existing ESI snapshots are fresh for seven days, as in the old fixture. Five new empty public-feed caches (`thera`, `turnur`, `storms`, `wormhole_types`, `combat`) have ready status, current `updated_at`, and `expires_at` / `next_at` seven days ahead. These avoid measuring unrelated internet responses and failure retries.
- RC16 dataset service initialises normally, but its automatic scheduler start is deferred through the existing `deferDatasetStart` option. Updater checking/build/install behavior is measured separately in this checkpoint.
- Every worker `fetch` path, including explicitly injected feed and dataset fetchers, is blocked and counted; successful backend results require zero attempts.
- Backend startup is `startKairo()` startup only. It does not include launching the managed supervisor, browser, or app-module import time. Module-level file reads/parsing are outside this metric; lazy Universe static loading invoked inside `startKairo()` remains inside it.
- The database probe seeds with the same original legacy store and stable taxonomy/market seeder for both targets, then opens each target's production store. It does not fake compaction or edit the application migration markers.

Commands from the analysis checkout (Node 24+; build both frontends before HTTP measurement):

```sh
KAIRO_PERF_APP_ROOT=/path/to/rc16 node analysis/rc16/harness/legacy/smoke.mjs
node analysis/rc16/harness/legacy/abba.mjs /path/to/v073 /path/to/rc16 /path/to/results
```

The runner records pinned source identities, per-harness SHA-256 hashes, source exemptions, run order and timestamps. Its `raw/legacy-abba/` outputs are the appropriate same-machine basis for RC16 regression claims; historical absolute numbers serve as context only.

Current fixture fingerprints identify counts, not a hash of every seeded row. Provenance also includes the exact shared harness and production source hashes. New catalog scopes/datasets and output fields intentionally differ, so current backend assertions validate expected counts and exercised opportunities rather than claiming complete cross-version decoded response equality. The fixed-time database probe separately compares full output hashes.
