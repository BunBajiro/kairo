# Mixed operational workload

Protocol clients only. These are instrumented 28-second synthetic windows; all request counts and safety observations passed.

| Window | Core CPU % | Server loop max ms | Common dashboard p50 / p95 ms | Common stream p95 ms | Navigation p50 ms | Unchanged stream states |
|---|---:|---:|---:|---:|---:|---:|
| quiet-1 | 7.47 | 115.08 | 53.41 / 77.79 | 80.35 | — | 29 / 34 |
| loaded-1 | 23.20 | 886.57 | 65.97 / 987.10 | 870.62 | 788.72 | 29 / 34 |
| loaded-2 | 22.68 | 984.09 | 57.96 / 1012.19 | 880.31 | 795.27 | 29 / 34 |
| quiet-2 | 8.24 | 120.46 | 46.45 / 77.41 | 91.95 | — | 29 / 34 |

The common polling workload is identical. Loaded windows add four 50-stop navigation plans and four map edits with six-request read bursts. HTTP request counts are 56 quiet / 92 loaded.

Unchanged stream payloads ignore version and serverTime only; this identifies repeat content, not permission to remove freshness/liveness signals. Dashboard snapshot data equality is counted separately from status/timestamp changes.

