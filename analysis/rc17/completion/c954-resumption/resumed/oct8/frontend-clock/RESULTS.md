# M6 refresh/clock matched gate

8 October 2026. **The narrow clock-owner trial passes correctness and reduces repeated map-publication work; retain the adverse camera/gesture rows when deciding adoption.** No task row triggers the declared repeated >10% and >1ms rule. These results support this bounded owner change under that rule, not broad leaf/camera optimization, universal speedup or clean RC17. Integration and final combined closure remain the coordinator's decision.

The baseline is clean exact `a7b1bf97b0073695926c443e52d523638e59e48d`, using its previously fresh, fingerprint-verified independent M6 build. The candidate is only the three clock/workspace source files plus the clock tests in `clock-refresh.patch`; full source comparison confirmed those four differences. Its typecheck and fresh production build pass. Source/build fingerprints are baseline `e1007fe8e518aab1eeb1015d710ac56e0759745b37202b6c660691e06ba089f7`, candidate `8a093f07277ec0a0b9e3d4bd8eac1305330a08281c22a1fb995e74f95791c688`. The runtime slot ran10:40:56–10:43:54UTC under the shared lock; all final source/harness captures and completed writes occurred before release. No worker failed or was replaced.

## Contract and correctness

Current wall time is consumed with a new complete map, library-summary or feed publication in the same render. The effect arms deadline ownership without another immediate setNow. Clock ticks and visibility still publish current time. Deadline selection uses the time already consumed at render, while its delay uses actual effect time; a deadline crossed between those two gets an immediate tick. Clock rollback during that gap publishes immediately. Legacy callers without a finite consumed timestamp still publish. No map-revision/shape comparator, custom leaf equality, new global cache or changed scene/gesture/camera ownership is introduced.

All32 targeted tests pass, including all8 clock tests (the6 additions plus2 existing) and workspace model, display and scoped-refresh controls. New cases cover no redundant tick, independent30-second cadence, absolute expiry, render-to-effect crossing, complete replacement records, hidden/resume/terminal-close, invalid timestamp fallback and clock rollback. Candidate compiled correctness passes24 action rows/13 controls before ordinary timing. All four fixed ABBA workers then pass the same24 rows/13 controls: metadata labels, same-revision pilot/record data, native deadline/rally/observation and stale-pilot transition, backend waiting-pilot refresh, selected state, native drag/save, zoom and pan.100/600-node saved drag positions match exactly across all five workers: system30000142 moves(0,0)→(60,28).

Browser executable SHA/CDP revision, loaded script hashes, app source/build fingerprints and worker/helper hashes passed before/after. Every completed worker records actual Chromium exit, app close and scratch removal. No application exception or external server request occurred. This worker preserves the prior M6 fixture/control scope; it does not claim every public-feed or delayed pilot/map workflow was repeated here. Those established model/workflow fences remain part of final combined integration.

## Ordinary renderer results

Same100/600-node canonical BFS fixture, full detail/default scale,1600×1050, real API refreshes and real3.5-second deadline. There is no React hook, props serialization, precise coverage, CPU profile or forced GC. Performance counters measure renderer task/script/layout/style, excluding browser/GPU/worker and server CPU. A long-task observer and complete request/graph/output receipts remain. Map-open includes readiness, fixed settles and fit;600-node open follows the same100-node history in each process. Only the four ordinary workers enter these values; the first correctness worker is excluded.

Two observations per arm, shown as means (also two-point medians), with both nearest AB/BA pairs. `SUMMARY.json` retains every original sample, all paired metrics, long tasks, heap endpoints and request/control records.

