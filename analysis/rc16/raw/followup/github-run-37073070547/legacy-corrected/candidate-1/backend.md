# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.19 | 0.6 |
| typical / state | 5.29 | 6.34 | 538.1 |
| typical / journey | 2.37 | 3.37 | 163.7 |
| typical / session | 20.10 | 33.82 | 469.9 |
| typical / market_browse | 2.70 | 3.09 | 58.9 |
| typical / market_report | 9.59 | 9.82 | 39.3 |
| typical / imports_warm | 0.82 | 0.97 | 171.2 |
| typical / imports_after_write | 1.13 | 1.27 | 171.2 |

typical idle: 1.04% of one core over 35.0 s; RSS 177.9 MiB; event loop p95 10.34 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.23 | 0.6 |
| stress / state | 26.35 | 30.75 | 3391.5 |
| stress / journey | 4.82 | 5.03 | 252.3 |
| stress / session | 113.26 | 149.47 | 2777.2 |
| stress / market_browse | 9.00 | 9.78 | 59.0 |
| stress / market_report | 45.65 | 46.08 | 39.3 |
| stress / imports_warm | 1.51 | 1.63 | 196.3 |
| stress / imports_after_write | 1.37 | 1.66 | 196.3 |

stress idle: 2.26% of one core over 35.0 s; RSS 222.1 MiB; event loop p95 10.23 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

