# Mixed operational workload

Protocol clients only. These are instrumented 28-second synthetic windows; all request counts and safety observations passed.

| Window | Core CPU % | Server loop max ms | Common dashboard p50 / p95 ms | Common stream p95 ms | Navigation p50 ms | Unchanged stream states |
|---|---:|---:|---:|---:|---:|---:|
| quiet-1 | 4.61 | 162.00 | 44.54 / 93.06 | 81.09 | — | 0 / 5 |
| loaded-1 | 7.23 | 162.79 | 48.39 / 104.04 | 109.19 | 31.98 | 0 / 5 |
| loaded-2 | 7.00 | 179.83 | 46.63 / 102.01 | 98.61 | 32.33 | 0 / 5 |
| quiet-2 | 4.76 | 154.66 | 42.73 / 57.16 | 85.37 | — | 0 / 5 |

The common polling workload is identical. Loaded windows add four 50-stop navigation plans and four map edits with six-request read bursts. HTTP request counts are 56 quiet / 92 loaded.

Unchanged stream payloads ignore version and serverTime only; this identifies repeat content, not permission to remove freshness/liveness signals. Dashboard snapshot data equality is counted separately from status/timestamp changes.