| Nodes | Phase | Baseline task ms | Candidate task ms | Task delta | Nearest AB / BA task % | Script delta |
|---:|---|---:|---:|---:|---:|---:|
|100|map-open|209.103|210.189|+0.52%|-7.62% / +7.70%|+2.17%|
|100|unchanged-refresh-1|38.059|26.959|-29.17%|-16.16% / -36.71%|-21.57%|
|100|unchanged-refresh-2|25.524|27.396|+7.33%|-3.55% / +15.42%|-25.78%|
|100|unchanged-refresh-3|28.855|17.742|-38.51%|-7.44% / -59.22%|-51.37%|
|100|one-node-metadata|79.917|49.535|-38.02%|-44.68% / -29.82%|-50.74%|
|100|same-revision-pilot-and-record|110.085|92.561|-15.92%|-5.47% / -25.35%|-39.47%|
|100|clock-boundary|106.664|105.763|-0.84%|+6.18% / -7.57%|-11.74%|
|100|after-deadline-refresh|93.182|84.172|-9.67%|+3.10% / -20.21%|-45.94%|
|100|selection|229.096|217.167|-5.21%|+9.62% / -19.24%|-21.38%|
|100|native-node-drag-save|261.947|295.957|+12.98%|+25.44% / -0.29%|-7.63%|
|100|zoom-control|514.499|516.577|+0.40%|+6.47% / -4.77%|+6.12%|
|100|pan-control|270.809|278.809|+2.95%|+14.08% / -7.53%|-8.99%|
|600|map-open|1061.694|1115.380|+5.06%|+11.91% / -1.89%|+6.60%|
|600|unchanged-refresh-1|91.160|78.238|-14.18%|+12.78% / -37.62%|-32.33%|
|600|unchanged-refresh-2|83.507|52.767|-36.81%|-37.65% / -35.93%|-42.54%|
|600|unchanged-refresh-3|84.920|77.528|-8.70%|+5.26% / -25.27%|-43.73%|
|600|one-node-metadata|229.522|205.015|-10.68%|-8.33% / -13.08%|-15.11%|
|600|same-revision-pilot-and-record|368.889|242.152|-34.36%|-49.12% / -7.58%|-63.46%|
|600|clock-boundary|376.074|358.965|-4.55%|-2.05% / -6.93%|-5.11%|
|600|after-deadline-refresh|245.274|228.934|-6.66%|+1.85% / -14.17%|-12.46%|
|600|selection|698.286|627.556|-10.13%|-7.45% / -12.77%|-23.28%|
|600|native-node-drag-save|1293.205|1474.414|+14.01%|+36.58% / -5.32%|+4.87%|
|600|zoom-control|1032.529|1258.535|+21.89%|+37.47% / +6.21%|+0.31%|
|600|pan-control|1113.514|1112.098|-0.13%|-7.75% / +8.12%|+14.28%|

Across the three unchanged refreshes,100-node renderer task totals92.437→72.097ms (−22.00%; nearest pairs−9.62%/−30.04%). At600nodes,259.586→208.533ms (−19.67%; pairs−6.30%/−33.35%). The individual100-node second refresh is adverse in task, so it remains visible alongside the summed sequence. Metadata and same-revision pilot/record task rows improve in both nearest pairs at both sizes. This agrees with the preceding observed redundant publication/clock mechanism, without using intrusive coverage timings as acceptance data.

## Adverse observations retained

- 600-node zoom task rises226.006ms/+21.89% in means. Both pairs are adverse:388.140ms/+37.47% and63.872ms/+6.21%. Script is almost flat (+0.31%). The second pair does not cross10%, but that does not make the observed task increase disappear or identify its cause.
- 600-node native drag/save rises181.210ms/+14.01%, with pairs436.487ms/+36.58% and−74.068ms/−5.32%.100-node drag rises34.010ms/+12.98%, with pairs68.749ms/+25.44% and−0.729ms/−0.29%. Final saved coordinates remain identical. No drag speedup is claimed.
- 600-node map-open rises53.686ms/+5.06%, with pairs127.327ms/+11.91% and−19.955ms/−1.89%.100-node map-open is+1.086ms/+0.52%. Preserve these first-selection costs in final combined checks.
- 600-node pan task is approximately flat (−0.13%) but script increases14.28%; both script pairs rise7.818ms/+10.44% and14.463ms/+17.83%. This is a repeated script adverse observation even though it does not meet the declared task rule.100-node pan and zoom include mixed adverse observations too.

No optional rerun/profile/variant was used to replace these controls or explain them speculatively. They limit the claim to recurring map-publication work. The source does not alter camera algorithms, but that alone is not causal evidence dismissing the observed interaction costs. The earlier diagnosis and this gate support addressing the refresh owner before any broader leaf memoization. A general scene comparator or culling change is not warranted by these results.

## Disposition boundary

The scoped recommendation is to adopt only the reviewed refresh/clock change with the listed tradeoffs, subject to the coordinator's decision and final merged publication/clock/input checks. If adopted, record M6's stable-scene recommendation as resolved by a narrower measured owner change, with broad leaf/camera work explicitly declined on this evidence; do not leave an unimplemented broad comparator implied as mandatory. M7/M8 camera/culling decisions, F3 Context and F6 archive/table remain their separate findings.

`prepared.json` preserves the preflight source/harness hashes and authored-only status at freeze; `attempt1/completed.json` is the completed runtime receipt. `clock-refresh.patch` and the full raw inventory are the integration/bank artifacts. No shared source or remote repository was changed by this agent. Full merged tests/build/package/CI and remaining finding dispositions still precede user review.
