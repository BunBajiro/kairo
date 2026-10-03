# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.19 | 0.6 |
| typical / state | 5.33 | 6.27 | 538.1 |
| typical / journey | 2.35 | 3.09 | 163.7 |
| typical / session | 18.49 | 30.27 | 469.9 |
| typical / market_browse | 2.47 | 2.74 | 58.9 |
| typical / market_report | 9.25 | 9.51 | 39.3 |
| typical / imports_warm | 0.74 | 0.94 | 171.2 |
| typical / imports_after_write | 1.04 | 1.36 | 171.2 |

typical idle: 0.96% of one core over 35.0 s; RSS 177.9 MiB; event loop p95 10.27 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.21 | 0.6 |
| stress / state | 26.68 | 31.70 | 3391.5 |
| stress / journey | 4.44 | 4.55 | 252.3 |
| stress / session | 108.43 | 141.98 | 2777.2 |
| stress / market_browse | 7.88 | 8.11 | 59.0 |
| stress / market_report | 45.30 | 46.14 | 39.3 |
| stress / imports_warm | 0.84 | 1.12 | 196.3 |
| stress / imports_after_write | 1.14 | 1.21 | 196.3 |

stress idle: 2.17% of one core over 35.0 s; RSS 222.4 MiB; event loop p95 10.15 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

