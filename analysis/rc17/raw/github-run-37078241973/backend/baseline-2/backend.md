# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.06 | 0.13 | 0.6 |
| typical / state | 2.92 | 3.18 | 538.1 |
| typical / journey | 1.28 | 1.35 | 163.7 |
| typical / session | 9.94 | 13.69 | 469.9 |
| typical / market_browse | 1.42 | 1.55 | 58.9 |
| typical / market_report | 5.27 | 5.45 | 39.3 |
| typical / imports_warm | 0.38 | 0.59 | 171.2 |
| typical / imports_after_write | 0.69 | 0.78 | 171.2 |

typical idle: 0.63% of one core over 35.0 s; RSS 183.7 MiB; event loop p95 10.26 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.07 | 0.11 | 0.6 |
| stress / state | 14.19 | 18.80 | 3391.5 |
| stress / journey | 2.46 | 2.60 | 252.3 |
| stress / session | 58.25 | 86.26 | 2777.2 |
| stress / market_browse | 4.67 | 4.83 | 59.0 |
| stress / market_report | 26.36 | 26.79 | 39.3 |
| stress / imports_warm | 0.44 | 0.96 | 196.3 |
| stress / imports_after_write | 0.78 | 1.01 | 196.3 |

stress idle: 1.21% of one core over 35.0 s; RSS 223.8 MiB; event loop p95 10.17 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

