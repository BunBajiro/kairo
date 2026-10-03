# Initial idle CPU attribution review

Read-only review of GitHub run `37078241973` and the initial local backend comparison, 2026-10-03. This evidence establishes an observed idle CPU increase in the CI candidate comparison. It does **not** establish either a necessary feature cost or harmless measurement noise. Per-window activity counters and separate CPU profiles are the next diagnostic step; no runtime measurements or application changes were made for this review.

## Exact observations

Each cell below is **process CPU milliseconds / percent of one logical core**, over one approximately 35-second idle window. Columns preserve the actual ABBA run order. CPU is the sum of user and system time; the raw reports do not preserve those components separately.

| Family / profile | Baseline 1 | Candidate 1 | Candidate 2 | Baseline 2 | Mean normalized change |
|---|---:|---:|---:|---:|---:|
| CI RC16 → optimized, typical | 208.160 / 0.594672% | 239.074 / 0.682840% | 308.280 / 0.880697% | 221.318 / 0.632258% | +27.43%; +0.168303 percentage points |
| CI RC16 → optimized, stress | 422.031 / 1.205707% | 500.945 / 1.431068% | 508.986 / 1.454137% | 423.281 / 1.209339% | +19.47%; +0.235079 percentage points |
| CI 0.7.3 → RC16, typical | 202.454 / 0.578378% | 319.466 / 0.912092% | 300.998 / 0.859141% | 198.695 / 0.567115% | +54.63%; +0.312870 percentage points |
| CI 0.7.3 → RC16, stress | 392.500 / 1.121197% | 538.141 / 1.537277% | 547.370 / 1.563645% | 311.069 / 0.888569% | +54.29%; +0.545578 percentage points |
| Local RC16 → initial optimized, typical | 210.444 / 0.600648% | 228.913 / 0.653930% | 325.529 / 0.929189% | 298.107 / 0.850859% | +9.07%; +0.065806 percentage points |
| Local RC16 → initial optimized, stress | 580.016 / 1.656872% | 607.117 / 1.734532% | 583.966 / 1.668198% | 574.241 / 1.640368% | +3.20%; +0.052745 percentage points |

The CI optimized stress pairs increase by **78.914 and 85.705 ms CPU**, or **18.69% and 20.24%** after normalizing the elapsed windows. Both candidate repetitions exceed both RC16 repetitions in that family. Typical increases are 14.83% and 39.29%. Initial local paired increases are 8.87%/9.21% typical and 4.69%/1.70% stress. Local and CI values are not pooled.

The same RC16 commit has substantially different readings between the two consecutive CI families: stress 538.141/547.370 ms earlier, then 422.031/423.281 ms; typical 319.466/300.998 ms earlier, then 208.160/221.318 ms. The earlier family ran 23:38:19–23:43:48 UTC, and the later family 23:43:48–23:49:17 UTC on 2026-10-02. This is concrete evidence of run-family variation, but it does not explain away the within-family candidate increase. The families share identical worker and meter code. The later fixture additionally performs the discovery-migration preparation check before application startup; on RC16 this adds no discovery rows because the table does not exist. These are therefore useful same-source comparisons, not byte-identical fixture executions.

## Activity and measurement boundaries

