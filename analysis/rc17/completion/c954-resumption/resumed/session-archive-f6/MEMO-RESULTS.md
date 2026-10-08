# F6 archive card memo: three-pair decision evidence

Decision: root accepted the narrow card memo boundary after independent review; main-source correctness validation remains required. It repeatedly reduces loaded-prefix refresh work and append work while preserving complete card DOM, history and current freshness behavior. This is not a blanket improvement claim: smaller-prefix report opens have mixed/adverse rows, and browser work from a 1,500-card DOM remains material. No windowing, retention cap or refresh-transport change is justified by this comparison alone. See DECISION.md for the accepted bounded disposition. Main integration and combined-source validation remain parent-owned.

The candidate extracts the existing native archive button into a memo component with all display values as primitive props (`id`, `label`, `started`, `minutes`, `active`) and a stable pilot-scoped opener callback. The parent still recomputes active minutes using `Date.now()` on every render. Changed labels, active state and minutes invalidate the card, with no timer-cadence change. There is no custom equality function, global cache, DOM reduction or session pruning.

## Source and method

Both arms are isolated local feature checkouts of `a7b1bf97b0073695926c443e52d523638e59e48d` plus the same reviewed report/naming cancellation focus patch `32c908a8687c0fbd57ac179d1d32f75d59d5b61ca48064ed2af0baa8d112560c`. Only `components/kairo/intelligence.tsx` differs between arms. Memo patch: `719fc58da60cca22399f35f9dd44f91dc03dca69c6cfdb5ccab71b599a8aa464`; final candidate file SHA-256: `4c3f21fed3d50a453c58df6b6f448ba93e7d2d6942f5bc6b1ad397d3eb797dd4`.

- Baseline source/build fingerprint: `6289b6cf59ac7cfc15b7005008e1b6667feb89d92a3d62dc8dbcd64c2a8f2a6c`.
- Candidate source/build fingerprint: `6769dbee786064de306392d039ee0659d5fe501cb2761a3381dd0255c99c4c1e`.
- Unchanged worker SHA-256: `1730e949b7ebe8043c341627a26b0f50801b242261852dff7655aa4a71f43782`.

Three fresh matched browser/application process pairs ran AB, BA, AB. Pair 1 is the original screening run, not a repeated replacement. `PAIR-OFFSET.md` records the sole runner adjustment before pairs 2/3; fixture, assertions, source, timeouts and metrics did not change. Chrome138/Node24 and the shared performance lock were used. Each process has the same durable synthetic 1,500-session fixture; prefixes are 30, 300 and 1,500 loaded cards. All six processes pass 81 hard checks, source/end/cleanup guards and exact matched card text/structure/geometry digests. The compiled candidate also passes the 25-check focus/history/active-minute control and both naming observations; typecheck and fresh build passed.

Each row below uses one within-process median, then three process-level values. Paired percentages are the median of the three candidate/baseline ratios, not a ratio of the displayed medians. Refresh and scroll have three observations per process; report-open overall medians use two distinct opens, retained separately below; selected append transitions have one observation each. Renderer task metrics cover the whole page and diagnostic work, not only React. Elapsed timing is separately measured. These small samples do not establish statistical significance or production-wide speed.

No numerical candidate-regression threshold was predeclared. The original plan used >50ms tasks and cardinality growth as diagnostic materiality examples and required the narrowest justified measured change. This report does not invent a retrospective pass threshold or remove adverse observations.

## Measured refresh and append benefit

| Loaded cards | Refresh elapsed ms B→C | Paired change [range] | Renderer task ms B→C | Paired change [range] | Script ms B→C |
| --- | --- | --- | --- | --- | --- |
| 30 | 51.40→47.00 | -8.56% [-14.10%, -5.24%] | 18.16→12.81 | -29.45% [-36.38%, -24.06%] | 10.32→7.14 |
| 300 | 120.30→95.10 | -25.81% [-26.27%, -5.75%] | 97.61→72.58 | -25.80% [-32.68%, -12.22%] | 31.37→6.23 |
| 1500 | 589.00→500.20 | -23.59% [-28.55%, -15.08%] | 503.12→403.12 | -27.78% [-33.18%, -19.60%] | 140.84→12.11 |

Every pair improves refresh elapsed, task and script measurements at each prefix. Transport is unchanged: refresh still requests 1/10/50 offset pages at 30/300/1,500 cards. At 1,500 cards the candidate still spends roughly 430–504ms elapsed and 343–404ms renderer task per measured refresh. It does not make refresh constant-time.

