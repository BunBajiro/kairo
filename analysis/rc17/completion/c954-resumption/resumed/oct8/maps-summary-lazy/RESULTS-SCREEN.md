# Lazy M9 screen: correctness passes; adoption remains blocked by measured tradeoffs

The first and only prescribed screen completed successfully. **Do not integrate the prototype on this screen alone.** The steady-summary benefit is substantial for wide bodies and a populated source, and the eager design's large dense-note duplication has been removed. Canonical expiry is nevertheless slower in both pairs for seven of eight shapes; wide-map isolated API responses and selected detail reads also have repeated adverse results. Their causes are not established by this screen. This report retains every adverse observation and does not add a post-hoc acceptance threshold.

## Exact boundary and integrity

`screen-attempt1` ran 8 October 2026, 11:21:01.238–11:29:01.798 UTC (8m00.560s), under both shared runtime locks. It used clean `9afa9a7197fa6b5a802e9efdaa322dedf2439150` versus the isolated four-file lazy candidate, patch `85b33d1deaf3a21214d0d38b4457cc64a2b55bc6b415670ad98f4ca10305ca9a`. Nine measured/coordinator inputs match review binding `5fcdab8546fb46fd4c31ac0010b9a4bb2651914d08304188cb3da8844df5145f`. There were eight predeclared shapes and four fresh ABBA workers, one copied fixture per shape per arm, plus a dedicated baseline seed process. No retry, extra arm, GC/profile diagnostic or source edit occurred.

All five children exited zero; exact cross-arm output and `universe_records` authority parity passed for all 32 shape/arm combinations, with only generated v4 UUID spelling normalized after zero-UUID seed verification. Both source inventories and all nine harness inputs passed final verification. All 19 inventoried raw artifacts and every child stdout/stderr receipt were rehashed after completion; all matched. There were no cleanup failures, and temporary successful fixtures/seeds were removed. Logs were captured until process/pipe close, written once, fsynced and rehashed. This new integrity result does not repair or supersede the rejected eager trial's separately documented lost log tails.

`summary.json` is a reproducible post-run derivative from `summarize-screen.py`. An independent reviewer checked every raw parity object, all 624 phase/storage numeric comparisons, derivative maps and database-change maps. Pair 1 is baseline-1 versus candidate-1; pair 2 is baseline-2 versus candidate-2 (counterbalanced temporal order). Five warm observations within one worker produce its steady median; they are not five independent processes. Raw arms retain every phase, CPU and point-memory observation; `summary.json` preserves paired elapsed/storage comparisons. Cumulative maxRSS is not retained memory.

## First and steady reads

| Shape | Phase | Baseline → candidate ms (pair 1 / pair 2) |
|---|---|---|
| plain-1 | first-summary-empty-cache | 2.75→3.76 (+36.5%) / 3.82→3.75 (-1.7%) |
| plain-1 | five-steady-median | 1.69→1.19 (-29.8%) / 1.31→1.25 (-4.4%) |
| plain-24 | first-summary-empty-cache | 13.36→14.38 (+7.6%) / 10.36→13.83 (+33.5%) |
| plain-24 | five-steady-median | 13.11→10.79 (-17.7%) / 9.72→9.24 (-4.9%) |
| wide-1 | first-summary-empty-cache | 32.06→27.15 (-15.3%) / 28.23→26.73 (-5.3%) |
| wide-1 | five-steady-median | 21.27→1.65 (-92.2%) / 21.98→1.68 (-92.3%) |
| wide-24 | first-summary-empty-cache | 282.73→264.80 (-6.3%) / 248.27→275.10 (+10.8%) |
| wide-24 | five-steady-median | 278.10→24.62 (-91.1%) / 270.44→21.58 (-92.0%) |
| dense-notes-1 | first-summary-empty-cache | 8.77→10.21 (+16.4%) / 7.85→10.55 (+34.5%) |
| dense-notes-1 | five-steady-median | 6.25→3.83 (-38.7%) / 6.88→3.78 (-45.0%) |
| dense-notes-8 | first-summary-empty-cache | 60.89→62.83 (+3.2%) / 68.71→59.64 (-13.2%) |
| dense-notes-8 | five-steady-median | 59.54→27.39 (-54.0%) / 60.59→27.16 (-55.2%) |
| primitive-fallback-8 | first-summary-empty-cache | 4.79→4.72 (-1.3%) / 3.57→5.00 (+40.2%) |
| primitive-fallback-8 | five-steady-median | 3.67→3.94 (+7.2%) / 3.63→3.79 (+4.3%) |
| wide-source-1 | first-summary-empty-cache | 12.20→13.31 (+9.1%) / 12.37→12.98 (+4.9%) |
| wide-source-1 | five-steady-median | 12.50→1.23 (-90.2%) / 12.25→1.26 (-89.7%) |

