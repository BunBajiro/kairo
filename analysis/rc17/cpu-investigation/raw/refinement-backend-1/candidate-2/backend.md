# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: fa6e852b76089b51cd552fa202de85ad6948b0ec (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.19 | 0.6 |
| typical / state | 4.44 | 5.24 | 538.1 |
| typical / journey | 1.84 | 2.22 | 169.0 |
| typical / session | 15.71 | 16.74 | 475.2 |
| typical / market_browse | 2.03 | 2.62 | 58.9 |
| typical / market_report | 6.25 | 6.78 | 39.3 |
| typical / imports_warm | 0.55 | 1.06 | 171.2 |
| typical / imports_after_write | 0.58 | 0.60 | 171.2 |

typical idle: 0.50% of one core over 35.0 s; RSS 151.1 MiB; event loop p95 10.16 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.12 | 0.6 |
| stress / state | 21.25 | 22.91 | 3391.5 |
| stress / journey | 3.67 | 4.66 | 261.1 |
| stress / session | 97.83 | 107.59 | 2812.3 |
| stress / market_browse | 7.04 | 8.32 | 59.0 |
| stress / market_report | 34.10 | 43.00 | 39.3 |
| stress / imports_warm | 0.67 | 0.94 | 196.3 |
| stress / imports_after_write | 0.65 | 0.76 | 196.3 |

stress idle: 1.74% of one core over 35.0 s; RSS 176.0 MiB; event loop p95 10.20 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

