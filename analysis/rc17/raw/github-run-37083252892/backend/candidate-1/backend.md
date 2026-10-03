# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: fa6e852b76089b51cd552fa202de85ad6948b0ec (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.16 | 0.24 | 0.6 |
| typical / state | 5.74 | 8.42 | 538.1 |
| typical / journey | 4.06 | 4.16 | 169.0 |
| typical / session | 20.44 | 21.62 | 475.2 |
| typical / market_browse | 2.70 | 2.98 | 58.9 |
| typical / market_report | 9.48 | 9.59 | 39.3 |
| typical / imports_warm | 0.75 | 0.93 | 171.2 |
| typical / imports_after_write | 1.03 | 1.17 | 171.2 |

typical idle: 0.53% of one core over 35.0 s; RSS 173.0 MiB; event loop p95 10.31 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.21 | 0.6 |
| stress / state | 28.06 | 34.27 | 3391.5 |
| stress / journey | 4.61 | 4.76 | 261.1 |
| stress / session | 110.91 | 144.73 | 2812.3 |
| stress / market_browse | 8.01 | 8.23 | 59.0 |
| stress / market_report | 45.15 | 45.67 | 39.3 |
| stress / imports_warm | 0.83 | 1.09 | 196.3 |
| stress / imports_after_write | 1.14 | 1.26 | 196.3 |

stress idle: 1.84% of one core over 35.0 s; RSS 202.1 MiB; event loop p95 10.31 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

