# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: b151125cd7b26611364923f00683b1c6f1c1bdd6 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 2.34 | 2.39 | 0.6 |
| typical / state | 4.30 | 4.65 | 537.6 |
| typical / journey | 1.72 | 1.93 | 155.5 |
| typical / session | 24.41 | 25.61 | 445.3 |
| typical / market_browse | 1.90 | 2.14 | 58.9 |
| typical / market_report | 7.24 | 7.42 | 39.3 |
| typical / imports_warm | 0.55 | 0.77 | 171.2 |
| typical / imports_after_write | 112.20 | 156.60 | 171.2 |

typical idle: 1.85% of one core over 35.0 s; RSS 117.0 MiB; event loop p95 10.21 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 9.63 | 12.87 | 0.6 |
| stress / state | 21.24 | 27.45 | 3391.0 |
| stress / journey | 3.39 | 3.50 | 238.6 |
| stress / session | 174.26 | 208.75 | 2613.1 |
| stress / market_browse | 6.11 | 6.23 | 59.0 |
| stress / market_report | 36.67 | 37.07 | 39.3 |
| stress / imports_warm | 0.61 | 0.92 | 196.3 |
| stress / imports_after_write | 447.90 | 828.50 | 196.3 |

stress idle: 14.40% of one core over 35.3 s; RSS 175.4 MiB; event loop p95 10.22 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

