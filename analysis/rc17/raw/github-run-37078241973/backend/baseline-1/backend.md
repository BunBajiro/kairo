# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 2.95 | 3.10 | 538.1 |
| typical / journey | 1.34 | 1.47 | 163.7 |
| typical / session | 10.61 | 14.46 | 469.9 |
| typical / market_browse | 1.50 | 1.60 | 58.9 |
| typical / market_report | 5.63 | 6.23 | 39.3 |
| typical / imports_warm | 0.40 | 0.72 | 171.2 |
| typical / imports_after_write | 0.71 | 0.78 | 171.2 |

typical idle: 0.59% of one core over 35.0 s; RSS 183.9 MiB; event loop p95 10.26 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.07 | 0.11 | 0.6 |
| stress / state | 14.74 | 24.58 | 3391.5 |
| stress / journey | 2.58 | 2.78 | 252.3 |
| stress / session | 61.83 | 89.62 | 2777.2 |
| stress / market_browse | 4.82 | 5.88 | 59.0 |
| stress / market_report | 27.38 | 27.65 | 39.3 |
| stress / imports_warm | 0.74 | 1.03 | 196.3 |
| stress / imports_after_write | 0.76 | 0.87 | 196.3 |

stress idle: 1.21% of one core over 35.0 s; RSS 201.9 MiB; event loop p95 10.26 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

