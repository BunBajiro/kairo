# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: null). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 4.11 | 7.37 | 537.6 |
| typical / journey | 1.83 | 2.83 | 155.5 |
| typical / session | 15.03 | 18.67 | 445.3 |
| typical / market_browse | 2.07 | 2.26 | 58.9 |
| typical / market_report | 6.77 | 7.93 | 39.3 |
| typical / imports_warm | 0.64 | 1.01 | 171.2 |
| typical / imports_after_write | 0.58 | 0.69 | 171.2 |

typical idle: 0.60% of one core over 35.0 s; RSS 68.5 MiB; event loop p95 10.21 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.11 | 0.6 |
| stress / state | 23.97 | 27.14 | 3391.0 |
| stress / journey | 3.97 | 4.51 | 238.6 |
| stress / session | 92.61 | 101.83 | 2613.1 |
| stress / market_browse | 6.68 | 7.19 | 59.0 |
| stress / market_report | 33.64 | 35.52 | 39.3 |
| stress / imports_warm | 0.67 | 0.98 | 196.3 |
| stress / imports_after_write | 0.70 | 1.78 | 196.3 |

stress idle: 1.32% of one core over 35.0 s; RSS 82.1 MiB; event loop p95 10.18 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

