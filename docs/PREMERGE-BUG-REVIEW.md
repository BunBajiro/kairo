# 0.8.0 RC Premerge Bug Review

The performance/refactor phase is complete. The correctness and usability review began on 13 October 2026 from PR #12 at `6e54542`. The starting handoff and original tested build remain recorded below.

## Current verified candidate

All five confirmed findings in the [bug ledger](#bug-ledger) are fixed and verified in build #72. The source changes and intermediate evidence are banked on the review branch. This completes the first automated review pass; actual Windows/EVE/OBS acceptance remains for Bun.

| Item | Verified identity |
| --- | --- |
| Work branch / review | `review/0.8.0-rc-premerge-bug-review`; [draft PR #12](https://github.com/BunBajiro/kairo/pull/12), targeting `main` |
| Version | `0.8.0-rc.17`; no stable release or merge authorized |
| Tested download | [Build #72 ZIP](https://github.com/BunBajiro/kairo/actions/runs/38421552532/artifacts/11826986872); expires 12 November 2026 |
| Packaged application commit | `4ffe436ab5ddd16ee72ee0f63c7777bdf0286c5f`, tree `e4dfed0ccb3f1ab15478ed607b707f104226b852` |
| ZIP identity | 25,972,968 bytes; SHA256 `a6d4c3c3371eca5728a4184090bec42b32263d2e64d8cda17327427ef2c71b34` |
| Download verification | CRC passes; all 495 packaged source files match the tested commit; 20 compiled assets present |
| Automated gates | Types and fresh build pass; all browser steps pass; **1,016/1,016** tests pass in both Actions and the independently downloaded/extracted package without source dependencies |
| Main / previous release | `239794774320fcdebaa1d76ce8a77c5c25cfc48c`, 0.7.3; unchanged |

[Structured candidate evidence](review-evidence/2026-10-13-fixed.json) preserves the 4 navigation, 36 import and 32 Session browser checks, exact package identity and verification scope. Screenshots and existing market/session/Universe/dataset checks remain in [Actions run 38421552532](https://github.com/BunBajiro/kairo/actions/runs/38421552532). Chrome 154.0.8037.97 and Firefox 153.0 both exercised the new flows at 1600px and 390px widths. Narrow Firefox screenshots were inspected for navigation, imports and Session paging.

The final evidence bank changes only `AGENTS.md`, this handoff, `docs/VALIDATION.md` and the structured candidate evidence. It does not change the tested runtime, dependencies, build inputs or tests, or relabel historical performance measurements. The package contains the ledger as of its source commit; this live branch ledger carries the subsequent verification closure.

## Starting baseline (historical)

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

The original handoff changed documentation only, with runtime, dependencies, build inputs and tests still those of build69. Build72 above supersedes that download for the current bug-review candidate. Historical measurements retain their original source identity. After an artifact expires or the application changes, build the current branch through the normal Actions workflow and verify the resulting extracted package.

Build69 passed types/build, Firefox market navigation, Chrome market/session/Universe/dataset checks, and all **1,004 extracted-runtime tests**. Download verification checked ZIP CRC and all487 packaged source files against source37a, plus20 compiled assets. Bun confirmed the category-first Firefox icon fix on13 October2026. That finding,R-UI1, is closed; it is not overall approval to merge.

## Carry forward, do not restart

- All **46 original performance/refactor decisions** have evidenced fix, retain or reject dispositions. [Closed issue ledger](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/completion/c954-resumption/resumed/CURRENT-ISSUES.md).
- The [completed three-way report](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/PERFORMANCE-REVIEW-0.8.0.md) covers0.7.3,RC16 and integrated70 in separate matched historical/current groups. Preserve slower rows and separate hosts; never chain percentages across mismatched anchors or relabel measurements as the later UI commit.
- Recurring idle CPU/RSS and Maps/routes improvements are supported. Startup/first-use costs, ongoing CI typical warm HTTP p95 increases of4.950/4.452ms, state/report tails, camera component costs, retention growth and updater interruptions remain documented retained limits. They are not unresolved work requiring another speculative optimization loop.
- Selected c954/build54 ancestry is included. **Excluded508/build55 and withdrawn PR10 are not implementation bases.** Use the active branch only.
- Historical evidence remains on the analysis branches, including original failed attempts, raw artifact banks, source manifests and independent reviews. Read only the evidence needed for a new finding.

## Continuing the bug review

1. Fetch this branch and compare actual workspace/remote state before editing; preserve any newer verified work. Read this file, [AGENTS](../AGENTS.md), [validation](VALIDATION.md), [architecture](ARCHITECTURE.md) and the relevant owner.
2. Review actual Windows/EVE/OBS behavior and affected desktop/narrow UI flows: startup/connections, pilots and freshness, Markets, Sessions/replay, Universe/Maps/routes, settings/datasets and Stream/OPSEC. These are review scopes, not newly discovered defects.
3. Record each reproduced finding below with steps, browser/build, expected/actual behavior, owning code, correction, evidence and status. Close it when its evidence supports closure. Reopen an old decision only for new concrete adverse evidence or a changed contract.
4. Check changed UI behavior in **Chrome and Firefox**. Both browser gates block packaging. Both now cover Range navigation, import quote ownership and Session paging at desktop/narrow widths; Firefox also covers desktop market navigation and Chrome has broader module coverage. Extend the affected-flow checks in both engines instead of claiming full parity across the product.
5. Make bounded fixes, run the relevant behavioral checks, then the normal build/package gates. Bank useful checkpoints to this branch and update this ledger. Do not repeat completed performance collection without a concrete reason.
6. Give Bun the exact successful Actions package for review. Only his later explicit approval permits merge to main and a stable0.8.0 release.

## Bug ledger

The first automated review pass is complete: five findings, five fixes verified in build72, no open confirmed finding in this ledger. Bun confirmed that fixes and general performance work must preserve the intended experience without exposing internal repairs in product UI; this is a standing rule in `AGENTS.md`. Findings below remain separate from the closed performance ledger. Keep this live ledger populated as new evidence arrives; record a finding when reproduced, then update its fix, checks and checkpoint before banking progress.

| ID | Status | Reproduction / expected / actual | Owner and change | Verification |
| --- | --- | --- | --- | --- |
| PBR-1 | Closed; fixed and verified in build72 | Universe → Navigate → Range: set an origin and Alternate midpoint destination, then calculate. Expected midpoint candidates; actual `ReferenceError: alternateJumpMidpoints is not defined`. | `server/universe-navigation.mjs`: import the existing midpoint calculation. | Service regression fails baseline and passes fixed; 67 navigation/routing/preparation tests pass. Builds71/72 pass all four Chrome/Firefox desktop/narrow scenarios: cold navigation, delayed response, actual midpoint output and transient failure recovery. Build70 retains its earlier responsive harness failure. No extra requests or recalculation introduced. |
| PBR-2 | Closed; fixed and verified in build72 | During OBS `CurrentSceneCollectionChanging`, use Reconnect saved. Replacement connection retained the old transition flag indefinitely, blocking inventory/actions. | `server/obs.mjs`: reset connection-owned transition state on cancellation. | Native WebSocket regression verifies live-transition blocking, then successful reconnect, inventory and protection application; fails baseline and passes source/extracted package. Constant-time state reset; no new polling. |
| PBR-3 | Closed; fixed and verified in build72 | Save a changed OBS port or password while its initial connection is pending. Save reused the cancelled promise and never connected with the new settings. | `server/obs.mjs`: await cancelled connection before opening replacement. | Native WebSocket port/password regressions fail baseline and pass source/extracted package. 49 adjacent OBS/Stream/lifecycle/OPSEC tests pass. Reuses cancellation/reconnect ordering without parallel duplicate connections or polling. |
| PBR-4 | Closed; fixed and verified in build72 | Import Analyser: delay Recalculate response, then edit quantity, change strategy, or close and open another item. The obsolete response overwrote the current quote; adding another item could use the previous item’s quantity. | `components/kairo/import-analyser.tsx`: invalidate pending quote ownership on edits, option/strategy changes, item changes, close and unmount; gate success, error and completion together. | Build71 reproduces 24 ownership failures; all 12 current-response controls pass. Build72 passes all 36 Chrome/Firefox desktop/narrow checks. Types and 31 owner tests pass. Constant-time ownership fencing; no replacement request or polling added. |
| PBR-5 | Closed; fixed and verified in build72 | Load 100 of 200 Session events, insert a delayed killmail with an earlier occurrence time, then finish pagination. Expected a timeline consistent with its report count; actual 201 reported / 200 displayed, `more:false`, delayed killmail absent. Manual head refresh recovers it. | `server/history.mjs` and report UI retain an event-ID/time snapshot across pages; original summary stays paired with that timeline. Existing Refresh acquires later arrivals. No new notices, controls or prefix rereads. | Seven regression/cost checks pass: one next-page request, row-ID maximum lookup and existing indexed range query retained. Independent live-to-ended paging check passes. Build72 passes all 32 Chrome/Firefox desktop/narrow checks: consistent 200/200 snapshot, existing Refresh reaches 201/201 unique events, invalid/wrong-pilot input rejected, no new notices. |

Reviewed areas: Universe/Maps/navigation, Sessions/archive/replay, startup/datasets, Stream/OPSEC/OBS and import planning. The existing targeted suites passed; this is not exhaustive usability acceptance. Actual Windows/EVE/OBS remains for Bun's in-app review.

The [internal API guide](INTERNAL-API.md) and [route/event reference](API-REFERENCE.md) describe the existing backbone for future work. Do not rebuild parallel services or add duplicate documentation around it.

## Repository cleanup and recovery

PR12 replaces the old Universe/RC17 review chain. PRs4/6/8 are internal performance archives; PR7 is the superseded RC16 candidate; PR9 is excluded build55; PR10 was withdrawn; PR11 was the completed performance/icon review. Their histories and bodies are retained when closed, never merged as cleanup.

Preserve `perf/benchmark-baseline`, `perf/database-review-v0.7.3` and `perf/rc16-checkpoint-v0.8.0`: these contain evidence outside candidate ancestry. Preserve non-ancestor recovery/withdrawn/excluded histories as archives. Other old branch refs are historical only, not active work. Cleanup disposition and verified PR closures are recorded in the [performance closure record](https://github.com/BunBajiro/kairo/blob/perf/rc16-checkpoint-v0.8.0/analysis/rc17/completion/c954-resumption/resumed/oct13/premerge-handoff/CLOSURE.md).

The package Actions run and raw evidence banks are retained. The analysis branch is investigation-only; never package or merge it into the application. No release tag was created, main was not moved, and the bug hunt now proceeds on PR #12.

## Review checkpoints

- `5c7150e`: first bank of PBR-1/2/3 fixes, five-finding ledger, browser regressions and standalone PBR-5 reproduction. [Build #70](https://github.com/BunBajiro/kairo/actions/runs/38419941884) retained its navigation result and harness failure; no candidate ZIP was produced.
- `6d7a58b`: invisible-fix/performance instructions, corrected responsive test wait and independent blocking browser checks. [Build #71](https://github.com/BunBajiro/kairo/actions/runs/38420788541) passes navigation and reproduces the import defect in all four browser/viewport combinations. [Durable structured baseline evidence](review-evidence/2026-10-13-baseline.json) retains the actual results. No candidate ZIP was produced.
- `4ffe436`: integrated import quote ownership and Session event snapshot fixes. Types, fresh build and all **1,016 source runtime tests** pass locally. [Build #72](https://github.com/BunBajiro/kairo/actions/runs/38421552532) passes every blocking gate, including all 72 new cross-browser checks and all 1,016 extracted-runtime tests. The downloaded ZIP independently passes CRC/source identity and all 1,016 tests without source dependencies. Local browser IPC is unavailable, so browser results come from Actions, not this workspace.
- Final documentation/evidence checkpoint: closes PBR-1 through PBR-5 with exact build72 evidence; corrects PR12's stale link to the original empty ledger so its prominent link follows the live branch. No runtime change, merge, stable release or renewed performance claim.
