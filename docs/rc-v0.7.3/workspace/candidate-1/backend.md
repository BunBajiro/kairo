# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 5a58faff44e6292705550ea5e3994d341b748455 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.21 | 0.6 |
| typical / state | 4.11 | 4.76 | 537.6 |
| typical / journey | 2.05 | 4.14 | 155.5 |
| typical / session | 15.44 | 19.31 | 445.3 |
| typical / market_browse | 2.03 | 2.29 | 58.9 |
| typical / market_report | 6.82 | 7.08 | 39.3 |
| typical / imports_warm | 0.55 | 0.78 | 171.2 |
| typical / imports_after_write | 0.58 | 0.60 | 171.2 |

typical idle: 0.82% of one core over 35.0 s; RSS 68.7 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.11 | 0.6 |
| stress / state | 27.54 | 34.61 | 3391.0 |
| stress / journey | 3.95 | 4.96 | 238.6 |
| stress / session | 94.43 | 106.09 | 2613.1 |
| stress / market_browse | 6.64 | 7.83 | 59.0 |
| stress / market_report | 35.98 | 41.81 | 39.3 |
| stress / imports_warm | 0.74 | 1.07 | 196.3 |
| stress / imports_after_write | 0.77 | 0.93 | 196.3 |

stress idle: 1.57% of one core over 35.0 s; RSS 102.0 MiB; event loop p95 10.22 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

