# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: ff8bbc530ce278a883f8b1831407095a14d3277d (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.10 | 0.15 | 0.6 |
| typical / state | 4.01 | 4.87 | 537.6 |
| typical / journey | 1.72 | 1.80 | 155.5 |
| typical / session | 18.39 | 26.78 | 445.3 |
| typical / market_browse | 1.88 | 2.12 | 58.9 |
| typical / market_report | 7.18 | 7.40 | 39.3 |
| typical / imports_warm | 0.60 | 0.78 | 171.2 |
| typical / imports_after_write | 1.07 | 92.43 | 171.2 |

typical idle: 0.47% of one core over 35.0 s; RSS 93.5 MiB; event loop p95 10.23 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.11 | 0.17 | 0.6 |
| stress / state | 20.71 | 32.60 | 3391.0 |
| stress / journey | 3.57 | 3.79 | 238.6 |
| stress / session | 109.05 | 119.21 | 2613.1 |
| stress / market_browse | 6.17 | 6.27 | 59.0 |
| stress / market_report | 36.63 | 37.35 | 39.3 |
| stress / imports_warm | 0.67 | 0.91 | 196.3 |
| stress / imports_after_write | 1.06 | 1.22 | 196.3 |

stress idle: 1.25% of one core over 35.0 s; RSS 123.5 MiB; event loop p95 10.21 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

