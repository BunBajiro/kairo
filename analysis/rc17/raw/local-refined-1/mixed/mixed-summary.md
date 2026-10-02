# Mixed operational workload

Protocol clients only. These are instrumented 28-second synthetic windows; all request counts and safety observations passed.

| Window | Core CPU % | Server loop max ms | Common dashboard p50 / p95 ms | Common stream p95 ms | Navigation p50 ms | Unchanged stream states |
|---|---:|---:|---:|---:|---:|---:|
| quiet-1 | 6.39 | 102.43 | 53.52 / 70.83 | 86.76 | — | 0 / 5 |
| loaded-1 | 9.73 | 147.19 | 55.57 / 97.70 | 106.72 | 40.70 | 0 / 5 |
| loaded-2 | 10.00 | 143.13 | 58.25 / 92.58 | 101.77 | 37.77 | 0 / 5 |
| quiet-2 | 6.09 | 103.22 | 41.72 / 62.46 | 80.44 | — | 0 / 5 |

The common polling workload is identical. Loaded windows add four 50-stop navigation plans and four map edits with six-request read bursts. HTTP request counts are 56 quiet / 92 loaded.

Unchanged stream payloads ignore version and serverTime only; this identifies repeat content, not permission to remove freshness/liveness signals. Dashboard snapshot data equality is counted separately from status/timestamp changes.

