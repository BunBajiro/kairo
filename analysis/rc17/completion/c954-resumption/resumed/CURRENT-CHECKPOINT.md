# 0.8.0 RC17 — build69 user-review follow-up

> **13 October update:** Build 69/source37a supersedes build66. R-UI1 is **patched, awaiting Bun's category-first Firefox retest**. The recovery defect is fixed and focused/browser/package checks pass; the original symptom was not reproduced in synthetic baseline. [Evidence and retest](oct13/market-icons/REVIEW.md). The 46 prior refactor decisions stay closed; no merge/release approval has occurred.

13 October 2026. **The declared automated acceptance gates are complete. The updated 0.8.0-rc.17 package is ready for the R-UI1 retest; that user finding remains open.** All 46 component findings have supported fix, retain or reject decisions in [CURRENT-ISSUES.md](CURRENT-ISSUES.md). The [three-version performance report](../../../PERFORMANCE-REVIEW-0.8.0.md) is complete and preserves slower rows and evidence limits. No merge, stable release or user-environment approval has occurred.

## Exact candidate

| Item | Identity |
|---|---|
| Download | [Build 69 — tested package](https://github.com/BunBajiro/kairo/actions/runs/38411934641/artifacts/11821673609) |
| Review PR | [PR #11](https://github.com/BunBajiro/kairo/pull/11), held draft for user review |
| Package source | `37a0e79b7d9df4e980615e7f3711e6e5f2884d12`, tree `08b2c2b9f64986a1ee260b0075ccab93fbd599f4` |
| Measured runtime source | `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, tree `35826c9d50c45702ff103e1f173e05c529ba2d9c` |
| Package | 25,949,022 bytes; SHA256 `09d905946f1dbb8fcc412e16549c10bea5cc05aa923ecab2c03d6f4bf54517f6` |
| Package version | `0.8.0-rc.17`; the review download may be named `Kairo-v0.8.0-rc17-market-icons-review.zip`, with identical bytes |
| Source continuity | Build66/0149 preserved measured70 runtime; build69 adds the focused ItemName/CSS correction, changelog and browser tests/workflow. Performance numbers remain measured70. |
| Selected history | c954/build54 is included; excluded508/build55 is not an ancestor |
| Historical versions | 0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c`; RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` |

Build 69 passed types/build, focused Firefox/Chrome icon checks, existing session/Universe/dataset browser checks, and all 1,004 tests from the exact extracted ZIP before upload. The downloaded original ZIP passed CRC and all 487 packaged source files match source37a; 20 compiled assets are inventoried. [Current package and browser evidence](oct13/market-icons/REVIEW.md). Earlier build66 source/compiled continuity remains historical evidence in its [package audit](oct11/release-preparation/package-build66/REVIEW.md); those compiled-byte equivalence claims do not apply to the changed UI in build69.

## Completed acceptance

| Scope | Result and evidence |
|---|---|
| Combined source and compiled controls | 1,004 tests/types/build; 89 compiled controls (Assets 31, actual-Core names 10, races 10, Maps clock 13, Session focus 25). [Compiled result](oct8/final-merged-frontend/RESULTS.md) |
| Runner/namespace and closed-evidence guard | 27 namespace controls and 10 retained-evidence controls; both independently reviewed. [Namespace correction](oct8/final-source-gates/NAMESPACE-FIX.md) |
| Local final matrix | Historical 0.7.3/RC16 and all eight RC16/current lanes; startup/full-contract/original-database, configured first binding, original seven-lane UI scope and real updater. [Full report and evidence index](../../../PERFORMANCE-REVIEW-0.8.0.md) |
| Independent comparison | [38176821997](https://github.com/BunBajiro/kairo/actions/runs/38176821997), all lanes plus historical anchor; artifact/source/harness and full arithmetic reviews complete. [Review](oct11/independent-actions/comparison-attempt1/CI-COMPARISON-REVIEW.md) |
| Independent UI | [38179056807](https://github.com/BunBajiro/kairo/actions/runs/38179056807), 1,004 tests and all seven lanes; 1,021 offline audit controls, 486 source files and 215 harness pins. [Review](oct11/independent-actions/ui-recovery2/RESULTS-REVIEW.md) |
| Independent updater | [38176822054](https://github.com/BunBajiro/kairo/actions/runs/38176822054), 25 inventory activations/six nominal 60-second windows, exact source/archive and 87 audit controls. [Review](oct11/independent-actions/updater-attempt1/RESULTS-REVIEW.md) |
| Full export / stopped upgrade / two reopens | One reviewed Oct13 attempt; four complete export/SQL comparisons, 24 retained tables, 24 authorization rejections, zero external requests, unchanged original stopped directory, actual descendant drain and all closed hashes. [Independent review](oct11/release-preparation/export-closure/INDEPENDENT-OCT13-RESULT-REVIEW.md) |
| Exact extracted package | [Build 69](https://github.com/BunBajiro/kairo/actions/runs/38411934641); original ZIP hash, 487 source files and 20 compiled assets inventoried; 1,004 extracted runtime tests passed. [R-UI1 follow-up](oct13/market-icons/REVIEW.md) remains pending user retest. |

Performance collection occurred October 11; final offline audits and the synthetic export supplement completed October 13. Workspace resets required restoration of files and fresh export execution inputs, not another performance collection. The initial failed local/CI attempts remain failed and preserved. The UI recoveries fixed only build ordering and a compact-number assertion; application source did not change.

## Performance disposition

Retain the integrated implementation for candidate review. Lower recurring idle CPU and resident memory reproduce in both local and CI pairs; Maps, routes and camera total task work improve. The report keeps historical 0.7.3→RC16 costs, separate matched RC16/current groups and separate hosts. It does not claim a direct chained 0.7.3/current percentage or universal improvement.

The accepted startup/first-Assets trade-off stays closed. Independently, CI typical warmed HTTP-state p95 is slower by 4.950/4.452 ms in its two pairs; local stress tails and full Session costs also remain visible. That ongoing tail is not relabelled startup, fixed or causally explained. Camera component/short-idle costs, bounded retention growth and updater restart interruptions remain documented. The repeated diagnostic markers received a retain disposition after complete review; no evidenced new correctness or redundant-work defect justifies another speculative optimization cycle.

## User review, then approval

1. Stop the previous Kairo instance and extract the complete designated ZIP into a fresh application folder. Use Node 24+ and launch `Kairo/START_KAIRO.bat`; no npm install/build is needed for this compiled package.
2. Check your actual EVE SSO/scopes, connected pilots, data freshness, Sessions/replay, Maps/routes, Markets and longer-session responsiveness.
3. Check the real OBS scene, widgets, covers/OPSEC and reconnect behavior under your Windows account. Automated synthetic checks do not establish Windows DPAPI, live provider permissions or your physical OBS configuration.
4. First retest Market category icons in Firefox before All items. Report any issue against build69/source37a, or explicitly approve after review. Only then may merge and stable release proceed.

The export test covers an actual synthetic RC16 directory, not Bun's installed database or an export/import feature. Source docs explain local data/backup and privacy boundaries. **PR #10 remains withdrawn/draft and must not be used for review.** PR #11 is the designated candidate; main is unchanged.

## Development and recovery

Kairo's backbone is Core/domain services over SQLite, reached through the private HTTP boundary. Owned semantic events and scoped UI invalidation refresh read models; OBS uses separately sanitized read-only projections. Future features should extend the owning service and its tests, then update the [internal API guide](https://github.com/BunBajiro/kairo/blob/0149e86638aa7bef279f24a6425504345ae1179f/docs/INTERNAL-API.md) and [route/event reference](https://github.com/BunBajiro/kairo/blob/0149e86638aa7bef279f24a6425504345ae1179f/docs/API-REFERENCE.md) together. Nine superseded documents were pruned; the maintained documentation map is in the package.

Application backup: branch `refactor/rc17-c954-continuation-v0.8.0` at 37a0e79. Evidence/report backup: `perf/rc16-checkpoint-v0.8.0`. Restore raw banks with `oct8/restore-evidence.py MANIFEST NEW_DESTINATION`; it checks chunks/archive/files without overwriting changed bytes. Current independent [comparison bank](oct11/independent-actions/comparison-attempt1/bank/RAW-MANIFEST.json), [UI bank](oct11/independent-actions/ui-recovery2/bank/RAW-MANIFEST.json), [updater bank](oct11/independent-actions/updater-attempt1/bank/RAW-MANIFEST.json) and [export bank](oct11/release-preparation/export-closure/RAW-OCT13-ATTEMPT1.json) preserve the completed evidence. The report links earlier local banks and failures. Build 69's hosted download expires November 12; source, inventories and these raw evidence banks remain in Git. Historical reset details stay in [EXECUTOR-RECOVERY.json](oct11/EXECUTOR-RECOVERY.json) and [RESET-RESUMPTION.json](oct11/RESET-RESUMPTION.json); they are not current blockers.
