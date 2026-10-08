# M9 compact SQL summary projection: reject this trial

**Do not integrate this two-file trial. M9 remains open.** On exact9afa baseline versus the declared isolated candidate, the completed original matrix preserves outputs but shows repeated material summary regressions. Moving projection into SQLite without changing persistence does not adequately remove the underlying repeated document work.

All15mutation/access phases,27diagnostic cases and complete selected-output equivalence match. The original27case ×4process ×5sample family and21case ×4process ×7sample family completed:1,128ordinary service samples, with separate serialization/CPU observations. Source/harness end guards pass, and28raw artifact hashes are verified by the unchanged summarizer. Independent source review identified primitive array-element interpretation; the trial was corrected before freezing and received21focused passing tests. The first semantic attempt had one fixture-count failure caused by required initial source creation; both attempts remain saved.

Table entries summarize the two process medians per variant, not independent pooled samples. Timings are milliseconds. The repeated flag requires >10% and >1ms in both paired process medians; it is an investigation rule, not a universal user-impact threshold.

| Case | Baseline → trial | Change | Repeated flag |
|---|---:|---:|---|
| plain/1/summary | 1.289 → 1.198 | -7.0% | False |
| plain/8/summary | 3.722 → 5.885 | +58.1% | True |
| plain/24/summary | 10.517 → 16.774 | +59.5% | True |
| wide/1/summary | 10.165 → 18.975 | +86.7% | True |
| wide/8/summary | 73.346 → 89.340 | +21.8% | False |
| wide/24/summary | 242.131 → 227.445 | -6.1% | False |
| roster/1/summary | 0.795 → 1.242 | +56.2% | False |
| roster/8/summary | 4.244 → 6.429 | +51.5% | True |
| roster/24/summary | 13.342 → 20.418 | +53.0% | True |

The24wide-map diagnostic falls from85,714,734 parsed map characters to1,593,786; nevertheless ordinary service median only falls242.130→227.445ms (about6.1%). The1wide-map case regresses10.165→18.976ms. Plain/roster8and24map summaries and several original Maps summary rows regress repeatedly. Eleven service/serialization metric rows meet the repeated rule across the complete matrix; all raw observations and flags are preserved in matched-attempt1/summary.json, with concise output in summary-output.txt.

This establishes that reduced JavaScript transfer/parse counts are insufficient evidence of improvement. Source inspection suggests native JSON projection and scalar/array handling can replace the removed JavaScript cost, but the exact native cost distribution was not independently profiled. Do not claim SQL decodes once without execution-plan evidence. No heap/RSS saving is claimed; additional memory, dense connection-note and cleanup-heavy performance gates were not run because the candidate already failed ordinary acceptance.

Current production-source continuation stays unchanged by this trial. The previously integrated9afa roster owner and no-op serialization guard remain. Next evaluate a small durable summary/reconciliation metadata boundary maintained transactionally with map writes, or an alternative that truly avoids repeated whole-body decoding. Such a proposal must account for one-time backfill, ordinary writes, page/retained overhead, direct SQL replacement, expiry/cleanup, import/undo and full-output parity. A schema change is not approved by this report; first isolate its cost/benefit. No broad database rewrite follows automatically.

PR10 remains withdrawn. This rejection closes only this experiment, not the underlying M9 finding or any final combined gate.
