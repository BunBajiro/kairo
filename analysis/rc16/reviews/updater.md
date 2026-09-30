# RC16 SDE updater and runtime lifecycle review

Reviewed application: canonical RC16 commit **`57c8dcc7fbd8fc2b62129498d1819050c78381a1`** on `feature/universe-v0.8.0` (`0.8.0-rc.16`). The local restored checkout has synthetic commit `36c69fb8de75ae7a6f673233d560753540c7c759`; its production files match the canonical GitHub Git-blob manifest. The synthetic identifier is not an upstream release revision. Analysis only: no application module was edited for this review.

## Decision

Retain the updater's current separation: one supervisor owns generation activation, one runtime owns the app, and one cancellable worker performs conversion. The real-archive run does **not** identify an updater-induced main-event-loop bottleneck. A real update is a substantial but short-lived CPU/RSS workload, so keep it in the performance budget and retest alongside a loaded map before RC17. Do not expand this into an updater rewrite merely for consolidation.

The highest-priority lifecycle follow-up is shared with the architecture review: shutdown must drain in-flight asynchronous bus listeners before closing the store. The new managed restart makes that inherited issue more relevant; see `reviews/architecture.md` for its separate deterministic evidence.

## Evidence and method

Harness: `harness/updater-bench.mjs`. Raw results: `raw/updater-light.json`, `raw/updater-archive.json`, `raw/updater-abort.json`. Source/measurement provenance: `raw/updater-provenance.json`, including canonical source revision, production Git-blob and SHA-256 hashes, measured-harness reconstruction, current harness hash, sample hashes, and the sole post-measurement JSON field-name correction. No measured values were changed and no timing rerun was performed for this provenance correction.

All measurements ran sequentially during a reserved slot, after the root correctness suite and before other agents' timing runs. Node **24.19.0**, Linux x64, reported CPU **AMD EPYC 9V74**. This is one measured real build and one measured cancellation, sufficient to establish workload scale and isolation, not a statistical speedup claim. The 20 inventory and 10 active-selection repeats share a warmed process and OS cache.

The actual CCP input was `eve-online-static-data-3552227-jsonl.zip`, **99,197,259 bytes** (94.60 MiB), with SHA-256 `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`. The input was already present locally; a mock fetcher streamed it through the **real download pipeline and unmodified default worker**, with its real resource limits. No network request was performed. Local transfer time is not Internet download time.

RSS samples include the main process and worker thread. Main-thread heap samples do not describe worker heap. Memory is sampled every 100 ms; scratch disk every second; sampled peaks are lower bounds. OS process maxRSS supplies a separate high-water mark. Disk traversal and monitoring add small measurement overhead. Histogram resolution is 5 ms, so a 5–6 ms observed delay is near the measurement floor; do not call it 5–6 ms of application blocking. This was a service-only run, not simultaneous live ESI, OBS, full-map rendering, or a Windows installation.

| Probe | Observed result | Interpretation |
|---|---:|---|
| First bundled service inventory | 17.73 ms | Startup-only metadata inventory cost |
| Bundled inventory, 20 warm repeats | 11.37 ms median | No reason to prioritise this over map/request hot paths |
| 100 concurrent checks | 1 metadata request; 9.40 ms total | Single-flight coalescing works |
| 1,000 sequential cached manual checks | 0 fetches; 5.45 ms total | Cache suppresses network work; emits four small status events per invocation |
| Simulated startup plus 24 hours | 25 conditional requests; one remaining timer | Startup check plus hourly cadence; clock-advanced operation count, not a 24-hour CPU test |
| Real archive stream, convert, verify, publish pending | **10.97 s wall; 14.49 CPU-s** | Conversion is meaningful CPU work; process CPU includes worker/libuv work |
| Main loop during real update | **2.12% ELU**, p99 **5.89 ms**, max **9.54 ms** | Heavy work remained off the main loop in this probe |
| Update process RSS | **382.66 MiB** sampled peak; **386.00 MiB** OS peak | Includes runtime harness baseline; not an incremental app RAM measurement |
| Scratch disk at update peak | **200.63 MiB** sampled | Excludes the original input archive outside the temp data directory and bundled application data |
| Published generation files | **23,038,926 bytes / 21.97 MiB** | 7 payload files, 8,490 systems, 454,830 celestials |
| Pending selection with full hash validation | 30.04 ms | Integrity verification is cheap relative to conversion on this host |
| Commit and cleanup | 6.05 ms | Only one managed generation remained; no archive/staging/spool debris |
| Active selection, 10 warm repeats | 3.59 ms median | Uses size/build checks rather than full payload rehash |
| Cancel actual worker, 1 second after building starts | **6.78 ms** from close request through cleanup | Worker exited before scratch removal; only a 196-byte state file remained |

