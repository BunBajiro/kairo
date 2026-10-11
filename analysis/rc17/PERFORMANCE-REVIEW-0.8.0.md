# Kairo 0.8.0 performance review — local evidence draft

11 October 2026. **The integrated refactor shows real local improvements in recurring work, memory, Maps, navigation and camera task time. It also retains measurable costs. Independent Actions, final acceptance and extracted-package validation are pending; this is not a user-review-ready release candidate.** The real-archive updater collection and independent local audit have passed within the scope below.

Retain the measured application source `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, tree `35826c9d50c45702ff103e1f173e05c529ba2d9c`. It includes selected c954/build #54 and excludes withdrawn `508f2d4`/build #55. All **46 component decisions** are closed as supported fixes, retentions or rejections; release gates B/W/L/P remain governed by the [single current issue ledger][ledger]. Withdrawn PR #10 remains outside user review. No new optimization or repeat measurement is proposed merely to obtain better numbers.

## What the three-version comparison establishes

There are **two separate matched groups**, not one interchangeable three-column benchmark:

| Group | Measured order | Purpose |
|---|---|---|
| Historical | v0.7.3 (`239794774320fcdebaa1d76ce8a77c5c25cfc48c`) / RC16 (`57c8dcc7fbd8fc2b62129498d1819050c78381a1`) / RC16 / v0.7.3 | Retain the original product-to-product baseline, including its regressions. |
| Current | RC16 / integrated70 / integrated70 / RC16, with each original lane's prescribed order | Assess the refactor against RC16 on unchanged workloads. Candidate-only correctness/loaded lanes are identified separately below. |

Both groups used the local Node 24.19.0 host and fresh source/build manifests, but their RC16 anchors differ materially: typical idle CPU is **2.648%** in the historical group and **0.877%** in the current group. Differences between collection groups are not attributed to source changes. **Do not pool the groups, multiply their percentage changes, or infer a directly measured v0.7.3→70 effect.** The evidence supports improvements relative to the matched RC16 observations, not a claim that every cost returns to v0.7.3 levels.

Backend observations use typical/stress fixtures, three warmups and ten measured operations including serialization, with actual 35-second idle windows. Real scheduler activity remains enabled; RC16/current Universe tick checks pass, whereas v0.7.3 has no Universe collector. Automatic SDE startup is deferred. Timed workloads ran sequentially under shared locks, with exact source/build/harness bindings, actual owned-process exit/drain and closed-file hash checks. The [comparison integrity receipt][integrity] preserves the 21 nested command exits and final inventory. Historical, ordinary, forced-GC and instrumented diagnostics remain distinct.

Tables show means of the two per-run observations, including means of per-run medians or p95s where labelled. They are descriptive, not confidence intervals. With ten backend samples, reported p95 is the observed maximum. The existing >1 ms **and** >10% in both pairs marker is a diagnostic aid, not a statistical test or permission to discard smaller costs. Full original rows, tails, payloads and both pairs are linked in the appendix.

## Historical v0.7.3 versus RC16

| Metric | v0.7.3 | RC16 | RC16 change |
|---|---:|---:|---:|
| Typical idle CPU, % of one core | 0.509 | 2.648 | +420.39% |
| Stress idle CPU, % of one core | 1.202 | 2.223 | +84.97% |
| Typical idle RSS, MiB | 69.027 | 150.367 | +117.84% |
| Stress idle RSS, MiB | 92.232 | 171.082 | +85.49% |
| Typical startup, ms | 12.785 | 172.443 | +1,248.82% |
| Stress startup, ms | 18.506 | 172.408 | +831.62% |
| Typical direct-state p50, ms | 4.239 | 4.619 | +8.95% |
| Stress direct-state p50, ms | 20.827 | 25.895 | +24.33% |
| Typical HTTP-state p50, ms | 9.015 | 9.711 | +7.73% |
| Stress HTTP-state p50, ms | 39.864 | 37.542 | −5.83% |
| Typical Session p50, ms | 15.324 | 15.440 | +0.76% |
| Stress Session p50, ms | 95.472 | 87.430 | −8.42% |

Eight historical rows cross the joint marker in both pairs: startup and idle-loop maximum in both profiles, typical Session p95, and stress direct-state p50/p95/CPU p50. Typical Session p95 rises 19.502→23.397 ms; stress direct-state p95 rises 25.736→34.021 ms. These are retained historical costs, not a newly established defect in integrated70. Changed payload sizes and added product responsibilities prevent an implementation-only causal claim. [Full historical review and all 78 rows/156 pairs][historical].

## Matched RC16 versus integrated70

| Metric | RC16 | Integrated70 | Current change |
|---|---:|---:|---:|
| Typical idle CPU, % of one core | 0.877 | 0.477 | −45.63% |
| Stress idle CPU, % of one core | 1.492 | 1.251 | −16.15% |
| Typical idle RSS, MiB | 151.229 | 119.465 | −21.00% |
| Stress idle RSS, MiB | 172.125 | 130.377 | −24.25% |
| Typical startup, ms | 159.626 | 136.017 | −14.79% |
| Stress startup, ms | 162.271 | 145.622 | −10.26% |
| Typical direct-state p50, ms | 3.959 | 4.326 | +9.28% |
| Stress direct-state p50, ms | 21.780 | 21.904 | +0.57% |
| Typical HTTP-state p50, ms | 8.580 | 8.651 | +0.83% |
| Stress HTTP-state p50, ms | 36.192 | 37.817 | +4.49% |
| Typical Session p50, ms | 14.971 | 15.943 | +6.49% |
| Stress Session p50, ms | 82.568 | 87.804 | +6.34% |

Idle CPU, RSS and startup improve in both pairs for both profiles. Ordinary heap after Core creation falls **52.73→38.00 MiB**. In the separate forced-GC lane, retained heap after creation falls **40.62→30.84 MiB** and after ten recreate/use/close cycles **35.34→31.87 MiB**. Retained growth across those cycles remains about 0.416 MiB RC16 / 0.495 MiB current; neither RSS nor this finite experiment proves leak freedom. [Backend/memory review][backend].

| Workload | RC16→integrated70 result | Evidence boundary |
|---|---|---|
| Shared Maps service cases | All 15 run-median comparisons improve in both pairs; mean reductions 30.26–90.05%. Full 24-map retrieval 309.388→30.781 ms. | Seven samples per service case; serialization costs retained separately. |
| Selected map, 1/8/24-map fixtures | 3.273/5.649/12.388→1.559/1.780/1.648 ms. | At 24 maps, link materializations 2,376→99; no warm-read writes. |
| Navigation, 1/10/50 stops | 17.997/156.988/788.675→14.917/15.933/32.557 ms. | Both pairs improve; complete plans/fixtures hash-match. Graph builds become 1/1/1 instead of 1/10/50. |
| 100-node camera zoom/pan | Renderer task 1,037.23→331.96 / 263.04→195.29 ms. | Both task pairs improve; headless software-renderer evidence. |
| 600-node camera zoom/pan | Renderer task 2,169.29→919.85 / 1,656.47→691.10 ms. | Both task pairs improve; dense zoom long tasks 12/12→0/0. |
| Session live-sync cache hits | Five fixture medians 0.694–54.170→0.00320–0.00569 ms. | Diagnostic candidate visit rows become zero. This is distinct from slower complete Session reports. |
| Configured warm Core binding updates | Pair means fall 70.18% and 63.23%. | Exact Wallet/Goal outputs; 100 actual updates per worker. Includes collection/publication behavior, not just formatting. |

The six new compact Maps-summary cases have no same-endpoint RC16 comparator: the 24-map response is 7,688 bytes versus 5,509,856 bytes for full-list output, with current medians 9.483/10.219 ms. That is a different contract. Selected-map raw JSON hashes differ by the previously audited property insertion order; field values and array order agree. These are not claims of identical bytes or a matched summary-endpoint speedup. [Maps/routes/camera review][maps].

## Costs retained in the decision

- **State and Session remain mixed.** Direct-state p95 changes are +4.65/−1.06 ms typical and −3.67/+5.39 ms stress. Stress HTTP-state p95 rises 50.42→59.00 ms, with pairs +4.78 ms/+7.77% and +12.37 ms/+31.43%. Session p50 worsens in both pairs in both profiles; stress p95 rises 8.7%. Session payloads grow 5,400/36,000 bytes. These observations do not establish a cause, and no blanket state-tail improvement is claimed.
- **Initialization versus ongoing use remains an accepted trade-off.** The separate startup adapter records first Market categories 1.006→8.167 ms, adverse in all six pairs. Its same-process import + construction + first Market mean improves 177.329→160.027 ms in all six pairs, with highly variable benefit. Ordinary four-pilot Store opening/seeding also costs +1.84/+1.35 ms. These distinct setup measurements are not summed or substituted for first Assets use.
- **First Overview/Assets costs remain visible.** The supplemental c9d→70 comparison, not RC16→70, records Overview window 683.977→803.575 ms and heap 16,048,932→17,384,666 B; first Assets task 80.220→155.361 ms and script 36.672→78.741 ms. Both task pairs (+136.672/+13.610 ms) and script pairs (+78.079/+6.060 ms) worsen. The large first-candidate spike remains unexplained. The bounded count diagnostic found no concrete repeated-work defect in the operations observed; it does not prove equal cost or explain the spike. The [retention decision][first-assets] accepts these costs under the user's initial-versus-ongoing-use policy. Earlier component gains are not added into an integrated gain.
- **Aged Imports are not proved resolved.** The passing adapter has p50 456.028→477.115 ms; one pair improves and the other loses 48.026 ms/+10.62%. Maximum has a +74.931 ms/+15.48% second pair. Earlier failed envelopes contain both-pair adverse observations and remain failed, preserved and unpooled. Small event-insert, history-write and history-block increases remain in the full audit. No numerical retry is queued.
- **Cold configured bindings are mixed.** Import + configured startup + first wire changes +7.678 ms/+3.52% and −24.406 ms/−9.68%; exact first Wallet/Goal elements agree. This closes the missing C2 observation without claiming a uniform cold gain. The control uses `noSync:true`; ordinary mixed coverage owns scheduled load.
- **Camera component costs persist.** Dense zoom layout rises 2.798→5.896 ms, +2.683/+3.514 ms in the pairs, within the retained camera trade-off. Dense pan retains two 71–77 ms long tasks per candidate observation. Sparse one-second idle results disagree across fixtures. More mutations do not imply more React commits, and no desktop GPU/FPS guarantee follows.
- **Retention remains bounded evidence.** Replay retained heap grows 597,844 B for repeat-small and 611,716/626,460 B for the cap cases after 12 measured cycles, despite stable detached DOM/listener checks. Distinct-cap start has one 62 ms long task. Forced-GC diagnostics are not natural-GC residency or a no-leak proof. A retained shared topology owner, full archive DOM and accepted bootstrap costs remain documented in the ledger's individual decisions.

## Correctness, loaded work and development backbone

The unchanged integrated source has **1,004/1,004 tests, types and a fresh combined build passing**, plus **89 compiled integration controls**: Assets31, actual-Core names10, names races10, Maps clock13 and Session focus25. The original Maps browser lane adds its 17 declared controls. Complete Session/route adapter outputs agree after exactly the documented 9,200 asserted-null `session_id` fields are removed at eight candidate visit paths. These scoped checks do not establish complete decoded equality for every backend endpoint or full database payload; relevant bodies absent from the original workers cannot be independently reconstructed.

All seven original local completion-UI lanes are covered: refresh21, admin18, frontend-models17, Studio10, and three replay cases with two warmups plus 12 measured cycles each. The original UI outer attempt remains failed because its owner read the wrong smoke-field path. A separate reviewed validation adopts the already successful repeat-small worker; only the two unrun cap cases were executed afterward. No successful measurement was rerun. The original failure, corrected owner, adoption and recovery are separately pinned. [UI result review][ui].

Candidate-only mixed coverage passes all **296 HTTP requests** across quiet/loaded/loaded/quiet 28-second windows, two connected SSE clients and protection/recovery checks. Loaded dashboard p95 is 120.99/101.98 ms versus quiet 76.59/59.41 ms; loaded all-request maxima are 221.01/174.46 ms. These are within-candidate added-load costs, not cross-version changes. Managed restart passes both semantic-work/accepted-HTTP schedules with durable goals/events, quiesce rejection and actual child drain. Its ordered trace contains **no numeric restart-gap measurement**; measured gaps come only from the separate updater collection below. [Lifetime review][lifetime].

**Local updater collection is complete:** 25 inventory activations and six original 60-second windows, ordered control 1 / conversion 1 / conversion 2 / control 2 / control 3 / conversion 3, passed source/build, output and actual lifecycle checks. The real 99,197,259-byte build 3552227 archive ran through the default Worker conversion path; three conversions produced matching seven-file/23,038,926-byte manifests with 8,490 systems. Each conversion replaced the runtime once, preserved the tested cookie/CSRF continuity and reconnected both SSE clients. Inventory first activation took 13.440 ms; the remaining 24 had wall p50/p95/max 7.986/10.442/10.923 ms. This warm-filesystem, single-process observation does not measure cold installation.

| Same-source updater pair | Extra recorded runtime CPU, ms | Extra highest observed RSS, MiB | Full-window successful HTTP p95 change, ms | Restart gap, ms |
|---|---:|---:|---:|---:|
| 1 | +14,675.981 | +239.867 | +0.649 | 716 |
| 2 | +13,834.838 | +275.633 | +4.157 | 716 |
| 3 | +13,763.441 | +277.586 | +0.527 | 707 |

Conversion is visibly costly: recorded runtime CPU is 3.80–3.90× control and observed RSS peaks at 515.105–550.570 MiB. Building took 9.887–10.519 seconds; pair 1's matched building-interval HTTP p95 rose 88.502→107.143 ms. **Five of 1,386 HTTP attempts failed during conversion 2's announced restart, and the two SSE clients recorded 36 connection-error retries across the three replacements.** Availability was interrupted; successful-request quantiles exclude those failures. CPU includes Worker work but omits unmeasured startup/replacement intervals, including 324–344 ms between generation meters; sampled RSS is neither retained heap nor a complete peak. Generated outputs were verified before deletion, so retained manifests/assertions are the surviving evidence. This is conversion versus control at source70, not a cross-version updater speedup. Internet download, production ESI and physical browser/OBS remain outside scope. [Full updater review][updater].

The maintained [internal API guide][api-guide] explains the backbone: private HTTP commands enter Core/domain services, SQLite owns durable records, owned semantic work drives invalidation and approved Stream projections, and frontend resource owners refresh scoped views. The [HTTP/event reference][api-reference] records routes and contracts, including the integrated names protocol. These are internal alpha interfaces, not a versioned public SDK. Nine superseded documents were pruned with originals banked; the earlier documentation review checked 114 relative links and 54 required package paths. Current `docs/VALIDATION.md` still needs a narrow status refresh after CI. Documentation and package freshness are not inferred from runtime test success. [Documentation bank and verification][checkpoint].

## Remaining release acceptance

The local historical/current matrix, startup/contracts/database adapters, merged compiled controls, original UI scope, configured first-binding supplement and real-archive updater audit are complete within their stated limits. Complete the required independent Actions suites and their full raw/adverse review. Actions results must be attached to this report without mixing their samples with local results. A passing artifact probe only established artifact availability.

After those gates, reconcile final documentation with the measured code, verify the exact extracted package and source/build/harness continuity, and prepare a clean 0.8.0 review candidate. Actual Windows/EVE/OBS review remains for the user. Only after user review and explicit approval may the candidate merge. This report does not reopen PR #10 or mark B/W/L/P closed; the ledger owns those decisions.

## Complete evidence appendices

The tables above select useful summary rows; **none replaces the full original row/pair coverage below**. Raw recovery manifests list preserved files, archive parts and hashes. Earlier failures remain separate rather than being converted to passes. Diagnostic counts are not ordinary timings; component-stage gains are not summed into release-wide claims.

| Scope | Full review / machine-readable coverage | Raw evidence |
|---|---|---|
| Historical backend | [Review][historical]; [78 rows, 156 pairs, 1,360 samples][historical-json] | [Historical raw manifest][historical-raw] |
| Current backend, memory, Session cache | [Review][backend]; [78 backend rows/156 pairs, 132 memory comparisons/264 pairs, 15 Session comparisons/30 pairs][backend-json] | [Original comparison raw manifest][comparison-raw] |
| Maps, routes, camera and Maps browser | [Review][maps]; [141 comparisons/282 pairs, all positive pairs and semantic receipts][maps-json] | [Original comparison raw manifest][comparison-raw] |
| Mixed / managed restart | [Review][lifetime]; [192 recomputed mixed fields and restart checks][lifetime-json] | [Original comparison raw manifest][comparison-raw] |
| Real-archive updater | [Review][updater]; [25 activations, six windows, three same-source pairs and all interruption/cost rows][updater-json] | [Updater raw manifest][updater-raw] |
| Original UI plus recovery | [Original audit][ui-original]; [new validation/adoption][ui-adoption]; [two-lane review][ui] / [audit][ui-json] | [Failed original][ui-original-raw]; [recovery raw][ui-raw] |
| Startup / full contracts / original database | [Attempt3 review][adapters]; [25 metrics/106 pairs][adapters-json]; [earlier attempts and adverse rows][adapters-history] | [All output-location attempts][adapters-raw] |
| Integrated initial UI / bounded count diagnostic | [14 ordinary comparisons/28 pairs][names-json]; [retention decision][first-assets]; [count audit][assets-json] | [Names/setup bank][names-raw]; [diagnostic raw][assets-raw] |
| Configured first binding | [Review][bindings]; [six metrics/12 pairs, 400 warm durations][bindings-json] | [Raw manifest][bindings-raw] |
| Combined tests and compiled integration | [Exact-source checkpoint][checkpoint]; [89-control result][compiled] | [Combined verification receipt][tests]; [merged bank inventory][compiled-raw] |
| Prior whitepaper/component decisions | [Single ledger][ledger] links every accepted/rejected proposal and its retained limits | [Original whitepaper](REPORT.md); [traceability catalogue](completion/TRACEABILITY.md) |

[ledger]: completion/c954-resumption/resumed/CURRENT-ISSUES.md
[checkpoint]: completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md
[integrity]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-INTEGRITY.json
[historical]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/HISTORICAL-REVIEW.md
[historical-json]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/HISTORICAL-AUDIT.json
[historical-raw]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/historical/RAW-MANIFEST.json
[backend]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-BACKEND-REVIEW.md
[backend-json]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-BACKEND-AUDIT.json
[comparison-raw]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/comparison/RAW-MANIFEST.json
[maps]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-MAPS-REVIEW.md
[maps-json]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-MAPS-AUDIT.json
[lifetime]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-LIFETIME-REVIEW.md
[lifetime-json]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/COMPARISON-LIFETIME-AUDIT.json
[updater]: completion/c954-resumption/resumed/oct11/updater-final-public-resume/RESULTS-REVIEW.md
[updater-json]: completion/c954-resumption/resumed/oct11/updater-final-public-resume/RESULTS-AUDIT.json
[updater-raw]: completion/c954-resumption/resumed/oct11/updater-final-public-resume/raw/RAW-MANIFEST.json
[ui-original]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/UI-ATTEMPT1-AUDIT.json
[ui-original-raw]: completion/c954-resumption/resumed/oct11/final-matrix-public-resume/results/ui-attempt1/RAW-MANIFEST.json
[ui-adoption]: completion/c954-resumption/resumed/oct11/ui-owner-recovery/REPEAT-SMALL-ADOPTION.json
[ui]: completion/c954-resumption/resumed/oct11/ui-owner-recovery/RESULTS-REVIEW.md
[ui-json]: completion/c954-resumption/resumed/oct11/ui-owner-recovery/RESULTS-AUDIT.json
[ui-raw]: completion/c954-resumption/resumed/oct11/ui-owner-recovery/raw/RAW-MANIFEST.json
[adapters]: completion/c954-resumption/resumed/oct11/final-local/review-attempt3/INDEPENDENT-REVIEW.md
[adapters-json]: completion/c954-resumption/resumed/oct11/final-local/review-attempt3/NUMERIC-AUDIT.json
[adapters-history]: completion/c954-resumption/resumed/oct11/final-local/review-attempt3/ATTEMPT-COMPARISON.json
[adapters-raw]: completion/c954-resumption/resumed/oct11/final-local/RAW-LOCAL-OUTPUT-LOCATION.json
[names-json]: completion/c954-resumption/resumed/oct11/final-local/names-review-attempt2/NUMERIC-AUDIT.json
[names-raw]: completion/c954-resumption/resumed/oct11/final-local/RAW-ATTEMPT2-NAMES-SETUP.json
[first-assets]: completion/c954-resumption/resumed/oct11/first-assets-attribution/RESULTS.md
[assets-json]: completion/c954-resumption/resumed/oct11/first-assets-attribution/RESULTS-AUDIT.json
[assets-raw]: completion/c954-resumption/resumed/oct11/first-assets-attribution/RAW-MANIFEST.json
[bindings]: completion/c954-resumption/resumed/oct11/first-binding-acceptance/RESULTS-REVIEW.md
[bindings-json]: completion/c954-resumption/resumed/oct11/first-binding-acceptance/RESULTS-AUDIT.json
[bindings-raw]: completion/c954-resumption/resumed/oct11/first-binding-acceptance/raw/RAW-MANIFEST.json
[compiled]: completion/c954-resumption/resumed/oct8/final-merged-frontend/RESULTS.md
[compiled-raw]: completion/c954-resumption/resumed/oct8/final-merged-frontend/completed-bank-inventory.json
[tests]: completion/c954-resumption/resumed/oct8/integration-next/checkpoint-attempt1/receipt.json
[api-guide]: https://github.com/BunBajiro/kairo/blob/70cd12f9a4d014e7e2cf931b9681c4bdc7f18789/docs/INTERNAL-API.md
[api-reference]: https://github.com/BunBajiro/kairo/blob/70cd12f9a4d014e7e2cf931b9681c4bdc7f18789/docs/API-REFERENCE.md
