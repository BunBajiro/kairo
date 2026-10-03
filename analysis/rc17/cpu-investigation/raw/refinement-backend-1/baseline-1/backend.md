# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.11 | 0.6 |
| typical / state | 4.06 | 4.49 | 538.1 |
| typical / journey | 2.04 | 2.60 | 163.7 |
| typical / session | 15.29 | 18.14 | 469.9 |
| typical / market_browse | 2.05 | 2.33 | 58.9 |
| typical / market_report | 6.52 | 8.20 | 39.3 |
| typical / imports_warm | 0.60 | 0.83 | 171.2 |
| typical / imports_after_write | 0.60 | 0.72 | 171.2 |

typical idle: 0.84% of one core over 35.0 s; RSS 159.1 MiB; event loop p95 10.17 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.25 | 0.6 |
| stress / state | 21.73 | 29.93 | 3391.5 |
| stress / journey | 3.51 | 3.72 | 252.3 |
| stress / session | 87.56 | 101.93 | 2777.2 |
| stress / market_browse | 6.64 | 7.04 | 59.0 |
| stress / market_report | 33.26 | 34.36 | 39.3 |
| stress / imports_warm | 0.68 | 1.03 | 196.3 |
| stress / imports_after_write | 0.68 | 0.74 | 196.3 |

stress idle: 1.57% of one core over 35.0 s; RSS 207.9 MiB; event loop p95 10.17 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

