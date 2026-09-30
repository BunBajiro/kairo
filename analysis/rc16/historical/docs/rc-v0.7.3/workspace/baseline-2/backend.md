# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: b151125cd7b26611364923f00683b1c6f1c1bdd6 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 2.50 | 2.94 | 0.6 |
| typical / state | 4.52 | 6.65 | 537.6 |
| typical / journey | 1.90 | 2.08 | 155.5 |
| typical / session | 25.46 | 26.94 | 445.3 |
| typical / market_browse | 1.98 | 2.40 | 58.9 |
| typical / market_report | 6.76 | 7.80 | 39.3 |
| typical / imports_warm | 0.60 | 0.79 | 171.2 |
| typical / imports_after_write | 101.50 | 133.39 | 171.2 |

typical idle: 2.02% of one core over 35.0 s; RSS 88.1 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 10.64 | 13.68 | 0.6 |
| stress / state | 23.77 | 26.44 | 3391.0 |
| stress / journey | 3.53 | 3.83 | 238.6 |
| stress / session | 187.00 | 213.04 | 2613.1 |
| stress / market_browse | 6.55 | 7.74 | 59.0 |
| stress / market_report | 34.46 | 36.55 | 39.3 |
| stress / imports_warm | 0.63 | 0.92 | 196.3 |
| stress / imports_after_write | 453.69 | 1033.19 | 196.3 |

stress idle: 15.62% of one core over 35.3 s; RSS 132.0 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

