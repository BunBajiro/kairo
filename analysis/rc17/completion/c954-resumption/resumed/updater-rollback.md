# U2b rollback correction on the c954 continuation

**Verified source bank:** `f01072674c044f39badc5e5e56c0c3d676621c07`, direct child of 9331b19, contains exactly these two updater files. The later integrated gate passes **951/951 tests, types and a fresh build**. Use [verification-completed.json](integrated-correctness-1/verification-completed.json) and [fresh-build-receipt.json](integrated-correctness-1/fresh-build-receipt.json); the original receipt-writing filename collision remains visible. The development narrative below retains its precommit source labels.

Work in progress, 7 October 2026. Application changes were developed directly from the user-selected c954 source. The continuation HEAD is now `9331b19c309a910f037825e3098a46c260bb2c41`, the separately banked native-timer correction; this updater work changes only `server/datasets.mjs` and `tests/kairo/datasets.test.mjs`. No source from excluded build #55 was imported. PR #10 remains withdrawn. This record is not final RC17 acceptance.

## Defect and selected ownership

At c954, `rollbackDatasetRuntime` removed `pending.json` before selecting the valid active generation. A locked failed pointer could therefore prevent recovery. Simply making removal best-effort was insufficient: a still-present valid payload and pointer could be selected again on the next launch.

The earlier saved `updater/rollback-recovery.patch` was reviewed as a proposal. Its decision to make every `state.json` read activation-critical was rejected: that file also contains ordinary update cache/advisory status, and the existing successful-commit contract deliberately permits post-commit bookkeeping failure. This implementation preserves that contract.

A failed UUID instead has an atomic, per-generation **external rejection marker**, named `activation-rejected-build-<build>-<uuid>.json` beside the generation directories. Rollback writes it before touching pointers or cleanup. Selection and explicit commit reject marker presence without depending on parsing its body; truncated content or an unexpected directory at that marker path cannot grant permission to retry the failed UUID. A new manual download receives another UUID and is unaffected even when the official build number is the same.

The marker is outside recursive payload removal. Cleanup retires it only after confirming that the failed generation directory no longer exists. Thus a partial recursive removal followed by a locked payload cannot erase rejection, and markers do not accumulate after their generation is successfully retired. Unrelated pointer errors and successful activation of another UUID do not clear a still-needed marker.

An initial local draft put the marker inside the generation. Independent static review correctly identified that partial recursive deletion could remove it before failing on remaining payload files. That draft was not tested, committed or published; the external-marker revision and a concrete partial-removal regression replace it.

## Recovery and visibility

- Rollback selects the verified active generation and sends failed pending-pointer removal through the existing warning-producing cleanup path. It no longer promises that the previous runtime has already restarted.
- Failure to write the rejection marker is explicit and happens before pointer removal. Activation refusal surfaces rollback failure ahead of the original message, so truncation cannot hide the recovery error.
- Ordinary post-commit `state.json` bookkeeping retains its previous semantics. An unreadable pending generation still permits independently verified active fallback.
- The service retains the cleanup return value in memory, including a warning-persistence failure; rereading stale or absent `cleanup.json` cannot erase that immediate warning.
- Existing warning/hourly maintenance recognizes rejected pending generations, retries their pointer/payload removal after unlock, and preserves the current runtime's active-directory lease.
- The existing `state.json` failed-build suppression remains separate: automatic failed-build retry is blocked; an explicit manual retry may prepare a fresh UUID.

## Targeted verification scope

Nine new fault/identity/status tests cover:

