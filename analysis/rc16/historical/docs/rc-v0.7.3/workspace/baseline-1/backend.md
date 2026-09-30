# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: b151125cd7b26611364923f00683b1c6f1c1bdd6 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 2.29 | 3.31 | 0.6 |
| typical / state | 4.40 | 4.73 | 537.6 |
| typical / journey | 1.78 | 2.08 | 155.5 |
| typical / session | 24.83 | 32.73 | 445.3 |
| typical / market_browse | 2.00 | 2.22 | 58.9 |
| typical / market_report | 6.93 | 9.00 | 39.3 |
| typical / imports_warm | 0.60 | 0.72 | 171.2 |
| typical / imports_after_write | 98.45 | 130.89 | 171.2 |

typical idle: 2.30% of one core over 35.0 s; RSS 99.0 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 9.99 | 12.08 | 0.6 |
| stress / state | 21.88 | 26.94 | 3391.0 |
| stress / journey | 3.39 | 3.57 | 238.6 |
| stress / session | 193.77 | 216.93 | 2613.1 |
| stress / market_browse | 8.78 | 14.54 | 59.0 |
| stress / market_report | 38.29 | 41.81 | 39.3 |
| stress / imports_warm | 0.60 | 1.02 | 196.3 |
| stress / imports_after_write | 470.53 | 965.13 | 196.3 |

stress idle: 15.07% of one core over 35.3 s; RSS 131.8 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

