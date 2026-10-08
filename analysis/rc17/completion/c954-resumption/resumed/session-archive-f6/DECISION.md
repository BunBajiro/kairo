# F6 Session archive: adopt focused changes, retain complete loaded history

Independent receipt: `MEMO-INDEPENDENT-FRONTEND-REVIEW.md` and `MEMO-INDEPENDENT-NUMERIC-REVIEW.json` independently verify all 68 scalar summary metrics, raw hashes, pairing and semantics.

Root accepted the scoped report/naming cancellation focus patch (`32c908a8`) and archive card memo patch (`719fc58d`) after the isolated compiled gates and independent review of all six measured workers. Retain the current 30-row incremental archive paging and complete loaded card DOM. Decline a new windowing or query contract in this pass.

This closes the conditional optimization decision with a measured tradeoff. It does not close the final combined-source W gate, verify native browser Find in this runtime, or establish smooth behavior at arbitrary history sizes. Parent owns source integration and the final combined-source correctness validation.

The original finding has a concrete cause: every archive publication and dialog state update recreated all loaded card subtrees. A memo boundary with complete primitive display props and a stable pilot-scoped opener avoids that repeated work. It keeps the same native buttons, text, order, keys, scroll geometry, loaded history, keyboard path and report identity. Active minutes still recompute on each parent render; label, active-state and minute changes remain observable. The separate focus fix restores only the still-owned, connected and enabled opener after report or naming Escape/Close, with pilot/navigation/unmount guards.

Across three fresh matched pairs (AB, BA, AB), all six workers passed 81 hard checks and full card presentation/DOM parity. Refresh renderer task paired medians improved 29.5%, 25.8% and 27.8% at 30, 300 and 1,500 loaded cards; every pair improved at every prefix. The 1,500-card append task improved 16.2% by the paired median. The isolated candidate also passed typecheck, fresh build and the 25-control compiled focus/history/clock gate; the common focus source passed all 25 affected semantic tests. Evidence and raw hashes are in `MEMO-RESULTS.md`, `memo-combined/completed.json`, `memo-combined/summary.json` and `FOCUS-GATE.md`.

The smaller change is justified without changing what loaded history means. Windowing would change DOM availability, native Find behavior, keyboard reachability and scroll/focus ownership, requiring a distinct design and validation decision. The measured repeat-render improvement supports the memo boundary; it does not independently justify those new semantics. Keeping loaded rows also preserves current full-prefix freshness and expanded report history without adding another cache, truncation rule or paging protocol.

Residual costs and adverse observations remain part of this decision:

- At 1,500 cards, candidate refresh still costs roughly 430–504 ms elapsed and 343–404 ms renderer task, with three long tasks across the three refresh samples per process and maximums of 295–338 ms. Pair 2's maximum rose from 319 to 338 ms.
- The same 22,500 archive descendants remain. The 60-frame scroll sweep still consumes about 1.24–1.30 seconds of renderer task work; its paired median is essentially unchanged and one pair is 1.64% worse. No general scroll improvement is claimed.
- First report-open task at 30 cards has a +9.67% paired median; 300-card report observations are mixed, including +13.68% second-open elapsed. Initial navigation has one +1.4 ms adverse pair; its cumulative task counter also rises in that pair. Full individual and paired ranges are retained. No numerical regression threshold was invented after measurement.
- Native Find remains unverified because the installed headless `window.find` also fails a minimal visible-text control. The complete DOM is preserved. Historical cleanup receipts verify successful close calls; strict actual process-exit handling belongs to the final merged wrapper.
- Collected heap after unmount returns to a small baseline in both arms after deleting the diagnostic opener reference. This is a bounded ownership observation, not a general leak or RSS guarantee. Successful naming submission while Start remains busy/disabled is outside the new cancellation-focus guarantee.

No further timing variant or broad virtualization is proposed. Clean RC17 and PR review remain governed by the parent’s complete finding inventory and final integration gates.
