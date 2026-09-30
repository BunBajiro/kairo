# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: true). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.18 | 0.23 | 0.6 |
| typical / state | 5.27 | 10.06 | 538.1 |
| typical / journey | 2.35 | 2.56 | 163.7 |
| typical / session | 20.94 | 24.22 | 469.9 |
| typical / market_browse | 2.67 | 3.04 | 58.9 |
| typical / market_report | 9.34 | 9.54 | 39.3 |
| typical / imports_warm | 1.25 | 1.48 | 171.2 |
| typical / imports_after_write | 1.68 | 3.48 | 171.2 |

typical idle: 0.82% of one core over 35.0 s; RSS 177.1 MiB; event loop p95 10.18 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.15 | 0.21 | 0.6 |
| stress / state | 27.23 | 53.16 | 3391.5 |
| stress / journey | 4.80 | 4.96 | 252.3 |
| stress / session | 110.14 | 148.12 | 2777.2 |
| stress / market_browse | 8.76 | 9.13 | 59.0 |
| stress / market_report | 45.46 | 46.45 | 39.3 |
| stress / imports_warm | 0.87 | 1.05 | 196.3 |
| stress / imports_after_write | 1.35 | 1.52 | 196.3 |

stress idle: 2.14% of one core over 35.0 s; RSS 192.7 MiB; event loop p95 10.17 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

