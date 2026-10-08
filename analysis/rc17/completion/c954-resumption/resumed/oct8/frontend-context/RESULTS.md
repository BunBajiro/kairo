# F3 residual attribution and accepted Assets view boundary

8 October 2026. **The coordinator accepted the one-file Assets view boundary for integration.** The change avoids rerendering the populated Assets subtree for unrelated resource Context updates. It does not replace the global Context API or change the names protocol. Full F3 and final combined RC17 gates remain open; F6 archive/table and M6 Maps scene work remain separate.

## Evidence boundary

The diagnostic profile is exact `985a6c17d466d01f1f098a1704de68f6eae5f6e6`, with source and copied build verified against the successful original build receipt. Compiled bodies/offsets in `ATTRIBUTION.json` identify names owner **117.540 ms**, snapshot event owner **45.352 ms**, and remaining framework/UI **109.755 ms** sampled during twenty full-name wallet events. Idle **1491.345 ms**, program **91.514 ms**, and GC **9.661 ms** remain separate. Framework/UI is an upper bound for Context work, not an exact sum of unnecessary subscribers; React descendants execute on separately scheduled stacks. Instrumented timing values are not ordinary evidence.

The browser fixture uses two sparse ID ranges (4200000–4209999, 4300000–4309999), twenty thousand names and **550,001 JSON bytes** per full map. The older dense-ID kernel did not represent that property layout. Backend names-wire work has been given the exact fixture; it is not solved by this view change.

Paired trial base is exact `22773cc7cb6e83ac51e412565ba65c101613536a`, including the Atlas adoption. Relevant operations/Context/dashboard/resource-state source is byte-identical between 985 and 227, but the new timings are explicitly bound to 227. Only `components/kairo/operations.tsx` differs in the trial.

## Implementation and validation

AssetsPage selects complete assets/prices/fittings/contracts snapshots plus the whole names map for a memoized AssetsView. Pure OperationRowsTable descendants receive explicit inputs instead of subscribing to broad Context; other pages retain their existing wrapper. Complete snapshot objects preserve metadata updates, and the full names map preserves deep fitted-module label changes. NoData remains a live Context consumer for character and navigation. This creates no global cache or retained history.

- **24/24** focused resource/model/scope tests pass.
- Both exact sources pass type checks and fresh production builds, **20 client assets each**.
- Expanded compiled diagnostics pass **31/31 on each variant**: sorting/filter/page state, deep fitting-name/data freshness with open details, inactive/active contracts, shared prices, metadata-only status/error/truncation, held state/SSE races, delayed old-pilot responses, authoritative name removal, stale/disabled/scope states, and live connection actions including zero characters.
- The whole ordinary browser ABBA completes **four fresh workers**, each **11/11** checks, zero exceptions/external traffic, and unchanged source/build/harness end guards. Counter/held-fetch diagnostics are separate from ordinary timings.
- Independent read-only review found no concrete blocker; see `INDEPENDENT-REVIEW.md`.

The first compiled baseline attempt reached the new zero-character control but failed because a harness selector had incorrectly nested quotes. Its exact failed harness, JSON/log and complete:false receipt remain in `assets-browser-attempt1`. App source and successful fresh builds did not change. The corrected diagnostic and full ordinary ABBA ran in `assets-browser-attempt2` against those verified manifests; no failed timing was discarded and no rebuild was claimed.

Baseline source/build fingerprint: `f6534da06526042f9c78804716600d75e48fd2ff6366db591b5987109f9cdc78`. Trial: `bb7b7b9aecbcee2fe15886e438c78a2e97733a7a8e8a3f35819439fb27a5d9d9`.

## Ordinary paired results

Medians summarize the two fresh workers per variant. Every nearest AB/BA pair, ordinary heap sample, and adverse row is in `ASSETS-SUMMARY.json` and the original worker JSONs.

| Phase | Baseline task ms | Trial task ms | Task change | Baseline script ms | Trial script ms |
|---|---:|---:|---:|---:|---:|
| assets-first-open | 74.946 | 70.134 | -6.4% | 37.620 | 34.578 |
| assets-sort-directions | 45.383 | 40.644 | -10.4% | 11.019 | 10.598 |
| assets-full-names-20-wallet-events | 297.193 | 265.725 | -10.6% | 243.703 | 208.320 |
| assets-unrelated-wallet-snapshot | 15.197 | 15.551 | +2.3% | 12.271 | 12.398 |
| assets-search-and-page | 75.872 | 68.856 | -9.2% | 31.240 | 29.155 |
| assets-relevant-name | 32.545 | 37.372 | +14.8% | 28.840 | 27.800 |
| assets-unrelated-name | 41.692 | 29.343 | -29.6% | 25.933 | 22.340 |
| inactive-assets-source-change | 22.864 | 20.557 | -10.1% | 14.342 | 12.798 |
| wallet-journal-open | 44.423 | 39.969 | -10.0% | 17.840 | 16.611 |
| wallet-unrelated-snapshot | 22.343 | 21.713 | -2.8% | 12.310 | 13.213 |
| wallet-transaction-first-use | 32.561 | 30.538 | -6.2% | 8.893 | 8.606 |
| wallet-journal-return | 33.878 | 33.181 | -2.1% | 9.196 | 9.493 |
| industry-first-use | 45.461 | 45.377 | -0.2% | 13.211 | 13.332 |

The twenty-event task pairs improve by 55.668 ms (17.58%), 7.269 ms (2.62%). The aggregate script window falls 243.703→208.320 ms. This is a bounded reduction in the measured Context consequence, not a whole-app CPU percentage.

Adverse observations are retained: relevant-name task pairs are -4.407 ms (-13.23%), +14.063 ms (+44.27%); first-open pairs are -15.163 ms (-17.91%), +5.538 ms (+8.49%). The unchanged single-Assets event is +0.354 ms in aggregate. Wallet event/return and Industry rows include small script-cost increases. No task row repeats a >10% and >1 ms regression in both nearest pairs.

## Disposition and remaining work

Adopt the one-file boundary with those observed tradeoffs recorded, then verify integration against the current continuation. The measured change reduces the expensive populated consumer's response to unrelated updates without introducing a general subscription system. The remaining broad Context design is not automatically rejected or approved by this single-page trial; Maps M6 and other consumer paths retain their own evidence requirements.

Names still scan/decode the repeated full map in this source; revisioned full-map-on-change publication is a separate backend/frontend protocol proposal with reconnect, epoch, late-state and pilot-audience contracts. This boundary makes no assumptions about that future change. Preserve final combined first-use/changed-input rows, local/CI gates and extracted package verification. No clean RC17 handoff is supported yet.

These synthetic 10,000-row/two-pilot measurements use local data with external traffic blocked. CDP renderer metrics exclude browser/GPU/worker CPU; controlled action windows include waits. Ordinary heaps are GC-sensitive snapshots, not retained-memory/leak evidence. No significance claim is made from one ABBA cycle.
