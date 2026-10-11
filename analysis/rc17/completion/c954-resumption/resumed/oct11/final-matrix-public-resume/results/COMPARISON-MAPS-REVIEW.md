# Final local Maps, routes and camera review

The collected RC16→source70 comparison supports the retained implementations. **No new material issue requiring another optimization or repeat measurement was found in this scope.** Existing adverse camera components and short-window limits remain explicit below. This is local evidence; independent Actions, other acceptance scopes and final release review remain separate.

Read-only audit of `/tmp/kairo-final-matrix-public-20261011/attempt1/comparison/comparison`: all14 consumed JSON files match their earlier closed-file tuples. Recomputed520 aggregate/sample-summary values and141 comparison rows/282 matched pairs. `COMPARISON-MAPS-AUDIT.json` retains every comparison and positive pair. No application was executed and no source, measured output or bound harness changed. Root separately reviews the global ownership envelope.

## Maps and navigation

All15 shared Maps cases improve median service time in both pairs; means of run medians improve30.26–90.05%. Selected-map time at1/8/24 maps is3.273/5.649/12.388ms for RC16 versus1.559/1.780/1.648ms for candidate. Full24-map retrieval is309.388→30.781ms (−90.05%). Serialization is measured separately; its individual adverse samples remain in the JSON.

Diagnostics preserve fixture/cardinality/geometry/binding assertions and zero warm-read writes. At24 maps, selected retrieval materializes2,376→99 link bodies and298→100 signature bodies, with candidate links restricted to the selected map. Full-list link materializations fall59,400→2,376. The old signature-by-edge filter is absent in all candidate diagnostic cases.

The six new compact-summary cases have no same-endpoint RC16 comparator. Their current costs remain visible: the24-map independence case has9.483/10.219ms run medians and a7,688-byte response, versus the full-list5,509,856-byte response. This is a deliberately different response contract, not raw byte equivalence. No previously rejected M9 optimization is reopened.

Selected-response raw hashes exactly reproduce the historical RC16 `b38a1d82…bcbbd7c` and candidate `5064dfaa…2a8968` pair. The banked `analysis/rc17/raw/maps-equivalence-059/comparison.json` documents zero field differences, preserved array order and only property insertion-order differences in99 connection objects. Current invariance across unrelated-map volumes and selected/list paths holds; this audit does not falsely claim identical cross-version JSON bytes.

Route fixture and complete-plan hashes match across both diagnostics and all four timing runs. Graph builds at1/10/50 stops remain1/10/50 for RC16 and1/1/1 for candidate. Mean run medians are17.997→14.917ms,156.988→15.933ms and788.675→32.557ms (−17.11%,−89.85%,−95.87%), improving in both pairs. The one-stop first-pair maximum rises1.004ms/+2.97%; it remains retained rather than being hidden by the improved mean.

## Camera and compiled behavior

| Fixture/action | Mean renderer task ms, RC16→candidate | Change |
| --- | ---: | ---: |
| 100-node zoom | 1,037.23→331.96 | −68.00% |
| 100-node pan | 263.04→195.29 | −25.76% |
| 600-node zoom | 2,169.29→919.85 | −57.60% |
| 600-node pan | 1,656.47→691.10 | −58.28% |

All four action/task comparisons improve in both pairs. Dense zoom long tasks fall12/12→0/0; dense pan retains two candidate long tasks per observation,71–77ms. This is not a stall-free or desktop-GPU claim.

The sole non-RAF metric exceeding the existing diagnostic >1ms **and** >10% marker in both pairs is600-node zoom layout:2.798→5.896ms, +3.099ms/+110.76%. Its +2.683/+3.514ms pair costs fit the already retained M5 camera tradeoff: the prior c954 review also records higher zoom layout despite much lower total task/script/style work. No new source intervention follows merely to eliminate this component cost.

One-second100-node idle task means increase3.072→7.121ms, driven by +7.865ms in one pair versus +0.232ms in the other.600-node idle task improves9.134→3.475ms. These sparse short windows do not establish an ongoing idle regression or gain. Pan style/layout increases and all other positive pairs remain in the JSON.

Separate post-timing diagnostics show more candidate style/attribute mutations, but no scene-node changes. After two mount/unmount cycles every run has zero map nodes/canvases and no Universe requests after unmount. Candidate listener counts are612→613 and613→613; retained-heap changes are +701,608/+478,468 bytes, versus baseline +602,512/+636,276. These bounded observations cannot establish leak freedom; mutation counts are not React commits.

The compiled Maps receipt passes all17 original checks, including reconnect recovery, collapse/scale persistence, pilot/map fencing, delayed saves, focus/drag and invalidation coalescing. Errors/external requests are empty; source verification, browser exit and cleanup pass. Two repeats, seven service samples or nine route samples remain small observed sets; maximum/p95 labels are not population-tail estimates. RAF aggregates match retained sample summaries, but complete frame timestamp arrays were not retained for independent quantile reconstruction.
