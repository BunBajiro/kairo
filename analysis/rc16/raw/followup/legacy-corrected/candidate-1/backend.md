# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.11 | 0.6 |
| typical / state | 4.51 | 5.97 | 538.1 |
| typical / journey | 1.91 | 2.64 | 163.7 |
| typical / session | 15.49 | 16.07 | 469.9 |
| typical / market_browse | 2.00 | 5.20 | 58.9 |
| typical / market_report | 6.45 | 6.75 | 39.3 |
| typical / imports_warm | 0.65 | 0.91 | 171.2 |
| typical / imports_after_write | 0.65 | 1.08 | 171.2 |

typical idle: 0.98% of one core over 35.0 s; RSS 144.5 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.09 | 0.29 | 0.6 |
| stress / state | 22.18 | 34.01 | 3391.5 |
| stress / journey | 3.56 | 3.86 | 252.3 |
| stress / session | 86.74 | 97.86 | 2777.2 |
| stress / market_browse | 6.57 | 6.88 | 59.0 |
| stress / market_report | 33.86 | 43.44 | 39.3 |
| stress / imports_warm | 0.74 | 1.22 | 196.3 |
| stress / imports_after_write | 0.73 | 1.04 | 196.3 |

stress idle: 1.66% of one core over 35.0 s; RSS 171.9 MiB; event loop p95 10.23 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

