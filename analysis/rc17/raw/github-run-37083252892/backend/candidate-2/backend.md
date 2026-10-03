# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: fa6e852b76089b51cd552fa202de85ad6948b0ec (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.23 | 0.6 |
| typical / state | 5.36 | 6.25 | 538.1 |
| typical / journey | 2.37 | 2.56 | 169.0 |
| typical / session | 20.32 | 33.39 | 475.2 |
| typical / market_browse | 2.44 | 2.83 | 58.9 |
| typical / market_report | 9.32 | 9.58 | 39.3 |
| typical / imports_warm | 0.75 | 0.97 | 171.2 |
| typical / imports_after_write | 1.10 | 1.20 | 171.2 |

typical idle: 0.75% of one core over 35.0 s; RSS 159.0 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.22 | 0.6 |
| stress / state | 26.84 | 43.59 | 3391.5 |
| stress / journey | 4.62 | 5.06 | 261.1 |
| stress / session | 115.55 | 148.72 | 2812.3 |
| stress / market_browse | 7.87 | 8.31 | 59.0 |
| stress / market_report | 45.10 | 45.89 | 39.3 |
| stress / imports_warm | 1.35 | 1.57 | 196.3 |
| stress / imports_after_write | 1.14 | 1.25 | 196.3 |

stress idle: 1.75% of one core over 35.0 s; RSS 189.5 MiB; event loop p95 10.27 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

