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
