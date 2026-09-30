# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.29 | 0.6 |
| typical / state | 4.08 | 4.43 | 538.1 |
| typical / journey | 1.85 | 2.19 | 163.7 |
| typical / session | 16.79 | 20.22 | 469.9 |
| typical / market_browse | 2.15 | 2.60 | 58.9 |
| typical / market_report | 6.76 | 7.33 | 39.3 |
| typical / imports_warm | 0.66 | 0.91 | 171.2 |
| typical / imports_after_write | 0.62 | 0.75 | 171.2 |

typical idle: 0.83% of one core over 35.0 s; RSS 133.9 MiB; event loop p95 10.19 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.11 | 0.6 |
| stress / state | 21.89 | 27.69 | 3391.5 |
| stress / journey | 3.67 | 3.97 | 252.3 |
| stress / session | 84.87 | 99.98 | 2777.2 |
| stress / market_browse | 6.56 | 6.71 | 59.0 |
| stress / market_report | 35.13 | 44.16 | 39.3 |
| stress / imports_warm | 0.73 | 0.99 | 196.3 |
| stress / imports_after_write | 0.69 | 1.08 | 196.3 |

stress idle: 1.62% of one core over 35.0 s; RSS 170.8 MiB; event loop p95 10.22 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

