# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 57c8dcc7fbd8fc2b62129498d1819050c78381a1 (dirty: false). Node v24.19.0; AMD EPYC 9V74 80-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.08 | 0.09 | 0.6 |
| typical / state | 3.88 | 5.20 | 538.1 |
| typical / journey | 2.03 | 2.85 | 163.7 |
| typical / session | 14.62 | 19.67 | 469.9 |
| typical / market_browse | 1.93 | 3.03 | 58.9 |
| typical / market_report | 6.46 | 7.50 | 39.3 |
| typical / imports_warm | 0.54 | 0.77 | 171.2 |
| typical / imports_after_write | 0.56 | 0.65 | 171.2 |

typical idle: 0.85% of one core over 35.0 s; RSS 158.5 MiB; event loop p95 10.17 ms.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| stress / opsec | 0.08 | 0.09 | 0.6 |
| stress / state | 22.69 | 30.30 | 3391.5 |
| stress / journey | 3.85 | 6.69 | 252.3 |
| stress / session | 82.83 | 94.42 | 2777.2 |
| stress / market_browse | 6.33 | 7.08 | 59.0 |
| stress / market_report | 30.75 | 31.43 | 39.3 |
| stress / imports_warm | 0.63 | 0.90 | 196.3 |
| stress / imports_after_write | 0.67 | 0.80 | 196.3 |

stress idle: 1.64% of one core over 35.0 s; RSS 205.9 MiB; event loop p95 10.19 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

