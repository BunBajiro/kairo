# F3 / F6 / F7: operation models and tables

7 October 2026. Implementation checkpoint based on `a27d36c602435ce220452b5d45b0109d30efa533`, with the ongoing completion source edits. This is not a clean RC17 acceptance record. Source hashes for this lane are recorded in [model-counts.json](model-counts.json); the coordinator must pin the full final source/build before integrated measurements.

## Changes and ownership

| Finding | Relevant source and change | Evidence here | Still required for closure |
| --- | --- | --- | --- |
| F3 active/inactive derived rows | `components/kairo/operations.tsx` now constructs `OperationTable` elements inside Radix tab bodies. The expensive transform executes inside that mounted child, not while every tab's JSX is prepared. Skills, implants, notifications, journal, transactions, orders, loyalty, standings, fittings, jobs, planets, mining, blueprints and assets use that boundary. `createOperationRowsModel` in `derived-models.mjs` owns one previous immutable source/result per mounted table. | Exact legacy row mappings; relevant source/name replacement; unrelated resource/name retention; zero derivation for an unused owner. Installed Radix `TabsContent` renders `present && children`; no forceMount is added. | Actual compiled UI diagnostic counts, active tab/pilot transitions, populated matched timing. Parent context is still broad; this change avoids expensive row rebuilding but does not claim every consumer stops rerendering. |
| F3 name ownership | Name-dependent models record only IDs referenced by their transformed fields. An actual names-map replacement compares those values before rebuilding; unrelated names do not invalidate the rows. Journal/notification models do not depend on names. | 100 unchanged-input calls and an unrelated name replacement preserve the same row reference; a used name replacement rebuilds once. All original fallback names preserved. | Compiled UI relevant-name publication and inactive-tab tests. The rare changed names map still checks its referenced IDs; this is not a zero-work name update. |
| F3 asset header/chart | Asset price map depends only on price data; header total depends only on asset data and prices. The header remains visible and correct on Fittings/Contracts without constructing asset display rows. Overview job counts and bounded 80-point wallet chart depend on their actual input arrays. | Asset zero/unpriced/duplicate-price/location semantics and graph ordering/date semantics match original implementation. | Matched populated assets/journal workload. Overview's time-sensitive current queue and 24-hour earnings scan are intentionally not frozen behind data-only caches; no claim that all Overview work is eliminated. |
| F6 table processing | `ui.tsx` gives each mounted table one `createTableModel` owner. Empty search does not normalize row text. First nonempty search normalizes once for that row-array identity; query/order changes reuse text. Unchanged inputs and pagination reuse filtered/sorted results. Filter then sort order is retained, including mixed number/string semantics. | All search/null/numeric/string/nested/boolean/tie fixtures equal the old algorithm's result and order. 1k/10k-row diagnostic counts below. | Compiled UI search/order/page/details acceptance and matched populated timing. No server-side query or virtualization decision is implied. Archive merge/presentation belongs to the separate refresh lane. |
| F6 stable identity and page clamp | Known dataset IDs (including zero) and mining composite IDs are preferred; unknown rows retain their source index through filtering/sorting, rather than their current page index. Shrinking collections persist the clamped page so later growth cannot revive an obsolete high page. | Stable row identity across filter/order, zero ID, and 91→31→0 page computations tested. | Browser check of actual React page-clamp effect and expanded details. Unknown records lacking any canonical ID cannot acquire an identity stable across arbitrary source reorder; no such claim is made. |
| F7 fixed formatters | `model.ts` reexports lazy fixed `isk`/`stamp` formatters from `formatters.mjs`. Two NumberFormat instances and one UTC DateTimeFormat instance are created only on first valid use. Invalid date output remains `Invalid Date EVE`, rather than introducing Intl's RangeError. | Exact compact/decimal/negative/-0/NaN/infinity/non-number outputs; UTC and DST-boundary/empty/invalid stamp outputs; 10k-row fixture constructs 2 number + 1 date formatters, none at import or on invalid-only inputs. | Matched cold/import/warm cost. This is a bounded setup-work simplification, not a headline speed claim. Separate worker provided below. |

