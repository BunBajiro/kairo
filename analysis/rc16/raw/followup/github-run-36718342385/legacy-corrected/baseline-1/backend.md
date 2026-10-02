# Kairo backend performance

Synthetic data; Node CPU is expressed as a percentage of one logical core.

Commit: 239794774320fcdebaa1d76ce8a77c5c25cfc48c (dirty: false). Node v24.19.0; AMD EPYC 7763 64-Core Processor.

| Profile / operation | p50 ms | p95 ms | Response KiB |
|---|---:|---:|---:|
| typical / opsec | 0.14 | 0.21 | 0.6 |
| typical / state | 5.46 | 6.48 | 537.6 |
| typical / journey | 2.37 | 2.54 | 155.5 |
| typical / session | 21.14 | 32.01 | 445.3 |
| typical / market_browse | 2.60 | 3.02 | 58.9 |
| typical / market_report | 9.41 | 9.69 | 39.3 |
| typical / imports_warm | 0.87 | 1.04 | 171.2 |
| typical / imports_after_write | 1.20 | 1.30 | 171.2 |

typical idle: 0.81% of one core over 35.0 s; RSS 94.0 MiB; event loop p95 10.34 ms.


Elapsed timings are observations, not portable hardware budgets. RSS is process memory, not a leak diagnosis. Raw samples and workload sizes are in the JSON.