The first empty read includes lazy key seeding and compact publication. Candidate construction leaves zero derivative rows and bodies, so there is no persistent eager backfill. First summary records two changed metadata rows per map (seed plus fill); five steady calls and the final post-expiry steady call write nothing. Unsupported primitive maps retain a versioned fallback marker and continue using the authoritative full body. Their steady overhead is visible rather than treated as an optimisation win.

Wide-one, wide-24 and wide-source steady gains are about 90–92%; dense-eight is about 54–55%. Plain-one and plain-24 show smaller paired gains. First read is mixed overall and slower in both pairs for plain-24, dense-one and wide-source. Existing populated startup remains about 10 seconds for wide-24 and 15–17 seconds for dense-eight. This prototype does not resolve those existing startup costs.

## Actual write/read and API cycles

| Shape | Phase | Baseline → candidate ms (pair 1 / pair 2) |
|---|---|---|
| plain-1 | raw-changed-write-alone | 0.39→0.23 (-41.3%) / 0.17→0.21 (+19.5%) |
| plain-1 | raw-write-plus-first-summary-1-to-1 | 1.80→1.20 (-33.0%) / 1.27→1.35 (+6.7%) |
| plain-1 | api-node-response-summary-detail-combined | 9.16→7.30 (-20.4%) / 6.42→6.84 (+6.5%) |
| plain-1 | api-comment-response-summary-detail-combined | 5.81→5.71 (-1.8%) / 5.11→5.71 (+11.8%) |
| plain-24 | raw-changed-write-alone | 0.14→0.16 (+13.9%) / 0.13→0.15 (+13.9%) |
| plain-24 | raw-write-plus-first-summary-1-to-1 | 11.22→10.66 (-5.0%) / 9.52→9.17 (-3.7%) |
| plain-24 | api-node-response-summary-detail-combined | 22.58→13.71 (-39.3%) / 14.01→14.10 (+0.6%) |
| plain-24 | api-comment-response-summary-detail-combined | 15.25→14.80 (-2.9%) / 14.04→13.95 (-0.6%) |
| wide-1 | raw-changed-write-alone | 4.40→4.73 (+7.6%) / 4.30→5.04 (+17.2%) |
| wide-1 | raw-write-plus-first-summary-1-to-1 | 27.13→11.75 (-56.7%) / 28.19→15.13 (-46.3%) |
| wide-1 | api-node-response-summary-detail-combined | 144.40→137.85 (-4.5%) / 127.76→133.79 (+4.7%) |
| wide-1 | api-comment-response-summary-detail-combined | 120.46→115.77 (-3.9%) / 144.24→114.36 (-20.7%) |
| wide-24 | raw-changed-write-alone | 5.72→9.89 (+72.9%) / 4.37→7.15 (+63.5%) |
| wide-24 | raw-write-plus-first-summary-1-to-1 | 263.53→34.10 (-87.1%) / 250.92→32.02 (-87.2%) |
| wide-24 | api-node-response-summary-detail-combined | 388.07→150.65 (-61.2%) / 372.31→147.02 (-60.5%) |
| wide-24 | api-comment-response-summary-detail-combined | 385.30→135.53 (-64.8%) / 365.98→136.35 (-62.7%) |
| dense-notes-1 | raw-changed-write-alone | 2.43→2.42 (-0.5%) / 2.88→2.50 (-13.2%) |
| dense-notes-1 | raw-write-plus-first-summary-1-to-1 | 8.98→7.47 (-16.9%) / 15.08→8.07 (-46.5%) |
| dense-notes-1 | api-node-response-summary-detail-combined | 75.04→84.96 (+13.2%) / 73.23→72.61 (-0.8%) |
| dense-notes-1 | api-comment-response-summary-detail-combined | 82.28→74.28 (-9.7%) / 75.42→73.12 (-3.0%) |
| dense-notes-8 | raw-changed-write-alone | 2.56→2.25 (-12.0%) / 3.18→2.26 (-29.1%) |
| dense-notes-8 | raw-write-plus-first-summary-1-to-1 | 57.26→38.76 (-32.3%) / 59.94→34.23 (-42.9%) |
| dense-notes-8 | api-node-response-summary-detail-combined | 124.25→101.53 (-18.3%) / 122.31→100.97 (-17.5%) |
| dense-notes-8 | api-comment-response-summary-detail-combined | 124.39→136.16 (+9.5%) / 120.64→108.20 (-10.3%) |
| primitive-fallback-8 | raw-changed-write-alone | 0.13→0.14 (+8.4%) / 0.13→0.11 (-15.7%) |
| primitive-fallback-8 | raw-write-plus-first-summary-1-to-1 | 3.79→5.67 (+49.7%) / 3.48→3.65 (+4.8%) |
| wide-source-1 | raw-changed-write-alone | 0.14→0.13 (-6.9%) / 0.15→0.13 (-12.4%) |
| wide-source-1 | raw-write-plus-first-summary-1-to-1 | 15.99→1.69 (-89.5%) / 11.86→2.53 (-78.7%) |
| wide-source-1 | api-node-response-summary-detail-combined | 19.75→5.89 (-70.2%) / 19.30→5.94 (-69.2%) |
| wide-source-1 | api-comment-response-summary-detail-combined | 18.33→6.69 (-63.5%) / 17.09→5.74 (-66.4%) |

