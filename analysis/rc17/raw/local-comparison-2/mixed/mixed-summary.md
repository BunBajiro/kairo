# Mixed operational workload

Protocol clients only. These are instrumented 28-second synthetic windows; all request counts and safety observations passed.

| Window | Core CPU % | Server loop max ms | Common dashboard p50 / p95 ms | Common stream p95 ms | Navigation p50 ms | Unchanged stream states |
|---|---:|---:|---:|---:|---:|---:|
| quiet-1 | 6.16 | 106.43 | 39.93 / 69.03 | 78.30 | — | 0 / 5 |
| loaded-1 | 9.46 | 131.79 | 54.08 / 97.27 | 104.25 | 37.94 | 0 / 5 |
| loaded-2 | 9.19 | 145.75 | 52.54 / 95.19 | 106.31 | 39.52 | 0 / 5 |
| quiet-2 | 6.25 | 187.96 | 45.91 / 63.86 | 72.63 | — | 0 / 5 |

The common polling workload is identical. Loaded windows add four 50-stop navigation plans and four map edits with six-request read bursts. HTTP request counts are 56 quiet / 92 loaded.

Unchanged stream payloads ignore version and serverTime only; this identifies repeat content, not permission to remove freshness/liveness signals. Dashboard snapshot data equality is counted separately from status/timestamp changes.

