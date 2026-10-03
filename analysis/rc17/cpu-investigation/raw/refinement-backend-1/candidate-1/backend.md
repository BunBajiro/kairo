# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: fa6e852b76089b51cd552fa202de85ad6948b0ec (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.09 | 0.17 | 0.6 |
| typical / state | 4.41 | 6.35 | 538.1 |
| typical / journey | 1.83 | 1.93 | 169.0 |
| typical / session | 15.61 | 16.28 | 475.2 |
| typical / market_browse | 2.05 | 2.34 | 58.9 |
| typical / market_report | 6.72 | 9.06 | 39.3 |
| typical / imports_warm | 0.55 | 0.79 | 171.2 |
| typical / imports_after_write | 0.58 | 0.60 | 171.2 |

typical idle: 0.64% of one core over 35.0 s; RSS 150.4 MiB; event loop p95 10.21 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.12 | 0.6 |
| stress / state | 22.03 | 22.54 | 3391.5 |
| stress / journey | 3.69 | 3.96 | 261.1 |
| stress / session | 88.59 | 97.71 | 2812.3 |
| stress / market_browse | 6.46 | 6.54 | 59.0 |
| stress / market_report | 33.56 | 35.61 | 39.3 |
| stress / imports_warm | 0.64 | 0.99 | 196.3 |
| stress / imports_after_write | 0.67 | 0.69 | 196.3 |

stress idle: 1.57% of one core over 35.0 s; RSS 180.4 MiB; event loop p95 10.17 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

