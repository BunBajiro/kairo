# CI backend and memory arithmetic review

**Arithmetic and scoped semantic checks pass; a repeated current-source ongoing state HTTP tail cost remains.** This is an offline review of the original Actions 38176821997 evidence, collected October 11, 2026. No benchmark or application runtime was rerun. Numeric validity is not a blanket performance pass or release approval.

Current comparison: RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` → `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. Historical corrected comparison: 0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c` → RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`. These are separate ABBA lanes; historical startup/idle costs are not attributed to the current change.

## Current RC16 → 70cd

**Typical state HTTP p95 increases in both pairs: 12.504122→17.454456 ms (+4.950334 ms, +39.5896%) and 10.678834→15.130395 ms (+4.451561 ms, +41.6858%).** Both exceed the existing joint +1 ms and +10% marker. This is an ongoing warm-operation observation: three HTTP warmups are excluded, and HTTP runs after the 35-second idle window and direct operations. It cannot be relabelled as startup or first-use cost. Ten measured HTTP samples make p95 the maximum under the harness nearest-rank rule; two runs do not establish a distribution or cause.

| Metric | Baseline mean | Candidate mean | Pair deltas | Mean change | Joint marker |
|---|---:|---:|---|---:|---|
| typical / idle_cpu (% one core) | 0.664810 | 0.385151 | -0.286862 / -0.272454 | -42.07% | no |
| typical / idle_rss (MiB) | 183.175781 | 137.644531 | -45.460938 / -45.601562 | -24.86% | no |
| typical / startKairo_startup (ms) | 131.229637 | 133.781265 | -1.612516 / +6.715773 | +1.94% | no |
| typical / state_http (ms) | 7.625271 | 7.926143 | +0.301241 / +0.300503 | +3.95% | no |
| typical / state_http_p95 (ms) | 11.591478 | 16.292425 | +4.950334 / +4.451561 | +40.56% | yes |
| typical / state (ms) | 3.017761 | 3.279461 | +0.228804 / +0.294595 | +8.67% | no |
| typical / state_p95 (ms) | 3.307789 | 3.428416 | +0.040690 / +0.200563 | +3.65% | no |
| typical / session (ms) | 10.605525 | 11.911515 | +1.774828 / +0.837154 | +12.31% | no |
| typical / session_p95 (ms) | 14.530129 | 13.516216 | -0.726369 / -1.301458 | -6.98% | no |
| typical / session_payload (KiB) | 469.925781 | 475.199219 | +5.273438 / +5.273438 | +1.12% | no |
| stress / idle_cpu (% one core) | 1.301482 | 0.928956 | -0.328571 / -0.416479 | -28.62% | no |
| stress / idle_rss (MiB) | 224.230469 | 154.281250 | -69.898438 / -70.000000 | -31.20% | no |
| stress / startKairo_startup (ms) | 123.802144 | 126.397978 | +1.173447 / +4.018220 | +2.10% | no |
| stress / state_http (ms) | 30.211765 | 30.960168 | +1.052296 / +0.444511 | +2.48% | no |
| stress / state_http_p95 (ms) | 37.990230 | 34.457339 | -1.989178 / -5.076605 | -9.30% | no |
| stress / state (ms) | 15.990222 | 17.071987 | +0.442411 / +1.721120 | +6.77% | no |
| stress / state_p95 (ms) | 19.666842 | 21.816638 | +1.818362 / +2.481229 | +10.93% | no |
| stress / session (ms) | 65.338826 | 65.864670 | -0.094420 / +1.146108 | +0.80% | no |
| stress / session_p95 (ms) | 79.070345 | 73.211291 | -4.599625 / -7.118483 | -7.41% | no |
| stress / session_payload (KiB) | 2777.172852 | 2812.329102 | +35.156250 / +35.156250 | +1.27% | no |

All 78 current summary rows, every pair and every adverse flag are retained in the JSON, along with unsummarized CPU p95/min/max, per-operation memory snapshots, HTTP server CPU/loop/RSS, and raw distributions. Larger response payloads are observations and do not by themselves establish the cause of timing differences.

## Historical corrected 0.7.3 → RC16

