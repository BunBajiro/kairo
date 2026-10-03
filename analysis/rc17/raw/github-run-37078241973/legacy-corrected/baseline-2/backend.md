# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.13 | 0.6 |
| typical / state | 3.10 | 4.33 | 537.6 |
| typical / journey | 1.39 | 1.53 | 155.5 |
| typical / session | 12.67 | 21.17 | 445.3 |
| typical / market_browse | 1.49 | 1.60 | 58.9 |
| typical / market_report | 5.78 | 6.05 | 39.3 |
| typical / imports_warm | 0.43 | 0.67 | 171.2 |
| typical / imports_after_write | 0.74 | 0.80 | 171.2 |

typical idle: 0.57% of one core over 35.0 s; RSS 93.7 MiB; event loop p95 10.25 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.07 | 0.11 | 0.6 |
| stress / state | 14.49 | 23.32 | 3391.0 |
| stress / journey | 2.63 | 2.81 | 238.6 |
| stress / session | 63.26 | 76.16 | 2613.1 |
| stress / market_browse | 4.63 | 4.74 | 59.0 |
| stress / market_report | 26.83 | 27.23 | 39.3 |
| stress / imports_warm | 0.43 | 0.69 | 196.3 |
| stress / imports_after_write | 0.74 | 1.07 | 196.3 |

stress idle: 0.89% of one core over 35.0 s; RSS 126.3 MiB; event loop p95 10.23 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