| Append to loaded cards | Elapsed ms B→C | Paired change [range] | Renderer task ms B→C | Paired change [range] |
| --- | --- | --- | --- | --- |
| 60 | 50.10→50.10 | +0.00% [-0.60%, +0.20%] | 30.46→21.53 | -29.31% [-48.68%, -16.42%] |
| 300 | 107.00→94.40 | -10.93% [-20.47%, -3.64%] | 116.07→87.59 | -25.06% [-29.95%, -11.63%] |
| 1500 | 827.90→717.20 | -15.32% [-15.69%, -8.30%] | 835.89→711.30 | -16.25% [-17.67%, -8.08%] |

## Report opens, scrolling and adverse rows

| Cards | Operation | Elapsed ms B→C | Paired change [range] | Renderer task ms B→C | Paired change [range] |
| --- | --- | --- | --- | --- | --- |
| 30 | First report open | 82.50→82.60 | +1.40% [-15.97%, +18.79%] | 77.09→77.64 | +9.67% [-26.68%, +20.53%] |
| 30 | Second report open | 95.00→72.50 | -23.68% [-33.30%, +0.42%] | 50.55→31.13 | -40.16% [-45.25%, -18.60%] |
| 30 | Both-open median | 88.75→78.50 | -9.09% [-19.32%, -3.94%] | 64.05→53.94 | -14.40% [-24.27%, -6.15%] |
| 300 | First report open | 115.60→115.40 | -11.33% [-20.47%, +22.31%] | 107.51→103.99 | -3.18% [-25.56%, +6.80%] |
| 300 | Second report open | 119.90→136.30 | +13.68% [-18.60%, +17.86%] | 146.94→142.06 | -3.63% [-23.29%, +17.77%] |
| 300 | Both-open median | 117.75→120.50 | +1.40% [-19.51%, +19.89%] | 126.32→122.79 | +0.53% [-24.23%, +8.86%] |
| 1500 | First report open | 413.40→350.50 | -16.40% [-24.28%, -5.79%] | 402.39→340.87 | -16.12% [-24.36%, -2.36%] |
| 1500 | Second report open | 399.40→368.00 | -7.86% [-17.25%, -1.86%] | 398.09→387.41 | -6.28% [-6.40%, -0.30%] |
| 1500 | Both-open median | 424.70→364.90 | -12.20% [-14.08%, -11.73%] | 408.15→368.38 | -11.20% [-13.09%, -4.41%] |

First-open work at 30 cards has an adverse paired median (+9.67% task, +1.40% elapsed); the first-open task difference in the two adverse pairs is about 7.46ms and 13.23ms. At 300 cards the both-open task/elapsed medians are mixed, and second-open elapsed is +13.68% paired median. These effects are observed, not dismissed as noise or explained by a proved root cause. At 1,500 cards both first and second report-open task/elapsed improve in every pair, while style work remains similar/mixed.

| Cards | Scroll task ms / 60 frames B→C | Paired change [range] | Scroll frame p95 ms B→C | Paired change [range] |
| --- | --- | --- | --- | --- |
| 30 | 37.25→31.44 | -4.72% [-45.61%, -0.77%] | 17.20→17.10 | -1.16% [-1.72%, +0.58%] |
| 300 | 184.98→164.78 | -10.92% [-14.84%, -2.60%] | 18.60→17.20 | -5.73% [-7.53%, -1.16%] |
| 1500 | 1306.05→1240.80 | -0.61% [-6.15%, +1.64%] | 23.30→17.40 | -27.04% [-30.40%, -1.55%] |

Full DOM remains 450/4,500/22,500 archive descendants at 30/300/1,500 cards, with the same scroll geometry. The 1,500-card scroll task result is essentially unchanged and pair 1 is +1.64%. Better frame-p95 observations do not establish reduced total scroll work or a general scroll improvement. The candidate still incurs about 1.24–1.30s renderer work over the 60-frame sweep.

The following is the complete set of summary metrics with any candidate-worse pair (including tiny differences); full raw observations and non-adverse rows remain in `memo-combined/summary.json` and its hash-linked raw inputs.

