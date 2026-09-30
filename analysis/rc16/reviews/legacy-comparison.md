# Same-machine legacy comparison: released v0.7.3 versus RC16

All four sequential backend runs and all four aged-history database probes completed. Source files were hash-checked before measurement. Raw evidence and machine-readable comparisons are in `../raw/legacy-abba/`; exact historical recovery/method details are in `historical.md`.

The old session, import-cache and database improvements remain visible. The main newly observed legacy costs are greater resident memory, additional server initialisation work, moderately higher idle CPU/stalls, and slower large authenticated state responses. These measurements do not attribute a cause by themselves.

| Large fixture measurement | Released v0.7.3 | RC16 | Interpretation |
|---|---:|---:|---|
| Idle CPU, percent of one logical core | 1.32–1.35% | 1.62–1.64% | +22.0% relative; about +0.29 percentage points of one core |
| Idle RSS | 82.15–101.42 MiB | 167.86–170.82 MiB | Repeatable higher process residency; not a memory-leak diagnosis |
| Largest observed idle loop delay | 36.18–36.83 ms | 55.41–56.92 ms | Higher short-window maximum in both pairs |
| `startKairo()` initialisation | 14.93–17.67 ms | 164.38–168.70 ms | Additional ~150 ms, excluding module import and managed-supervisor launch |
| Authenticated state HTTP p50 | 40.22–40.30 ms | 44.72–45.63 ms | +12.2%; both paired increases exceed 10% and 1 ms |
| State projection/serialization p50 | 22.92–23.97 ms | 21.89–25.60 ms | Mixed direction; no repeatable material signal |
| Session report p50 | 92.61–99.51 ms | 84.87–90.34 ms | Prior optimisation benefit retained |
| Imports after unrelated write p50 | 0.70–0.70 ms | 0.69–0.71 ms | Prior selective cache invalidation retained |
| Cold imports after aged-history migration | 450.38–458.33 ms | 448.43–471.60 ms | Broadly unchanged |
| 5,000 committed event inserts | 18.01–18.62 ms | 17.97–18.56 ms | Broadly unchanged |
| 1,000 batched history updates | 34.94–35.05 ms | 33.87–34.44 ms | No degradation observed |
| Working history JSON | 15.60 MiB | 15.60 MiB | Prior bounded projection retained exactly |

The typical fixture shows the same memory/startup direction: RSS 68.47–68.79 → 133.95–148.14 MiB; `startKairo()` 11.07–11.70 → 160.25–172.69 ms. Its idle CPU remains below one percent of one core (0.58–0.60 → 0.72–0.83%). Typical session p50 rises 15.03 → 16.46–16.79 ms, but does not cross the >10% and >1 ms guard in both pairs. Keep the increase visible without treating the advisory threshold as proof that every smaller change is harmless.

The fixed-time database probe's complete cold-import response hashes and complete written history/source hashes match across every repetition and source. All four runs retain exactly 16,355,000 working history JSON bytes and the same preserved row counts. First migration open remains approximately 0.91 seconds on both versions. This evidence gives no reason to reopen the previous broad database-schema redesign question.

The comparison scope is controlled warm caches with the real scheduler and RC16 Universe ticks enabled. ESI snapshots and five empty public feeds are future-fresh, external requests are blocked/count-asserted, and automatic SDE scheduling is deferred for separate updater measurement. It does not measure populated new maps, a real player database, live collection, the full managed process launch, or a Windows/OBS session.

Current backend correctness checks validate fixture counts and exercised opportunity/report invariants. Complete legacy response equality is not claimed: RC16 intentionally adds catalog fields and report metadata. Large session payload increases from approximately 2,613 to 2,777 KiB, and journey from 239 to 252 KiB. The state payload itself changes only about 0.5 KiB, so its HTTP slowdown is not explained by a large increase in transferred data; a separate phase profile is needed before selecting a change.

All figures are two observed run ranges on this machine, not confidence intervals. Ten measured samples make nearest-rank p95 the sample maximum; raw p95 values are retained for visibility, not a reliable rare-tail estimate. CPU/RSS/loop-delay measurements are short idle windows and establish neither power/fan behavior nor long-term retention.

Reproduce the summary without rerunning measurements:

```sh
python analysis/rc16/harness/legacy-summary.py analysis/rc16/raw/legacy-abba
```

This writes `comparison.json` / `comparison.md` (and `summary` aliases), retaining every operation's latency/CPU/payload ranges, mean-of-two run ratios, paired advisory flags and database hashes. Timing flags are advisory; invalid/incomplete evidence or mismatching database outputs fail the summary.

## GitHub confirmation and revised confidence

[GitHub run 36708404690](https://github.com/BunBajiro/kairo/actions/runs/36708404690) completed the same ABBA order on Node 24.19.0, Linux, an AMD EPYC 7763 runner with two logical CPUs. All eight backend profile observations and four database reports are complete; every backend request counter is zero, every operation/HTTP series has ten samples, and idle windows span 35.002–35.020 seconds. Harness hashes exactly match the workspace run. Evidence is retained in `../raw/github-run/github/legacy/`.

These are **within-GitHub comparisons**; absolute GitHub and workspace timings are not compared.

| Large fixture measurement | GitHub v0.7.3 | GitHub RC16 | Agreement with workspace |
|---|---:|---:|---|
| Idle CPU, percent of one core | 1.63–1.72% | 2.14–2.15% | Higher in both environments; +28.2% in GitHub |
| Idle RSS | 107.36–125.54 MiB | 192.73–193.65 MiB | Higher residency reproduced |
| Largest idle loop delay | 43.68–44.89 ms | 76.15–76.15 ms | Higher short-window stalls reproduced |
| `startKairo()` initialisation | 27.20–28.02 ms | 219.94–231.02 ms | Higher initialisation cost reproduced |
| State HTTP p50 | 49.97–51.43 ms | 49.43–49.70 ms | Local slowdown **not reproduced**; GitHub mean improves 2.2% |
| Session report p50 | 114.79–118.04 ms | 110.14–111.80 ms | Prior session benefit retained |
| Imports after unrelated write p50 | 1.31–1.42 ms | 1.25–1.35 ms | Prior cache benefit retained |
| Cold aged imports | 617.55–663.19 ms | 621.37–657.56 ms | Broadly unchanged |
| Working history JSON | 15.60 MiB | 15.60 MiB | Exactly unchanged |

Typical RSS and initialisation also reproduce their increases (93.20–93.44 → 176.57–177.15 MiB; 23.03–24.45 → 212.62–216.80 ms). Typical idle CPU is only 4.7% higher on average, with overlapping run ranges, so the workspace's larger relative increase is not consistent across environments. Typical session p50 is unchanged. Database insert/write costs remain close: 5,000 events take 24.51–24.74 → 24.77–24.90 ms; 1,000 history updates take 40.07–40.38 → 40.17–41.99 ms.

Complete database cold-import and saved history/source hashes match in all four CI runs **and** match all four workspace runs. Working history JSON is exactly 16,355,000 bytes throughout. This confirms the earlier database gains and supplies no measured basis for a broad schema rewrite.

Prioritise attribution/reduction of new resident memory, initialisation work, and large-fixture scheduler stalls; these signals reproduce in both environments. Retain state HTTP as a local investigation lead, not a confirmed general RC16 regression. GitHub also shows some higher state/session p95 observations, but with ten samples these are maxima; they do not establish stable rare-tail regressions or override the preserved session p50 result. No existing scope limitation or correctness claim is expanded by this confirmation.