Progress observations place local copying at about **0.38 seconds** and worker setup/validation before first conversion progress at approximately **1.74 seconds**. Conversion/spooling and per-system compression account for most remaining elapsed time. These phase boundaries are coarse status events, **not** a CPU profile proving the exact function-level cost.

The process still reported around 361 MiB RSS immediately after the worker exited. Do not diagnose that as a leak from this snapshot: allocator retention, very short observation time, and process-wide RSS matter. Normal successful activation replaces that runtime process; this harness deliberately stopped before launching a replacement.

## Historical comparison boundary

The retrieved 0.7.3 checkpoint (`historical/docs/rc-v0.7.3/METHOD.md` and its workspace comparison) measures backend operations, real scheduler idle, market database projections, and prior browser scenarios. It has **no equivalent SDE conversion lane**. These new figures establish RC16's updater baseline; they must not be presented as a percentage degradation from 0.7.3 idle CPU or request latency. Use the root's repeated common-workload comparison for historical regressions.

## Operational structure and code evidence

| Area | Verified structure / relevant code |
|---|---|
| Idle and retry behavior | `server/datasets.mjs:218–224,279–333,352–361`: one unreferenced deadline timer; startup after 1 second subject to cache deadline; hourly checks; ETag/Last-Modified validators; 5-minute minimum cache; bounded exponential backoff and Retry-After; concurrent manual and automatic requests share `flight`. |
| Download and worker | `datasets.mjs:145–165,226–277`: streamed download capped at 512 MiB; default worker sets 512 MiB **old-generation heap** limit; cancellation calls `terminate()` and waits for the worker's exit before promise rejection and scratch removal. This is not a 512 MiB total-process limit. |
| ZIP and memory shape | `server/sde-archive.mjs:9–11,38–65,70–127`: seek/read selected members, no whole-archive extraction; member CRC and hash verification; bounded entry/line metadata. `sde-build.mjs:116–145,191–240` stages buffered system buckets, then parses one 256-system bucket and fills 8 MiB shards. It also retains look-up maps and uses temporary Buffer/string/object representations. |
| Integrity and CPU work | `sde-build.mjs:14,215–236,269`: synchronous level-9 gzip runs inside the worker, not the core; read-back verification of generated files. `datasets.mjs:257` validates again before publishing and `82–98` rehashes pending data before activation. Keep separate trust/activation boundaries unless measurement justifies a safe alternative. |
| Generation lifetime | `datasets.mjs:72–125`: retain active and pending until successful startup, atomically publish active pointer, retire other managed generations, remove abandoned staging/download files on next preparation, rollback failed activation. Cleanup failures are deliberately swallowed and retried on later preparation; no persistent cleanup-error telemetry exists. |
| Exclusive runtime ownership | `runtime-lock.mjs:6–25`; `runtime-supervisor.mjs:27–38`: SQLite lease acquired before preparation/cleanup, avoiding a second launch deleting the first runtime's work. |
| Bounded restart | `runtime-supervisor.mjs:42–43,100–151,154–182`: 60-second start budget, 30-second graceful stop budget and 5-second exit/kill waits; single update task; stop old runtime before activating replacement; rollback only before committed activation. |
| User state and reconnect | `runtime-child.mjs:11–25,35–54`, `index.mjs:35,53–66,543–557`: cookie/CSRF sessions pass over private IPC, updater announces intentional restart and waits 300 ms before supervisor notification, child closes its service and tracked HTTP work before core/store. Existing runtime tests cover real replacement and preserved session/settings. |

## Priorities for the implementation phase

