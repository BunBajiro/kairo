# Attempt 2 temporary-path recreation: bounded source review

11 October 2026. This is read-only attribution work, not an accepted performance result. No failed attempt, application source or harness was modified. No Kairo runtime, benchmark, or host-wide process scan was run. Exact inspected hashes and observed path metadata are in `provenance-work/cause-review-attempt2.json`.

## Established observations

Attempt 2 retains all 30 child results and their log/payload bindings but fails the new final cleanup gate. Three empty `tmp` paths exist after their rows recorded successful removal:

| Row | Row finished UTC | Observed directory birth UTC | Observed modification UTC |
|---|---|---|---|
| `startup-core-1-3-candidate` | 08:13:38.312 | 08:13:39.754695651 | 08:13:36.650827331 |
| `startup-format-1-3-candidate` | 08:13:52.758 | 08:13:54.842053474 | 08:13:52.618389188 |
| `startup-format-3-4-baseline` | 08:13:59.519 | 08:14:01.305777891 | 08:13:58.765886251 |

The directory birth times are later than recorded per-row completion; their modification times are earlier than birth. Metadata-preserving recreation is consistent with this pattern. These observations do not identify the creating process, establish a platform defect, or prove that the clock/filesystem metadata is reliable enough to attribute an actor.

## Code paths checked

`final-source-gates/run.mjs` constructs unique names from phase/lane/cycle/position/arm. All 30 actual job names are distinct. Each `row/tmp` is created once before its worker starts. The worker receives that path through `TMPDIR`, `TMP` and `TEMP`. The parent awaits real child close, confirms the owned process group has disappeared, removes `row/tmp`, and checks for ENOENT. Subsequent guards, source manifests, row comparisons and final evidence checks read files or write receipt/output files; they do not create `row/tmp` or restore directory timestamps.

`startup/worker.mjs` creates a private child directory with `mkdtemp`, runs its work, awaits `core.close()` if constructed, closes the Store and awaits removal of that private directory. It verifies source and emits JSON afterward. Its outer `row/tmp` belongs to the runner.

Two recreated paths belong to the formatter-only branch in `atlas/worker.mjs`, one on RC16 and one on the candidate. This branch uses an in-memory fixture Store and imports `projections.mjs`; its transitive application imports are `polling.mjs` and `public/stream/protection.js`. Those inspected files do not start timers, watchers, worker processes, or asynchronous filesystem writers. The formatter branch never constructs Core, Universe or a real Store. It awaits removal of its private `mkdtemp` directory before final source verification and output.

The source-manifest helper calls `captureSource`/`verifySource` through its imported API. Those operations read and hash source/assets and query Git; the CLI-only capture path creates its manifest parent only when invoked as the main script. The worker imports do not invoke that branch.

The final evidence helper uses read, realpath and lstat operations. Its synthetic tests can create temporary paths, but are not imported or executed by the production runner; their fixtures have independently generated `kairo-final-evidence-control-*` roots.

No inspected code explains recreation of empty outer paths with older restored modification times after the owning children have exited. The formatter-only cases substantially weaken an explanation based on Kairo service timers or delayed SQLite cleanup. They do not exclude an uninspected external actor or an observation/synchronization issue.

## Discriminating observation

Use the coordinator's small, separate filesystem probe rather than another application run. For unique synthetic paths, record create/removal times, inode and birth/mtime, explicit ENOENT, and parent-directory inotify CREATE/DELETE/ATTRIB events if available. Compare workspace paths with `/tmp`, and compare a quiet single invocation with a second benign tool invocation while the probe runs. A CREATE followed by ATTRIB and an older mtime would distinguish metadata restoration from a plain late mkdir. Inotify identifies the event and time, not the actor.

Retain the strict gate and both failed attempts. Do not recreate lost stdout, delete the returned temp paths to manufacture a passing receipt, or infer causality from the favorable semantic checks. Once the isolated probe supports a controlled execution condition, obtain one coherent fresh run under that condition with the unchanged workloads.


## One bounded `/tmp` rerun

A single run of the unchanged reviewed runner with a new destination under `/tmp` is a legitimate diagnostic of output-location sensitivity. It is not proof of a cause or justification to discard prior adverse observations. Preserve both failed attempts and their original receipts, raw bytes and adverse metrics. Record the only intended change—output and worker temporary-file location—alongside unchanged source manifests, harness hashes, complete 30-child order, settings and semantic assertions.

The coordinator's synthetic probe has not reproduced the fault so far, including benign tool reads; `/tmp` and the workspace report the same device. Therefore `/tmp` is not demonstrated to be a separate or stable filesystem, and success there would not establish a platform/synchronization cause. The probe is simpler than the actual runner and cannot exclude timing or concurrency effects.

Run all original rows once, retaining every outcome and the strict final evidence gate. Avoid concurrent edits/copies of the new attempt while it runs. A failure should stop this experiment and preserve the new attempt rather than trigger repeated location changes until a pass appears. A pass is new, separately labelled local evidence subject to independent verification; it does not retroactively validate earlier damaged evidence or replace independent Actions acceptance. Copy a completed, hash-verified evidence snapshot into the workspace only after the runner releases its locks, then verify the copied bytes against the original inventory.
