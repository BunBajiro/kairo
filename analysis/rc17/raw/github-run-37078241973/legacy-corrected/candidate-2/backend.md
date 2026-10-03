# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 3.02 | 3.48 | 538.1 |
| typical / journey | 1.32 | 1.46 | 163.7 |
| typical / session | 11.86 | 13.94 | 469.9 |
| typical / market_browse | 1.49 | 1.59 | 58.9 |
| typical / market_report | 5.90 | 6.21 | 39.3 |
| typical / imports_warm | 0.75 | 0.95 | 171.2 |
| typical / imports_after_write | 0.75 | 0.97 | 171.2 |

typical idle: 0.86% of one core over 35.0 s; RSS 184.1 MiB; event loop p95 10.26 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.13 | 0.29 | 0.6 |
| stress / state | 16.22 | 28.79 | 3391.5 |
| stress / journey | 2.81 | 2.93 | 252.3 |
| stress / session | 65.68 | 78.43 | 2777.2 |
| stress / market_browse | 4.97 | 5.31 | 59.0 |
| stress / market_report | 28.29 | 29.56 | 39.3 |
| stress / imports_warm | 0.82 | 1.09 | 196.3 |
| stress / imports_after_write | 2.78 | 8.89 | 196.3 |

stress idle: 1.56% of one core over 35.0 s; RSS 202.4 MiB; event loop p95 10.30 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

