# Mixed workload and managed-restart review

11 October 2026. **Both candidate-only lanes pass their declared correctness and collection checks; no new blocker found.** This is not a three-version performance conclusion or production acceptance. No application, browser, build or measurement was rerun during this audit.

Rehashed six raw/log/summary files against their already-captured ownership pins. Mixed, mixed-summary and restart commands each exited0, with no surviving group members/adopted children, no cleanup signal, and `waitpid` confirmation of no children. The mixed harness hashes and restart's92 source-file hashes agree with current frozen70 source. The coordinator's broader source/inventory audit remains separate. Detailed pins and selected numbers are in `COMPARISON-LIFETIME-AUDIT.json`.

Mixed ran the original quiet1/loaded1/loaded2/quiet2 sequence, four28-second synthetic protocol windows on candidate70. All296 scheduled HTTP requests returned200 with no task failures:56 per quiet window,92 per loaded window. Both loaded windows retained four50-segment navigation plans and the original map-edit/read bursts. Independently recomputed192 saved metric/transition fields from request and event records; saved summaries agree.

| Window | Dashboard p95 ms | Stream p95 ms | All-request maximum ms | Server loop maximum ms | Dispatch maximum ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| quiet1 | 76.59 | 74.65 | 86.59 | 105.45 | 5 |
| loaded1 | 120.99 | 130.60 | 221.01 | 160.96 | 73 |
| loaded2 | 101.98 | 111.60 | 174.46 | 144.18 | 75 |
| quiet2 | 59.41 | 72.49 | 81.53 | 107.35 | 3 |

The loaded latency/dispatch/event-loop costs remain visible. Core CPU is6.29%/10.25%/9.55%/6.05% of one core in sequence. These are added-load costs within candidate70, not RC16-versus-RC17 regressions or gains. Two observations per condition and an instrumented synthetic workload do not establish population tails.

Every window exercised the intentional provider503, stale stored location, hostile/unknown protection and recovered highsec. Reconstructed producer-to-wire transitions and unhide validation show no unsafe emission; both SSE clients stayed connected without parser errors. Commit-to-wire maxima were25/34/31/22ms. All20 stream state events had distinct saved content hashes after removing version/serverTime. The28 repeated dashboard data snapshots all carried changed freshness metadata; these are not grounds to remove liveness signals. Cleanup reported zero inflight or forbidden requests. This lane uses protocol clients, not a rendered browser or OBS executable.

Managed restart passed both controlled schedules: semantic work released before accepted HTTP completion, and semantic work released after HTTP completion while Core close waited with SQLite still open. Each retained the accepted201 goal,200 read, exactly one goal row/event and milestone event, active session, cookie/CSRF and a post-restart200 write. New writes during quiesce returned503. The planned notice preceded close; milestone persistence preceded SQLite close; the old child exited0 before the replacement fork. Both generations in both scenarios exited0 without signals. Old-child records show no pending work, listener failure, post-close operation, external network attempt or exit grace. One coherent dataset generation remained, the reconnect coordinator reached restarting→refreshing→idle once, and all observed OBS states stayed protected.

**No numeric restart gap is recorded by this lane.** Its trace contains ordered events rather than event timestamps, and controlled gates make it a correctness diagnostic. Do not turn total command duration into a restart latency result or substitute it for the separate real-archive updater measurements. Generation2 final teardown and arbitrary unreturned/stuck work are outside the stated semantic-drain assertion scope; outer process cleanup nevertheless passed.
