# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 5a58faff44e6292705550ea5e3994d341b748455 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.12 | 0.6 |
| typical / state | 4.08 | 5.28 | 537.6 |
| typical / journey | 1.87 | 2.14 | 155.5 |
| typical / session | 16.33 | 33.52 | 445.3 |
| typical / market_browse | 2.00 | 2.32 | 58.9 |
| typical / market_report | 7.19 | 13.27 | 39.3 |
| typical / imports_warm | 0.56 | 0.81 | 171.2 |
| typical / imports_after_write | 0.61 | 0.93 | 171.2 |

typical idle: 0.74% of one core over 35.0 s; RSS 68.5 MiB; event loop p95 10.25 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.16 | 0.6 |
| stress / state | 23.81 | 33.07 | 3391.0 |
| stress / journey | 3.91 | 4.61 | 238.6 |
| stress / session | 93.48 | 98.56 | 2613.1 |
| stress / market_browse | 6.45 | 6.90 | 59.0 |
| stress / market_report | 35.28 | 38.76 | 39.3 |
| stress / imports_warm | 0.73 | 0.91 | 196.3 |
| stress / imports_after_write | 0.67 | 0.76 | 196.3 |

stress idle: 1.45% of one core over 35.0 s; RSS 101.2 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

