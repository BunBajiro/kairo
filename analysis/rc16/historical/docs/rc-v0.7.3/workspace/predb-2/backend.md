# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: ff8bbc530ce278a883f8b1831407095a14d3277d (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.11 | 0.6 |
| typical / state | 4.63 | 7.12 | 537.6 |
| typical / journey | 1.89 | 2.00 | 155.5 |
| typical / session | 20.35 | 24.30 | 445.3 |
| typical / market_browse | 2.06 | 2.41 | 58.9 |
| typical / market_report | 7.01 | 8.20 | 39.3 |
| typical / imports_warm | 0.84 | 1.19 | 171.2 |
| typical / imports_after_write | 0.59 | 0.73 | 171.2 |

typical idle: 0.70% of one core over 35.0 s; RSS 68.0 MiB; event loop p95 10.21 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.13 | 0.6 |
| stress / state | 24.55 | 35.93 | 3391.0 |
| stress / journey | 3.81 | 4.61 | 238.6 |
| stress / session | 111.74 | 124.59 | 2613.1 |
| stress / market_browse | 6.66 | 7.32 | 59.0 |
| stress / market_report | 35.28 | 51.25 | 39.3 |
| stress / imports_warm | 0.91 | 1.14 | 196.3 |
| stress / imports_after_write | 0.70 | 0.83 | 196.3 |

stress idle: 1.29% of one core over 35.0 s; RSS 100.7 MiB; event loop p95 10.20 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