1. **P1 — Complete shared shutdown ownership.** Use the architecture review's listener-drain evidence to make async work ownership explicit. Preserve the supervisor's abort and force-stop fallback, and preserve existing session handover. Gate with a deferred ESI completion during restart and no post-close SQLite access or lost committed state.
2. **P2 — Measure conversion under actual app load, then consider worker-local reductions.** Real conversion costs roughly 14.5 CPU-seconds and peaks around 386 MiB in this isolated process. Candidate experiments are reducing redundant transient representations in bucket parsing (`sde-build.mjs:215–224`), benchmarking compression level (`:14,:236`), and comparing spool flush strategy (`:119–134`). No gain from these changes has been demonstrated. Do not remove output integrity checks to manufacture a faster result.
3. **P2 — Clarify total resource and failure bounds.** There is a download timeout and child-runtime deadline, but no conversion watchdog/no-progress deadline; 512 MiB old heap does not cap Buffer/native memory, and no global spool/free-space budget is enforced. These are resilience gaps, not observed hangs or disk growth in this run. Add only the limits and telemetry that support a clear recoverable error and retained active dataset; fault-inject cancellation, slow/disk-full writes, and cleanup failure if this area changes.
4. **P3 — Keep small startup work small.** Inventory reparses bundled reference JSON only to report revisions (`datasets.mjs:128–142`). A compact inventory manifest could avoid this, but ~11 ms warm cost is low value compared with measured backend/map hotspots. Avoid a broad dataset loader rewrite in RC17 without a demonstrated benefit.

## Retest gates

- Run identical real archive and environment before/after any updater change; compare at least three sequential repetitions and retain wall, CPU, process peak RSS, main-loop tail delay, output size, and cleanup inventories. Repeat slower/storage-constrained or Windows observations separately.
- All generated payload meanings, counts, detail indexes, shard boundaries, checksums and deterministic content must remain correct; compression changes may change byte hashes and must have decoded-equivalence checks. Do not use byte-for-byte identity as the sole gate after changing compression.
- Keep the demonstrated invariants: one fetch per concurrent flight, conditional/cache/backoff behavior, one timer, zero duplicate builders, worker exit before cleanup, one active managed generation after commit, retained old generation on failed pending startup.
- Add the loaded-app lane: concurrent representative Universe requests, active SSE client, scheduled work, and real worker conversion; record main-loop and HTTP tails plus end-to-end reconnect gap. The isolated measurements do not supply these figures.
- Preserve existing supervisor recovery tests and add the cross-module drain test before RC17. Root test run reports all 637 tests passing; that existing coverage does not refute the deferred-listener ownership finding.
- Exclude `analysis/rc16/**` and checkpoint-only launchers/profilers from RC17, then verify the extracted deliverable. Keep the production worker and updater integrity checks: they are application features, not analysis harnesses.

## Reproduction

From the analysis checkout, one command at a time, in a reserved timing slot:

```bash
node analysis/rc16/harness/updater-bench.mjs light > analysis/rc16/raw/updater-light.json
timeout 180s node analysis/rc16/harness/updater-bench.mjs archive /absolute/path/eve-online-static-data-3552227-jsonl.zip 3552227 > analysis/rc16/raw/updater-archive.json
timeout 30s node analysis/rc16/harness/updater-bench.mjs abort /absolute/path/eve-online-static-data-3552227-jsonl.zip 3552227 > analysis/rc16/raw/updater-abort.json
```

Each normal run creates and removes its own temporary data directory. The external `timeout` is an analysis safeguard, not a production conversion watchdog. If that safeguard kills a run, preserve the failure and inspect/remove its `kairo-rc16-updater-*` temp directory before rerunning; do not count an empty redirected result as a pass.

## GitHub confirmation

The successful [GitHub run 36708404690](https://github.com/BunBajiro/kairo/actions/runs/36708404690) repeats the lightweight lane in `raw/github-run/updater-light-github.json`: 100 concurrent checks share one fetch; 1,000 cached checks fetch nothing; simulated startup plus 24 hourly checks issues 25 requests and leaves one timer. All five lightweight measurements complete. The real archive install and cancellation above remain local-only; no loaded-app conversion or end-to-end reconnect result is inferred from CI.
