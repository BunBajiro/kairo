# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.15 | 0.25 | 0.6 |
| typical / state | 8.64 | 9.17 | 538.1 |
| typical / journey | 2.39 | 2.56 | 163.7 |
| typical / session | 21.14 | 22.00 | 469.9 |
| typical / market_browse | 2.88 | 3.09 | 58.9 |
| typical / market_report | 9.68 | 10.02 | 39.3 |
| typical / imports_warm | 0.76 | 0.92 | 171.2 |
| typical / imports_after_write | 1.10 | 1.15 | 171.2 |

typical idle: 0.86% of one core over 35.0 s; RSS 176.6 MiB; event loop p95 10.35 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.22 | 0.6 |
| stress / state | 28.22 | 45.20 | 3391.5 |
| stress / journey | 4.87 | 5.21 | 252.3 |
| stress / session | 111.80 | 152.30 | 2777.2 |
| stress / market_browse | 8.85 | 9.23 | 59.0 |
| stress / market_report | 46.03 | 46.61 | 39.3 |
| stress / imports_warm | 0.92 | 1.07 | 196.3 |
| stress / imports_after_write | 1.25 | 2.26 | 196.3 |

stress idle: 2.15% of one core over 35.0 s; RSS 193.6 MiB; event loop p95 10.35 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