| Metric | Baseline mean | Candidate mean | Pair deltas | Mean change | Joint marker |
|---|---:|---:|---|---:|---|
| typical / idle_cpu (% one core) | 0.486615 | 0.726364 | +0.333254 / +0.146246 | +49.27% | no |
| typical / idle_rss (MiB) | 93.517578 | 180.001953 | +89.738281 / +83.230469 | +92.48% | no |
| typical / idle_loop_max (ms) | 13.549567 | 20.111359 | +8.060928 / +5.062656 | +48.43% | yes |
| typical / startKairo_startup (ms) | 13.130460 | 138.565571 | +120.766045 / +130.104177 | +955.30% | yes |
| typical / state_http_p95 (ms) | 12.205998 | 11.831185 | -1.969879 / +1.220254 | -3.07% | no |
| stress / idle_cpu (% one core) | 1.043943 | 1.388938 | +0.354949 / +0.335042 | +33.05% | no |
| stress / idle_rss (MiB) | 126.353516 | 224.265625 | +97.082031 / +98.742188 | +77.49% | no |
| stress / idle_loop_max (ms) | 29.638655 | 46.202879 | +12.910592 / +20.217856 | +55.89% | yes |
| stress / startKairo_startup (ms) | 16.094950 | 127.564622 | +111.462971 / +111.476374 | +692.58% | yes |
| stress / state_http_p95 (ms) | 33.889365 | 34.142196 | +1.349962 / -0.844299 | +0.75% | no |

The older baseline has no Universe collector; its feed/tick applicability is explicitly false. RC16/current observations have successful real ticks, no rejected ticks, corrected storms fixtures and zero blocked external attempts. All 78 historical rows and unsummarized metrics remain separate in the JSON.

## Memory and sessions

| Metric | Baseline mean | Candidate mean | Pair deltas | Mean change | Joint marker |
|---|---:|---:|---|---:|---|
| ordinary / harness_baseline / sincePreviousMarkerMs (ms) | 0.365433 | 0.444056 | -0.006841 / +0.164088 | +21.52% | no |
| ordinary / store_module_imported / sincePreviousMarkerMs (ms) | 0.798707 | 0.827180 | +0.038778 / +0.018167 | +3.56% | no |
| ordinary / store_open_4_pilots_seeded / sincePreviousMarkerMs (ms) | 21.237616 | 22.476107 | +1.241776 / +1.235206 | +5.83% | no |
| ordinary / core_module_imported / sincePreviousMarkerMs (ms) | 33.252651 | 30.413935 | -2.620530 / -3.056904 | -8.54% | no |
| ordinary / core_created / heapUsed (bytes) | 56783416.000000 | 39209808.000000 | -17868800.000000 / -17278416.000000 | -30.95% | no |
| ordinary / core_created / sincePreviousMarkerMs (ms) | 118.402059 | 112.581891 | -4.111660 / -7.528675 | -4.92% | no |
| ordinary / core_closed_reference_released / heapUsed (bytes) | 56845744.000000 | 39306728.000000 | -17834208.000000 / -17243824.000000 | -30.85% | no |
| ordinary / core_closed_reference_released / sincePreviousMarkerMs (ms) | 0.423060 | 0.727824 | +0.297619 / +0.311911 | +72.04% | no |
| ordinary / store_closed_reference_released / sincePreviousMarkerMs (ms) | 1.551890 | 1.755296 | +0.220789 / +0.186022 | +13.11% | no |
| retention / core_created / heapUsed (bytes) | 42509560.000000 | 32245512.000000 | -10264336.000000 / -10263760.000000 | -24.15% | no |
| retention / core_closed_reference_released / heapUsed (bytes) | 36545724.000000 | 32815932.000000 | -3729888.000000 / -3729696.000000 | -10.21% | no |
| retention / recreate_use_close_cycle_10 / heapUsed (bytes) | 36982140.000000 | 33333956.000000 | -3648392.000000 / -3647976.000000 | -9.86% | no |

