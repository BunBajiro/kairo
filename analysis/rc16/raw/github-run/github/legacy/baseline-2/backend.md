# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.22 | 0.6 |
| typical / state | 5.45 | 6.57 | 537.6 |
| typical / journey | 2.41 | 2.64 | 155.5 |
| typical / session | 20.91 | 32.20 | 445.3 |
| typical / market_browse | 2.69 | 3.08 | 58.9 |
| typical / market_report | 9.96 | 10.29 | 39.3 |
| typical / imports_warm | 0.80 | 1.02 | 171.2 |
| typical / imports_after_write | 1.18 | 3.41 | 171.2 |

typical idle: 0.77% of one core over 35.0 s; RSS 93.4 MiB; event loop p95 10.31 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.14 | 0.22 | 0.6 |
| stress / state | 27.36 | 40.07 | 3391.0 |
| stress / journey | 5.11 | 5.28 | 238.6 |
| stress / session | 114.79 | 133.53 | 2613.1 |
| stress / market_browse | 8.85 | 9.49 | 59.0 |
| stress / market_report | 45.47 | 46.64 | 39.3 |
| stress / imports_warm | 0.93 | 1.14 | 196.3 |
| stress / imports_after_write | 1.42 | 1.49 | 196.3 |

stress idle: 1.63% of one core over 35.0 s; RSS 125.5 MiB; event loop p95 10.26 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

