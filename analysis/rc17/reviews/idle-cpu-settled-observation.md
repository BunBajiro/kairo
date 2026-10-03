# Settled idle CPU observation: independent review

The completed local ABBA observation does **not reproduce the magnitude or consistent direction of the original GitHub idle-CPU increase**. Its two-process means are 1.404929% of one core for RC16 and 1.415722% for the candidate: +0.010793 percentage points, or +0.768% relative. The original short-warm-up GitHub stress comparison increased by 19.47% relative. These are different workloads and environments; the new result does **not** cancel the original result or establish its cause.

This review launched no application or benchmark process and changed no source, harness or raw measurement. The existing `observe-1` lane continued through the conversation interruption and completed normally. The companion [`observe-1-summary.json`](../cpu-investigation/observe-1-summary.json) is explicitly derived from the retained raw evidence, with raw-file checksums and the arithmetic used below.

## Provenance and validity

The lane ran from 2026-10-03 00:22:54 to 00:30:59 UTC in RC16 / candidate / candidate / RC16 order. Every process warmed for 30 seconds, then observed three consecutive 30-second windows. Node was v24.19.0 on Linux x64, AMD EPYC 9V74, nine visible logical CPUs and eight available to the process. This is local evidence, not an additional GitHub run.

| Source | Commit | Verified source/build fingerprint |
|---|---|---|
| RC16 | `57c8dcc7fbd8fc2b62129498d1819050c78381a1` | `02558f159d1fea0b7c1670856e40e52894dd62ea76c733c929cc6d9c4af43a85` |
| Candidate | `05d0d4b36c154329006d6772769063db874762da` | `b927c985297161a30987b4b9a329cf53610d7ffd309e405389ccbe6429129e82` |

The runner recorded clean sources, successful verification after each process, and final source/harness verification. This review independently rebuilt both source/build fingerprints from their current files and Git identities after completion; they match. Every recorded adapter/helper hash also matches. Key executable adapter hashes are:

- `idle-run.mjs`: `e6bdf5c3dec9245d6fb2c3e08517aca852997d7f21eb06ae76dbe6a32591c8e8`.
- `idle-worker.mjs`: `cf8f36543e5697e9412bf3fd8f5f5e2a1ba6a37a6427406cb9134c7ce58ff551`.
- Frozen backend fixture: `62ea73e7fc23ab6c69ba7986c2162823146e350e474729f7cc9c478485cc4073`.

All four workers completed cleanup. Every measured window contains exactly 10 started, completed and successful Universe ticks, and 10 fulfilled Operations and Feeds subtasks. Pending ticks are zero at both boundaries. No external fetch, subtask rejection or client connection occurred; candidate semantic-task pending/failure counts are zero. The Politics queue contains 3,000 entries immediately after startup, zero after each warm-up and zero after every measured window. The frozen stress-fixture definition fingerprint is identical across processes; time-dependent timestamps and migration-equivalent discovery storage retain the already-documented fixture differences.

There is no Inspector, SQL/snapshot/JSON counter or binding wrapper in this mode. The low-frequency tick audit, 10 ms loop-delay observer and 250 ms RSS sampler remain. Thus these are process-CPU measurements with the stated common observers, not a measurement of observer-free production CPU. Queue checks occur outside the CPU windows; small gaps between windows are recorded. Exact raw CPU sums and CPU/elapsed percentage calculations were independently checked.

## Per-window measurements

CPU times are milliseconds. The three windows in each process form a trajectory, **not three independent repetitions**.

| Process | Window | User CPU | System CPU | Total CPU | % one core |
|---|---:|---:|---:|---:|---:|
| RC16-1 | 1 | 318.509 | 84.998 | 403.507 | 1.344999961 |
| RC16-1 | 2 | 357.557 | 40.409 | 397.966 | 1.326547139 |
| RC16-1 | 3 | 410.362 | 77.489 | 487.851 | 1.626155264 |
| Candidate-1 | 1 | 356.345 | 39.053 | 395.398 | 1.317785208 |
| Candidate-1 | 2 | 340.724 | 87.208 | 427.932 | 1.426420491 |
| Candidate-1 | 3 | 364.308 | 95.750 | 460.058 | 1.533538362 |
| Candidate-2 | 1 | 295.984 | 77.218 | 373.202 | 1.244035682 |
| Candidate-2 | 2 | 292.124 | 111.765 | 403.889 | 1.346251275 |
| Candidate-2 | 3 | 422.434 | 65.516 | 487.950 | 1.626291597 |
| RC16-2 | 1 | 349.693 | 49.300 | 398.993 | 1.329936638 |
| RC16-2 | 2 | 356.408 | 97.293 | 453.701 | 1.512291940 |
| RC16-2 | 3 | 319.834 | 67.059 | 386.893 | 1.289641950 |

