# 0.8.0 RC Premerge Bug Review

The performance/refactor phase is complete. The correctness and usability review began on 13 October 2026 from PR #12 at `6e54542`. The starting handoff and original tested build remain recorded below.

## Current verified candidate

The first five confirmed findings in the [bug ledger](#bug-ledger) are fixed and verified in build #72. The source changes and intermediate evidence are banked on the review branch. **The comprehensive bug hunt remains active:** build72 is a verified checkpoint, not the end of the review. Strong automated regressions establish closure of internal defects; only actual environment behavior outside that evidence remains for manual acceptance.

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

The first batch contains five fixes verified in build72. A broader second pass is in progress. Bun confirmed that fixes and general performance work must preserve the intended experience without exposing internal repairs in product UI; this is a standing rule in `AGENTS.md`. Findings below remain separate from the closed performance ledger. Keep this live ledger populated as new evidence arrives; record a finding when reproduced, then update its fix, checks and checkpoint before banking progress.

| ID | Status | Reproduction / expected / actual | Owner and change | Verification |
| --- | --- | --- | --- | --- |
| PBR-1 | Closed; fixed and verified in build72 | Universe → Navigate → Range: set an origin and Alternate midpoint destination, then calculate. Expected midpoint candidates; actual `ReferenceError: alternateJumpMidpoints is not defined`. | `server/universe-navigation.mjs`: import the existing midpoint calculation. | Service regression fails baseline and passes fixed; 67 navigation/routing/preparation tests pass. Builds71/72 pass all four Chrome/Firefox desktop/narrow scenarios: cold navigation, delayed response, actual midpoint output and transient failure recovery. Build70 retains its earlier responsive harness failure. No extra requests or recalculation introduced. |
| PBR-2 | Closed; fixed and verified in build72 | During OBS `CurrentSceneCollectionChanging`, use Reconnect saved. Replacement connection retained the old transition flag indefinitely, blocking inventory/actions. | `server/obs.mjs`: reset connection-owned transition state on cancellation. | Native WebSocket regression verifies live-transition blocking, then successful reconnect, inventory and protection application; fails baseline and passes source/extracted package. Constant-time state reset; no new polling. |
| PBR-3 | Closed; fixed and verified in build72 | Save a changed OBS port or password while its initial connection is pending. Save reused the cancelled promise and never connected with the new settings. | `server/obs.mjs`: await cancelled connection before opening replacement. | Native WebSocket port/password regressions fail baseline and pass source/extracted package. 49 adjacent OBS/Stream/lifecycle/OPSEC tests pass. Reuses cancellation/reconnect ordering without parallel duplicate connections or polling. |
| PBR-4 | Closed; fixed and verified in build72 | Import Analyser: delay Recalculate response, then edit quantity, change strategy, or close and open another item. The obsolete response overwrote the current quote; adding another item could use the previous item’s quantity. | `components/kairo/import-analyser.tsx`: invalidate pending quote ownership on edits, option/strategy changes, item changes, close and unmount; gate success, error and completion together. | Build71 reproduces 24 ownership failures; all 12 current-response controls pass. Build72 passes all 36 Chrome/Firefox desktop/narrow checks. Types and 31 owner tests pass. Constant-time ownership fencing; no replacement request or polling added. |
| PBR-5 | Closed; fixed and verified in build72 | Load 100 of 200 Session events, insert a delayed killmail with an earlier occurrence time, then finish pagination. Expected a timeline consistent with its report count; actual 201 reported / 200 displayed, `more:false`, delayed killmail absent. Manual head refresh recovers it. | `server/history.mjs` and report UI retain an event-ID/time snapshot across pages; original summary stays paired with that timeline. Existing Refresh acquires later arrivals. No new notices, controls or prefix rereads. | Seven regression/cost checks pass: one next-page request, row-ID maximum lookup and existing indexed range query retained. Independent live-to-ended paging check passes. Build72 passes all 32 Chrome/Firefox desktop/narrow checks: consistent 200/200 snapshot, existing Refresh reaches 201/201 unique events, invalid/wrong-pilot input rejected, no new notices. |
| PBR-6 | Fixed; checkpoint verification pending | Import a text/SMT Ansiblex list with Owner alliance and Alliance capital supplied by the form. A same-alliance bridge route incorrectly returns `no_route` because imported links lose both defaults. | `server/universe-ansiblex.mjs`: apply form defaults while preserving explicit per-row metadata and owner-specific capital precedence. | Pre-fix real `saveLinkList`→route test returns `no_route` instead of `ok`; fixed parser/service/routing/permanent-link suites pass 53 tests, including override and unknown-capital controls. |
| PBR-7 | Fixed; combined verification pending | Overlap trader-data refresh for Amarr/seller42 and Jita/seller43. Expected each requested context; the global in-flight promise returns Amarr state for Jita and skips Jita/seller43 collection. | `server/imports.mjs`: scope ownership of refresh work without losing duplicate-context coalescing or close draining. | Deterministic pre-fix service regression fails: requested Jita60003760, actual Amarr60008494. Separate-context, duplicate coalescing, failure retry and multi-context close checks pass. |
| PBR-8 | Fixed; combined verification pending | Start a Session with stale or missing ship evidence, then receive a fresh observation of the same hull. Expected that observed hull from its receipt time; report incorrectly remains empty because no ship-change event occurs. | Session travel/history owner: retain the first valid in-session ship baseline without inventing a ship change or backdating it. | Real-Core regression fails before source edits: expected hull999999, actual empty list; shipChanges remains correctly zero. Five new freshness/ownership/restart/order controls pass; 105 focused Session/combat/replay tests pass. |
| PBR-9 | Fixed; combined verification pending | Reconnect a pilot while an older token refresh or disconnect revocation is pending. Old success overwrites new tokens/scopes, old `invalid_grant` marks the new login revoked, new access joins the obsolete flight, or delayed disconnect removes the new login. | `server/auth.mjs`: bind refresh work and SQL publication to its token envelope; end local ownership before best-effort revocation. | Four deterministic pre-fix failures use real SQLite, encrypted vault and signed JWTs with controlled provider responses. Six new controls pass, including old success/failure, new connection authority, disconnect and replacement-flight ownership; 67 focused Auth/ESI checks pass. Independent review found no blocker. |
| PBR-10 | Fixed; combined verification pending | Delete an import plan while its pending save awaits a quote, or concurrently fill the last plan slot. The old save resurrects a deleted plan; two creates can exceed the 100-plan destination limit. | `server/imports.mjs`: recheck current identity/capacity immediately before persistence after awaited calculation. | Two deterministic pre-fix failures: missing rejection after deletion; two final-slot saves accepted instead of one. |
| PBR-11 | Fixed; combined verification pending | Change a Stream notification rule from All/pilot42 to pilot43 while pilot42 toasts are visible or delayed. Old notifications survive and a delayed toast still reaches public SSE despite the new filter. | `server/stream.mjs`: apply the current rule's pilot filter when retaining the bounded notification queue on save. | Four pre-fix failures plus one healthy control; all five now pass, including visible/pending removal, unchanged-scope delivery, explicit preview and no resurrection. No polling or product messaging added. |

| PBR-12 | Fixed; combined verification pending | Public Thera/Turnur reports incorrectly enable private wormhole routes when that control is off; destination search rejects selected public exits when private connections are off. | Routing graph applies independent private, Thera and Turnur controls; navigation no longer coerces private routing. | Both directions fail before correction. Production route and destination controls pass, including independent public opt-out and private opt-in; 116 focused Universe checks pass. |
| PBR-13 | Fixed; combined verification pending | Start a scan for item A, then request item B on the same hub/mode. The second request returns A's job without scanning B; access pilot, Jita comparison and cancelled state are also conflated. | `server/markets.mjs`: coalesce only complete identical live scan requests; retain the existing one-scan-at-a-time behavior. | Pre-fix regression fails expected rejection; identical-request reuse and mismatched item/pilot/comparison/cancel controls pass within 51 Market/import tests. |
| PBR-14 | Fixed; combined verification pending | Import scenario API reports 147.8 ISK break-even where 144.9 is the first profitable tick and 144.8 loses money. Fee minima are added alongside percentage fees instead of choosing the charged regime. | `server/import-math.mjs`: solve minimum/percentage fee regimes consistently with scenario net, then round to a valid tick; impossible recovery returns null. | Two pre-fix regressions fail. Minimum, mixed, proportional, no-repricing, tick-boundary and impossible-margin controls pass; 38 import checks pass. |
| PBR-15 | Reproduced; correction in progress | Overview hull image fails, then a new hull image successfully loads. The reused image remains transparent despite decoded pixels. | Dashboard hull image recovery. | Build73 reproduces in both Chrome/Firefox at 1600/390; four failed visibility checks with healthy image decoding/telemetry/pilot-switch controls. |
| PBR-16 | Reproduced; correction in progress | Browser denies localStorage access during startup. Connected pilots exist, but the saved-pilot preference read prevents first-pilot selection and displays guest data. | Dashboard optional preference read. | Build73 reproduces eight selection/content failures across both browsers and widths; real bootstrap confirms healthy connected pilots. |
| PBR-17 | Reproduced; correction in progress | Two module changes overlap. A delayed older bootstrap arrives after the newer response and turns the newer displayed setting back on while the server remains correctly off. | Dashboard bootstrap response ownership. | Build73 reproduces four stale-display failures across both browsers and widths; server persistence controls pass. |

Reviewed areas in the first batch: Universe/Maps/navigation, Sessions/archive/replay, startup/datasets, Stream/OPSEC/OBS and import planning. The existing targeted suites passed; broader review continues below. Actual Windows/EVE/OBS remains separate from automated closure of these defects.

## Comprehensive review coverage

This table tracks work, not presumed defects. Complete source review and relevant adversarial checks before marking an area reviewed; record concrete findings in the ledger above. Tests must prove externally meaningful behavior through the real owner. Keep pre-fix failure evidence and relevant healthy/recovery controls. Human reproduction is not a prerequisite for closing well-tested internal races or failure paths.

| Area | Second-pass focus | State |
| --- | --- | --- |
| Universe / Maps / operations / routes | Expiry, revisions, access, persisted commands, malformed inputs, feeds and route acceptance | In progress |
| Markets / imports / histories | Jobs, cancellation, trader authorization, books, pricing/date boundaries and saved plans | In progress |
| Sessions / combat / travel / replay | Event ownership, delayed evidence, aggregation, paging, archive edits and replay boundaries | In progress |
| Runtime / datasets / Registry / Stream / OBS | Restart/rollback, cancellation, teardown, projection and protection state | In progress |
| Dashboard / connections / settings | Pilot/resource ownership, delayed responses, invalidation, reconnect and saved preferences | In progress |
| Auth / ESI / HTTP / Vault | Token races, permissions, caching/pagination/retries, boundary validation and private/public separation | In progress |
| Core / Goals / modules / persistence | Collection ownership, freshness, accounting, durable writes and event publication | In progress |

Manual review remains useful for real Windows/DPAPI, actual EVE permissions/SSO and OBS scene/audio output, and extended play. It is separate from automated acceptance of the specific corrected contracts and must not be used to defer tests that can realistically reproduce a defect.

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

- `aace8cc`: automated bug-closure criteria and comprehensive coverage matrix banked; manual reproduction is not required for rigorously tested internal defects.
- `c9ea251`: [build73](https://github.com/BunBajiro/kairo/actions/runs/38425291854) retains dashboard baseline: 16 failed defect checks, 35 passing controls. No candidate ZIP.
