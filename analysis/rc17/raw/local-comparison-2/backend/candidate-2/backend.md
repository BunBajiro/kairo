# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 059b95909dffa82f8b10dfd266954323147d7580 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.12 | 0.6 |
| typical / state | 3.91 | 4.36 | 538.1 |
| typical / journey | 1.81 | 2.17 | 169.0 |
| typical / session | 15.38 | 19.32 | 475.2 |
| typical / market_browse | 1.96 | 2.24 | 58.9 |
| typical / market_report | 6.57 | 7.10 | 39.3 |
| typical / imports_warm | 0.53 | 0.77 | 171.2 |
| typical / imports_after_write | 0.56 | 0.65 | 171.2 |

typical idle: 0.93% of one core over 35.0 s; RSS 162.5 MiB; event loop p95 10.21 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.10 | 0.6 |
| stress / state | 21.36 | 25.66 | 3391.5 |
| stress / journey | 3.68 | 4.30 | 261.1 |
| stress / session | 88.88 | 99.06 | 2812.3 |
| stress / market_browse | 6.39 | 6.69 | 59.0 |
| stress / market_report | 33.09 | 35.54 | 39.3 |
| stress / imports_warm | 0.66 | 0.87 | 196.3 |
| stress / imports_after_write | 0.72 | 0.78 | 196.3 |

stress idle: 1.67% of one core over 35.0 s; RSS 212.6 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

