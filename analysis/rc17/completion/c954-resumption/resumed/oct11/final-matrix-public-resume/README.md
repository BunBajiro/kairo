# Final original local matrix — public resume preparation

Prepared 11 October 2026. No Kairo application, browser or benchmark was executed by this preparation. This is an **ownership/output adaptation**, not a claim that only output paths changed. Application source remains `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. Independent review is required before the coordinator grants execution.

## Exact sequential commands

After the bounded first-Assets disposition and all setup finish, freeze these reviewed files and run the following commands **one at a time**, with all other work parked. Do not add an outer flock: `run.py` owns the performance lock; original workers or their original UI command own the different benchmark lock.

```sh
cd /workspace/scratch/a2f3334402fc/kairo-analysis-restored
KAIRO_FINAL_MATRIX_GRANTED=1 python3 analysis/rc17/completion/c954-resumption/resumed/oct11/final-matrix-public-resume/run.py --stage historical
KAIRO_FINAL_MATRIX_GRANTED=1 python3 analysis/rc17/completion/c954-resumption/resumed/oct11/final-matrix-public-resume/run.py --stage comparison
KAIRO_FINAL_MATRIX_GRANTED=1 python3 analysis/rc17/completion/c954-resumption/resumed/oct11/final-matrix-public-resume/run.py --stage ui
```

Outputs are fresh `historical/`, `comparison/` and `ui/` directories under `/tmp/kairo-final-matrix-public-20261011/attempt1`. Each stage refuses an existing output. The later stage requires every earlier stage's successful final receipt, original input hashes and retained file inventory. Bank completed stages between commands, outside all measurement windows. A failure preserves its directory and stops progression; a new attempt needs a reviewed output binding rather than overwriting or continuing a partially completed matched group.

The three source roots are the original command list's `kairo-v073-final-baseline`, `kairo-rc16-baseline` and `kairo-rc17-c954-continuation`. Candidate setup comes from `/tmp/kairo-public-resume-20261011/setup/`; RC16/v0.7.3 setup comes from its sibling `setup-matrix/`. Both retain actual manifests, build receipts, logs and inventories. Source and prebuild manifests are copied byte-for-byte. Studio's derived receipt preserves the actual candidate build timestamps, log path/hash, source fingerprint and lockfile. It does not imply a new build.

## Preserved work and boundaries

| Stage | Original execution preserved | Scope |
| --- | --- | --- |
| Historical | `legacy-corrected-run.mjs` then original `legacy-summary.py` | v0.7.3 / RC16 / RC16 / v0.7.3; both profiles, default ten samples and three warmups; 35-second idle observations unchanged |
| Comparison | `local-run-owned.py` dispatches the exact original `local-run.py` try body | `maps routes backend memory mixed restart browser browser-performance`, unchanged order/arguments; Maps diagnostics plus B/C/C/B, all original reverse-order arms, memory ordinary/retention separation, mixed quiet/load/load/quiet |
| UI | Seven original `flock ... ui-ci-lane.mjs` invocations | frontend-refresh, admin-polling, frontend-models, studio-stream, replay repeat-small/repeat-cap/distinct-cap; original rows/cycles/default windows |

`adapt-local-run.py` mechanically verifies exactly five declared edits: import the envelope; use the correct fixed analysis root after relocating the file; construct the envelope after making the output directory; replace only the old subprocess/log function with owned execution plus closed-file pins; finalize the envelope after the original final progress save. The original lane dispatch body is AST-identical. The per-command default timeout remains 900 seconds. The three original source-manifest capture/verify flows, fixtures, worker code and assertions stay unchanged. Orchestration `elapsedSeconds` includes the added outside-window ownership/hash checks; raw worker metrics remain the performance evidence.

The external stage owner adds finite whole-stage deadlines (historical 30 minutes, comparison 6 hours, each UI owner 11 minutes); it does not override any original sample duration or inner deadline. Typical elapsed time depends on fixture preparation and host speed. Code guarantees a historical idle/settle floor of **288 seconds** (4 arms × 2 profiles × 36 seconds), the same **288-second** floor for the new backend lane, and **112 seconds** for four mixed windows. Camera has at least **28.64 seconds** of ordinary prescribed idle/zoom/pan waits across four browsers, plus loading/diagnostics. UI replay retains three separate trials, each two warmup and twelve measured navigation cycles plus fixed replay/retention waits; no duration reduction is proposed. Allow roughly **20–40 minutes** for the whole matrix, an estimate rather than a deadline or measured result.

## Actual ownership and evidence integrity

Each external command starts a new session. The envelope becomes a Linux child subreaper, so detached browser/server descendants are adopted when their intermediate parent exits. After direct-child exit it reaps owned children and uses the existing reviewed `NamespaceCensus` to check every original/adopted process group. Successful collection requires actual empty groups and `waitpid` confirmation that there are no children. A surviving live child triggers cleanup and fails that command; unknown/live descendants keep the outer lock held. No polling census, hashing or profiling runs inside a worker's measured windows.

Closed command logs are pinned at their close boundary; comparison step outputs are pinned before the next original step; copied setup receipts/manifests/build logs and harness inputs are pinned before runtime and rechecked afterward. Final inventories must match the earlier captured tuples. No original logs or receipts are reconstructed. Existing owners sometimes contain several fresh workers; their nested files are pinned at that owner's exit, not at every internal write. Their own recorded raw hashes still require independent comparison during the numerical audit. Adding a filesystem monitor inside ordinary timing would alter the workload and is deliberately outside this preparation.

`controls/` retains four real, bounded, non-Kairo ownership checks: normal exit; detached surviving child detected/killed/reaped with the command rejected; deadline cleanup; and closed-file replacement rejected. These establish the new helper's concrete behavior in this namespace, not whole-application acceptance. All source/setup inventories and result semantics still require independent review. Local evidence does not replace the three independent Actions workflows, updater acceptance, final three-way report, package extraction checks or user review.
