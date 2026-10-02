# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.13 | 0.20 | 0.6 |
| typical / state | 5.28 | 6.20 | 537.6 |
| typical / journey | 2.29 | 2.46 | 155.5 |
| typical / session | 21.15 | 36.91 | 445.3 |
| typical / market_browse | 2.67 | 3.22 | 58.9 |
| typical / market_report | 9.76 | 9.87 | 39.3 |
| typical / imports_warm | 0.84 | 1.12 | 171.2 |
| typical / imports_after_write | 1.32 | 7.88 | 171.2 |

typical idle: 0.63% of one core over 35.0 s; RSS 93.9 MiB; event loop p95 10.34 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.14 | 0.22 | 0.6 |
| stress / state | 27.12 | 39.72 | 3391.0 |
| stress / journey | 5.03 | 5.14 | 238.6 |
| stress / session | 113.70 | 132.62 | 2613.1 |
| stress / market_browse | 9.03 | 9.65 | 59.0 |
| stress / market_report | 45.47 | 46.71 | 39.3 |
| stress / imports_warm | 0.95 | 1.11 | 196.3 |
| stress / imports_after_write | 1.32 | 1.51 | 196.3 |

stress idle: 1.54% of one core over 35.0 s; RSS 126.0 MiB; event loop p95 10.33 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

