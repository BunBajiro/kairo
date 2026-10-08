# S3 harness prepared for independent review

8 October 2026. **Prepared only; no Kairo module, test, diagnostic worker or timed workload has been executed for this harness. Independent review and the root's runtime slot remain required. S3 is open and PR #10 remains withdrawn.**

The root explicitly selected exact `a7b1bf97b0073695926c443e52d523638e59e48d` for this next experiment, superseding the earlier plan's requested c9 boundary. `prepare-sources.py` was executed solely to create two source worktrees, apply the declared two-file baseline ablation, and hash static files. Candidate `/workspace/scratch/a2f3334402fc/kairo-s3-a7-candidate` is clean exact a7; baseline `/workspace/scratch/a2f3334402fc/kairo-s3-a7-baseline` differs only in `server/store.mjs` and `server/session-combat.mjs`. R1, the accepted hidden filter and Assets boundary remain in both arms. The historical binding/recipe documents are retained; their two source replacements were verified against the identical a7 bytes before application.

`baseline-source.json` and `candidate-source.json` contain full source inventories compatible with `source-manifest.mjs`. `baseline-ablation.patch` is the exact baseline intervention. `source-boundary.json` binds the roots and fingerprints; the baseline fingerprint is `701f92eba05f68d4349a962009d6914aebe5afe4a49149eafbf476048e3b0d80`, candidate `d7f6a0c6683c41576fd96f3aa0924934327b2bdc08847e686f58688df12071c8`. Python AST parsing and `git diff --check` are the only syntax/whitespace checks performed; JavaScript has not been parsed by Node or executed.

## Prepared files and fixed execution shape

- `common.mjs`: full source/harness guards, process/phase observations, blocked external transports, storage snapshots and complete application-table digests. The expected S3 migration row is checked separately and excluded from cross-arm data digests; SQLite implementation tables are excluded. No other durable application row is excluded.
- `fixtures.mjs`: a dedicated baseline child builds and checkpoints twelve byte-pinned seeds: six write shapes and six collector shapes. It uses the real pre-S3 `openStore`. Every fresh measurement worker receives a verified identical file copy; no measurement worker seeds or imports baseline services first.
- `write-worker.mjs`: actual populated `openStore` migration, equivalent checkpoint, close, ordinary reopen, 500 SQL inserts per pilot in one transaction, 500 end updates per pilot in one transaction, equivalent final checkpoint and durable reopen verification. SQL statements/input values are prepared outside measured operations; every generated ID, pilot owner, start/end and full-table digest is checked outside timings. Storage includes page count/size/freelist and DB/WAL/SHM bytes before and after migration, writes and checkpoints. No VACUUM or manual index creation is used.
- `cadence-worker.mjs`: real `createSessionCombat.syncRecent` with immediate local providers, either separate diagnostic wrappers or ordinary host timing. It deliberately awaits pilots sequentially, preserving the historical collector workload. Production Core launches its pilot calls without awaiting; this lane cannot establish Core overlap/whole-app performance.
- `run.py`: optional self-acquisition of both established locks, fresh output directory, no filename resumption, dedicated seed child, process receipts, before/end full source and harness guards, all-arm explicit parity, complete/failed artifact manifests, and cleanup only after success. Failed seeds/workers remain inspectable.

The runner requires `--phase diagnostic`, `--phase write`, `--phase cadence`, or `--phase all`. Diagnostics run both arms at all six archive/pilot shapes. Writes run six shapes × baseline/candidate/candidate/baseline = 24 fresh workers. Ordinary cadence runs 100 archives/one pilot and 10,000 archives/four pilots × ABBA = eight fresh workers and at least 16 minutes of real interval time. No interior ordinary cadence shape is executed or silently promoted to complete. Separate phase invocations create separate attempts/seeds; parity is asserted within an attempt, never inferred from unrelated fixture hashes.

Example commands for the coordinator **after review and runtime grant**, from this directory:

```sh
python3 run.py diagnostic-attempt1 --phase diagnostic
python3 run.py write-attempt1 --phase write
python3 run.py cadence-attempt1 --phase cadence
```

The coordinator's conventional `KAIRO_SESSION_MATCHED_LOCK_HELD=1` means it already holds both `/tmp/kairo-performance.lock` and `/tmp/kairo-rc16-benchmark.lock`; otherwise the runner acquires them before starting. Workers assert this ownership declaration. They must not be launched directly without the coordinator.

## Deadline and parity contract

There are exactly 41 ticks. The first ordinary tick records its real sampled offset; subsequent deadlines are that offset plus 3,000 ms per ordinal. This also prevents a first-tick rounding offset from leaving the active Session's 3-second partial-history retry just beyond tick 1. The final tick waits for both the outer 120,000 ms target and the live feed's actual first `nextCheckAt`. The latter is read once after the first tick and checked against the actual sample. No extra forced sync or simulated ordinary tick supplies the final provider response.

The domain clock samples monotonic host elapsed time at each tick and stays fixed within that tick, as in the historical collector harness; host Date.now and timers remain real. The 41 tick durations, actual offsets/lateness, total elapsed/CPU, event-loop distribution, point memory and cumulative maxRSS are recorded. Tick samples are not independent process replications. Initial-deadline observation and periodic progress messages occur outside tick-work durations but inside the total monitored interval; provider adapters retain small ordered receipts in both arms. There are no SQL wrappers or SQL-returned-ID arrays in ordinary mode.

Diagnostics assert exact ordered eligibility at every tick, exact cutoff/tie controls, 143 returned IDs and Session reads per pilot, seven route queries/4,006 returned route rows per pilot, 17 historical calls per pilot, zero verification, and the three live responses `sequence.json → 100.json → 100.json` (200/404/404). Returned rows do not measure internal SQLite rows examined. Ordinary mode checks the same final provider, ready-state/cursor and complete application-output contract, with preflight ordered IDs at five cutoff points; its `expectedEligibilityOracleSha256` is labelled expected, not a fabricated observation of timed SQL.

Only explicitly checked clock fields are normalized for cross-arm collector parity: final Session `updatedAt` must equal its expected tick (1 for active, 0 otherwise); live `lastAdvanceAt`, `checkedAt`, `nextCheckAt` and `notBefore` must equal tick 0, tick 40, and the declared offsets. Raw states/digests remain in outputs. Other fields, provider order, ownership, rows and revision/cursor values are exact. A delayed schedule that changes the twenty pre-cutoff ticks fails instead of being normalized into success.

## Remaining review and acceptance risks

The JavaScript worker paths are unexecuted and need independent review before semantic/diagnostic runtime. The source inventories were generated statically with the same schema/fingerprint spelling as the shared helper; the first worker will verify that compatibility before importing application code. Review should especially check provider ordering expectations, timestamp normalization, seed/durable digests, actual index migration and failure/cleanup handling.

The existing exact-source Session eligibility/live/collector/lifecycle semantic suite still needs a coordinator receipt; this harness does not substitute for disabled/reauth, pending, settling, end-write, verification or close/drain tests. Planner diagnostics and six write shapes plus two real endpoints are a bounded gate, not automatic justification for omitting interior cadence or closing route/report work. Retain historical adverse insert/end/update/storage rows and any new adverse observations in the eventual decision. This lane cannot close S1 report, R1 replay, F6 DOM, whole-Core startup/idle, or Clean RC17.

Independent review identified receipt/cleanup robustness gaps, not a workload or SQL mismatch. Revision 2 moves initial guards under the failure-receipt path, inventories artifacts on failures as well as success, records seed/worker directory cleanup failures before final output, and attempts collector/store close independently. These corrections are statically prepared and remain unexecuted.
