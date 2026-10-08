# S3 ordinary gates: measured retention recommended

The exact-a7 S3 eligibility index and query should be retained for RC17, with their measured migration, write and storage costs explicitly accepted. The largest real endpoint reduces collector work in both ABBA pairs. Small-endpoint total work and tail timings are mixed; no universal speedup or new pass threshold is claimed. This is the component recommendation for the coordinator to reconcile into the closure ledger, not Clean RC17 or PR #10 readiness.

## Completed evidence

The existing `ordinary-attempt1` completed 2026-10-08T11:30:17.574527+00:00–2026-10-08T11:46:56.691982+00:00 UTC (16 minutes 39.117 seconds). No interrupted worker was restarted after the chat refresh. Both shared locks were held across the gates and released after the coordinator exited zero. All 24 write/storage workers and eight real cadence workers passed, plus two dedicated seed children. The outer receipt verifies 91 artifacts, both final source inventories and the unchanged measurement/coordinator bindings; both owned process groups were absent after close. There were no cleanup or artifact failures.

Exact candidate is `a7b1bf97b0073695926c443e52d523638e59e48d`; baseline differs only in the declared S3 index-migration and eligibility-SQL ablation. R1 and all other a7 changes remain in both arms. The original twelve-input binding is `68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c`; ordinary coordinator revision 2 is `c48a03b81a4968c52bf12d9fba01ed888bded059361e607a8ab846adce1f7213`. Earlier focused semantics passed 39/39, and twelve separate diagnostics passed all six archive/pilot shapes; those results were not rerun.

`summarize-ordinary.py` is post-run analysis only. It independently rechecks all outer artifact hashes, completed process-group receipts, phase counts, exact parity and actual deadlines before creating `ordinary-attempt1/summary.json`. Its pairing/arithmetic/scope received a read-only independent review. Every operation, storage stage, CPU/point-memory scalar and both paired observations remain in the raw outputs and numeric summary. Raw Node `cpu.user`/`cpu.system` fields are microseconds; CPU totals below are converted to milliseconds.

## Actual 120-second cadence

Each worker executed 41 actual scheduled ticks and reached the first live feed’s real next-check deadline. Final offsets were 120,002–120,003 ms, total monitored intervals 120.008–120.038 seconds, and maximum tick lateness was 2 ms. All provider/state/cursor contracts passed: one-pilot workers made 41 collector calls and 17 history calls; four-pilot workers made 164 collector calls and 68 history calls. Each made three live requests (200/404/404), zero verification calls, and finished ready at cursor 100. Full normalized application/provider parity matches all four arms at each endpoint.

| Archives × pilots | Measure | Baseline → candidate ms, pair 1 / pair 2 |
| --- | --- | ---: |
| 100-1 | Sum of collector tick work | 60.997→60.370 / 53.273→53.466 |
| 100-1 | Median tick work | 0.488→0.601 / 0.461→0.501 |
| 100-1 | p95 tick work | 5.617→6.150 / 6.778→6.383 |
| 100-1 | Maximum tick work | 18.795→18.693 / 20.561→16.988 |
| 100-1 | Total interval CPU | 607.631→574.852 / 598.034→611.327 |
| 10000-4 | Sum of collector tick work | 392.302→170.610 / 383.156→163.621 |
| 10000-4 | Median tick work | 6.394→1.051 / 6.659→1.077 |
| 10000-4 | p95 tick work | 35.703→24.358 / 28.947→30.389 |
| 10000-4 | Maximum tick work | 66.326→52.052 / 60.147→59.275 |
| 10000-4 | Total interval CPU | 975.040→833.571 / 927.799→734.179 |

At 10,000 archives × four pilots, summed collector work falls 56.51%/57.30%, and median tick work falls 83.57%/83.83%. Its p95 is mixed (−31.78%/+4.98%). At 100 archives × one pilot, total work is mixed (−1.03%/+0.36%), and median tick work increases 0.113/0.040 ms (+23.06%/+8.77%). These adverse rows are retained. The intentional two-minute wait is not presented as a speedup. Event-loop p95 remains around 10.17–10.19 ms; no retained-memory claim follows from process maxRSS.

