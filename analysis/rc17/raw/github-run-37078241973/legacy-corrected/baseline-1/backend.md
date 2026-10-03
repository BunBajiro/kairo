# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.11 | 0.6 |
| typical / state | 2.94 | 3.86 | 537.6 |
| typical / journey | 1.32 | 1.48 | 155.5 |
| typical / session | 12.15 | 21.11 | 445.3 |
| typical / market_browse | 1.50 | 1.61 | 58.9 |
| typical / market_report | 5.95 | 6.63 | 39.3 |
| typical / imports_warm | 0.43 | 0.73 | 171.2 |
| typical / imports_after_write | 0.76 | 1.06 | 171.2 |

typical idle: 0.58% of one core over 35.0 s; RSS 94.1 MiB; event loop p95 10.24 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.07 | 0.12 | 0.6 |
| stress / state | 15.34 | 21.76 | 3391.0 |
| stress / journey | 2.63 | 2.91 | 238.6 |
| stress / session | 64.59 | 72.46 | 2613.1 |
| stress / market_browse | 4.86 | 5.93 | 59.0 |
| stress / market_report | 28.20 | 30.22 | 39.3 |
| stress / imports_warm | 0.85 | 1.13 | 196.3 |
| stress / imports_after_write | 1.14 | 1.23 | 196.3 |

stress idle: 1.12% of one core over 35.0 s; RSS 125.4 MiB; event loop p95 10.30 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

