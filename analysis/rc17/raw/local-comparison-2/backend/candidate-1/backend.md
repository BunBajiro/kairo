# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 059b95909dffa82f8b10dfd266954323147d7580 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.30 | 0.6 |
| typical / state | 4.33 | 7.56 | 538.1 |
| typical / journey | 2.08 | 4.21 | 169.0 |
| typical / session | 16.70 | 21.06 | 475.2 |
| typical / market_browse | 2.22 | 2.94 | 58.9 |
| typical / market_report | 6.92 | 7.52 | 39.3 |
| typical / imports_warm | 0.55 | 0.87 | 171.2 |
| typical / imports_after_write | 0.59 | 0.68 | 171.2 |

typical idle: 0.65% of one core over 35.0 s; RSS 153.1 MiB; event loop p95 10.18 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.20 | 0.6 |
| stress / state | 21.12 | 27.90 | 3391.5 |
| stress / journey | 5.22 | 16.12 | 261.1 |
| stress / session | 93.65 | 107.92 | 2812.3 |
| stress / market_browse | 6.59 | 7.12 | 59.0 |
| stress / market_report | 32.48 | 32.86 | 39.3 |
| stress / imports_warm | 0.68 | 0.97 | 196.3 |
| stress / imports_after_write | 0.70 | 0.80 | 196.3 |

stress idle: 1.73% of one core over 35.0 s; RSS 181.2 MiB; event loop p95 10.18 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

