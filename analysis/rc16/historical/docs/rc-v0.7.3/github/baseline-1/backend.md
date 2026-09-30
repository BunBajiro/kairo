# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: b151125cd7b26611364923f00683b1c6f1c1bdd6 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 2.32 | 2.38 | 0.6 |
| typical / state | 4.37 | 5.02 | 537.6 |
| typical / journey | 1.70 | 1.83 | 155.5 |
| typical / session | 24.17 | 25.37 | 445.3 |
| typical / market_browse | 1.92 | 2.15 | 58.9 |
| typical / market_report | 7.22 | 7.35 | 39.3 |
| typical / imports_warm | 0.54 | 0.75 | 171.2 |
| typical / imports_after_write | 118.06 | 305.10 | 171.2 |

typical idle: 1.84% of one core over 35.0 s; RSS 117.3 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 9.90 | 10.77 | 0.6 |
| stress / state | 21.07 | 28.01 | 3391.0 |
| stress / journey | 3.41 | 4.21 | 238.6 |
| stress / session | 188.70 | 210.26 | 2613.1 |
| stress / market_browse | 6.12 | 6.38 | 59.0 |
| stress / market_report | 36.21 | 36.74 | 39.3 |
| stress / imports_warm | 0.59 | 0.80 | 196.3 |
| stress / imports_after_write | 450.85 | 833.73 | 196.3 |

stress idle: 14.38% of one core over 35.3 s; RSS 158.5 MiB; event loop p95 10.21 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

