# Corrected warm-cache backend comparison

The corrected backend-only ABBA completed successfully both locally and in the focused GitHub rerun. RC16's successful background feed path still uses more idle CPU and memory and has longer maximum event-loop stalls than v0.7.3 in this fixture. Startup remains the clearest cross-version latency increase. The smaller dashboard HTTP difference does not meet the checkpoint's two-repeat 10% plus 1 ms signal rule.

## Method and correction

Run `node analysis/rc16/followup/harness/legacy-corrected-run.mjs ../kairo-v073 . analysis/rc16/raw/followup/legacy-corrected` from the analysis checkout. This entry point acquires `/tmp/kairo-rc16-benchmark.lock` itself. Raw data and provenance are in `../raw/followup/legacy-corrected/`. The unchanged summary command is `python3 analysis/rc16/harness/legacy-summary.py analysis/rc16/raw/followup/legacy-corrected`.

The 329.492-second run used baseline → candidate → candidate → baseline, each with typical and stress profiles, 35-second idle windows, three operation warmups, and ten measured operation samples. Node v24.19.0 ran on the same AMD EPYC 9V74 host as the local follow-ups. Source identity was verified before and after execution: 195 v0.7.3 blobs at `239794774320fcdebaa1d76ce8a77c5c25cfc48c`; 405 RC16 application blobs at `57c8dcc7fbd8fc2b62129498d1819050c78381a1`. The two permitted investigation guard exemptions are recorded. All eight corrected runner/helper hashes also matched at the end.

The frozen initial harness seeded the storms cache as `[]`, causing RC16's feed-state projection to reject inside a background `Promise.allSettled` subtask. v0.7.3 does not have that Core Universe service. The new copy changes this cache to `{storms:[],points:[]}` and verifies that `feeds.state()` succeeds after startup, outside the startup timer. All four RC16 profile observations returned ready storms and 2,384 bundled points. The actual scheduled `Universe.tick()` is wrapped only to count success and inspect both settled subtasks: every idle window recorded 12 calls, 12 successes, zero rejections. No synthetic successful tick or timer substitution was used.

This small RC16-only audit introduces assertion/bookkeeping overhead, and the explicit feed-state check warms that projection before idle measurement. These are correctness observers, not evidence that all differences from the older run were caused solely by the fixture correction. The new fixture version-1 fingerprint still identifies workload counts, not full seeded row content; use the corrected scope and file hashes for content provenance. SDE automatic start remains deferred, public caches remain fresh for seven days, the real scheduler runs, and all external fetch calls are blocked. This remains a controlled warm-cache baseline rather than the default installation/startup experience.

## Results

Ranges are the two runs, not confidence intervals. CPU is percent of one logical core; operation/HTTP values are run medians; startup is one start per profile per run.

| Metric | Typical v0.7.3 → RC16 | Stress v0.7.3 → RC16 |
|---|---|---|
| Idle CPU | 0.637–0.920 → 0.936–0.984% | 1.364–1.551 → 1.662–1.666% |
| Idle RSS | 68.54–68.96 → 144.52–150.82 MiB | 101.57–101.70 → 171.95–172.55 MiB |
| Maximum idle event-loop delay | 14.86–22.15 → 22.51–23.86 ms | 39.55–42.30 → 58.92–59.64 ms |
| `startKairo` startup | 13.67–14.15 → 150.65–158.39 ms | 15.99–16.15 → 154.20–164.52 ms |
| Dashboard state HTTP | 9.60–9.86 → 9.67–9.67 ms | 39.68–40.07 → 41.95–44.06 ms |
| Session report | 15.51–16.81 → 14.60–15.49 ms | 90.28–103.56 → 86.74–95.24 ms |
| Cached imports after unrelated write | 0.606–0.662 → 0.598–0.651 ms | 0.721–0.749 → 0.731–0.732 ms |

Stress idle CPU increased 14.1% by the ratio of means; baseline spread limits the precision of that percentage. Stress RSS increased about 70.6 MiB and maximum idle event-loop delay increased 44.8% by the ratio of means. Startup increased about 138–143 ms on average. These support investigating Core startup ownership and recurring projections. They do not independently diagnose retained memory as a leak or assign all cost to one subsystem.

