# 0.8.0 RC Premerge Bug Review

The performance/refactor phase is complete. The correctness and usability review began on 13 October 2026 from PR #12 at `6e54542`. The starting handoff and original tested build remain recorded below.

## Active work and exact baseline

| Item | Verified identity |
| --- | --- |
| Work branch | `review/0.8.0-rc-premerge-bug-review` |
| Review | [Draft PR #12](https://github.com/BunBajiro/kairo/pull/12), targeting `main` |
| Version | `0.8.0-rc.17`; no stable release or merge authorized |
| Tested download | [Build #69](https://github.com/BunBajiro/kairo/actions/runs/38411934641/artifacts/11821673609), run38411934641 |
| Packaged application commit | `37a0e79b7d9df4e980615e7f3711e6e5f2884d12`, tree `08b2c2b9f64986a1ee260b0075ccab93fbd599f4` |
| ZIP identity | 25,949,022 bytes; SHA256 `09d905946f1dbb8fcc412e16549c10bea5cc05aa923ecab2c03d6f4bf54517f6` |
| Branch starting commit | `8a5359d9d35b556d5b756a7f2e03721c918fd390`; only AGENTS and validation documentation changed after build69 |
| Performance measurement commit | `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` |
| Final issue-closure bank | `568ce3e29213e4132a535340c1321e28c46a83cc` on `perf/rc16-checkpoint-v0.8.0` |
| Main / previous release | `239794774320fcdebaa1d76ce8a77c5c25cfc48c`,0.7.3; unchanged |

This handoff changes documentation only. Runtime, dependencies, build inputs and tests remain those of build69. Keep the original tested download; do not describe this documentation commit as another measured/tested runtime. The hosted ZIP expires12 November2026. After expiry or an application change, build the current branch through the normal Actions workflow and verify the resulting extracted package.

Build69 passed types/build, Firefox market navigation, Chrome market/session/Universe/dataset checks, and all **1,004 extracted-runtime tests**. Download verification checked ZIP CRC and all487 packaged source files against source37a, plus20 compiled assets. Bun confirmed the category-first Firefox icon fix on13 October2026. That finding,R-UI1, is closed; it is not overall approval to merge.

## Carry forward, do not restart

- All **46 original performance/refactor decisions** have evidenced fix, retain or reject dispositions. [Closed issue ledger](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/completion/c954-resumption/resumed/CURRENT-ISSUES.md).
- The [completed three-way report](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/PERFORMANCE-REVIEW-0.8.0.md) covers0.7.3,RC16 and integrated70 in separate matched historical/current groups. Preserve slower rows and separate hosts; never chain percentages across mismatched anchors or relabel measurements as the later UI commit.
- Recurring idle CPU/RSS and Maps/routes improvements are supported. Startup/first-use costs, ongoing CI typical warm HTTP p95 increases of4.950/4.452ms, state/report tails, camera component costs, retention growth and updater interruptions remain documented retained limits. They are not unresolved work requiring another speculative optimization loop.
- Selected c954/build54 ancestry is included. **Excluded508/build55 and withdrawn PR10 are not implementation bases.** Use the active branch only.
- Historical evidence remains on the analysis branches, including original failed attempts, raw artifact banks, source manifests and independent reviews. Read only the evidence needed for a new finding.

## Bug-review workflow for the next chat

1. Fetch this branch and compare actual workspace/remote state before editing; preserve any newer verified work. Read this file, [AGENTS](../AGENTS.md), [validation](VALIDATION.md), [architecture](ARCHITECTURE.md) and the relevant owner.
2. Review actual Windows/EVE/OBS behavior and affected desktop/narrow UI flows: startup/connections, pilots and freshness, Markets, Sessions/replay, Universe/Maps/routes, settings/datasets and Stream/OPSEC. These are review scopes, not newly discovered defects.
3. Record each reproduced finding below with steps, browser/build, expected/actual behavior, owning code, correction, evidence and status. Close it when its evidence supports closure. Reopen an old decision only for new concrete adverse evidence or a changed contract.
4. Check changed UI behavior in **Chrome and Firefox**. Both existing browser gates block packaging. Firefox currently automates desktop market navigation; Chrome has broader module coverage. Extend the affected-flow checks in both engines instead of claiming full parity from the existing Firefox baseline.
5. Make bounded fixes, run the relevant behavioral checks, then the normal build/package gates. Bank useful checkpoints to this branch and update this ledger. Do not repeat completed performance collection without a concrete reason.
6. Give Bun the exact successful Actions package for review. Only his later explicit approval permits merge to main and a stable0.8.0 release.

## Bug ledger

The first review pass is in progress. Findings below are separate from the closed performance ledger. Source fixes are not yet a downloadable candidate: the new Chrome/Firefox checks and normal packaged-runtime gates must pass first.

| ID | Status | Reproduction / expected / actual | Owner and change | Verification |
| --- | --- | --- | --- | --- |
| PBR-1 | Fixed; browser verification pending | Universe → Navigate → Range: set an origin and Alternate midpoint destination, then calculate. Expected midpoint candidates; actual `ReferenceError: alternateJumpMidpoints is not defined`. | `server/universe-navigation.mjs`: import the existing midpoint calculation. | New service regression fails on baseline and passes fixed; 67 navigation/routing/preparation tests pass. New compiled Chrome/Firefox desktop/narrow test queued. |
| PBR-2 | Fixed; package verification pending | During OBS `CurrentSceneCollectionChanging`, use Reconnect saved. Replacement connection retained the old transition flag indefinitely, blocking inventory/actions. | `server/obs.mjs`: reset connection-owned transition state on cancellation. | Native WebSocket regression verifies live-transition blocking, then successful reconnect, inventory and protection application; fails baseline, passes fixed. |
| PBR-3 | Fixed; package verification pending | Save a changed OBS port or password while its initial connection is pending. Save reused the cancelled promise and never connected with the new settings. | `server/obs.mjs`: await cancelled connection before opening replacement. | Native WebSocket regressions for port and password fail baseline and pass fixed. 49 adjacent OBS/Stream/lifecycle/OPSEC tests pass. |
| PBR-4 | Browser reproduction pending | Import Analyser: delay Recalculate response, then edit quantity, change strategy, or close and open another item. Source permits the obsolete response to overwrite the current quote. | `components/kairo/import-analyser.tsx`: candidate missing request ownership. No fix applied at this checkpoint. | New compiled test delays real quote responses; both browser engines queued in Actions. Local browser launch is unavailable due workspace IPC restriction. |
| PBR-5 | Open; service reproduction confirmed | Load 100 of 200 Session events, insert a delayed killmail with an earlier occurrence time, then finish pagination. Expected 201 events including the killmail; actual 200 displayed, `more:false`, delayed killmail absent. Manual head refresh recovers it. | `components/kairo/session-report.tsx` appends offset pages from mutable time order; background refresh stops beyond 100 loaded rows. Fix design pending; avoid repeatedly rereading the full timeline. | Real `sessionReport()` plus the UI deduplication merge reproduces 201 reported / 200 displayed. Browser verification pending. |

Reviewed areas: Universe/Maps/navigation, Sessions/archive/replay, startup/datasets, Stream/OPSEC/OBS and import planning. The existing targeted suites passed; this is not exhaustive usability acceptance. Actual Windows/EVE/OBS remains for Bun's in-app review.

The [internal API guide](INTERNAL-API.md) and [route/event reference](API-REFERENCE.md) describe the existing backbone for future work. Do not rebuild parallel services or add duplicate documentation around it.

## Repository cleanup and recovery

PR12 replaces the old Universe/RC17 review chain. PRs4/6/8 are internal performance archives; PR7 is the superseded RC16 candidate; PR9 is excluded build55; PR10 was withdrawn; PR11 was the completed performance/icon review. Their histories and bodies are retained when closed, never merged as cleanup.

Preserve `perf/benchmark-baseline`, `perf/database-review-v0.7.3` and `perf/rc16-checkpoint-v0.8.0`: these contain evidence outside candidate ancestry. Preserve non-ancestor recovery/withdrawn/excluded histories as archives. Other old branch refs are historical only, not active work. Cleanup disposition and verified PR closures are recorded in the [performance closure record](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/oct13/premerge-handoff/CLOSURE.md).

The package Actions run and raw evidence banks are retained. The analysis branch is investigation-only; never package or merge it into the application. No release tag was created, main was not moved, and the bug hunt now proceeds on PR #12.
