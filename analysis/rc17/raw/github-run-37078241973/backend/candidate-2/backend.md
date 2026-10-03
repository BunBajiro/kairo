# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 05d0d4b36c154329006d6772769063db874762da (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 2.84 | 3.06 | 538.1 |
| typical / journey | 1.33 | 1.57 | 169.0 |
| typical / session | 11.18 | 15.78 | 475.2 |
| typical / market_browse | 1.48 | 1.62 | 58.9 |
| typical / market_report | 5.60 | 5.91 | 39.3 |
| typical / imports_warm | 0.39 | 0.66 | 171.2 |
| typical / imports_after_write | 0.71 | 0.77 | 171.2 |

typical idle: 0.88% of one core over 35.0 s; RSS 184.0 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.12 | 0.6 |
| stress / state | 15.73 | 21.59 | 3391.5 |
| stress / journey | 2.63 | 2.76 | 261.1 |
| stress / session | 65.10 | 121.22 | 2812.3 |
| stress / market_browse | 4.75 | 5.55 | 59.0 |
| stress / market_report | 27.77 | 28.63 | 39.3 |
| stress / imports_warm | 0.79 | 1.11 | 196.3 |
| stress / imports_after_write | 0.89 | 1.18 | 196.3 |

stress idle: 1.45% of one core over 35.0 s; RSS 203.8 MiB; event loop p95 10.26 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

