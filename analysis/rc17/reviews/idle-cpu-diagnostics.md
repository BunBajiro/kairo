# Idle CPU investigation: diagnostic evidence

The additional diagnostics do not yet explain or dismiss the GitHub idle CPU increase. Both sources perform the same scheduled activity in these settled windows, and neither the single profiled pair nor the separate single counting pair reproduces an increase in total CPU. Their instrumentation changes CPU cost; the separately authorised ABBA observation is required before making a steady-state performance claim. The original short-warm-up evidence remains valid for that original workload and has not been overwritten.

## Scope and provenance

- RC16: `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; candidate: `05d0d4b36c154329006d6772769063db874762da`.
- External adapter: `analysis/rc17/cpu-investigation/idle-run.mjs` and `idle-worker.mjs`; the accepted `analysis/rc17/harness/` files and production sources were not changed.
- Exact corrected stress fixture and real application scheduler are reused: four characters, 20,000 assets per character, cached feeds with the corrected storms object, seven-day freshness, and deferred automatic SDE startup. All fetch paths are blocked; no dashboard/OBS clients or manual ticks are introduced.
- Each diagnostic mode runs RC16 then candidate sequentially under the shared benchmark lock. Every process warms for 30 seconds and observes one 30-second window. Source/build manifests and adapter/fixture hashes are verified before and after each process and at the end; both completed pairs passed these guards, cleanup, and semantic checks.
- Sources are clean and their fingerprints match the previously accepted local refined run. Each mode retains a complete provenance file. Exact executable adapter bytes are archived under `cpu-investigation/adapter-snapshots/profile-1/` and `counts-1/`, with hashes independently checked against the recorded run.

## Work actually completed

All four diagnostic windows contain exactly **10 started, 10 completed and 10 successful Universe ticks**, and 10 fulfilled operations and feeds results each. Pending Universe ticks are zero at both window boundaries. Both sources have **3,000 Politics queue records after startup, zero after warm-up, and zero after the observed window**. All network-attempt counts, clients and tick rejections are zero. The candidate semantic bus also reports no pending tasks or failures.

The queue observations establish that the original freshly seeded stress fixture has a real startup backlog. The settled windows here deliberately exclude it. This does **not** establish that the backlog caused the earlier within-pair RC17 increase: the queue-processing implementation is inherited, and these diagnostics did not measure the original first 35 seconds as a separate controlled window. The original audit also recorded cumulative ticks after startup rather than exact meter-window deltas; the new audit records exact window deltas and pending boundaries.

## Separate profile pair

| Source | Observed user CPU (ms) | System CPU (ms) | Total CPU (ms) | Window (ms) | Loop delay p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| RC16 | 753.295 | 512.999 | 1266.294 | 29999.915 | 10.863 |
| RC17 | 640.847 | 619.528 | 1260.375 | 30000.203 | 10.879 |

The Inspector samples at 1 ms. These CPU numbers include profiling overhead and are not accepted performance comparisons. There is one profile per source. Warm-up CPU was not captured in this first pair; warm-up task counts and queue boundaries were captured.

Both profiles place the largest sampled application leaf at native SQLite `get` called by `snapshotMetadata → runDataset → syncDataset` (approximately 173.993 ms of weighted sample intervals for RC16 and 172.622 ms for RC17). This is consistent with the inherited fresh-cache checks being a major recurring cost. Smaller sampled stacks include protection checks, OPSEC refresh, character SQL reads, and feed `state()`/normalization. No obvious candidate-only hotspot is demonstrated by this pair.

`profile-summary.json` preserves the full sampled leaf stacks. Its durations sum Inspector `timeDeltas`, which represent sampled wall intervals, **not measured process CPU attribution**. About 29.69 seconds of each profile are marked idle. The profile interval also includes Inspector start work outside the CPU window: the `node:inspector post` leaf has about 76.971 ms in RC16 and 49.616 ms in RC17. Garbage-collector samples total about 5.397 ms in RC16 and none in the candidate sample; this small sample does not prove that candidate garbage collection has disappeared. Native frames, unsampled work, profiler overhead, and sampling variability limit precise attribution. Profiled event-loop utilization likewise must not be interpreted as steady application CPU usage.

## Separate counting pair

Warm-up CPU capture was added only after the complete profile pair, before the counting pair; both versions of the adapter are preserved. There is no Inspector in this mode. Wrappers count dynamic calls, SQL executions, JSON parsing and settings/snapshot reads. Wrapper durations measure only synchronous execution, are inclusive, and cannot be added as exclusive CPU costs.

| Source / phase | User CPU (ms) | System CPU (ms) | Total CPU (ms) |
| --- | ---: | ---: | ---: |
| RC16 warm-up | 434.183 | 83.077 | 517.260 |
| RC16 settled window | 376.330 | 66.319 | 442.649 |
| RC17 warm-up | 456.444 | 59.605 | 516.049 |
| RC17 settled window | 341.294 | 89.741 | 431.035 |

The observed 30-second counting windows agree on every recorded counter except three related settings-read counters:

| Counter | RC16 | RC17 |
| --- | ---: | ---: |
| `snapshotMetadata` reads | 1,330 | 1,330 |
| Full snapshot reads | 2,700 | 2,700 |
| `auth.characters()` calls | 2,020 | 2,020 |
| `stream.setOPSEC()` calls | 360 | 360 |
| `stream.setBindings()` calls | 53 | 53 |
| JSON parse calls | 11,050 | 11,050 |
| JSON parse input characters | 8,739,390 | 8,739,390 |
| `session:live-feed` settings reads | 0 | 40 |
| Stream settings reads | 106 | 53 |
| All measured SQL get/all/run executions | 13,197 | 13,184 |

The candidate adds 40 cursor/deadline settings checks for the four pilots' Sessions live synchronization. In this fixture the cursor is absent, so that adds a SQL read without extra JSON parsing. It also eliminates 53 redundant stream-setting reads from the inherited eager empty-stream state path. These sum to 13 fewer SQL executions. There are no SSE clients, so framing/backpressure logic is inactive. Bindings synchronous wrapper time is approximately 0.559 ms in RC16 and 0.044 ms in RC17 for the entire window; this diagnostic does not support blaming empty bindings for an approximately 80 ms CPU increase. Dynamic `stream.config()` counts do not capture the RC16 internally closed-over configuration call, but the underlying SQL and settings counters do capture it.

The metadata, full snapshot, character and OPSEC repetitions are shared refactoring targets. Profiles and counts support investigating that inherited work; they do not identify it as an RC17-specific regression. In particular, cached-feed `tick()` still creates a full state projection which its caller ignores. A future split must retain explicit refresh response behavior and cleanup/retry ownership. See `reviews/idle-cpu-source-audit.md` for the source review, including Politics bootstrap and live-feed differences.

## Outstanding observation

The separate `raw/observe-1` ABBA lane is in progress. It retains only the pre-existing low-frequency Universe tick audit and meter observers, with no Inspector or SQL/snapshot/JSON/binding instrumentation. It observes three consecutive 30-second windows after 30 seconds of warm-up for each of RC16 / candidate / candidate / RC16. Each window will be reported separately with user/system CPU, exact activity deltas and queue boundaries. No pooling of profile, counting and observation samples is permitted.