1. Locked failed pointer and directory, repeated startup selection, actionable warnings and eventual retirement.
2. Fresh UUID retry of the same official build, successful commit and refusal to commit the older rejected UUID.
3. Unrelated invalid pointer plus truncated/directory marker contents preserving rejection.
4. Marker-recording failure before pointer deletion, without a false restoration message.
5. Unreadable pending-generation fallback to independently valid active data.
6. Immediate refusal cleanup warnings, unlock-on-check retry and marker retirement.
7. Advisory bookkeeping failure during refusal exposed as recovery failure, with rejection retained.
8. Partial recursive deletion leaving valid payload/pointer bytes: repeat startup still rejects, direct commit still refuses.
9. Cleanup-warning persistence failure retained in live service status.

The existing successful-pointer-publication/advisory-failure test remains unchanged. Independent follow-up review of the revised source found no material issue. The review also required preserving valid fallback for a bad pending generation and retaining the in-memory cleanup warning if its own persistence fails; the revised implementation and tests cover both.

## Executed focused gate

[Attempt 1 source inventory](updater-rollback-attempt-1/source.json), [full log](updater-rollback-attempt-1/tests.log) and [immutable receipt](updater-rollback-attempt-1/receipt.json) record **93/93 passing tests**, zero failures/skips, at Node 24.19.0. Test files ran sequentially under the coordinated `/tmp/kairo-performance.lock`: datasets, dataset HTTP/connection, SDE builder and real Worker limits, runtime supervisor/child/lock, and lifecycle. The first attempt passed; no failed attempt was discarded.

The receipt pins HEAD `9331b19c309a910f037825e3098a46c260bb2c41` plus exactly the two uncommitted updater files. Whole source, tests and existing compiled-file inventory were verified unchanged before/after the run; fingerprint `6e359a8b285302ae0295c406afb5885e7e62681eeb36b5a393ca29212493f07b`. The captured compiled assets were not rebuilt or exercised by these Node tests. The log SHA-256 is `2113f485bc50d923641eb9504fe083bd75b83eeeb02749d34db3cb4f4b509276`. The 93 count includes the nine new regressions and existing related suites; it is not an additional 93 independent domain findings.

Runtime ownership was released after the 5-second focused run. Source is stable for the root's integrated correctness/type/build gate and checkpoint. No fresh real-archive loaded conversion or independent CI run is claimed by this correction. The earlier c954 U1 evidence remains source-bound; affected final combined loaded-worker/restart and independent CI acceptance still belong to the overall RC17 gate. Static diff whitespace check passes.

## Integrated correctness and fresh build

Root subsequently granted the exclusive runtime slot for the full gate. `npm run test:kairo` passed **951/951** tests with zero failures/skips; `npm run check:kairo` and `npm run build` both exited zero. The source was frozen at HEAD `9331b19` plus the two updater files, and all **482 source files** remained byte-identical before/after the commands.

Before compilation, the entire prior `dist` was renamed to `/workspace/scratch/a2f3334402fc/recovery-c954-builds/933-before-u2b-1791380603241/dist`; the build-start inventory has zero client assets. The fresh build emits **20 client assets** rather than retaining the previous inventory's 26. Its final source/build fingerprint is **`47d9d44d087be3e85c08372503b4af0cd2fad88cc8ef53fec86fa5da90beb73e`**.

Evidence is under [integrated-correctness-1](integrated-correctness-1/): full `tests.log`, `types.log`, `build.log`, before/build-start/final source inventories, individual command exits/hashes and [fresh-build-receipt.json](integrated-correctness-1/fresh-build-receipt.json). The first evidence writer accidentally used `build-receipt.json` both for the individual command receipt and final combined receipt; exclusive creation correctly refused the second write. The original `completion.json` preserves that bookkeeping failure. [verification-completed.json](integrated-correctness-1/verification-completed.json) records the subsequent successful read-only reconciliation: every command exited zero, all log hashes matched, build-start assets were absent, and the complete saved post-build source/assets still matched the workspace. No test or build was repeated, no application source changed, and the original failed metadata-write record was not overwritten.

Runtime ownership is released. The code is ready for a bank checkpoint and affected compiled/loaded-worker/final CI gates; this is not a clean-RC17 declaration.