- All **20 RC16/optimized idle samples** in the three comparisons report `tickAudit.calls = 12`, `successes = 12`, no rejections and zero external network attempts. The four 0.7.3 samples report the Universe audit as inapplicable, with zero calls; 0.7.3 has no Universe collector service.
- The audit is cumulative from a wrapper installed after `startKairo()`. `meter_start` does not reset it or capture a starting count. There are no per-window successful subtask counts, timer callback counts, callback CPU timings, in-flight boundary records, or GC measurements. Twelve cumulative successful ticks cannot resolve the amount of work inside each measured window.
- The worker initializes a fresh disposable application, waits one second, then measures idle for 35 seconds. All elapsed windows are 35,001.013–35,036.185 ms. Direct operation benchmarks and loopback HTTP happen **after** this idle window. HTTP's later audit reuses the cumulative count and must not be counted as another idle interval.
- The production Core scheduler runs every 3 seconds and its heartbeat every 10 seconds; OBS also has a 10-second interval. The fixture seeds no stream elements or clients and performs no browser work. Universe ticks in RC16 and the candidate each await two audited subtasks, `operations.tick()` and `feeds.tick()`, but successful subtask counts/durations are not stored. Other Core work, including protection, sync, public combat and recent Session combat checks, is outside this Universe audit.
- The common observer adds a 250 ms RSS sampler and a 10 ms event-loop delay monitor. These execute inside the measured process. Actual observer callback counts are not saved. Process CPU includes scheduled work, allocation/GC and observer overhead; it is not a direct measurement of feature-specific CPU.
- CI stress event-loop active time, computed from recorded utilization and elapsed time, is approximately 345.660/348.753 ms for RC16 and 380.079/380.113 ms for the optimized candidate. Heap endpoints vary between repetitions, including ~25 MiB drops in both one candidate and one baseline repetition. Those endpoints do not identify GC duration or establish GC as the cause.

## Fixture equivalence and remaining limits

Typical workload definitions are one pilot, 2,000 assets per pilot, 10,000 events, 300 visits, 600 combat records, 50 sessions and 1,000 market types. Stress definitions are four pilots, 20,000 assets per pilot, 50,000 events, 2,000 visits, 4,000 combat records, 200 sessions and 5,000 market types. Events, visits and archive sessions belong to pilot 42. All six profile comparisons retain the same definition fingerprints: typical `0c2523716cf3b3f063e681452e345d656c7ee24b045f965d3856c235b77e2854`, stress `5d6a8174075b20619915215e42ff752d983670e73590a11a3f5b11102d1fc15b`.

These fingerprints cover version/profile/counts, not every seeded byte. Each worker uses its own `Date.now()` and the selected application's dataset catalog/scopes. Relative freshness is held constant: dataset/public feed caches expire seven days later, public collectors are ready, automatic dataset startup is deferred, and archived sessions end approximately 42 hours before initialization. All measured samples made zero external requests. The candidate receives 100 discovered-system memberships before measurement to reproduce migration from legacy visits; RC16 retains the equivalent membership in its visits table. No new active session or due network fetch was deliberately added to the candidate idle workload.

Both CI families ran Node `v24.19.0`, Linux `6.17.0-1022-azure`, AMD EPYC 9V45, two logical CPUs. Local used the same Node version but Linux `6.18.44`, AMD EPYC 9V74 and nine logical CPUs. CI candidate is `05d0d4b36c154329006d6772769063db874762da`; local initial candidate is `059b95909dffa82f8b10dfd266954323147d7580`; RC16 is `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; 0.7.3 is `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Both CI provenance records are complete/end-verified, and this review independently matched every recorded harness hash against the reviewed files.

The next diagnostic should split user/system CPU, measure multiple steady windows after warm-up, record timer and subtask started/completed deltas including in-flight work at boundaries, and profile idle separately from timing. Extra useful work, a recurring implementation cost, and startup/GC/host variability remain competing explanations. None is established by these initial reports.

## Evidence

- `analysis/rc17/raw/github-run-37078241973/backend/{baseline-1,candidate-1,candidate-2,baseline-2}/backend.json`
- `analysis/rc17/raw/github-run-37078241973/legacy-corrected/{baseline-1,candidate-1,candidate-2,baseline-2}/backend.json`
- `analysis/rc17/raw/local-comparison-2/backend/{baseline-1,candidate-1,candidate-2,baseline-2}/backend.json`
- Each family's `provenance.json`; `analysis/rc17/harness/backend/{backend,worker,metrics,fixture,process}.mjs`; corresponding legacy-corrected harness files; `analysis/rc17/harness/legacy-discovery-fixture.mjs`; RC16/candidate Core and Universe timer call sites.
