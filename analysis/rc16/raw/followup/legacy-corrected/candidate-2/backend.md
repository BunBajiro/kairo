# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.12 | 0.6 |
| typical / state | 3.99 | 5.29 | 538.1 |
| typical / journey | 1.92 | 2.08 | 163.7 |
| typical / session | 14.60 | 21.30 | 469.9 |
| typical / market_browse | 2.07 | 2.73 | 58.9 |
| typical / market_report | 6.36 | 7.66 | 39.3 |
| typical / imports_warm | 0.58 | 0.89 | 171.2 |
| typical / imports_after_write | 0.60 | 0.69 | 171.2 |

typical idle: 0.94% of one core over 35.0 s; RSS 150.8 MiB; event loop p95 10.18 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.10 | 0.37 | 0.6 |
| stress / state | 22.97 | 30.42 | 3391.5 |
| stress / journey | 3.79 | 6.33 | 252.3 |
| stress / session | 95.24 | 105.59 | 2777.2 |
| stress / market_browse | 6.83 | 8.42 | 59.0 |
| stress / market_report | 36.21 | 41.56 | 39.3 |
| stress / imports_warm | 0.75 | 1.10 | 196.3 |
| stress / imports_after_write | 0.73 | 1.29 | 196.3 |

stress idle: 1.67% of one core over 35.0 s; RSS 172.6 MiB; event loop p95 10.22 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