These are real combined operations, including first reads after invalidation. The large wide-24 API cycles improve despite response-only/detail regressions: node response+summary+detail falls from 388/372 to 151/147 ms; comment cycles fall from 385/366 to 136/136 ms. Dense-eight node cycles improve in both pairs, but its comment cycle is mixed. Plain-one API cycles are also mixed. No production read/write frequency is assumed. Burst-write costs and their following read remain separate in the raw data: dense-eight's burst-first-summary is 56.32/54.85→76.62/59.60 ms, but the preceding write burst is mixed, so that read alone must not be relabeled as a two-pair regression for the whole burst-plus-read cycle.

## Adverse gates that remain material

| Shape / operation | Pair 1 baseline → candidate ms | Pair 2 baseline → candidate ms |
|---|---:|---:|
| wide-24 node response only | 60.47→81.60 (+34.9%) | 55.04→70.53 (+28.1%) |
| wide-24 selected node detail | 16.18→26.89 (+66.2%) | 17.06→22.77 (+33.5%) |
| wide-24 selected comment detail | 20.26→33.89 (+67.3%) | 22.78→26.29 (+15.4%) |
| wide-24 comment undo response | 78.54→88.06 (+12.1%) | 82.59→92.44 (+11.9%) |
| dense-one node response only | 39.37→55.03 (+39.8%) | 37.92→50.28 (+32.6%) |
| dense-eight comment undo response | 45.87→59.15 (+29.0%) | 41.42→49.67 (+19.9%) |
| wide-one selected comment detail | 22.11→26.49 (+19.8%) | 21.61→24.40 (+12.9%) |

Selected/full source cleanup remained inline and unchanged; these are observations after preceding lazy fill/write phases in each process. Allocation/GC history, SQLite page/cache/checkpoint state and code-generation effects are hypotheses, not demonstrated causes. No profile or causal ablation was performed. The prior eager trial's separate dense-selected adverse results also remain retained; this screen is not a causal explanation for them.

| Shape | Phase | Baseline → candidate ms (pair 1 / pair 2) |
|---|---|---|
| plain-1 | canonical-expiry-first-summary | 6.70→7.92 (+18.3%) / 6.23→6.51 (+4.4%) |
| plain-24 | canonical-expiry-first-summary | 63.21→79.73 (+26.1%) / 60.36→104.87 (+73.7%) |
| wide-1 | canonical-expiry-first-summary | 103.86→108.69 (+4.7%) / 92.77→103.95 (+12.0%) |
| wide-24 | canonical-expiry-first-summary | 779.64→824.67 (+5.8%) / 752.29→914.13 (+21.5%) |
| dense-notes-1 | canonical-expiry-first-summary | 38.96→51.40 (+31.9%) / 40.90→50.98 (+24.7%) |
| dense-notes-8 | canonical-expiry-first-summary | 198.56→287.29 (+44.7%) / 193.08→278.57 (+44.3%) |
| primitive-fallback-8 | canonical-expiry-first-summary | 18.18→19.97 (+9.9%) / 16.95→19.58 (+15.5%) |
| wide-source-1 | canonical-expiry-first-summary | 38.78→31.36 (-19.1%) / 30.49→29.85 (-2.1%) |

