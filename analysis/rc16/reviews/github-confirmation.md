# Independent GitHub confirmation

Run [36708404690](https://github.com/BunBajiro/kairo/actions/runs/36708404690) completed successfully on 30 September 2026, 11:25–11:42 UTC. All measurement and validation steps passed. This confirms the analysis workflow completed; it does not imply RC16 is free of the diagnosed performance or shutdown issues.

## Identity and evidence integrity

- Measured harness commit: `0344ff4ec069080a87e19294fa8fddc28f737327`.
- Unchanged application: RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; baseline: released v0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c`.
- Node 24.19.0, Ubuntu runner, AMD EPYC 7763; runner exposes two logical CPUs; browser is Chrome 153.0.8010.52 and SwiftShader. Local Chrome was 153.0.8010.0. Interpret paired comparisons within each environment.
- All 405 protected application files match RC16; the two permitted repository changes are internal instructions and the user-build workflow guard. All 20 harness hashes match the workspace files.
- Artifact `internal-rc16-performance-evidence`, ID `11093357604`, 113,873 bytes. Downloaded ZIP SHA256 equals GitHub's digest: `4c4f833594c91d64dd09d8a945948a592346e17734b9ee30b982d0a38acedbc6`.
- Extracted artifact files are preserved unchanged under [raw/github-run](../raw/github-run). [Retrieval metadata](../raw/github-run/retrieval.json) and the [complete job log](../raw/github-run/actions-job.log) were added after download.
- Both production builds and RC16's type checks succeeded. All **637 existing runtime tests passed**, with zero failures. Later evidence/report commits do not change the measured harness.

## What reproduced, and what did not

The following are GitHub's own measurements; they are not ratios against workspace timings.

| Area | GitHub evidence | Interpretation |
|---|---|---|
| Large legacy backend idle | v0.7.3 1.63–1.72% → RC16 2.14–2.15% of one core; RSS 107–126 → 193–194 MiB | Higher recurring cost and residency reproduce; RSS does not establish a leak |
| Large idle loop maximum | 43.7–44.9 → 76.2 ms | Higher short-window burst cost reproduces |
| Large-fixture `startKairo` | 27.2–28.0 → 219.9–231.0 ms | Extra initialisation reproduces; excludes imports and supervisor launch |
| Large state HTTP p50 | 50.0–51.4 → 49.4–49.7 ms | Local slowdown does **not** reproduce; retain as an environment-specific lead |
| Typical session/idle CPU | Session 20.9–21.2 → 20.9–21.1 ms; idle CPU ranges overlap | Local small typical-workload increases are not consistent across both environments |
| Earlier database/cache/session work | Identical complete database output hashes and 16,355,000 working JSON bytes; large session 114.8–118.0 → 110.1–111.8 ms | Retained targeted optimisations remain effective; no broad DB replacement case |
| Full Maps workspace | 1 map 3.83–4.23 ms; 24 maps 352.7–356.3 ms | Nonlinear projection cost reproduces |
| Maps read amplification | Same 5,432 SQL executions, 59,400 emitted link rows and 4,752 signature point lookups | Deterministic counts match local exactly; batching/summary-detail contracts remain strong targets |
| Route/history preparation | 100k-visit Universe state 186 ms; 50-stop itinerary 1.76–1.82 s | Reuse request context and avoid unrelated history preparation |
| Maps browser interaction | 600-node six-click median task duration 5.78 s; RAF p95 283–333 ms | Large-map interaction cost reproduces in software rendering |
| Reversible CSS-property probe | Mean style duration 1,809.9 → 6.16 ms; task duration 3,723.4 → 2,512.0 ms | Custom-property style path confirmed; registration, typing and inheritance changed together |
| Refresh burst | Ten events → ten Maps + one Universe response, 7,813,659 bytes | Coalesce invalidations and reduce response scope; normal state polling is recorded separately |
| Minimal Overview idle | v0.7.3 0.184–0.218% → RC16 0.246–0.256% renderer busy time | Small CI overhead: +17.6 ms per 35 s, +0.050 percentage points; local ranges overlap |
| Updater cache/scheduler | 100 simultaneous checks: one fetch; 1,000 cached checks: zero; simulated startup + 24 hours: 25 requests, one timer | Lightweight operation counts reproduce |
| Async disposal | Deferred completion publishes after listener disposal; closing SQLite first yields caught `ERR_INVALID_STATE` | Ownership gap reproduces; successful diagnostic is not a safe-shutdown pass |

Backend component times exclude separately measured JSON serialization. Browser task duration is renderer main-thread work, not whole-process CPU or desktop GPU frame rate. SQL row counts do not measure physical IO. Short observed maxima are not production tail-percentile estimates.

## Completeness and limits

The artifact contains all four legacy backend/database runs with zero external fetches, 15 backend scenarios in both forward and reverse order (270 timed samples), matching SQL diagnostics, the complete 37-sample browser suite, and four complete Overview runs. Browser controls report no renderer errors, no backend fetch attempts and no successful external responses. The style probe's four CI phases contain no API requests; the burst separately records one incidental state response. All raw outputs retain source/runtime/fixture information.

The updater lane here repeats lightweight inventory, coalescing, cache and scheduler checks. The actual CCP archive conversion/install and worker cancellation were measured **locally only**. Neither environment provides a loaded Windows/EVE/OBS run, desktop power measurement, long soak, or full-supervisor reproduction of the disposal race.

These results preserve the proposed implementation order: owned shutdown, Maps camera/style and refresh ownership, batched map projections, shared itinerary context, then measured history/residency improvements and selected consolidation. They qualify the HTTP and Overview interpretation without changing the main priorities.

Detailed reviews: [legacy](legacy-comparison.md), [backend](backend.md), [frontend](frontend.md), [updater](updater.md), [architecture](architecture.md), [methodology](methodology.md). Implementation starts from clean RC16; this branch remains analysis evidence and must not be merged or packaged.
