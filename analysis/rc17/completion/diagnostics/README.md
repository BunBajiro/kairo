# State-tail causal diagnostic (reconstructed 7 October)

This is an external attribution experiment for G8/P1. It is not the unchanged
common-backend acceptance lane, and no result has yet been accepted from these
reconstructed scripts. The earlier 3 October crossover raw files were lost.

The initial older instrumented script walked/hashed every 3.47 MB response and
used `quiesce?.()` only where available. RC16 has no matching method, leaving
different timers active. Its lower fa6 tail cannot dismiss the CI signal. This
replacement removes those interventions: only preflight/final output hashing,
same supported active/noSync setting, no forced GC, no profiling in windows.

Capture source manifests before running using the unchanged
`../../harness/source-manifest.mjs` helper. Sources must be isolated and immutable
during the run. A two-file allocation variant from fa6 must record exactly its
`server/market-categories.mjs` / `server/universe-intel.mjs` changes and inherited
compiled assets; dirty provenance is explicit and is not final acceptance.

Configuration:

```json
{
  "sources": {
    "rc16": {"root":"/absolute/rc16", "manifest":"/absolute/rc16.json"},
    "fa6": {"root":"/absolute/fa6", "manifest":"/absolute/fa6.json"},
    "allocation": {"root":"/absolute/allocation", "manifest":"/absolute/allocation.json"}
  },
  "order": ["rc16", "fa6", "allocation", "allocation", "fa6", "rc16"],
  "schedulers": ["active", "nosync"],
  "windows": 4,
  "samples": 25,
  "warmupSeconds": 36,
  "cpuProfile": false
}
```

In an exclusively granted runtime slot, first perform a separate one-source
sanity run with one ten-sample window (at least four seconds active warmup for a
real tick). Keep its output separate. Then use an unused output directory:

```sh
node state-tail-run.mjs /absolute/config.json /absolute/new-output
node state-tail-summary.mjs /absolute/new-output
```

The runner self-acquires `/tmp/kairo-rc16-benchmark.lock`. It executes serial
fresh processes. The same fixture clock and complete response digest/bytes apply
to every source and mode. It preserves original pre-state OPSEC operation order,
then measures four windows of three warmups and 25 state samples. Active warmup
requires successful real Universe ticks and valid cached feed state; external
traffic is rejected. Every process records source/harness hashes and rechecks
them after the window. `progress.json` is mutable; `completion.json` is written
once only after every child, cleanup and final hash check succeeds. Existing run
directories are rejected. Failed child diagnostics remain, without a false
completion record.

Each sample records projection/serialization/total/CPU, keyed snapshot read costs,
start/end timestamps, GC phase overlap and overlap with real asynchronous ticks.
Window memory snapshots and per-process distributions remain separate. GC/tick
overlap is association; it does not establish the allocation owner or prove
causality. The allocation-only source crossover tests one concrete hypothesis;
active/noSync crossover tests scheduler contribution without calling a
version-specific quiescence API. noSync still leaves any normal non-sync timers
that each source implements, so record actual ticks rather than call it fully
quiescent. An optional CPU profile occurs only in a separate final phase.

After attribution, final frozen-source acceptance still uses the **unchanged**
backend adapter's original ten-sample maxima, one-second warmup and 35-second
idle windows, typical and stress, balanced source order locally and on CI.
Larger diagnostic distributions neither replace nor erase the historical
repeated CI direct-state p95 signal. Keep the old 05d idle CPU cause as G9/P2;
aggregate counters alone cannot establish it.

## Maps probes (prepared, not yet executed)

`maps-expiry-plans.mjs` extracts the three expiry queries and the Universe-record
schema from two source manifests, then applies them to separate disposable SQLite
databases. The synthetic fixture has four pilots, 1/8/24 maps per pilot and 100
connections per map, including future/expired/invalid/null expiry, collapsed
dated and unknown-lifetime links, timezone offsets and permanent connections.
Every complete returned identity must match; collapsed dated rows must occur
once. It records query plans and database page bytes, **not elapsed latency or
observed SQLite VM row visits**. Exact schema creation/index migration and
canonical write timings remain a separate required experiment.