## Process summaries

Each observed summary below sums the three measured windows and normalizes by their summed elapsed time. Warm-up is reported separately and is not included in the settled totals.

| Process, actual order | Warm-up total CPU, ms | Observed user CPU, ms | Observed system CPU, ms | Observed total CPU, ms | Observed % one core |
|---|---:|---:|---:|---:|---:|
| RC16-1 | 474.127 | 1086.428 | 202.896 | 1289.324 | 1.432567 |
| Candidate-1 | 443.191 | 1061.377 | 222.011 | 1283.388 | 1.425909 |
| Candidate-2 | 467.976 | 1010.542 | 254.499 | 1265.041 | 1.405536 |
| RC16-2 | 444.226 | 1025.935 | 213.652 | 1239.587 | 1.377291 |

The bracketing comparisons differ in direction: Candidate-1 versus RC16-1 is −0.465%; Candidate-2 versus RC16-2 is +2.051%. Both candidate process totals fall between the two RC16 totals. Mean user CPU is lower and mean system CPU higher in this small lane; the combined means are close. These components identify a descriptive difference, not a mechanism. The within-process windows also vary despite equal tick counts and empty queues. No significance claim, causal GC claim or independence assumption is supported by two processes per source.

## What this does and does not establish

The original GitHub comparison used a one-second warm-up and a 35-second meter beginning while the newly seeded application's Politics backlog was still relevant. This observation deliberately uses an empty queue after 30 seconds of warm-up and then watches another 90 seconds locally. It establishes that the earlier approximately 19.5% stress increase is not a persistent settled-local effect under these conditions. It does not retrospectively attribute the earlier difference to backlog, compilation, garbage collection, system CPU or host variation.

The separate diagnostic pairs found nearly identical scheduled activity and shared metadata/protection/feed work; the counting pair recorded +40 candidate Session cursor reads and −53 redundant stream-setting reads per 30 seconds. Those findings narrow the search but cannot establish equal instruction/allocation cost. Inherited snapshot and feed-projection inefficiencies are worthwhile refactoring leads; their presence in both builds does not explain the candidate's earlier increase.

The CPU concern therefore remains **unresolved for the original short-warm-up GitHub workload**, with a materially narrower finding: no comparable sustained increase reproduced in this settled local stress observation. It has not been accepted as an unavoidable feature cost, and this result is not a release-clearance claim.

The minimal next attribution step is a focused observation of the original startup-inclusive phase, preserving its one-second warm-up/35-second meter, and recording queue and activity boundaries plus user/system CPU. Separate count/profile diagnostics should be used only as needed to attribute a repeated difference; their timings must not be pooled with the observation lane. Prefer reproducing the relevant lane on the original CI environment class before explaining a CI-specific effect. Another full three-version performance matrix is unnecessary to answer this narrower question. Any later optimization should be evaluated independently on the original short-warm-up workload and the settled workload, preserving the current evidence.

## Evidence

- [`raw/observe-1/provenance.json`](../cpu-investigation/raw/observe-1/provenance.json).
- Per-process `idle.json` under [`raw/observe-1`](../cpu-investigation/raw/observe-1).
- [`observe-1-summary.json`](../cpu-investigation/observe-1-summary.json), derived arithmetic and checksums only.
- [`idle-cpu-initial-evidence.md`](idle-cpu-initial-evidence.md), original local/CI windows and limitations.
- [`idle-cpu-diagnostics-independent.md`](idle-cpu-diagnostics-independent.md), separate count/profile diagnostics.
