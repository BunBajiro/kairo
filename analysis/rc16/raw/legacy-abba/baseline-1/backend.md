# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: null). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.09 | 0.6 |
| typical / state | 3.99 | 4.92 | 537.6 |
| typical / journey | 1.84 | 2.34 | 155.5 |
| typical / session | 15.03 | 18.64 | 445.3 |
| typical / market_browse | 1.97 | 2.49 | 58.9 |
| typical / market_report | 6.56 | 6.99 | 39.3 |
| typical / imports_warm | 0.56 | 0.80 | 171.2 |
| typical / imports_after_write | 0.58 | 0.66 | 171.2 |

typical idle: 0.58% of one core over 35.0 s; RSS 68.8 MiB; event loop p95 10.20 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.11 | 0.6 |
| stress / state | 22.92 | 29.50 | 3391.0 |
| stress / journey | 3.72 | 4.05 | 238.6 |
| stress / session | 99.51 | 106.25 | 2613.1 |
| stress / market_browse | 7.16 | 9.35 | 59.0 |
| stress / market_report | 36.55 | 39.52 | 39.3 |
| stress / imports_warm | 0.69 | 0.93 | 196.3 |
| stress / imports_after_write | 0.70 | 0.82 | 196.3 |

stress idle: 1.35% of one core over 35.0 s; RSS 101.4 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

