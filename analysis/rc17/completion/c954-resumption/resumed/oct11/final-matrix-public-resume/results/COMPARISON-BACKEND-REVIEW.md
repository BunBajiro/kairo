# Independent backend and memory comparison review

**Pass for collection integrity and arithmetic; no new source defect established.** This review covers RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` versus integrated source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, on the same local Node 24.19.0 host. It supports continuing the remaining acceptance lanes. It is not release approval and does not reopen the accepted startup/first-use trade-off.

All 32 backend/memory evidence files match both the outer completion inventory and inner closed-file pins. Both source manifests, 933 source/build file hashes, 15 distinct runner/worker/summarizer pins, four owned command exits/drains, and all 14 memory worker result hashes pass. Backend recomputation covers 1,360 samples, 544 distribution values, 78 rows/156 pairs and all 26 displayed rows. Memory recomputation covers 100 marker observations, 50 summaries/264 aggregates, 132 metric comparisons, 420 session timing samples/60 medians, 30 session summaries, 30 SQL diagnostic rows and five fixtures matched across all six session workers. Full values and every adverse pair remain in `COMPARISON-BACKEND-AUDIT.json`; its indices are zero-based.

## Current-source costs and acceptance

| Finding | Matched evidence | Disposition |
|---|---|---|
| G6 startup | Mean `startKairo` startup improves 14.8% typical and 10.3% stress; all four pairs improve. Ordinary store open plus four-pilot seeding costs 4.45→6.29 ms and 4.64→5.98 ms (+1.84/+1.35 ms). Core import improves 46.01→35.57 ms; creation improves 121.25→117.27 ms. | Retain the isolated one-time setup cost explicitly. It is not a measurement of first Assets open and supplies no duplicate-work cause. |
| G9 idle | CPU falls 0.877→0.477% of one core typical (−45.6%) and 1.492→1.251% stress (−16.1%). RSS falls 151.23→119.46 MiB and 172.13→130.38 MiB. All pairs improve. | Local matched improvement; do not transfer attribution from historical 0.7.3→RC16 results. |
| G8 state | Direct p95 pairs are mixed: typical +4.65/−1.06 ms; stress −3.67/+5.39 ms. Stress HTTP p95 worsens in both pairs: +4.78 ms/+7.77% and +12.37 ms/+31.43%; mean 50.42→59.00 ms (+17.0%). | A real adverse observation remains. Only one pair crosses both +1 ms and +10%; do not call all state tails improved or infer a new cause from these two samples. |
| S1 session report | p50 worsens in both pairs: typical +1.39/+0.56 ms (+6.5% mean); stress +4.59/+5.88 ms (+6.3% mean). Stress p95 +11.54/+4.47 ms (+8.7% mean); typical p95 improves. Payload grows 5,400 bytes typical / 36,000 bytes stress in both pairs. | Preserve this ongoing report cost separately from the live-sync cache gain. No row crosses both +1 ms and +10% in both pairs. Payload/timing observations alone do not establish causality. |

The pre-existing repeated joint latency marker finds **zero backend or session-timing rows**. The sole flagged ordinary-memory interval is store opening/seeding above. Absence of this marker does not erase adverse rows or establish statistical equivalence. Two runs per source provide descriptive observations, not confidence intervals.

## Memory and session scope

Ordinary heap after core creation falls 52.73→38.00 MiB. Forced-GC retained heap after core creation falls 40.62→30.84 MiB, and after ten recreate/use/close cycles 35.34→31.87 MiB. Retained heap grows about 0.416 MiB baseline and 0.495 MiB candidate across those ten cycles. This is not a no-leak proof; process/module singletons intentionally survive closure, and RSS includes allocator residency. Ordinary snapshots and forced-GC retention remain separate.

Actual live-sync cache-hit medians fall from 0.694–54.170 ms to 0.00320–0.00569 ms across five fixtures. Diagnostic visit rows become zero in every candidate cache-hit fixture, versus 300/3,000/30,000/300/12,000 baseline rows over three calls. Ordinary route/group hashes, route lengths and group counts agree across all six workers. Hash coverage is system/time/duration/active route fields and combat groups only; raw hash bodies are not archived. Route/group timings generally improve, with small mixed-pair group costs retained at 100 visits (+2.34%) and 100 visits plus 10,000 older visits (+0.59%). SQL counts describe returned rows, not pages scanned; diagnostic execution is not used as timing evidence.

Backend fixture assertions, successful real Universe tick audits, and zero blocked-network attempts pass. This lane has no database workers and does not establish complete decoded cross-version HTTP output equality. The Journey row is the cold legacy compatibility reader; active lifetime Journey logging/UI is retired. Root owns the global envelope audit; Maps, routes, browser and remaining release gates are outside this review.
