# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 3.91 | 4.18 | 538.1 |
| typical / journey | 1.81 | 1.99 | 163.7 |
| typical / session | 15.33 | 19.07 | 469.9 |
| typical / market_browse | 2.08 | 2.29 | 58.9 |
| typical / market_report | 6.44 | 6.92 | 39.3 |
| typical / imports_warm | 0.55 | 0.80 | 171.2 |
| typical / imports_after_write | 0.59 | 0.61 | 171.2 |

typical idle: 0.60% of one core over 35.0 s; RSS 151.5 MiB; event loop p95 10.17 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.19 | 0.6 |
| stress / state | 22.09 | 26.63 | 3391.5 |
| stress / journey | 3.52 | 3.86 | 252.3 |
| stress / session | 81.75 | 90.23 | 2777.2 |
| stress / market_browse | 6.35 | 6.79 | 59.0 |
| stress / market_report | 31.07 | 35.29 | 39.3 |
| stress / imports_warm | 0.65 | 0.86 | 196.3 |
| stress / imports_after_write | 0.66 | 0.75 | 196.3 |

stress idle: 1.66% of one core over 35.0 s; RSS 207.6 MiB; event loop p95 10.18 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

