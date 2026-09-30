# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: null). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.20 | 0.6 |
| typical / state | 5.35 | 6.65 | 537.6 |
| typical / journey | 2.42 | 4.31 | 155.5 |
| typical / session | 16.81 | 21.29 | 445.3 |
| typical / market_browse | 2.23 | 2.86 | 58.9 |
| typical / market_report | 8.75 | 11.82 | 39.3 |
| typical / imports_warm | 0.66 | 1.02 | 171.2 |
| typical / imports_after_write | 0.66 | 0.91 | 171.2 |

typical idle: 0.92% of one core over 35.0 s; RSS 69.0 MiB; event loop p95 10.30 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.19 | 0.6 |
| stress / state | 25.41 | 33.24 | 3391.0 |
| stress / journey | 3.88 | 4.06 | 238.6 |
| stress / session | 103.56 | 111.63 | 2613.1 |
| stress / market_browse | 6.98 | 10.01 | 59.0 |
| stress / market_report | 36.25 | 46.76 | 39.3 |
| stress / imports_warm | 0.77 | 1.25 | 196.3 |
| stress / imports_after_write | 0.72 | 1.17 | 196.3 |

stress idle: 1.36% of one core over 35.0 s; RSS 101.6 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

