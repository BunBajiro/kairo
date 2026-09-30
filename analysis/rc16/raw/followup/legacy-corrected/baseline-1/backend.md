# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: null). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.13 | 0.6 |
| typical / state | 4.28 | 5.83 | 537.6 |
| typical / journey | 2.00 | 3.44 | 155.5 |
| typical / session | 15.51 | 18.91 | 445.3 |
| typical / market_browse | 2.08 | 2.74 | 58.9 |
| typical / market_report | 6.68 | 7.99 | 39.3 |
| typical / imports_warm | 0.63 | 0.79 | 171.2 |
| typical / imports_after_write | 0.61 | 0.75 | 171.2 |

typical idle: 0.64% of one core over 35.0 s; RSS 68.5 MiB; event loop p95 10.23 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.16 | 0.6 |
| stress / state | 28.36 | 32.41 | 3391.0 |
| stress / journey | 4.63 | 5.64 | 238.6 |
| stress / session | 90.28 | 139.42 | 2613.1 |
| stress / market_browse | 6.92 | 9.44 | 59.0 |
| stress / market_report | 37.20 | 43.52 | 39.3 |
| stress / imports_warm | 0.71 | 1.11 | 196.3 |
| stress / imports_after_write | 0.75 | 1.10 | 196.3 |

stress idle: 1.55% of one core over 35.0 s; RSS 101.7 MiB; event loop p95 10.29 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

