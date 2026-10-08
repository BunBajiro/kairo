# Names + M6 + F6 focus integration and final compiled wiring

8 October 2026. Preparation only: no application build, test or browser run in this lane. The coordinator owns main source edits, commits and the final runtime grant. PR10 remains withdrawn.

## Read-only application checks

At clean `de3a8d070c0e6828d8bde728a1aff42778b04529`, combined `git apply --check` for the frozen names and M6 patches exits0. Existing names inputs (`dashboard.tsx`, `server/core.mjs`, `server/index.mjs`) match the reviewed proposal's baseline hashes exactly, and the three new helper/test files are absent. The names and clock patches touch disjoint paths, so no merge conflict or replacement of the accepted Assets file is needed. All ten resulting file hashes, plus the accepted Assets file hash, are pinned in `PREPARED.json`.

The coordinator began applying names/M6 and API docs during this read-only task. A subsequent attempt to recheck the names patch correctly reports its new files already present; that is not a new source conflict. A separate F6 focus-patch check against that then-current tree exits0. The observed status is retained in `PREPARED.json`. This agent made no edits to main.

| Change | Frozen patch | Paths / integration action |
|---|---|---|
| Revisioned names publication | `../../names-protocol-227/names-protocol.patch` | `dashboard.tsx`, new `name-directory-state.mjs`, `server/core.mjs`, `server/index.mjs`, two new name-directory tests. Apply patch only; copying the old227 branch would lose accepted later work. Sibling confirms no source changes since the reviewed proposal/build. |
| Clock owner | `../frontend-clock/clock-refresh.patch`, SHA`ca12f9eb560eebf112b9c127edccd06b634879da1dbc59f7a7c350ab4964076f` | `jspace-workspace.tsx`, `jspace-clock.mjs`, declaration and clock tests. Includes the reviewed render/effect rollback fallback. |
| F6 report/naming focus | `../../session-archive-f6/focus-candidate/focus-restoration.patch`, SHA`32c908a8687c0fbd57ac179d1d32f75d59d5b61ca48064ed2af0baa8d112560c` | `intelligence.tsx` and `session-report.tsx`. The historical proposal manifest says unvalidated, but `focus-gate2/receipt.json` is the completed25-control evidence. Memo screening is a separate decision; if adopted, combine it on the same intelligence file before final freeze. |
| API docs | `../../names-protocol-227/api-doc-proposal/api-docs.patch` | Prepared against de3 docs by the names owner; coordinator incorporates it with source adoption. It is not part of the protocol's original six-file source trial. |

For a still-unmodified de3 checkout, the integration order is names patch, clock patch, API docs, then accepted F6 focus/memo changes. A patch already applied must not be reapplied. Verify resulting accepted hashes, review the diff, and commit/bank source before final freeze. Wait for the remaining F6/M9/S3 decisions before recording the final source SHA. Full suite/type/build/package gates remain coordinator-owned; this wrapper does not run or replace them.

Subsequent F6 decision: the coordinator accepted card memo patch `719fc58da60cca22399f35f9dd44f91dc03dca69c6cfdb5ccab71b599a8aa464` after the focus patch. The combined intelligence file is `4c3f21fed3d50a453c58df6b6f448ba93e7d2d6942f5bc6b1ad397d3eb797dd4`. The independent frontend numeric/source review is retained in the F6 lane; the same 25 focus checks still apply on the final merged build.

## Why a new wrapper is required

Historical top-level runners hard-code old source roots/manifests or227 proposal fingerprints. Running them against current main would either reject valid later changes or misattribute the result. Their worker entrypoints already accept an application root and a source manifest; those fixtures and assertions remain reusable.

This folder preserves external copies of the31-control Assets worker and the reviewed revision6 actual-Core names fixture/protocol/race workers. Changes are limited to relative imports, correct integration wording and strict cleanup after actual Chromium exit. No assertion, fixture shape, callback gate, native input or publication sequence is removed. The names fixture is byte-identical. The F6 focus copy likewise changes imports and stronger cleanup only. M6 reuses the existing frozen correctness worker directly. `PREPARED.json` binds every original/copy/helper hash.

