# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 5a58faff44e6292705550ea5e3994d341b748455 (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.10 | 0.15 | 0.6 |
| typical / state | 3.98 | 5.22 | 537.6 |
| typical / journey | 1.77 | 1.85 | 155.5 |
| typical / session | 15.51 | 25.10 | 445.3 |
| typical / market_browse | 1.99 | 2.69 | 58.9 |
| typical / market_report | 7.17 | 7.37 | 39.3 |
| typical / imports_warm | 0.59 | 0.79 | 171.2 |
| typical / imports_after_write | 0.99 | 1.78 | 171.2 |

typical idle: 0.46% of one core over 35.0 s; RSS 93.3 MiB; event loop p95 10.22 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.11 | 0.19 | 0.6 |
| stress / state | 20.99 | 33.20 | 3391.0 |
| stress / journey | 3.61 | 3.83 | 238.6 |
| stress / session | 87.54 | 100.22 | 2613.1 |
| stress / market_browse | 6.21 | 6.32 | 59.0 |
| stress / market_report | 37.57 | 38.82 | 39.3 |
| stress / imports_warm | 1.05 | 1.29 | 196.3 |
| stress / imports_after_write | 1.09 | 1.16 | 196.3 |

stress idle: 1.24% of one core over 35.0 s; RSS 122.3 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