| Cards/phase | Metric | Paired change [range] |
| --- | --- | --- |
| 30 | reportOpenStyleMs | -6.92% [-42.43%, +0.32%] |
| 30 | scrollFrameP95Ms | -1.16% [-1.72%, +0.58%] |
| 30 | firstReportOpenElapsedMs | +1.40% [-15.97%, +18.79%] |
| 30 | firstReportOpenTaskMs | +9.67% [-26.68%, +20.53%] |
| 30 | firstReportOpenScriptMs | -2.86% [-22.91%, +10.37%] |
| 30 | firstReportOpenStyleMs | +4.15% [-55.73%, +31.39%] |
| 30 | secondReportOpenElapsedMs | -23.68% [-33.30%, +0.42%] |
| 30 | secondReportOpenScriptMs | -28.79% [-30.31%, +0.52%] |
| 300 | reportOpenElapsedMs | +1.40% [-19.51%, +19.89%] |
| 300 | reportOpenTaskMs | +0.53% [-24.23%, +8.86%] |
| 300 | reportOpenStyleMs | +4.32% [-12.12%, +15.59%] |
| 300 | firstReportOpenElapsedMs | -11.33% [-20.47%, +22.31%] |
| 300 | firstReportOpenTaskMs | -3.18% [-25.56%, +6.80%] |
| 300 | firstReportOpenStyleMs | +0.11% [-16.35%, +25.70%] |
| 300 | secondReportOpenElapsedMs | +13.68% [-18.60%, +17.86%] |
| 300 | secondReportOpenTaskMs | -3.63% [-23.29%, +17.77%] |
| 300 | secondReportOpenStyleMs | +6.13% [-7.09%, +9.06%] |
| 1500 | reportOpenStyleMs | +1.87% [-8.97%, +3.28%] |
| 1500 | scrollTaskMs | -0.61% [-6.15%, +1.64%] |
| 1500 | firstReportOpenStyleMs | +0.34% [-23.55%, +7.07%] |
| 1500 | secondReportOpenStyleMs | +3.37% [-0.18%, +9.87%] |
| Append 60 | elapsedMs | +0.00% [-0.60%, +0.20%] |
| unmounted | collectedJsHeapMiB | +0.02% [-7.42%, +0.46%] |
| remounted | collectedJsHeapMiB | +0.17% [-1.50%, +0.38%] |
| unmountedAgain | collectedJsHeapMiB | +0.32% [-0.16%, +0.57%] |
| unmountedAgain | domNodes | +0.00% [-0.34%, +0.34%] |

Refresh long tasks at 1,500 cards remain material. Across the three refresh samples per process, baseline counts are 4/6/7 (max309/319/395ms), candidate3/3/3 (max295/338/338ms); totals938/1078/1311→863/968/967ms. Pair2 therefore has a worse maximum,319→338ms, despite lower total task work. No long tasks occur in those refresh windows at30/300 in either arm.

Initial navigation is also retained separately in `memo-combined/initial-observations.json`: elapsed B→C is361.4→246.3,317.3→280.9,338.2→339.6ms for pairs1/2/3. Pair3 is adverse by1.4ms (+0.41%). The corresponding initial cumulative `TaskDuration` readings are284.392→199.178,226.826→211.616,245.783→265.616ms; pair3 increases19.833ms (+8.07%). These are cumulative page counters at the ready observation, not a dedicated navigation interval, and are not mixed with operation deltas.

Historical cleanup helpers independently attempt browser/application/temp teardown and report successful close calls, but the browser helper does not strictly prove process exit on every fallback path. The six workers exited successfully and no lingering F6 process was observed at release. That supports the completed run boundary but is not an unrecorded per-child exit assertion. The final merged correctness wrapper has a stricter actual-exit helper; these raw timing runs remain unchanged.

## Retention and contracts

The separate same-page retention control proved the earlier retained-DOM result was confounded by the diagnostic opener reference. Both paired arms delete that diagnostic reference before explicit GC. Mounted 1,500-card heap medians are19.193→13.982MiB with exactly31,850 DOMnodes in each arm. After unmount, remount30 and unmount again, both arms return to about5.9–6.1MiB and matching small DOMcounts. Small adverse heap differences after unmount are preserved in the table; this supports bounded ownership for this fixture, not a universal leak/RSS claim.

The fixture preserves all original session data/labels except explicitly declared label edits, exact started/id ordering, full-prefix refresh/publication supersession, one active request, report identity and all270 event pages through archive invalidation. Full loaded card DOM/text and trusted native Enter remain. Active time updates0→1→0 under controlled clock/publication changes. Report/naming Escape and Close restore owned connected openers; pilot changes/navigation/unmount cannot restore obsolete owners. Successful naming submission remains outside the new cancellation-focus guarantee when Start is busy/disabled.

Native browser Find is explicitly unverified because installed headless `window.find` also fails on the minimal visible-text control. There is no claim that this probe passed. The patch preserves the existing full DOM; introducing windowing would require a separate design and acceptance decision for visible-history/Find/keyboard behavior. Full-DOM cost and offset full-prefix transport remain explicit limitations, not silently closed as constant-scale performance.

## Decision boundary and recovery

The supported decision is to take the low-complexity memo improvement for repeated publication/refresh/append work and keep the complete history contract. Mixed smaller-prefix report-open costs and remaining full-DOM costs prevent broader claims. Independent review accepted that bounded tradeoff; current main-source build/correctness gates are still required after integration. No additional timing run or windowing variant is proposed by this lane.

All failed earlier attempts remain retained. `memo-combined/completed.json` links the two original completion receipts and all six raw runs by SHA-256. The candidate authoring manifests retain their original proposed status as historical inputs; this decision document supersedes that status without modifying input bytes. No continuation source, remote branch or PR was changed by this lane.
