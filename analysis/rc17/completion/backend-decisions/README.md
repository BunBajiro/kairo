# Conditional Goals and enrichment decisions

7 October 2026. Source-count diagnostics passed; no timed runs or production changes were made for these two conditional findings. They remain open pending matched measurements and an explicit accept-or-reject decision. Each JSON pins actual source file hashes, harness hash and Node version; final source commit must be supplied by the coordinator when running frozen lanes.

## Retained Goals credit total

`goals-ledger-trial.mjs` exercises actual `createGoals.refresh` with one active income goal, 100/10,000/100,000 retained credits, and 50 recent records in the visible source window. The highest cardinality is a stress fixture, not a normal-player-size assertion. Current code SUMs the retained per-goal ledger after each `accumulate`, even when no observed/credited value changed.

`goals-ledger-counts.json` confirms the same behavior at all three cardinalities: three unchanged refreshes produce three SUM queries, 150 keyed entry lookups and **zero ledger or other database writes**. One changed window checks 60 entries, writes 11 changed/new credits, and increases progress by exactly 52. The older credits remain; all final rows have a deterministic hash. No completion events are produced because the target stays above progress. These controls disallow a trial that speeds work by dropping old credits or merely skipping new sample reconciliation.

The ordinary lane removes the diagnostic statement wrappers, times 100 unchanged refreshes plus one changed refresh, and records CPU. Run `KAIRO_DECISION_TIMED=1` under the shared timing lock with exact source and fixed host, in ABBA order for a production candidate. Measure the 100-row case as well: extra durable aggregate/invalidation complexity is not justified by only a contrived large case. If a maintained total is justified, update the total and credit deltas in the existing accounting savepoint; cover baseline mining, decreased observations, completion clipping, imported/legacy ledgers, outer rollback, nested creation and unavailable/stale samples. Existing `goals-preparation.test.mjs` rollback/reentrant/freshness controls must pass. The present harness is an income-source workload; it does not replace those source-specific correctness tests.

## Serial station/structure and planetary detail enrichment

`enrichment-trial.mjs` constructs actual Core with actual `createESI`, enables only the relevant module/scopes, and calls actual `core.sync` / `core.requestSync`. No duplicated approximation of the PI loop or a bypassed limiter is used. Synthetic provider responses resolve public-name batches to an empty result so the representative unresolved-station fallback is actually reached. Cold and warm snapshots must match exact expected ordered data. Shapes are pinned with hashes.

`enrichment-counts.json` contains 0/1/10/50 distinct locations for stations, structures and PI:

| Kind | Cold calls for 0 / 1 / 10 / 50 rows | Warm calls | Maximum concurrent requests |
| --- | --- | --- | --- |
| Stations | 1 / 3 / 12 / 52 | 0 | 1 |
| Structures | 1 / 2 / 11 / 51 | 0 | 1 |
| PI | 1 / 2 / 11 / 51 | 0 | 1 |

The extra station call is the public names batch; every lane includes its base dataset request. All lanes run through the real four-slot ESI limiter and cache. The 50-planet lane is a deliberate stress case beyond ordinary single-pilot holdings; include 1 and 10 cases in the decision and avoid presenting 50 planets as representative play. No real provider latency is inferred from immediate-response counts.

Ordinary mode (`KAIRO_DECISION_TIMED=1`) applies a controlled response delay (`KAIRO_ENRICHMENT_DELAY_MS`, default 50 ms), records cold and forced-warm elapsed time, CPU, provider paths and maximum simultaneous requests. Repeat with 0/50/200 ms delays, especially 0/1 and warm cases to expose added scheduling overhead. The current source is serial; no speculative candidate was placed in production. If measured cold costs justify a bounded pool, maintain original output order and unresolved items, private structure scoping, partial denial, fresh auth checks, cache hits, coalescing, global ESI capacity and Core close draining. Extend fixtures with 403/429/cancellation and actual concurrent competing priority traffic before accepting such a change. A parallel helper benchmark that bypasses Core/ESI is not a closure substitute.

## Reproduction

From the analysis repository, set `KAIRO_BENCH_REPO` to the immutable app checkout and `KAIRO_BENCH_SOURCE_COMMIT` to its exact revision. Defaults are untimed diagnostics. `KAIRO_DECISION_OUTPUT` selects the JSON output; `KAIRO_ENRICHMENT_KIND` and `KAIRO_ENRICHMENT_COUNTS` can limit an ordinary lane without changing its fixture. The coordinator must hold `/tmp/kairo-rc16-benchmark.lock` for every timed invocation; do not run these during browser/startup/build tests. No clean RC17 package is supported by these untimed results.
