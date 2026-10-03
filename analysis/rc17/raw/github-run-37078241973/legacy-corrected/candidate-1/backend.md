# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V45 96-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.07 | 0.10 | 0.6 |
| typical / state | 2.98 | 3.41 | 538.1 |
| typical / journey | 1.34 | 1.46 | 163.7 |
| typical / session | 11.74 | 17.05 | 469.9 |
| typical / market_browse | 1.53 | 1.92 | 58.9 |
| typical / market_report | 5.77 | 5.96 | 39.3 |
| typical / imports_warm | 0.40 | 0.62 | 171.2 |
| typical / imports_after_write | 0.79 | 0.88 | 171.2 |

typical idle: 0.91% of one core over 35.0 s; RSS 184.4 MiB; event loop p95 10.18 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.11 | 0.6 |
| stress / state | 15.78 | 35.83 | 3391.5 |
| stress / journey | 2.70 | 2.84 | 252.3 |
| stress / session | 66.57 | 93.84 | 2777.2 |
| stress / market_browse | 4.86 | 5.09 | 59.0 |
| stress / market_report | 28.28 | 28.77 | 39.3 |
| stress / imports_warm | 0.80 | 1.19 | 196.3 |
| stress / imports_after_write | 0.76 | 0.92 | 196.3 |

stress idle: 1.54% of one core over 35.0 s; RSS 203.7 MiB; event loop p95 10.29 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

