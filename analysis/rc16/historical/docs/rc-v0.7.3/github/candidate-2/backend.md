# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 5a58faff44e6292705550ea5e3994d341b748455 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.10 | 0.16 | 0.6 |
| typical / state | 4.05 | 4.91 | 537.6 |
| typical / journey | 1.72 | 1.82 | 155.5 |
| typical / session | 15.00 | 23.51 | 445.3 |
| typical / market_browse | 1.93 | 2.13 | 58.9 |
| typical / market_report | 7.11 | 7.31 | 39.3 |
| typical / imports_warm | 0.59 | 0.78 | 171.2 |
| typical / imports_after_write | 1.01 | 1.37 | 171.2 |

typical idle: 0.47% of one core over 35.0 s; RSS 93.7 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.11 | 0.18 | 0.6 |
| stress / state | 20.49 | 32.15 | 3391.0 |
| stress / journey | 3.59 | 3.78 | 238.6 |
| stress / session | 87.30 | 98.02 | 2613.1 |
| stress / market_browse | 6.13 | 6.37 | 59.0 |
| stress / market_report | 35.99 | 37.00 | 39.3 |
| stress / imports_warm | 0.68 | 0.86 | 196.3 |
| stress / imports_after_write | 1.07 | 1.11 | 196.3 |

stress idle: 1.23% of one core over 35.0 s; RSS 121.9 MiB; event loop p95 10.22 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