The stress HTTP mean increase was 7.84%, so the original local result should not be promoted into a robust HTTP regression claim; the original GitHub comparison also did not reproduce that regression. The newer session report and import-cache improvements remain intact in this workload. All existing workload correctness assertions passed and every worker reported zero external-request attempts. Full decoded cross-version state equality is not claimed because RC16 intentionally adds fields.

This run supersedes the original idle comparison's claim to a successful RC16 feed projection. Original local and GitHub measurements remain available with that qualification. Database/schema/aged-history probes were not rerun: their original source/output hashes and working JSON equality remain the applicable evidence. The generated summary's empty database section means unmeasured in this rerun; it is not a failed equivalence test.

## Independent corrected GitHub result

[Run 37073070547](https://github.com/BunBajiro/kairo/actions/runs/37073070547) succeeds after restoring the prerequisite that both applications are built. It ran only the corrected backend lane; it does not repeat or clear the earlier mixed SSE failure. Harness/workflow commit is `827a0475acc1457b1943d130bf92f66f38e93c2e`; measured application sources are unchanged v0.7.3 and RC16. The 336.980-second ABBA started at 22:34:24.848 UTC on 2 October 2026, using Node 24.19.0, Linux x64, two logical CPUs on AMD EPYC 7763. This host differs from the local EPYC 9V74, so compare changes within each environment only.

The [retained artifact, log and validation](../raw/followup/github-run-37073070547/) include four complete backend reports, eight typical/stress observations and an independently recomputed matching summary. All 195/405 source blobs and eight corrected helper hashes verified at both ends. All 23 workflow-recorded harness hashes match. Every RC16 idle profile reports 12 real ticks and 12 successes with zero rejections; the final stress HTTP meter reaches 13 successful ticks. No external requests occurred. The RC16 report's `dirty:true` records generated analysis outputs in the investigation checkout, not changed application files; the protected source verifier is authoritative for that distinction.

| Metric | CI typical v0.7.3 → RC16 | CI stress v0.7.3 → RC16 |
|---|---|---|
| Idle CPU | 0.623–0.630 → 0.752–1.038% | 1.538–1.543 → 2.217–2.257% |
| Idle RSS | 93.09–93.91 → 172.46–177.86 MiB | 107.63–125.97 → 222.00–222.06 MiB |
| Maximum idle event-loop delay | 13.17–15.52 → 21.43–30.83 ms | 41.98–42.86 → 80.81–83.23 ms |
| `startKairo` startup | 20.06–23.33 → 218.94–226.00 ms | 26.18–26.72 → 216.96–223.96 ms |
| Dashboard state HTTP p50 | 12.51–13.31 → 12.68–14.42 ms | 49.64–51.37 → 48.45–50.38 ms |
| Session report p50 | 20.42–21.15 → 20.10–21.60 ms | 113.70–116.26 → 112.74–113.26 ms |

The higher startup, residency and recurring stall costs reproduce, with different magnitudes. Stress HTTP changes −2.16% by the ratio of CI means, versus +7.84% locally; neither supports a general RC16 HTTP regression claim. Session medians remain similar or slightly better and selective import-cache reuse remains intact.

One narrower CI tail signal deserves retention: stress Session report p95 is 130.28–132.62 ms in v0.7.3 versus 147.54–149.47 ms in RC16, +12.97% by the ratio of means and over 1 ms in both repetitions. With ten samples, this nearest-rank p95 is the **largest observed sample**, not a stable population percentile. The new candidate ABBA retains it for comparison; it does not establish a whole-session median regression or attribute the tail to a particular subsystem.

The archive is artifact `11256137304`, 48,345 bytes, SHA-256 `43349f8792506740f4cf8f7a82a9d2c077989f0d94c9b09a4be915dd2f98c992`. No application source, dependency, or frozen initial harness was changed. No database probe was repeated; the empty database summary remains an unmeasured lane, not failed equality.