## Migration, write and storage costs

Each fixture uses the real pre-S3 Store to seed a populated database; candidate first open performs the actual additive migration. Equivalent checkpoints, close/reopen and durable full application-table digests pass. Each insert and end-update phase performs 500 rows per pilot in one transaction; these are batch costs, not individual UI latencies.

| Archives × pilots | First populated open ms, pair 1 / pair 2 | Insert batch ms, pair 1 / pair 2 | End-update batch ms, pair 1 / pair 2 |
| --- | ---: | ---: | ---: |
| 100-1 | 1.498→1.664 / 1.512→1.633 | 1.087→1.199 / 1.050→1.215 | 0.902→1.338 / 0.889→1.319 |
| 100-4 | 1.502→1.954 / 1.996→1.781 | 4.199→5.487 / 5.190→4.822 | 3.994→5.086 / 3.444→5.324 |
| 1000-1 | 1.985→2.007 / 1.465→2.078 | 1.329→1.438 / 1.262→1.395 | 1.181→1.310 / 0.958→1.248 |
| 1000-4 | 1.616→2.466 / 1.737→2.707 | 6.653→4.813 / 4.392→5.474 | 3.407→5.454 / 3.601→6.336 |
| 10000-1 | 1.964→4.744 / 1.511→5.215 | 3.012→1.484 / 1.261→1.526 | 0.898→1.379 / 0.975→1.308 |
| 10000-4 | 2.176→14.218 / 1.635→16.147 | 5.272→6.357 / 7.220→6.682 | 3.473→6.954 / 3.499→5.661 |

| Archives × pilots | Checkpointed DB bytes, baseline → candidate | Increase bytes | Increase |
| --- | ---: | ---: | ---: |
| 100-1 | 405,504→434,176 | 28,672 | 7.07% |
| 100-4 | 684,032→786,432 | 102,400 | 14.97% |
| 1000-1 | 540,672→606,208 | 65,536 | 12.12% |
| 1000-4 | 1,204,224→1,445,888 | 241,664 | 20.07% |
| 10000-1 | 1,781,760→2,146,304 | 364,544 | 20.46% |
| 10000-4 | 6,303,744→7,782,400 | 1,478,656 | 23.46% |

End-update batches are slower in both pairs at every shape. The largest fixture adds 12.042/14.512 ms to the first migration open and 3.481/2.162 ms to the 2,000-row end-update batch. Ordinary reopen there rises 0.660→0.799 and 0.680→0.910 ms; its final checkpoint is also adverse, 0.498→2.678 and 0.575→0.642 ms. Insert results are mixed. The largest checkpointed database increase is 1,478,656 bytes (23.46%). All six storage figures agree exactly between repetitions. No VACUUM was used; intermediate WAL snapshots are not cumulative bytes written. Source import/hash work is outside timed operations, and cumulative maxRSS includes that process history.

## Disposition and limits

Retain S3 as the bounded optimization: repeated archived-session polling at the large endpoint has materially lower measured work, while the additive index’s one-time migration, write-maintenance and persistent space costs are now concrete and visible. At the small endpoint there is no consistent total-work benefit, and individual/tail costs cannot be dismissed. This recommendation uses the observed absolute costs and repeated large-archive benefit; it does not introduce a percentage threshold or assume a production read/write frequency.

The remaining S3 timing debt covered by this plan is now supplied: six ordinary write/storage ABBA shapes and both real cadence endpoints, together with the earlier six-shape diagnostics and semantics. Four interior ordinary cadence shapes were not executed and must not be labeled measured. This is a bounded retention judgment based on endpoint behavior plus diagnostic/write coverage, not a claim about those interior timings.

The harness calls `createSessionCombat.syncRecent` for pilots sequentially, preserving the historical collector lane. Production Core launches its calls concurrently. Immediate synthetic provider responses, sampled domain clock and the serial call schedule do not establish whole-Core concurrency, startup/idle performance, external-provider latency, S1 report rendering or R1 replay behavior. Those retain their separate scope. No application source was changed by this task.
