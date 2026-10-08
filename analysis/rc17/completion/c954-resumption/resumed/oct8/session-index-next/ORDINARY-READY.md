# S3 ordinary gates: prepared, awaiting runtime grant

8 October 2026. The exact-source focused semantics passed 39/39 and the twelve separate diagnostic workers passed all six parity groups (`RESULTS-DIAGNOSTIC.md`). **Neither ordinary gate has run.** PR #10 stays withdrawn and S3 remains open. This preparation adds a coordinator and receipts only; the reviewed revision-2 runner, measured workers, fixtures, source inventories and two-file baseline ablation are unchanged.

After independent coordinator review and the root's explicit serialized runtime grant, run this single command from any working directory. The final argument must name a new directory; there is no filename resumption:

```sh
python3 /workspace/scratch/a2f3334402fc/kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/oct8/session-index-next/run-ordinary-gates.py /workspace/scratch/a2f3334402fc/kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/oct8/session-index-next/ordinary-attempt1
```

The coordinator holds `/tmp/kairo-performance.lock` and `/tmp/kairo-rc16-benchmark.lock` across both phases. `KAIRO_SESSION_MATCHED_LOCK_HELD=1` may be supplied only when the parent already owns both locks. It runs `run.py OUTPUT/write --phase write`, requires successful complete outputs/parity/artifact hashes, then `run.py OUTPUT/cadence --phase cadence`. It does not use `--phase all` or repeat diagnostics.

| Phase | Fixed shapes (archives per pilot × pilots) | Order at each shape | Fresh measured workers |
| --- | --- | --- | ---: |
| Write/storage | 100×1, 100×4, 1,000×1, 1,000×4, 10,000×1, 10,000×4 | Baseline, candidate, candidate, baseline | 24 |
| Real cadence | 100×1 and 10,000×4 | Baseline, candidate, candidate, baseline | 8 |

Each phase has its own dedicated baseline seed child and byte-pinned seed copies; there are 34 children of the unchanged phase runner in total, including the two seed children. Successful phase seeds are removed by that phase. Failed phase seeds and incomplete worker directories remain at their recorded paths. A later cadence failure does not recreate the already successful write phase's deleted temporary seeds; its seed manifest, fixture hashes, outputs and receipts remain.

Write/storage measures actual populated index migration, equivalent checkpoint, ordinary reopen, 500 inserts per pilot in one transaction, 500 end updates per pilot in one transaction and final checkpoint. It validates durable full application data after reopen. Page count/size/freelist and DB/WAL/SHM observations accompany CPU/time/memory; the expected S3 migration row is checked separately. No one-sided VACUUM or forced cold OS cache is used.

Each cadence worker uses 41 actual scheduled ticks with a three-second interval and a minimum 120-second monitored interval. Tick zero's actual sampled offset anchors subsequent targets. The last tick waits for the actual first live `nextCheckAt`, as well as the outer 120-second target. Eight workers require at least 960 seconds (16 minutes) of cadence alone. Budget approximately **20–25 minutes for both gates**, an estimate rather than an observed duration. Immediate local providers, complete normalized domain/provider parity, deadline assertions, ready state and cursor 100 are checked. Only documented and asserted clock fields are normalized. There are no diagnostic SQL wrappers in the ordinary interval.

This remains the historical serial per-pilot `createSessionCombat.syncRecent` workload; production Core launches its calls concurrently. It does not establish whole-Core concurrency, startup or idle behavior. Four interior ordinary cadence cases remain explicitly unexecuted. Two process observations per arm at each shape are limited evidence, and ticks are not independent process replications. Existing adverse insert/update/storage evidence and any adverse new observations must remain in the decision.

## Provenance and failure receipts

The exact source commit is `a7b1bf97b0073695926c443e52d523638e59e48d`. Both inventories contain 488 source files. Candidate is unchanged a7; baseline removes only the eligibility index migration and restores the previous eligibility SQL/arguments in `server/store.mjs` and `server/session-combat.mjs`. R1 and every other current a7 change remain in both arms.

- Baseline fingerprint: `701f92eba05f68d4349a962009d6914aebe5afe4a49149eafbf476048e3b0d80`.
- Candidate fingerprint: `d7f6a0c6683c41576fd96f3aa0924934327b2bdc08847e686f58688df12071c8`.
- Reviewed revision-2 binding SHA-256: `68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c`.
- `ordinary-gates-binding.json` pins the added coordinator, this runbook and the original reviewed binding; it does not replace or weaken the twelve-file measurement binding.

The added coordinator saves each phase command, PID/process group and state before waiting; consumes separate stdout/stderr pipes until process close; writes each wrapper log once, fsyncs and hashes it; validates every completed phase artifact and output; and inventories existing files on failures too. It copies both source manifests, source boundary, baseline patch and harness bindings into the outer output before measurement. Source/harness checks run before phases and again in `finally` on success or failure. `sourceAndHarnessVerified` is true only after both initial and final guards pass.

SIGINT/SIGTERM request process-group shutdown, pipe drainage and a failed receipt. The wrapper checks the whole owned process group after leader close on every outcome, records any unexpected survivors, and attempts bounded TERM/KILL cleanup. A live survivor blocks artifact finalization and lock release until it exits; progress records that blocked state. Zombie-only remnants are reported as a cleanup failure, without claiming group absence. An interrupted inner worker may not have its own finalized JSON or exit receipt: the wrapper retains actual progress/log artifacts and marks that state incomplete, without inventing missing data. SIGKILL, host loss or an unwritable filesystem cannot guarantee finalization. Atomically saved progress and already written phase evidence remain. There is no log reconstruction or reuse of a failed attempt. The coordinator itself is outside measured worker processes.

The outer `progress.json` identifies the active phase; `write/progress.json` and `cadence/progress.json` identify the active child. Live per-worker logs are the existing phase runner's original logs. Outer phase stdout/stderr logs become final only after that phase coordinator closes. The outer final file is `completed.json` or `failed.json`; it never marks `releaseReady` true.
