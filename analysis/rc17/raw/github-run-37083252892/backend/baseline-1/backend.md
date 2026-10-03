# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.20 | 0.6 |
| typical / state | 5.36 | 6.25 | 538.1 |
| typical / journey | 2.28 | 3.12 | 163.7 |
| typical / session | 19.12 | 31.64 | 469.9 |
| typical / market_browse | 2.44 | 2.99 | 58.9 |
| typical / market_report | 9.45 | 10.16 | 39.3 |
| typical / imports_warm | 0.74 | 1.04 | 171.2 |
| typical / imports_after_write | 1.06 | 1.14 | 171.2 |

typical idle: 0.95% of one core over 35.0 s; RSS 169.8 MiB; event loop p95 10.25 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.14 | 0.21 | 0.6 |
| stress / state | 26.49 | 30.40 | 3391.5 |
| stress / journey | 4.42 | 4.52 | 252.3 |
| stress / session | 105.61 | 140.91 | 2777.2 |
| stress / market_browse | 7.91 | 8.45 | 59.0 |
| stress / market_report | 44.94 | 45.81 | 39.3 |
| stress / imports_warm | 1.36 | 1.59 | 196.3 |
| stress / imports_after_write | 1.64 | 1.91 | 196.3 |

stress idle: 2.16% of one core over 35.0 s; RSS 222.8 MiB; event loop p95 10.23 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

