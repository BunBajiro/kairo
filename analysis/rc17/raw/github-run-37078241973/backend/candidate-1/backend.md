# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 05d0d4b36c154329006d6772769063db874762da (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 2.85 | 8.15 | 538.1 |
| typical / journey | 1.34 | 1.41 | 169.0 |
| typical / session | 10.42 | 14.29 | 475.2 |
| typical / market_browse | 1.42 | 1.80 | 58.9 |
| typical / market_report | 5.10 | 5.41 | 39.3 |
| typical / imports_warm | 0.38 | 0.61 | 171.2 |
| typical / imports_after_write | 0.69 | 0.95 | 171.2 |

typical idle: 0.68% of one core over 35.0 s; RSS 183.8 MiB; event loop p95 10.25 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.11 | 0.6 |
| stress / state | 15.38 | 19.58 | 3391.5 |
| stress / journey | 2.82 | 3.05 | 261.1 |
| stress / session | 66.66 | 95.26 | 2812.3 |
| stress / market_browse | 4.81 | 4.95 | 59.0 |
| stress / market_report | 28.10 | 28.46 | 39.3 |
| stress / imports_warm | 0.47 | 0.82 | 196.3 |
| stress / imports_after_write | 0.78 | 0.93 | 196.3 |

stress idle: 1.43% of one core over 35.0 s; RSS 222.0 MiB; event loop p95 10.28 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

