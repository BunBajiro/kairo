# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: ff8bbc530ce278a883f8b1831407095a14d3277d (dirty: true). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.22 | 0.6 |
| typical / state | 4.07 | 5.19 | 537.6 |
| typical / journey | 1.83 | 2.05 | 155.5 |
| typical / session | 18.06 | 20.35 | 445.3 |
| typical / market_browse | 2.06 | 2.65 | 58.9 |
| typical / market_report | 6.76 | 7.27 | 39.3 |
| typical / imports_warm | 0.58 | 0.82 | 171.2 |
| typical / imports_after_write | 0.60 | 0.73 | 171.2 |

typical idle: 1.09% of one core over 35.0 s; RSS 68.2 MiB; event loop p95 10.28 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.16 | 0.6 |
| stress / state | 22.76 | 26.19 | 3391.0 |
| stress / journey | 3.82 | 4.57 | 238.6 |
| stress / session | 109.05 | 117.09 | 2613.1 |
| stress / market_browse | 6.36 | 6.98 | 59.0 |
| stress / market_report | 34.84 | 36.56 | 39.3 |
| stress / imports_warm | 0.67 | 1.05 | 196.3 |
| stress / imports_after_write | 0.68 | 0.73 | 196.3 |

stress idle: 1.57% of one core over 35.0 s; RSS 101.8 MiB; event loop p95 10.22 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