Dense-eight expiry adds about 85–89 ms in both pairs; plain-24 adds 17–45 ms. The candidate makes three additional changed derivative rows per map during this expiry call (invalidate delete/insert plus refill), but row counts alone do not explain elapsed cost. Subsequent wide summaries are much faster; that does not erase first expiry latency or justify assuming how frequently another summary follows. One-off adverse values elsewhere, such as dense-eight's first node response (+87% in one pair, -6% in the other), remain in `summary.json` and raw arms.

## Storage and writes

The following allocated-page totals are identical in both repetitions and remain the final checkpointed DB sizes. Derivative bytes are the observed maximum before expiry; after expiry the metadata is smaller, so reporting only final metadata would conceal its populated cost.

| Shape | Baseline DB bytes | Candidate DB bytes | Increase | Maximum compact body bytes |
|---|---:|---:|---:|---:|
| plain-1 | 655,360 | 700,416 | 6.88% | 34,464 |
| plain-24 | 2,576,384 | 2,998,272 | 16.38% | 395,759 |
| wide-1 | 18,468,864 | 18,616,320 | 0.80% | 137,731 |
| wide-24 | 102,215,680 | 103,788,544 | 1.54% | 1,556,885 |
| dense-notes-1 | 9,039,872 | 9,183,232 | 1.59% | 141,217 |
| dense-notes-8 | 27,090,944 | 28,102,656 | 3.73% | 1,001,111 |
| primitive-fallback-8 | 1,196,032 | 1,220,608 | 2.05% | 18,244 |
| wide-source-1 | 7,802,880 | 7,905,280 | 1.31% | 92,365 |

Dense-eight metadata peaks at about 1.00 MB, with arbitrary connection notes excluded. Its DB increase is 3.73%, versus the rejected eager design's separate +75.3% dense-note result; this is evidence that the earlier duplication mechanism was removed, not a matched speed comparison between those trials. Plain-24's 16.38% increase is 421,888 bytes and must remain visible. Repeated small changed writes still pay invalidation overhead: plain-24 eight-write burst is 0.435/0.377→0.778/0.599 ms. WAL sizes depend on intervening automatic checkpoints and are not cumulative write-amplification byte measurements. For example, dense-eight's observed WAL maximum is lower in the candidate; this does not prove fewer bytes written.

## Minimum remaining decision gates

The 41 focused tests already cover rollback/savepoints, owner/kind/key moves, direct SQL replacement/deletion, stale publication and ABA, large generation tokens, version/trigger repair, full authoritative cleanup with actual SQL row keys, unknown-field retention, own-property `locked`, contention fallback and canonical expiry/pruning. The screen now adds real node/comment API edits, node undo with immediate summary/detail, comment undo followed by another edit/read cycle, and plain-one native import/removal with immediate summary/detail. All four arms match. Broadly labeling import/undo wholly untested would now be wrong; complex imported data and unrelated UI flows were not exercised by this bounded fixture.

For **component adoption**, the smallest remaining semantic gap is a warmed compact source/interactive map followed by actual background location/tracking publication, then immediate summary and selected detail. Existing standalone tracking tests do not necessarily install and warm this new metadata layer. Exercise source and scoped-map propagation plus the supported tracking write callback in one focused integration case, compare baseline/candidate authoritative output, and confirm invalidation/refill followed by a write-free steady summary. No broad new matrix is required for this semantic gap.

The performance decision still needs explicit disposition of expiry and isolated response/detail regressions. A bounded, predeclared follow-up of the concrete wide-24 response/detail case and dense-eight/plain-24 expiry transition is sufficient to investigate those observations; repeating every original shape or varying implementations until a pass would not be justified. Any causal diagnostics belong outside timed comparisons, and all first-screen adverse evidence must remain. If the team elects to accept an observed tradeoff, it must state which actual caller sequences justify it; the synthetic combined cycle cannot establish production frequency.

Until those decisions are supported, keep the lazy prototype unintegrated. If release scope instead chooses **measured retention of the existing implementation**, record that as an explicit rejected/retained optimisation decision, with the remaining wide-summary cost visible; do not describe the compact-input optimisation as implemented or the latency finding as fixed. Final integration, if adopted, still needs the normal combined-source correctness/build gates. No clean RC17 or PR #10 review readiness follows from this isolated screen.