```sh
node maps-expiry-plans.mjs /absolute/fa6.json /absolute/candidate.json /absolute/new-plans.json
```

`camera-label-probe.mjs` reuses the unchanged camera adapter's synthetic graph,
viewport and native click fixture in a derived external script. It requires an
old compiled frontend which assigns `output.textContent`: the new shipped
`nodeValue` version will correctly fail the intervention-call guard. On one
600-node scene it runs replace/retain/retain/replace interventions on only the
zoom output's own setter, writes full CDP invalidation traces and records setter
counts/node identity. DOM element count, full canonical graph, default node
scales, full detail and intended zoom all remain checked. Profiling can alter
frame count and elapsed duration; its causal invalidation evidence cannot
replace fresh unchanged camera ABBA on the final compiled build.

```sh
node camera-label-probe.mjs /absolute/frozen-fa6 /absolute/new-camera.json /absolute/fa6.json
```

Use an existing output parent directory and an unused result filename. The probe
writes the result plus four adjacent `.trace.json` files; no old trace is
overwritten. Set `KAIRO_CHROME_PATH` to the prepared Chromium wrapper when needed.
Both probes self-acquire the shared runtime lock and must wait for the root's
exclusive slot. None of the reconstructed scripts or prepared changes imply
recovery of the lost 3 October raw evidence.

## Fresh G8/G9 causal run preparation (7 October)

`prepare-causal.mjs <workspace-root> <unused-input-directory>` captures manifests
for frozen RC16, fa6, the isolated two-file startup-allocation variant, and exact
original `05d0d4b36c154329006d6772769063db874762da`. RC16 and 05d have fresh local
builds; these are not mislabelled as recovered historical build artifacts. The
allocation variant must differ from fa6 in exactly `market-categories.mjs` and
`universe-intel.mjs`, verified against full source manifest file sets (including
staged/untracked/deleted files), and inherit identical compiled assets.

It writes a two-process, one-source fa6 sanity config (one 10-sample window,
4-second warmup), the prescribed G8 RC16/fa6/allocation ABCCBA active/noSync
config, and a G9 RC16/original05d/fa6 ABCCBA config. It does not run measurements.
Only execute after the coordinator freezes the builds and grants the runtime
slot. Outputs are written into unused directories and historical raw files are
unchanged.

`idle-startup-run.mjs <g9-config.json> <unused-output-directory>` self-acquires
the common benchmark lock and runs `idle-startup-worker.mjs`. Each fresh stress
process retains a 1-second warmup and a 35-second startup-inclusive window,
then three consecutive 30-second settled windows. The latter begin roughly
36 seconds after startup, not the earlier standalone observation's 30-second
boundary. This intentional difference is explicit in every result; the three
windows are correlated trajectories, not extra independent repetitions.

The worker records startup/warmup user and system CPU, queue boundaries,
per-window CPU/loop/memory observations and actual successful Universe ticks.
Both boundaries of every settled window must have an empty Politics queue;
all network attempts, tick failures, or ticks still pending after close fail the
run. It has no Inspector, snapshot/SQL/JSON counter wrappers, forced GC, manual
ticks or UI/OBS clients. Source and harness verification occurs outside measured
windows. `idle-startup-summary.mjs` verifies child hashes and independently
recomputes CPU arithmetic, workload controls and per-process settled totals.

These are diagnostic lanes. A local non-reproduction does not convert the old
CI increases into harmless noise or identify their cause. GC/tick correlation
and equal call counts do not prove allocation ownership. Final acceptance still
requires the unchanged original backend adapter on final pinned local/CI source;
all original adverse results remain in the whitepaper.
