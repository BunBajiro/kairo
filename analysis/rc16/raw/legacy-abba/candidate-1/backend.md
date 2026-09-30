# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.15 | 0.6 |
| typical / state | 4.61 | 5.09 | 538.1 |
| typical / journey | 1.87 | 2.03 | 163.7 |
| typical / session | 16.46 | 25.97 | 469.9 |
| typical / market_browse | 2.07 | 3.78 | 58.9 |
| typical / market_report | 6.89 | 10.43 | 39.3 |
| typical / imports_warm | 0.63 | 0.80 | 171.2 |
| typical / imports_after_write | 0.61 | 0.88 | 171.2 |

typical idle: 0.72% of one core over 35.0 s; RSS 148.1 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.19 | 0.6 |
| stress / state | 25.60 | 31.13 | 3391.5 |
| stress / journey | 3.84 | 4.60 | 252.3 |
| stress / session | 90.34 | 103.43 | 2777.2 |
| stress / market_browse | 6.65 | 7.36 | 59.0 |
| stress / market_report | 33.87 | 37.34 | 39.3 |
| stress / imports_warm | 1.10 | 1.38 | 196.3 |
| stress / imports_after_write | 0.71 | 0.80 | 196.3 |

stress idle: 1.64% of one core over 35.0 s; RSS 167.9 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