No new full-map cache, protocol, broad Context split, scene comparator or application instrumentation is added by this wrapper. Diagnostic Array/formatter/fetch/callback adapters are the established correctness fixtures, never performance evidence. `--timing` is not supplied; there is no ABBA loop or new performance matrix.

Review-version note: `NAMES-INTEGRATION-REVIEW.md` records revision3; the subsequent coordinator review covers the stronger interruption/unknown-group cleanup in the final wrapper. Its reference to a final performance matrix means the existing whole-application runbook, not an additional names/M6/F6 matrix requested by this lane.

## One frozen final-build correctness pass

`run.py` requires five explicit arguments: `--root`, full `--commit`, `--prebuild`, `--built`, and a new `--output` directory. Both source manifests must describe the same clean commit/root/source files. The pre-build manifest must have no compiled assets; the post-build manifest must have compiled assets. Create these around the coordinator's one fresh build in a clean final source checkout; do not relabel the old a7 or227 outputs as final. The wrapper verifies the post-build source/assets before and after each worker and at completion, pins the browser executable/CDP version, and keeps the shared flock through final guards and completion writes.

| Existing worker | Checks | Final integration contract |
|---|---:|---|
| Assets semantics |31| Full metadata, whole-name deep fitting labels, open details, source/price changes, sort/query/page retention, legacy snapshot compatibility, delayed state/pilot fences, stale/disabled/scope/zero-character actions. This worker still deliberately sends legacy snapshot envelopes; it is not the new protocol transport proof. |
| Actual Core names |10| Real20-Wallet publications with exactly20 received snapshots, no repeated full directory after bootstrap, changed directory before snapshot, different-pilot global names, expanded fitting and table state. Same sparse20k/550,001-byte names/two10k Assets fixture; no timing claims. |
| Names races |10| Compiled clean legacy first open, initial error recovery, held HTTP versus new Core publication, batching, authoritative/legacy recovery, pilot switch, zero-client/remount ownership and actual server restart/new process epoch. |
| M6 clock correctness |13| Existing100/600-node24-action sequence: metadata, same-revision pilot/record, real expiry/rally/stale→waiting, selection/native drag save/camera, with exact(0,0)→(60,28) saved positions. Its recorded Performance counters are diagnostic-only in this combined pass. |
| F6 focus |25| Exact connected opener after native Enter/Escape/Close;270 ordered report events retained during publication; active duration updates; live/end report, route/map/pilot teardown and naming cancellation focus. Successful naming submission while its opener is busy remains outside the accepted guarantee. |

Total89 existing checks across five fresh browser/app workers. Expected duration roughly2–3minutes, excluding the coordinator's build. F6's final `intelligence.tsx` bytes are bound by the full final manifest rather than a hard-coded pre-memo digest; this allows only the coordinator's final frozen choice, while the same focus fixture must pass. The unchanged accepted report component, names, Assets and clock source hashes remain explicit guards.

Launch only after the coordinator grants runtime:

```sh
env KAIRO_FINAL_FRONTEND_GRANTED=1 python /workspace/scratch/a2f3334402fc/kairo-analysis-restored/analysis/rc17/completion/c954-resumption/resumed/oct8/final-merged-frontend/run.py --root FINAL_ROOT --commit FULL_SHA --prebuild PREBUILD_JSON --built BUILT_JSON --output NEW_OUTPUT_DIRECTORY
```

All failures remain in a new output directory with failure/final-guard receipts. The initial progress receipt is saved atomically before preparation/input reads. Each child has an owned process group; SIGINT/SIGTERM triggers group shutdown and observed exit before closed logs/raw files are hashed. A group that still has a live process keeps the shared lock until that process exits and marks cleanup failed. An unknown process-group state likewise retains the lock until observation recovers, and still fails cleanup. Final source/assets and harness/input guards run independently, including after failure. SIGKILL or host loss can still prevent final receipts; existing atomic progress and raw files remain.

The worker result is complete only after independent cleanup stages pass and actual Chromium exit is observed. No automatic retries or mutation of the frozen build occur. This correctness pass supplies merged wiring evidence; existing isolated performance decisions/adverse observations and final package/CI/real-EVE/OBS/Windows boundaries remain separate.
