# F6 loaded archive: baseline diagnostic and open decisions

Attempt4 completed three fresh compiled browser/application processes on exact frozen 227 (`22773cc7cb6e83ac51e412565ba65c101613536a`), source/build fingerprint `2c72fd451304d300e05a57d9b4eecc8bd906233c65c9478ad353e4578a474872`. Each process passed 75 hard checks, including loaded-prefix identity/order, full-prefix page offsets, 270-event report pagination, publication/expanded-history retention, stale-publication fencing and durable data preservation. Source end guards and cleanup passed. Each process separately recorded six failed Escape focus-return observations; native Find remains unverified. This is completed diagnosis, not release or contract acceptance.

The distributions below contain one median per process (n=3), not pooled repetitions. Elapsed refresh includes serial real HTTP; task work covers the renderer, including diagnostics.

| Loaded cards | Archive descendants | Refresh HTTP pages | Refresh elapsed ms | Refresh task ms | Report-open task ms | Scroll frame p95 ms |
|---:|---:|---:|---:|---:|---:|---:|
| 30 | 450 | 1 | 57.8 | 21.6 | 64.9 | 17.2 |
| 300 | 4500 | 10 | 113.3 | 91.5 | 95.6 | 18.1 |
| 1500 | 22500 | 50 | 646.6 | 554.3 | 336.7 | 24.6 |

At 1,500 cards, each process records 4–5 long tasks during the three refresh samples, with process maxima 335–412 ms. The final append from 1,470 to 1,500 costs median 869 ms elapsed (range 792–951), and 910.6 ms renderer task time. A 60-frame scroll pass costs 1,384.5 ms task time at 1,500 versus 29.1 ms at 30. Its script/layout/style totals remain small (approximately 3.2/0.5/0 ms), so memoizing React work cannot be presumed to fix the entire scrolling cost. Report-open style recalculation reaches 104.9 ms at 1,500 (versus 10.6 at 30); unchanged full DOM still has browser costs.

Source attribution: SessionsPage renders every loaded native card and its SVG/text descendants, and its archive owner intentionally refreshes every loaded 30-row page. Loading/busy state, report selection and publication rerender the parent. The data-preserving transport cost and retained DOM cardinality are separate from avoidable unchanged-card rendering. The measurement supports trying a narrow card memo boundary before considering any windowing.

Proposed memo: `memo-candidate/archive-card-memo.patch`, relative to the same focused opener fix in both future arms. It passes complete primitive display values, keeps the actual native-button DOM, and makes only the report-opening callback stable within one pilot. Elapsed minutes still recompute from Date.now on every parent render, including active cards. No archive transport, ordering, data ownership or timer cadence changes. Not applied or measured yet.

The Escape defect is recorded in FOCUS-FINDING.md and all failed runs are retained. `focus-candidate/focus-restoration.patch` is a proposed two-file scoped fix; `focus-browser.mjs` now independently attempts each cleanup, requires a fresh trusted click for each opening, and checks all original labels exactly. It also records the adjacent naming-dialog Escape/Close controls without inventing acceptance. The candidate patch and full closure fixture have not been run; the naming-only baseline mode has since reproduced the adjacent defect (below).

Retained-heap limitation: the attempt4 diagnostic holds `window.__reportOpener`, an element reference to the last archive button. DOM parent links can retain the detached archive after unmount. Collected JS heap drops 19.16→10.32 MiB, but the approximately 32k DOM-node counts are therefore confounded and cannot establish application retention or a leak. The raw observations are preserved. `retention-control.mjs` is prepared to retain, then clear that exact diagnostic reference in the same unmounted page, followed by a 30-card remount/unmount. It will not repeat ordinary timing claims.

Next gates: focused source-bound opener correctness/type/build; brief retained-reference control; then a matched small memo comparison with the focus patch common to both arms. Adoption must retain adverse full-DOM/browser costs and every history/keyboard/ownership contract. Clean RC17 and PR #10 remain out of user review.

## Short controls: completed

Controls1 is retained as a harness failure: the global dialog-title selector chose the hidden Jump to a module title while Name this session was actually open. Its raw DOM/active input and successful cleanup prove the collision. Controls2 scopes queries to the named modal, with no app change or timeout extension.

Controls2 naming baseline completed on exact frozen 227. Both trusted Enter openings succeed; Escape and Close each leave BODY focused while their original Start session opener remains connected. This is now an observed adjacent defect, not just an inference. The scoped proposal now tracks naming/report openers independently and applies the same mounted/pilot/identity/connected/enabled guards. Combined patch SHA256 `32c908a8687c0fbd57ac179d1d32f75d59d5b61ca48064ed2af0baa8d112560c` is awaiting quick review and the candidate build/compiled gate.

The separate retained-reference control completed with six hard guards, exact source verification and independent cleanup. It loaded all 1,500 original labels, opened/closed the last report, then compared the same unmounted page with and without the diagnostic element reference:

| Phase | Collected JS heap MiB | DOM nodes | DOM listeners | Visible archive cards |
|---|---:|---:|---:|---:|
| Mounted 1,500 |18.143|31850|2114|1500|
| Unmounted, diagnostic opener held |9.244|32115|2118|0|
| Same unmounted page, opener deleted |5.347|582|617|0|
| Remounted 30 |5.489|984|645|30|
| Unmounted again, no opener ref |5.416|589|617|0|

Deleting only the diagnostic reference releases 31,533 DOM nodes and about 3.90 MiB of collected JS heap. The subsequent 30-card cycle returns to 589 nodes versus 582 before it. This directly attributes the previous large detached DOM count to the harness reference. It does not claim universal leak freedom or process RSS recovery. Durable session/visit/event rows and every original label remain unchanged. Ordinary attempt4 timings are not repeated or rewritten.