| Metric | Baseline mean | Candidate mean | Pair deltas | Mean change | Joint marker |
|---|---:|---:|---|---:|---|
| 100 / 1 / 0 / session_route (ms) | 0.509761 | 0.458172 | -0.042455 / -0.060723 | -10.12% | no |
| 100 / 1 / 0 / route_and_combat_groups (ms) | 0.466785 | 0.531493 | +0.081944 / +0.047471 | +13.86% | no |
| 100 / 1 / 0 / actual_live_sync_cache_hit (ms) | 0.481363 | 0.004932 | -0.471794 / -0.481067 | -98.98% | no |
| 1000 / 1 / 0 / session_route (ms) | 3.597873 | 3.552554 | -0.139732 / +0.049094 | -1.26% | no |
| 1000 / 1 / 0 / route_and_combat_groups (ms) | 4.286804 | 3.773227 | -0.743885 / -0.283268 | -11.98% | no |
| 1000 / 1 / 0 / actual_live_sync_cache_hit (ms) | 3.978714 | 0.003961 | -3.967036 / -3.982470 | -99.90% | no |
| 10000 / 1 / 0 / session_route (ms) | 38.582274 | 35.098642 | -3.740623 / -3.226639 | -9.03% | no |
| 10000 / 1 / 0 / route_and_combat_groups (ms) | 39.291966 | 38.176830 | -1.268156 / -0.962115 | -2.84% | no |
| 10000 / 1 / 0 / actual_live_sync_cache_hit (ms) | 38.573064 | 0.004222 | -38.370122 / -38.767564 | -99.99% | no |
| 100 / 1 / 10000 / session_route (ms) | 0.351001 | 0.308727 | -0.041062 / -0.043486 | -12.04% | no |
| 100 / 1 / 10000 / route_and_combat_groups (ms) | 0.408392 | 0.365833 | -0.050866 / -0.034252 | -10.42% | no |
| 100 / 1 / 10000 / actual_live_sync_cache_hit (ms) | 0.429870 | 0.004041 | -0.426715 / -0.424942 | -99.06% | no |
| 1000 / 4 / 0 / session_route (ms) | 3.278044 | 2.930904 | -0.333014 / -0.361266 | -10.59% | no |
| 1000 / 4 / 0 / route_and_combat_groups (ms) | 3.894270 | 3.611714 | -0.269957 / -0.295156 | -7.26% | no |
| 1000 / 4 / 0 / actual_live_sync_cache_hit (ms) | 15.851002 | 0.004066 | -15.890056 / -15.803816 | -99.97% | no |

Ordinary snapshots/phase intervals and forced-GC retention are separate. The ordinary store-opening interval includes four-pilot seeding; it is not first Assets open. Forced-GC rows intentionally retain process/module singletons after closure. Cycle growth and every memory pair remain recorded; these finite observations are not a no-leak proof. All 100 marker observations have one native context and zero detached contexts.

Five fixture definitions, route/group hashes, route lengths, route byte counts and combat group counts agree across all six session workers. Discovery preparation is explicitly checked. Every candidate live-sync cache-hit diagnostic returns zero visit rows; baseline totals are 300/3,000/30,000/300/12,000 across three calls. CPU medians and all 420 wall/CPU sample records are retained separately. The SQL evidence measures returned rows, not pages scanned; diagnostics are not timing runs. Semantic hash equality covers only system/time/duration/active route fields and combat groups. Hash bodies and complete decoded HTTP outputs are not archived.

## Reproduction and scope

Run `python audit-backend-memory.py /absolute/path/to/extracted/evidence`. The script reads raw files, recomputes distributions and summaries, and writes only its sibling JSON audit; optional `--write-review` also regenerates this review. It does not invoke a harness or import application code. Floating comparisons use relative tolerance 1e-12 and absolute tolerance 1e-9; stored raw values and unrounded recomputations remain in the JSON. Adverse flags retain every positive pair, while the joint marker uses strict >1 ms and >10% in both pairs. Larger numeric values can be contextual (for example measured duration or allocator residency), so an increase flag alone is not a defect diagnosis.

Coverage: 2720 backend samples; 1088 recomputed distribution values; 156 summary rows; 556 exhaustive numeric comparison rows; 32 CPU/tick meters; 52 displayed summary rows; 128 displayed operation rows; 100 marker observations; 50 memory summaries/264 aggregates; 420 session sample records/60 medians; 30 session summaries; 30 diagnostic rows. All 14 memory worker hashes agree with the immutable completion record. Full input hashes are recorded for this scoped audit.

Node v24.19.0, Linux x64, AMD EPYC 9V45, four logical CPUs. Backend workloads match count fingerprints within each lane. Backend fixture assertions and archived settings supply bounded semantic evidence, not full cross-version HTTP equivalence. No database workers exist in these lanes. Journey is the preserved cold compatibility reader; active lifetime Journey logging/UI is retired. The parent review owns ZIP/source/runner envelope validation and remaining acceptance lanes; this review makes no causal source attribution and does not replace that envelope.
