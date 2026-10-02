# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.13 | 0.20 | 0.6 |
| typical / state | 5.40 | 6.39 | 537.6 |
| typical / journey | 2.31 | 2.44 | 155.5 |
| typical / session | 20.42 | 30.82 | 445.3 |
| typical / market_browse | 2.71 | 3.32 | 58.9 |
| typical / market_report | 9.40 | 9.63 | 39.3 |
| typical / imports_warm | 0.82 | 1.03 | 171.2 |
| typical / imports_after_write | 1.30 | 2.16 | 171.2 |

typical idle: 0.62% of one core over 35.0 s; RSS 93.1 MiB; event loop p95 10.34 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.14 | 0.22 | 0.6 |
| stress / state | 26.83 | 39.66 | 3391.0 |
| stress / journey | 5.12 | 5.70 | 238.6 |
| stress / session | 116.26 | 130.28 | 2613.1 |
| stress / market_browse | 8.88 | 10.04 | 59.0 |
| stress / market_report | 44.93 | 47.96 | 39.3 |
| stress / imports_warm | 1.00 | 1.17 | 196.3 |
| stress / imports_after_write | 1.40 | 1.47 | 196.3 |

stress idle: 1.54% of one core over 35.0 s; RSS 107.6 MiB; event loop p95 10.33 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

