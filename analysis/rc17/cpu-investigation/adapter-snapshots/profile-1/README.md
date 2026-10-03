# Idle CPU attribution

This separate external adapter reuses the frozen corrected backend `seedFixture(..., 'stress')` and real `startKairo` scheduler. It introduces no application edits, manual ticks, HTTP/SSE clients or external requests. The fixture retains four characters, 20,000 assets per character, corrected cached storm objects and seven-day freshness; SDE automatic startup remains deferred exactly as in the accepted corrected benchmark. The original measurement files are unchanged.

Run **diagnostics first**:

```sh
KAIRO_BASELINE_MANIFEST=/absolute/rc16-source.json \
KAIRO_CANDIDATE_MANIFEST=/absolute/candidate-source.json \
node analysis/rc17/cpu-investigation/idle-run.mjs profile /absolute/rc16-root /absolute/candidate-root /absolute/new-profile-output
```

Use `counts` for a separate counting run. Each diagnostic runs RC16 then candidate sequentially, with a deliberate 30-second warm-up and one 30-second idle window. `profile` saves V8 Inspector `idle.cpuprofile` files with a 1 ms sampling interval; it does not enable the SQL/snapshot/binding counters. `counts` has no Inspector and counts SQL calls, snapshot/metadata/settings reads, parsed JSON input characters, dynamic stream binding/config/OPSEC calls, character reads, Universe subtasks/cleanup/politics, combat synchronization and Sessions synchronization. Aggregate wrapper timings are synchronous duration only, not exclusive cost or asynchronous task latency. Those counts help explain call frequency; profiles help attribute CPU and garbage collection. Both modes are diagnostic-only and their CPU/loop values must not be used as uninstrumented performance comparisons.

If attribution leaves a steady-state question, run `observe` into another new directory. It uses **RC16 / candidate / candidate / RC16** order, with 30 seconds of warm-up then **three consecutive 30-second windows** per process. It has no Inspector, SQL, snapshot, JSON or binding wrappers. Only the low-frequency real Universe tick completion audit remains, matching the corrected benchmark's existing observer; its counts are captured as exact window deltas instead of cumulative-since-startup totals. Returned tick results must contain the two fulfilled operations/feeds subtasks. Each window reports started/completed/successful tick deltas, fulfilled subtask deltas and pending ticks at both boundaries. Tiny meter reset gaps are recorded explicitly.

Each window also reports user/system CPU separately, total CPU as a percentage of one logical core, event-loop utilization, 10 ms monitor delay samples/p95/max, RSS endpoints/peak and heap endpoints. CPU is sampled in the application process. A 250 ms RSS sampler matches the earlier meter. Politics queue sizes are captured after startup, after warm-up and after each window, outside the CPU meter; the post-warm-up queue must be empty so this diagnosis explicitly describes settled idle, while original short-warm-up evidence remains unchanged. The warm-up exercises at least eight successful real ticks, and every observation window requires at least eight. Any subtask rejection, network attempt, source change or missing completion fails the run. Three windows describe the trajectory; do not pool them into fabricated independent trials or treat monitor sample percentiles as request-latency percentiles.

The runner requires pre-captured clean source/build manifests, takes the shared benchmark flock, verifies source and adapter/fixture hashes before and after every worker, and rejects existing output directories. `provenance.json` and per-worker `idle.json` retain partial failure evidence. Root must allocate the runtime slot before execution. No runtime has to be occupied merely to inspect or summarize retained files.
