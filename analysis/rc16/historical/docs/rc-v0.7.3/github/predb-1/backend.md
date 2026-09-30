# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: ff8bbc530ce278a883f8b1831407095a14d3277d (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.10 | 0.15 | 0.6 |
| typical / state | 4.02 | 5.08 | 537.6 |
| typical / journey | 1.70 | 1.79 | 155.5 |
| typical / session | 18.19 | 26.23 | 445.3 |
| typical / market_browse | 1.89 | 2.11 | 58.9 |
| typical / market_report | 7.12 | 7.33 | 39.3 |
| typical / imports_warm | 0.59 | 0.79 | 171.2 |
| typical / imports_after_write | 1.01 | 1.45 | 171.2 |

typical idle: 0.46% of one core over 35.0 s; RSS 93.3 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.12 | 0.17 | 0.6 |
| stress / state | 21.18 | 30.83 | 3391.0 |
| stress / journey | 3.48 | 3.82 | 238.6 |
| stress / session | 107.56 | 118.02 | 2613.1 |
| stress / market_browse | 6.12 | 6.30 | 59.0 |
| stress / market_report | 36.32 | 36.88 | 39.3 |
| stress / imports_warm | 0.67 | 0.90 | 196.3 |
| stress / imports_after_write | 1.14 | 1.38 | 196.3 |

stress idle: 1.26% of one core over 35.0 s; RSS 121.2 MiB; event loop p95 10.29 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

