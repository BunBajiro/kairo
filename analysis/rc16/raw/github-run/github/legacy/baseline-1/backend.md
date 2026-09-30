# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.22 | 0.6 |
| typical / state | 5.46 | 6.52 | 537.6 |
| typical / journey | 2.41 | 2.59 | 155.5 |
| typical / session | 21.18 | 33.00 | 445.3 |
| typical / market_browse | 2.72 | 3.11 | 58.9 |
| typical / market_report | 10.08 | 10.45 | 39.3 |
| typical / imports_warm | 0.87 | 1.15 | 171.2 |
| typical / imports_after_write | 1.31 | 1.72 | 171.2 |

typical idle: 0.84% of one core over 35.0 s; RSS 93.2 MiB; event loop p95 10.33 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.24 | 0.6 |
| stress / state | 27.17 | 40.14 | 3391.0 |
| stress / journey | 5.18 | 5.37 | 238.6 |
| stress / session | 118.04 | 133.98 | 2613.1 |
| stress / market_browse | 8.87 | 9.27 | 59.0 |
| stress / market_report | 45.51 | 46.29 | 39.3 |
| stress / imports_warm | 0.92 | 1.19 | 196.3 |
| stress / imports_after_write | 1.31 | 1.46 | 196.3 |

stress idle: 1.72% of one core over 35.0 s; RSS 107.4 MiB; event loop p95 10.23 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