The Overview request effects were also connected to the refresh lane's `useResourceRefresh` hook and separate `activityRevision` / `goalsRevision`. That transport/revision contract is owned and verified by the refresh lane, not inferred from model-count tests.

Table filters and ordering retain their mounted component state across ordinary resource updates. Radix still unmounts inactive tab contents, so returning to a tab uses its initial filter/order as before. This patch does not add a cross-tab filter store or new persistence behavior.

## Deterministic evidence

[11 targeted tests](targeted-tests.log) pass in `tests/kairo/frontend-derived-models.test.mjs` and `tests/kairo/frontend-formatters.test.mjs`. [Type checking](types.log) also passed at this lane's checkpoint; final integrated source verification remains the coordinator's gate.

[model-counts.mjs](model-counts.mjs) replays 101 identical populated jobs/search/sort inputs using both the old whole-render transform and the new actual helper. Ordered row results are checked each time; these counts contain no elapsed-time assertion.

| Rows | Old → new transformed rows | Old → new normalized search rows | Old → new sort comparisons |
| --- | --- | --- | --- |
| 1,000 | 101,000 → 1,000 | 101,000 → 1,000 | 691,143 → 6,843 |
| 10,000 | 1,010,000 → 10,000 | 1,010,000 → 10,000 | 7,823,965 → 77,465 |

An unrelated name addition causes zero additional model derivations; a referenced name change causes one. The helper owner is mounted-local and holds at most one source/result plus its referenced name IDs; it is not an unbounded global snapshot cache. A table retains one source's entry wrappers and, once searched, normalized strings; retained-memory impact should be included in the populated UI lane.

## Executable final-source checks prepared

- [browser-acceptance.mjs](browser-acceptance.mjs) launches the actual compiled app with synthetic populated pilots, dataset bodies and blocked external traffic. Diagnostic mode instruments row-shaped Array.map calls, search normalization and Intl construction outside timing; it checks actual tabs, unrelated and relevant data/name changes, filter survival, page clamp after shrink/regrowth, expanded details, selected-pilot rows, stale data and disabled empty state. `--timing` uses fresh uninstrumented renderer metrics for the same actions. `--baseline` observes the old behavior without asserting new count/clamp guarantees.
- [formatter-cost.mjs](formatter-cost.mjs) imports the actual UI `model.ts` exports using Node 24 type stripping. It retains import and first-use costs separately and measures five 30k-call warm windows. This isolates formatter work under Node; it does not establish Chromium frame/CPU improvement.

Both require the coordinator's `KAIRO_MODELS_LOCKED=1` and a source manifest captured after a fresh build, and verify the source/build fingerprint again at completion. Both passed syntax checks only. Neither has been run against a fresh compiled candidate in this lane. Use baseline/candidate ABBA under the shared runtime lock, separate diagnostic count runs from timing, and retain adverse results.

Example commands (run from the analysis repository after coordinator scheduling):

```sh
KAIRO_MODELS_LOCKED=1 KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc17/completion/frontend-models/browser-acceptance.mjs /path/to/app /path/to/counts.json /path/to/manifest.json
KAIRO_MODELS_LOCKED=1 KAIRO_CHROME_PATH=/path/to/chrome node analysis/rc17/completion/frontend-models/browser-acceptance.mjs /path/to/app /path/to/timing.json /path/to/manifest.json --timing
KAIRO_MODELS_LOCKED=1 node analysis/rc17/completion/frontend-models/formatter-cost.mjs /path/to/app /path/to/formatter.json /path/to/manifest.json
```

Remaining limits: broad React context subscriptions and eager page delivery need their own measured disposition; no archive DOM/windowing decision, real-user latency claim, or clean-release readiness follows from these deterministic counts.
