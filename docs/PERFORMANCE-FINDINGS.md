# Kairo v0.7.2 — internal performance findings

This investigation identifies work for an upcoming **optimisation and refactoring pass**. No optimisation or application behaviour change has been applied. The strongest candidates are snapshot access and scheduling, import-cache dependencies, and session aggregation. Browser idle work was comparatively small in the measured scenarios.

**Keep this branch isolated.** `perf/benchmark-baseline` is an internal investigation, not a version update or an end-user build. Never merge it into `main` or use it as the development base. Start the subsequent v0.7.3 work from clean v0.7.2, commit `b151125cd7b26611364923f00683b1c6f1c1bdd6`. Keep the harness and captured data here; use a disposable test checkout when measuring a future implementation.

## Evidence and reproducibility

The measured harness commit is `ec26c4f36238954227cb2af9d0f8bf330fd4a182`. Application source, runtime dependencies, lockfile and version match the clean baseline. Two complete backend runs were performed sequentially in the workspace and two on GitHub. GitHub also completed six browser scenarios against the compiled application. These are baseline repetitions, not before/after optimisation comparisons.

[GitHub Actions run 34852836758](https://github.com/BunBajiro/kairo/actions/runs/34852836758) passed compilation, all **144 existing behaviour tests**, **7 harness tests**, TypeScript checking, both backend runs and all browser scenarios. The workspace also passed the 144 + 7 tests and TypeScript checking. The end-user packaging job is skipped on this branch.

Both environments used Node 24.19.0. GitHub used Ubuntu 24.04, a Xeon Platinum 8370C with 2 logical CPUs and approximately 8 GiB RAM; the workspace used an AMD EPYC 9V74 with 9 logical CPUs and approximately 16 GiB RAM. GitHub's browser was Chrome 152.0.7977.82. Compare repetitions within each environment: hardware differences are not performance improvements.

The smaller fixture has 1 character, 2,000 assets per character, 10,000 activity events, 300 visits, 600 personal and 600 alliance combat records, 50 saved sessions and 1,000 market types per hub. The larger fixture has 4 characters, 20,000 assets each, 50,000 events, 2,000 visits, 4,000 records in each combat table, 200 sessions and 5,000 types per hub. Both include 30 history days per type across the configured market data. “Typical” and “stress” are fixture names, not surveyed player profiles. The dense six-hour session deliberately exposes scaling costs.

Each operation has 3 warmups and 10 timed samples; timings include JSON serialization. Each idle observation lasts 35 seconds. CPU percentages describe **one logical core**, not the whole PC. External request attempts were zero. Full commands, fixture details and metric definitions are in [PERFORMANCE.md](PERFORMANCE.md).

## Backend baseline

The ranges below span the p50 from each of the two runs; they are not confidence intervals.

| Measurement | Workspace smaller | Workspace larger | GitHub smaller | GitHub larger |
|---|---:|---:|---:|---:|
| Protection evaluation (ms) | 2.17–2.28 | 9.98–10.02 | 2.78–2.80 | 11.34–11.36 |
| State projection (ms) | 4.10–4.15 | 21.82–22.20 | 5.04–5.22 | 24.45–24.53 |
| Journey (ms) | 1.75–1.79 | 3.53–3.60 | 2.27–2.30 | 4.42–4.43 |
| Session report (ms) | 24.68–25.09 | 178.04–186.14 | 30.51–30.72 | 215.50–217.84 |
| Market browse (ms) | 1.99–2.01 | 6.37–6.46 | 2.60 | 7.96–8.08 |
| Market supply report (ms) | 6.47–6.54 | 33.82–34.33 | 8.27–8.60 | 39.78–40.69 |
| Imports, cached (ms) | 0.50–0.52 | 0.58–0.61 | 0.66–0.67 | 0.74–1.40 |
| Imports, after unrelated write (ms) | 91.37–92.64 | 463.34–463.50 | 123.82–128.38 | 561.91–563.43 |
| Authenticated state HTTP (ms) | 9.23–9.40 | 41.70–46.63 | 12.60–17.41 | 44.59–51.04 |

| Measurement | Workspace smaller | Workspace larger | GitHub smaller | GitHub larger |
|---|---:|---:|---:|---:|
| Idle CPU (% of one core) | 1.94–1.97 | 14.77–15.16 | 2.08–2.12 | 16.14–16.19 |
| Largest observed idle loop delay (ms) | 61.3–62.2 | 441.5–466.6 | 59.4–62.0 | 494.1–502.3 |
| Observed peak idle RSS (MiB) | 98.4–98.7 | 154.7–155.2 | 116.9–123.6 | 175.0 |

The larger fixture's projected state is **3.31 MiB** and its session report is **2.55 MiB** before compression. Even when the visible page needs only a subset, the full state path decodes and serializes the broad projection. The corresponding smaller payloads are 537.6 KiB and 445.3 KiB.

The idle event-loop p95 stays near the meter's 10 ms resolution, while the largest observed delays approach half a second. That distinction matters: frequent short samples can conceal periodic stalls. Ten samples also make operation p95 the maximum observation, so it is not a stable rare-tail estimate. GitHub's stress import recalculation reached roughly one second in those maximum samples.

A separate 35-second workspace control running only the measurement meter, without Kairo, used 0.44% of one core (153.4 ms CPU). Small CPU readings include measurement overhead. This is one control observation, not a constant to subtract from every result; it does not explain the much larger scheduler cost.

## Priorities for the next pass

### 1. Refactor snapshot access and scheduler ownership, then optimise redundant work

**Highest priority for continuous background cost.** [core.mjs](../server/core.mjs) calls the all-module `snapshots()` projection inside `refreshOPSEC()`. [store.mjs](../server/store.mjs) prepares a SQLite read and decodes JSON on every `snapshot()` call. `runDataset()` reads the previous body before checking its due time; protection dataset completion, character sync completion and the three-second ticker can each repeat the full protection projection.

A separate instrumented diagnostic found **37 snapshot reads for one protection evaluation**, including the full asset and wallet-journal snapshots. An explicit scheduling wave made **1,472 reads**, representing **124.51 MiB of JSON-equivalent payloads** returned through that boundary. Assets alone accounted for 40 repeated reads. This is decoded payload volume, not measured physical disk traffic. Instrumentation was excluded from baseline timings; [snapshot-read evidence](performance-data/workspace-snapshot-reads.json) retains the per-key counts.

Refactor the boundary into lightweight scheduling metadata, protection-specific inputs and UI projections. Give decoded snapshots explicit ownership and invalidation; reuse immutable values where safe. Coalesce redundant evaluations while retaining immediate reactions to relevant evidence changes. CPU sampling also identifies snapshot retrieval as a hot application frame.

Acceptance checks: protection must no longer read assets or journal data; idle CPU and periodic stalls should decline on the same fixture and machine. Keep the three-second cadence and all existing fail-closed behaviour, evidence deadlines, scope and organisation checks before reuse, character isolation, manual/FW precedence, jump continuity and OBS state ordering. A slower protection decision is not an acceptable performance gain.

### 2. Optimise import caching with explicit dependency ownership

[imports.mjs](../server/imports.mjs) uses SQLite `total_changes()` in the memo key. An unrelated setting write therefore invalidates the complete analysis. On GitHub the large fixture goes from **0.74–1.40 ms cached** to **561.91–563.43 ms recalculated**. The workspace independently reproduces the same pattern. CPU profiles point into opportunity calculations and history-window processing.

Replace the database-wide counter with revisions for the actual inputs: both order books, history, import settings, seller fee inputs, buyer state, relevant character orders and access/module state. Retain time-based invalidation for freshness and order expiry, and the existing single-flight behaviour. A small refactor that centralises those dependencies is preferable to several loosely coordinated caches.

Acceptance checks: unrelated settings preserve a warm result; changing any relevant dependency or crossing an expiry invalidates it. Preserve price ticks, rankings and tie order, fees, budgets/cargo, buyer/seller identity, exclusions for all watched characters' orders, missing/stale data, detail quotes and saved-plan calculations. Compare numerical outputs as well as timings.

### 3. Refactor session aggregation and optimise interval matching

The large report takes **215.50–217.84 ms** on GitHub before HTTP overhead. [session-details.mjs](../server/session-details.mjs) repeatedly matches visits against combat records and records against merged windows, with repeated date parsing. CPU sampling highlights this matching path and SQLite work. These costs grow with both visit and combat counts.

Separate loading, timestamp normalisation, interval matching and report assembly. Group records by system and use ordered time ranges instead of repeated full scans. Consider caching the immutable portion of archived reports with explicit invalidation for edits, backfilled records, names and coverage; preserve current module/access decisions and metadata.

Acceptance checks: preserve quiet and repeated visits, exact interval boundaries, qualification before adding the ten-minute combat buffer, deduplication, exclusive kill/loss accounting, LP deltas, unknown valuation, pagination and stable most-active-system ties. Preserve cards, expansion, focus, scroll and live-report updates. The current [session UI](../components/kairo/session-report.tsx) already suppresses static-report polling and hidden-document refreshes; the measured archived report did not repeatedly reload its individual report endpoint.

### 4. Review frontend state ownership after the backend improvements

The [dashboard](../components/kairo/dashboard.tsx) has a 30-second full-state fallback and shares broad data/name state through context. This is a plausible payload and rerender improvement, but the measured idle renderer work is low. Scope data and subscriptions only where evidence shows a benefit; preserve reconnect recovery, freshness, selection, filters, pagination and focus.

The compiled main-page JavaScript is **831,476 bytes**, within **1,406,611 bytes** of total static client assets. Splitting it is a startup candidate, not an explanation for the measured backend idle cost. Each browser load is only one observation and includes scenario setup.

### 5. Defer smaller query and widget improvements

The large market supply report takes **39.78–40.69 ms** on GitHub. [markets.mjs](../server/markets.mjs) performs related joined counts for four signals plus rows and summary statistics. A shared aggregate or prepared-query refactor may help after higher-priority work; retain all four signals, thresholds, ordering and pages.

Ten synthetic stream widgets produced 895 DOM mutations and 143 layouts over 35 seconds, but only 0.35% renderer main-thread busy time. [render.js](../public/stream/render.js) writes clock-like text every 250 ms. Avoiding unchanged text writes is a possible small optimisation; do not reduce countdown precision or change the visual feel merely to improve a benchmark.

## Browser observations

Each scenario used the larger fixture, a visible 1600×1050 headless viewport, two seconds of settling and a 35-second observation. ESI collection was disabled to separate UI/server polling from the scheduler measured above. Renderer busy time excludes other Chrome processes and GPU/compositor work.

| Scenario | Renderer busy % | Node CPU % of one core | Requests in 35 s | DOM nodes |
|---|---:|---:|---:|---:|
| Overview | 0.61 | 1.47 | 6 | 467 |
| Assets | 0.37 | 1.10 | 1 | 505 |
| Markets | 0.56 | 1.29 | 10 | 636 |
| Archived session | 0.57 | 0.93 | 3 | 1138 |
| Empty stream | 0.06 | 1.10 | 0 | 11 |
| 10 stream widgets | 0.35 | 1.07 | 0 | 71 |

No long tasks were recorded during these idle windows. Overview requests included two state/timeline/goals refresh sets; markets made nine market-overview requests plus one state request. The archived session made state, journey and session-list requests, with no repeated individual-report request. Streams kept their event connections open without new requests.

The fixture sets dataset refresh dates ahead to avoid live collection, but protection correctly ages location evidence out after 30 seconds. The first observation includes that state transition; it is not a steady-state live-location benchmark. Synthetic personal combat records are populated independently of generic activity events, so event-derived headline kill/loss counts are not a golden UI accounting fixture. Existing behaviour tests remain the accounting oracle.

## Implementation and verification sequence

1. Start implementation from the clean v0.7.2 commit above. Keep this investigation branch and draft PR unmerged.
2. Refactor snapshot/scheduler boundaries first, then handle import dependencies and session aggregation in separate reviewable changes. Only add lower-priority UI/query work when remeasurement supports it.
3. Keep existing correctness tests green and add focused regressions for each changed dependency or matching boundary. Preserve front-facing functionality and feel; avoid broad snapshots that merely mirror new implementation details.
4. Run the same external harness against baseline and candidate in disposable test checkouts, sequentially, on matching hardware/Node/browser versions. Record application and harness commits. Compare raw samples, payloads, CPU, stalls and behaviour before accepting a change. Do not copy profiling files into the development branch.
5. Calibrate timing budgets after more repeated measurements. Current comparisons are advisory and reject incompatible/incomplete inputs; correctness, populated workloads, external-call blocking and harness failures are enforced now.

These measurements do not establish the cause of physical fan activity. They exclude actual OBS/Streamlabs rendering, GPU power, Firefox, hidden-tab throttling, live internet collection and long-duration memory retention. Short RSS/heap observations are not a memory-leak diagnosis. Those are follow-up investigations if the prioritised backend changes do not account for real-world cost.

## Retained evidence

The JSON evidence and repeatability summaries are committed in [performance-data](performance-data/README.md), including both workspace runs, both GitHub runs, the browser result, snapshot reads, raw CPU profiles and their summaries. GitHub's successful run also retains screenshots and original reports in artifact `kairo-internal-performance-ec26c4f36238954227cb2af9d0f8bf330fd4a182`, with a 30-day retention policy. The committed numerical evidence remains available after that artifact expires.
