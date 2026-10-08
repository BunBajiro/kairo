# Final RC17 closure runbook — prepared, not executed

8 October 2026. This is a coordinator runbook, not an acceptance record. No candidate request, application source, source manifest or CI dispatch was changed to prepare it. The final combined source does not yet have a frozen identity here. PR #10 remains withdrawn; a clean review package follows closure, not this plan.

The fixed comparison baseline is RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`. The implementation must descend deliberately from selected build #54, `c954c0d808847f249df0659ed15fdce2e89f84c4`; excluded build #55, `508f2d450c7cc17cc464cf316b80748367adc9e2`, supplies neither source nor acceptance. Historical v0.7.3 is `239794774320fcdebaa1d76ce8a77c5c25cfc48c` only for the existing same-job anchor. Component ablations retain their original baselines and are never relabelled RC16 comparisons.

## 1. Integration, freeze and execution order

1. Finish the already assigned names/M6/F6/M9 decisions and integration, plus outstanding S3 and administrative/Studio disposition. Reject or retain proposals explicitly; do not include a rejected experiment because its read-only result is favourable. Reconcile the API guide with accepted ownership/protocol changes. Names documentation replacements are prepared in `../names-protocol-227/api-doc-proposal/`.
2. Run the integrated types, fresh build, affected semantic tests and compiled wiring controls under the coordinator's runtime slot. Then commit the exact intended application source, record its tree and confirm the c954 ancestry and absence of excluded-source substitution. Record a full lowercase final SHA; do not use a branch name as candidate identity.
3. Freeze the reviewed external harness revision/configuration before measurement. Complete the small missing final-source envelopes listed in section 4; do not weaken historical source guards or edit archived workers/results. Every adapter change needs its own before/after hashes, exact scope and review. Separate logical/correctness diagnostics from ordinary timings.
4. Install locked dependencies and build clean RC16 and final candidate checkouts. Record source/tree/status, Node/browser/platform, lockfile, build command/log/hash, and compiled assets. Capture manifests **after** compilation; verify before and after each relevant lane. Build or test work must not overlap ordinary measurement.
5. Run the original local `all` lanes and the specifically required remaining final-source component/compiled gates. Resolve actual failures and repeated material adverse observations before final acceptance. Then run the independent GitHub comparison/UI/updater workflows against that same source SHA and the frozen reviewed harness commit. Local and CI samples remain separate.
6. Retrieve all raw results, failures, logs, workflow conclusions and artifact metadata; hash and bank them. Review each finding against its exact source and complete output, then verify the extracted package. Only after every row has an evidenced fix/retain/reject disposition and required final gates pass may the coordinator prepare a clean RC17 for user review.

`/tmp/kairo-performance.lock` is the coordinator slot for local work. Original comparison runners acquire `/tmp/kairo-rc16-benchmark.lock` themselves. Do not wrap a self-locking runner in the same lock. A coordinator may hold the outer performance lock while a legacy runner obtains its different benchmark lock. Updater loaded and idle-startup runners already acquire the performance lock; do not nest it. The coordinator must serialize these groups even when their lock names differ. Runtime permission is separate from this document; none is granted by a command example.

## 2. Existing CI entry points

All three analysis workflows below run on `perf/rc16-checkpoint-v0.8.0` and pin Node24.19.0 on Ubuntu24.04; workflow/harness edits alone do not request a comparison. They are internal evidence workflows, not a clean release. Dispatch only after section 1 is satisfied. Record actual local Node/browser versions separately; do not pool hosts or runtime versions.

| Existing workflow | Exact manual inputs | Push request path / current state | Required result |
|---|---|---|---|
| `.github/workflows/rc17-comparison.yml` — Internal instrumented RC17 comparison | `candidate_sha=<final 40-char SHA>`, `suite=all`; omit `accepted_full_run` | `analysis/rc17/candidate-source.json`. At this inspection it still requests `fa6e852b76089b51cd552fa202de85ad6948b0ec`, `suite:backend`, request `2026-10-03-idle-refinement-startup-inclusive`; this is stale for final acceptance. | Types/tests/build and every original lane, source/build verification, raw artifact and verified internal bundle. `all` also reruns v0.7.3↔RC16 alongside RC16↔candidate on the same runner. |
| `.github/workflows/rc17-completion-ui.yml` — Internal RC17 completion UI evidence | `candidate_sha=<same final SHA>` | `analysis/rc17/completion/ui-request.json` with exact `candidateCommit` (optional `sourceCommit` must match). | All seven lane receipts, final source and harness verification, `completion.json.complete:true`, no failed/missing step. Single-candidate replay correctness is not matched performance evidence. |
| `.github/workflows/rc17-updater.yml` — Internal RC17 real updater evidence | `candidate_sha=<same final SHA>` | `analysis/rc17/completion/updater/request.json` with exact `candidateCommit`. | Full exact-source tests/build; verified official archive; U3 inventory and real loaded conversion; final source verification and complete raw results. |

Supported comparison `suite` values are `all`, `maps`, `routes`, `backend`, `legacy-backend`, `memory`, `mixed`, `restart`, `browser`, `browser-performance`. Focused suites support diagnosis/recovery; they do not turn an incomplete final matrix into an `all` pass. `accepted_full_run` is restricted to the existing guarded browser-only recovery and requires identical original source **and built assets**; do not use it to join different integrated candidates or rebuilt deployment IDs.

When the coordinator chooses the push mechanism, the final comparison request is exactly this schema, with real values substituted only then:

```json
{"candidateCommit":"<final full lowercase SHA>","suite":"all","request":"<unique final internal closure request>"}
```

The source application's `.github/workflows/test-build.yml` is separate: manual dispatch has no inputs and runs at the selected source ref; non-main branch pushes also trigger it. It builds/types, runs `tests/session-ui.mjs`, `tests/universe-ui.mjs`, `tests/datasets-ui.mjs`, packages/extracts and runs `npm run test:kairo` in the extracted tree. A normal test-build success does not substitute for the three analysis workflows or component closure.

## 3. Exact existing local commands and lane inventory

Run from the analysis checkout. `$RC16_ROOT`, `$CANDIDATE_ROOT`, `$FINAL_SHA` and `$OUT` denote coordinator-selected absolute paths/identity; `$OUT` must be a **new** attempt directory. These are templates, not a command block to execute before the freeze. Record stdout/stderr and exit/cleanup outcomes for each command, including failure.

In each application checkout, existing package commands are:

```sh
npm run install:ci
npm run check:kairo
npm run build
npm run test:kairo
```

Then from analysis:

```sh
node analysis/rc17/harness/source-manifest.mjs capture "$RC16_ROOT" "$OUT/rc16-source.json" 57c8dcc7fbd8fc2b62129498d1819050c78381a1
node analysis/rc17/harness/source-manifest.mjs capture "$CANDIDATE_ROOT" "$OUT/candidate-source.json" "$FINAL_SHA"
export KAIRO_BASELINE_MANIFEST="$OUT/rc16-source.json"
export KAIRO_CANDIDATE_MANIFEST="$OUT/candidate-source.json"
node analysis/rc17/harness/backend-run.mjs "$RC16_ROOT" "$CANDIDATE_ROOT" "$OUT/backend"
python3 analysis/rc17/harness/backend-summary.py "$OUT/backend"
node analysis/rc17/harness/memory-runner.mjs "$RC16_ROOT" "$CANDIDATE_ROOT" "$OUT/memory" all
python3 analysis/rc17/harness/memory-summarize.py "$OUT/memory"
node analysis/rc17/harness/route-run.mjs "$RC16_ROOT" "$CANDIDATE_ROOT" "$OUT/routes"
node analysis/rc17/harness/browser-camera-run.mjs "$RC16_ROOT" "$CANDIDATE_ROOT" "$OUT/browser-camera"
node analysis/rc17/harness/browser-camera-summary.mjs "$OUT/browser-camera"
```

These commands self-lock the legacy benchmark lock. Chrome commands also need the explicitly recorded `KAIRO_CHROME_PATH`; record the binary/version and helper hashes, not merely its path. Do not use profiling or counter flags in ordinary children.

| Required lane | Work and rows that must remain | Existing command / applicability |
|---|---|---|
| Corrected backend — G6/G8/G9/S1, service interactions | Fresh ABBA; **both typical and stress**. Three warmups and ten measured operations; 1-second warmup plus 35-second actual scheduler idle. Keep startup, idle CPU/RSS/loop p95/max, authenticated HTTP state p50/p95, and every direct operation's p50/p95, CPU and payload: `opsec`, `state`, `journey`, `session`, `market_browse`, `market_report`, `imports_warm`, `imports_after_write`. Preserve nonempty personal/alliance combat, opportunity and successful real Universe tick controls, zero external requests. Journey is the preserved cold legacy reader, not a resurrected lifetime feature. | `backend-run.mjs` and summary above. `backend-run.mjs` executes the backend workload only; optional database rows in the summary are **not automatically produced**. Do not assert they ran from a nonempty summary. |
| Bounded residency / S2 Sessions | Ordinary and separately forced-GC ABBA; first use, finite caches, ten recreate/use/close cycles. Sessions: 100/1,000/10,000 visits; 100 active +10,000 older visits; 1,000 visits ×4 pilots. Every case retains `session_route`, `route_and_combat_groups`, `actual_live_sync_cache_hit`; three warmups +seven ordinary samples, separate diagnostic children. Candidate not-due visit rows zero, RC16 original repeated work retained. | `memory-runner.mjs ... all` and summary above. Route names/sovereignty/full report fields need section 4's additional semantic gate; existing timing hashes are narrower. |
| Itinerary — RT1/RT2 | Fixed clock, 1/10/50 stops, corrected stress fixture, whole result digest and separate logical preparation counts. Preserve all small-case maxima and output edges/access/warnings; warm gate timing does not establish jump/private/public first-use speed. | `route-run.mjs` above. |
| Maps — M1–M4/M9/G14 | Run `baseline-diagnostics`, `candidate-diagnostics`, `baseline-1`, `candidate-1`, `candidate-2`, `baseline-2`; retain every existing case including no-signature, unrelated-map, selected detail and full library/serialization. Keep pilot/access/revision/signature associations and index construction/write/space costs. | Exact workflow loop in `rc17-comparison.yml`: set `KAIRO_BENCH_SOURCE_ROOT`, `KAIRO_SOURCE_MANIFEST`, `KAIRO_BENCH_OUTPUT`; `node analysis/rc17/harness/maps-scaling.mjs diagnostics --baseline` for baseline diagnostics, omit `--baseline` for candidate; use `timings`, plus `--reverse` for each second ordinary arm. |
| Mixed Core / SSE / protection | Candidate quiet/load/load/quiet, two pilots ×20k Assets, eight Maps, ten widgets, four 50-stop plans; retain 56/92 request controls, actual dashboard/Stream continuity, large frames/backpressure, stale/fresh fail-closed OPSEC, recovery and zero external IO. Historical RC16 continuity failures remain failed partial baselines. | `KAIRO_PERF_APP_ROOT="$CANDIDATE_ROOT" KAIRO_SOURCE_MANIFEST="$OUT/candidate-source.json" node analysis/rc17/harness/mixed-run.mjs "$OUT/mixed"`, then `node analysis/rc17/harness/mixed-summary.mjs "$OUT/mixed/mixed.json"`. Self-locking. |
| Managed restart — G1/G12/U1/U2b | Accepted deferred semantic work and HTTP finish before Store close, primary error/disposal order, private session cookie/CSRF, reconnect and persisted evidence, actual child exit/replacement. Preserve known-gap reproductions separately. | `KAIRO_CANDIDATE_ROOT="$CANDIDATE_ROOT" flock /tmp/kairo-rc16-benchmark.lock node analysis/rc17/harness/restart-candidate.mjs > "$OUT/restart-candidate.json"`. |
| Maps compiled correctness + camera — M3/M5/G13 | All 17 feature checks, focus-detail default off, per-pilot prefs, scaled ports/drag, collapsed DOM, boundary systems, cleanup; separate ABBA 100/600-node pan/zoom task/style/layout. Retain dense long tasks. Headless software rendering is not desktop GPU FPS. | `KAIRO_BENCH_REPO="$CANDIDATE_ROOT" KAIRO_BROWSER_OUTPUT="$OUT/maps-browser" flock /tmp/kairo-rc16-benchmark.lock node analysis/rc17/harness/maps-correctness.mjs`; camera commands above. |
| Completion UI — F1/F2/F3/F5–F9/R1 | Seven lanes: `frontend-refresh`, `admin-polling`, `frontend-models`, `studio-stream`, `session-replay-repeat-small`, `session-replay-repeat-cap`, `session-replay-distinct-cap`. Retain current resource/pilot/dataset fences, loaded archive/history, 10k rows, dirty config, native timers, denied storage/protection and cleanup. Supplement with already reviewed current M6/F6/names gates in section 4. | For each lane: `CANDIDATE_SHA="$FINAL_SHA" flock /tmp/kairo-rc16-benchmark.lock node analysis/rc17/completion/ui-ci-lane.mjs "$LANE" "$CANDIDATE_ROOT" "$OUT/candidate-source.json" "$OUT"`. Needs the exact-source `$OUT/build-receipt.json` contract and recorded browser; workflow creates it. |
| Historical same-host anchor | Original corrected v0.7.3/RC16/RC16/v0.7.3, then final RC16/candidate ABBA on the same runner. Keep comparisons separate. | `node analysis/rc16/followup/harness/legacy-corrected-run.mjs "$V073_ROOT" "$RC16_ROOT" "$OUT/legacy-corrected"`; `python3 analysis/rc16/harness/legacy-summary.py "$OUT/legacy-corrected"`. Included in CI `all`; historical three-version design is not a reason to benchmark excluded508. |

## 4. Remaining final-source gates and preparation gaps

Existing isolated passes support decisions only at their pinned inputs. No row below is newly executed by this runbook, and no missing envelope is silently called ready.

| Finding | Existing material to reuse | Minimum final-source work / readiness |
|---|---|---|
| G6/G7 cold import/construction/first use | `completion/startup/worker.mjs <root> <manifest> core timing` measures cold Core import, construction, first real Market categories, warm category distribution and same-process cumulative sum. `completion/atlas/worker.mjs <root> <manifest> format timing` measures import/first Wallet/first Goal/warm formatted pairs, exact text and cumulative first use. Both have separate heap/counter modes. | **Workers exist; final balanced envelope not prepared.** Existing `startup/runner.mjs` hard-pins RC16/fa6/exact two-file variant; `atlas/runner.mjs` hard-pins a27/fa6/exact five-file variant. Preserve them. Add a narrow reviewed final-source runner/config around unchanged relevant workers, RC16/final/final/RC16 fresh processes with pre/post manifests and harness/output hashes. Do not rerun all old ablations. Include configured first binding in the existing actual-Core mixed gate; isolated formatter timing does not prove whole startup. |
| G8 state and S1/S2 complete semantics | Original backend measures full JSON serialization and actual HTTP; session workload asserts event/personal/alliance counts. `memory-sessions.mjs` hashes system/time/duration/active and groups. Shared membership/sovereignty/export correctness lives in current tests. | **Final full-domain check not prepared in the ordinary summary.** Preserve original timed inputs/bytes. Add separate semantic output comparison/assertions for complete reports/routes/export against required contracts, explicitly allow intentional ownership/revision additions and Journey retirement. State revision metadata (`dataRevision`, `resourceRevisions`, newly accepted `namesRevision`) is retained in real payloads; normalize only documented volatile transport fields for domain comparison. Direct original `state` measures `{data,names}`; `/api/state` covers the actual full HTTP envelope. Never claim those byte counts are interchangeable. |
| Original database/write compatibility rows | `analysis/rc16/harness/legacy/rc-database.mjs <measured-root> <output-dir>` already implements populated first-open migration, aged Imports,5,000 committed event inserts,1,000 history updates/largest synchronous block, retained history bytes and complete import/history hashes. Its existing `legacy/abba.mjs` calls it with `KAIRO_PERF_APP_ROOT` fixed to the common seeding source and `KAIRO_PERF_SEED_LEGACY=1`. | The corrected backend-only workflow deliberately does **not** rerun it. If final all-row closure requires refreshed write/migration evidence after accepted indexes, use this unchanged worker in a reviewed RC16/final ABBA envelope with common RC16 seeding (`KAIRO_PERF_APP_ROOT="$RC16_ROOT" KAIRO_PERF_SEED_LEGACY=1 KAIRO_PERF_APP_REF="$MEASURED_SHA" node analysis/rc16/harness/legacy/rc-database.mjs "$MEASURED_ROOT" "$ARM_OUT"`). Envelope/full source guards are **not prepared**, and historical pinned `legacy/abba.mjs` must not be relabelled. Retain original16,355,000B working-history/hash evidence; document explicitly if unchanged source/covered write lanes support a bounded retain decision instead. |
| G9 idle attribution | Existing `diagnostics/idle-startup-run.mjs <config.json> <new-output-dir>` accepts named source roots/manifests and order, checks clean sources; worker retains 1s+35s then three 30s settled windows. | Main final acceptance is unchanged backend local+CI. Historical six-process diagnostic is complete and not a final candidate run. No extra settled/profile rerun by default. Only if a material new signal remains, reuse this separately labelled `diagnosticOnly:true, performanceAcceptance:false` lane with reviewed final source config. Windows within one process stay correlated. |
| U1/U2/U2b real loaded activation and U3 inventory | Generic `updater/loaded-run.mjs` and `inventory-run.mjs`, existing `rc17-updater.yml`. Archive build3552227: 99,197,259 B, SHA256 `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`. | **Executable final-source lane; not yet run here.** Use real default Worker, same archive and six current default windows: control/conversion/conversion/control/control/conversion, 60s each. Same two-pilot loaded fixture and actual supervisor. Review current rollback UUID rejection/locked-pointer tests plus managed restart; successful conversion does not cover fault semantics. Inventory25 activations retains first and next24 separately. Bank exact inventory script/dependencies externally because its own JSON lacks harness hashes and writes completion before temp-dir removal. |
| G3/G10/G11/G12 Auth, roster, cache pacing, shared transport | Full current tests; `completion/services/service-counts.mjs <root> <output.json>` produces diagnostic source/harness hashes and current roster/pacing/feed counts. | Full current suite must retain public discovery/JWKS coalescing and failure clearing, two independent token POSTs, origin/signature/claims/rotation, invalid-grant isolation, operation-local fresh roster, ESI4 slots/priority/cache/coalescing/cancel/drain, warm Market0 provider calls/0 requested courtesy wait, independent feed cursor/verification and cancelled queued task bound. These logical controls have no elapsed-speed claim. Repeat diagnostic counts only if needed to verify changed integrated owners; runner needs external full-source pre/post guard and cleanup receipt. |
| G1/G4/G5 lifetime, retention, Politics | `startup-rollback`, `core-construction-rollback`, `lifecycle`, `runtime-child/supervisor`, `public-feed-transport`, `sse`, `stream-shutdown`, `cache-retention`, `universe-politics`, datasets and real worker tests in `tests/kairo`; current full suite includes them. Existing all-HTTP inventory: `node analysis/rc17/completion/retention/inventory-all-http.mjs "$CANDIDATE_ROOT" "$OUT/retention"` under benchmark lock. | Exact-source full suite + affected restart/memory/backend are required. Preserve accepted-work drain, Store-last disposal, primary/cleanup error visibility, durable player rows, active retries/validators, bounded deletion200, disabled Politics replay budget1000 and incomplete/capacity states. The all-HTTP inventory is an existing optional targeted rerun only if changed retention owners require it; rejected archive index is not reintroduced. |
| Names/hidden bindings/enrichment, F3 | `names-protocol-227` six-file reviewed proposal,75 tests,12case counts/ABBA, compiled39 checks and four-arm browser ABBA; `bindings-names-985`; `enrichment-9afa`. | **Exact final-source adaptation not prepared.** Current isolated names runners pin227+hidden and exclude later Assets. Rebind only in a new reviewed harness copy, include real Core publication/race gates, merged Assets subscription boundary and bootstrap cost. Preserve legacy input fallback rather than silently rewriting mocks. Repeat existing representative integrated counts/semantic/wiring and required adverses below; historical whole12case component matrices remain their own evidence. Broad remaining F3 Context must get a distinct current merged-page disposition. |
| S3 eligibility index | `oct8/session-index-next/PREPARED.md`, revision2 reviewed harness, diagnostic39 tests/12 arms complete per coordinator; write/cadence acceptance separate. | Existing commands: `python3 run.py <new-attempt> --phase write` and `--phase cadence` from that directory (self-locks both locks). All six archive100/1k/10k ×pilot1/4 write/migration/storage arms; real41 ticks spanning120s at endpoint100/1 and10k/4. Finish already assigned matched work; record any approved omitted interior cadence as a bounded scope, never implicitly complete. Rebind final checks only if integration changes owners. |
| M6/F6/M9/R1/F5/F8/F9/M7/M8/Goals/F7 | Already prepared/accepted or active lane records under `oct8` and sibling resumed directories; each owner retains exact source/adverse rows. | Integrate only accepted proposals, preserve rejected summary/index/lazy-route trials, run affected compiled controls on the merged build. Original `all` alone does not run current M6 scene, F6 archive1500 or names first-open races. Use their frozen reviewed workers with deliberate final-source adapters; do not expand into unrelated new experiments. F7/server formatter, M8/no-spatial-index and Goals/no-ledger-rewrite decisions remain separately scoped. |

U1/U3 existing command setup (under the appropriate self/external locks, sequentially):

```sh
export KAIRO_PERF_APP_ROOT="$CANDIDATE_ROOT"
export KAIRO_SOURCE_MANIFEST="$OUT/candidate-source.json"
export KAIRO_UPDATER_ARCHIVE="$OFFICIAL_ARCHIVE"
export KAIRO_UPDATER_BUILD=3552227
export KAIRO_UPDATER_ARCHIVE_SHA256=0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83
flock /tmp/kairo-performance.lock node analysis/rc17/completion/updater/inventory-run.mjs "$OUT/inventory.json"
node analysis/rc17/completion/updater/loaded-run.mjs "$OUT/updater-loaded"
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/rc16-source.json"
node analysis/rc17/harness/source-manifest.mjs verify "$OUT/candidate-source.json"
```

Changing all equal updater windows for an actual timeout is a separately recorded condition, not silent replacement of a failed attempt. Never present the sampled external-allocation budget or Worker old-generation setting as a hard RSS/native cap.

## 5. Adverse rows that must stay visible

The final report includes **every original row and pair**, not only this compact list. Historical observations remain source-labelled even if a new integrated comparison improves. The repeated >10% **and** >1ms rule applies to paired ordinary latency observations as a follow-up trigger; it is not a universal quality budget, a p95 cancellation rule, or a reason to ignore small measured costs. Ten-sample p95 is an observed maximum, not a stable population-tail estimate. Do not repeat runs solely to erase an adverse result.

| Required pin | Retained observation / final treatment |
|---|---|
| G6/G7 startup and first use | Typical whole-app startup; original taxonomy first-use deferral about1.1→7.8ms and two-file cumulative162.578 vsRC16 161.542ms. Keep construction, migration/index and cumulative **within one process**, not sums of medians from different experiments. |
| G8 direct-state tail | Historical stress +25.36% tail flag and full ten-sample distribution; associated GC does not establish allocation ownership. Preserve direct and HTTP bytes including added real transport metadata. |
| G9 idle | Historical CI05d stress +19.47% and settled local +3.59% remain historical unexplained observations. Final original typical/stress startup-inclusive windows and independentCI decide final-source acceptance. |
| S1/S2/RT2 | Session report historicalCI stressp50 +5.81%,p95 +3.74%, required+5,400/+36,000B; route1k +0.397ms/+7.72%,100visit route+groups about+0.100ms; prior onestop max34.38 vs29.52ms. Keep all complete fields, operation sizes and pairs; prior fixed10k defect stays fixed unless new evidence differs. |
| Names backend | **20knames/0clients/eight persisted changes+burst**, isolated36.862→41.945ms,+5.084ms/+13.79%, pairs+8.40%/+19.18%. Unresolved source of cost; retain final combined row. Connection/reconnection each sends an extra full550KB map, observed approximately5ms; `/state` still sends full map. |
| Names compiled | InitialOverview/bootstrap task356.106→394.460ms; pairs+1.05%/+21.42%, mean+38.354ms/+10.77%. Keep startup alongside steady20Wallet improvement. Assetsfirstopen secondpair+1.479ms/+1.57%. No claim that cold first connection improved uniformly. |
| Hidden bindings | visible10/20knames/0clients ordinarymedian2.313→2.427ms; p952.754→5.680ms, pairedp95+4.717/+1.135ms. visible50/10knames/1client noWorkSync p956.905→12.815ms, paired+0.121/+11.698ms. Preserve both final rows without assigning an unsupported cause. Save/preview remain fresh; first routine update after save may remove hidden keys and publish one extra identical-visible frame. |
| Enrichment | Preserve0/1-item,warm0-provider,actualESIcap4/order/equivalence controls and isolatedPIstressCPU60.557ms candidate vsother7.941ms observation. Current selected representative PI counts are0/1/6/10, not the historical harness's50-planet wording. |
| U1 | Building-interval thirdconversion HTTPp95/max197.17/198.53ms vscontrol104.07/133.98ms; mainloopmax187ms, replacementSSEgaps715/720/782ms, sampledloadedRSS~563MiB. Whole-window p95/zero failed1s polls do not erase bursts/outage. |
| Memory/Maps/frontend | Preserve shared topology retained~0.635MiB and cumulative max160.582→163.310ms; ordinaryRSS separate from collectedheap, no leak claim from short runs. Keep no-signature/small-map/fullserialization losses, densecamera longtasks, S3 write/storage costs, M6/F6/M9/R1/admin individual adverse pairs from each completed owner result. Rejected M9 dense database growth75.3% remains a rejection, not a final-source row to hide. |

## 6. Completion record and package gate

Create a final ledger linking every original G/F/M/S/R/U/RT finding and the conditional names/bindings/Goals/retention items to: exact final files, fix/retain/reject decision, local raw identity, independentCI lane/attempt, remaining limits and reviewer disposition. Keep prepared/unexecuted, failed partial, isolated accepted and final integrated accepted states distinct. Successful ordinary evidence cannot repair a failed cleanup/source/equality gate; preserve failed attempts before any correction.

Bank source/build manifests and receipts, fixture counts/hashes/clock, harness and dependency inventory, Node/browser identity, raw samples/counters in their separate modes, byte counts/full semantic outputs, request/cursor/pilot controls, stderr/exit/cleanup, workflow outcomes/runattempt URLs and archive retrieval hashes. Close logs before inventorying. Recheck existing inventories; do not overwrite them with a new candidate attribution. Missing historical blobs/log tails remain documented gaps, not reconstructed evidence.

The existing internal bundle step is:

```sh
python3 analysis/rc17/package-internal.py --checkpoint "$ANALYSIS_ROOT" --candidate-manifest "$OUT/candidate-source.json" --baseline-manifest "$OUT/rc16-source.json" --output "$INTERNAL_BUNDLE_OUTPUT"
python3 "$INTERNAL_BUNDLE_OUTPUT/internal-rc17/verify-bundle.py"
```

It needs the recorded `KAIRO_WORKFLOW_STEPS` and `KAIRO_REQUEST_SUITE` context used by the workflow; do not fabricate success for local packaging. A focused/failed run may create an explicitly incomplete internal bundle. Only a complete all-suite record plus all additional closure gates supports final review preparation.

The application test-build's concrete extraction gate uses:

```sh
python3 scripts/package-release.py "$PACKAGE_ZIP"
python3 -m zipfile -e "$PACKAGE_ZIP" "$EXTRACTED_ROOT"
```

Then run `npm run test:kairo` from `$EXTRACTED_ROOT/Kairo`, without inheriting source-checkout dependencies, and retain the package inventory/source/build linkage. Final package verification must include the accepted new files/docs and actual runtime/compiled assets. No workflow named `release`, user-review PR promotion or clean-package publication is requested by this runbook.

## References inspected

Source of commands: `analysis/rc17/README.md`; `.github/workflows/rc17-comparison.yml`, `rc17-completion-ui.yml`, `rc17-updater.yml`; application `package.json` and `.github/workflows/test-build.yml`; `harness/backend-run.mjs`, `backend/backend.mjs`, `backend/worker.mjs`, `backend-summary.py`, `memory-runner.mjs`, `memory-sessions.mjs`; startup/Atlas workers and pinned runners; updater loaded/inventory runners; `completion/ui-ci-lane.mjs`; services counter and retention README. Closure source: the four `c954-resumption` traces, current scoped completed lane reports and this agent's reviewed names/S3 evidence. This document does not refresh remote run state or claim the latest CI conclusion.
