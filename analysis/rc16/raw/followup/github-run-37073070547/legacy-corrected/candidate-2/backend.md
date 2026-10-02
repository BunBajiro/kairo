# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.22 | 0.6 |
| typical / state | 5.40 | 5.94 | 538.1 |
| typical / journey | 2.66 | 4.32 | 163.7 |
| typical / session | 21.60 | 24.44 | 469.9 |
| typical / market_browse | 2.81 | 3.25 | 58.9 |
| typical / market_report | 9.66 | 11.23 | 39.3 |
| typical / imports_warm | 0.79 | 0.98 | 171.2 |
| typical / imports_after_write | 1.13 | 1.79 | 171.2 |

typical idle: 0.75% of one core over 35.0 s; RSS 172.5 MiB; event loop p95 10.17 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.16 | 0.23 | 0.6 |
| stress / state | 26.89 | 30.96 | 3391.5 |
| stress / journey | 4.80 | 4.97 | 252.3 |
| stress / session | 112.74 | 147.54 | 2777.2 |
| stress / market_browse | 8.92 | 14.29 | 59.0 |
| stress / market_report | 45.49 | 46.32 | 39.3 |
| stress / imports_warm | 0.91 | 1.07 | 196.3 |
| stress / imports_after_write | 1.35 | 1.44 | 196.3 |

stress idle: 2.22% of one core over 35.0 s; RSS 222.0 MiB; event loop p95 10.14 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

