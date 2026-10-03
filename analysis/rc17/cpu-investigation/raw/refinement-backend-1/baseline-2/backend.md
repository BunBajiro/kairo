# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.39 | 0.6 |
| typical / state | 4.03 | 4.26 | 538.1 |
| typical / journey | 1.81 | 2.06 | 163.7 |
| typical / session | 15.38 | 21.90 | 469.9 |
| typical / market_browse | 2.18 | 4.96 | 58.9 |
| typical / market_report | 6.94 | 7.54 | 39.3 |
| typical / imports_warm | 0.62 | 1.01 | 171.2 |
| typical / imports_after_write | 0.65 | 1.84 | 171.2 |

typical idle: 0.95% of one core over 35.0 s; RSS 158.7 MiB; event loop p95 10.17 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.15 | 0.6 |
| stress / state | 21.63 | 37.93 | 3391.5 |
| stress / journey | 3.50 | 3.74 | 252.3 |
| stress / session | 84.27 | 106.17 | 2777.2 |
| stress / market_browse | 6.41 | 13.08 | 59.0 |
| stress / market_report | 32.64 | 45.56 | 39.3 |
| stress / imports_warm | 0.68 | 1.07 | 196.3 |
| stress / imports_after_write | 0.70 | 0.82 | 196.3 |

stress idle: 1.84% of one core over 35.0 s; RSS 200.4 MiB; event loop p95 10.20 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

