# F7 UI formatter decision — retain lazy reuse

**Retain the existing three lazy fixed formatters.** The completed comparison preserves every checked output and removes substantial repeated setup cost in the representative warm fixture. Cold first use is not eliminated and does not show an improvement. This closes the bounded F7 adopt/reject measurement decision; it does not close populated-browser or final combined RC17 acceptance.

The run completed on 7 October 2026 using Node **24.19.0**, under the exclusive `/tmp/kairo-performance.lock`. [Immutable completion](run1/completed.json), [comparison and all samples](run1/comparison.json), and [exact output checks](run1/semantics.json) are retained. No child failed. Application source was not changed.

## Exact source and comparison

| Input | Identity |
|---|---|
| Original per-cell formatter baseline | Existing c954-based eight-file UI ablation; source/build fingerprint `615799709626ba337ca36b82c9b084875912a9598167e7b6cace4018c6bfe150`, explicitly dirty variant. `model.ts` contains the original `new Intl.NumberFormat` per number call and `Date.toLocaleString` per stamp call. |
| Current implementation | Clean `f01072674c044f39badc5e5e56c0c3d676621c07`; source/build fingerprint `47d9d44d087be3e85c08372503b4af0cd2fad88cc8ef53fec86fa5da90beb73e`. |
| Relevant source boundary | Current `model.ts`, `formatters.mjs` and `workspace-navigation.mjs` are byte-identical to c954. The imported baseline/current model differs only in formatter definitions versus the lazy reexport; navigation is identical. The other ablated frontend files are not imported by this worker. No 508 source or result is used. |
| Timing harness | Existing `frontend-models/formatter-cost.mjs`, unchanged SHA-256 `5c7002b2e02967f3173b49cc2f19b028617189ce7d95ad14c37072fd18a1a993`. Full source/build, runner, semantic worker and source-helper hashes are verified before and after. |

Three baseline–candidate–candidate–baseline cycles produce **six fresh processes per variant**. Every process measures importing the actual UI `model.ts`, its first valid decimal/compact/UTC-date triplet, and five warm windows of 10,000 rows × three calls. Round zero remains included. Cold values include Intl's first-use setup. The semantic worker runs separately before timing; it cannot warm the subsequent fresh processes.

## Results

Values are descriptive medians and full six-process ranges, in milliseconds. Warm values are each process's median of its five retained windows, then summarized across six processes; those thirty windows are not treated as thirty independent processes.

| Metric | Original per-cell | Lazy reused |
|---|---:|---:|
| Model import | 33.053 (29.510–35.538) | 30.941 (29.650–36.022) |
| First valid decimal + compact + UTC stamp | 14.810 (14.056–15.646) | **14.926 (14.246–15.702)** |
| Import plus first valid triplet | 48.082 (44.414–50.254) | 46.116 (43.896–**51.227**) |
| Warm 30,000 calls, per-process median | 1,106.145 (1,076.348–1,160.712) | 24.237 (23.435–26.416) |

The warm median is about **97.8% lower in this Node fixture**. All individual warm windows remain in the raw files: baseline 1,063.266–1,232.221 ms, candidate 22.671–28.195 ms. This supports removing repeated formatter construction, rather than a marginal timing-only inference.

The cold triplet median is slightly **higher**, by 0.117 ms. Cumulative import plus first-use ranges overlap, and the candidate maximum is **51.227 versus 50.254 ms**. These observations do not support an app-startup acceleration claim. Lazy construction avoids an eager import-time formatter, but the first valid use still pays approximately 15 ms in the measured call order.

## Output and ownership checks

The separate untimed lane compares both actual implementations for all **30,000 representative outputs**, not merely aggregate character counts. Their ordered digest is `621dd7ee7d3800e1f311c3e62bca0527327e770331e618f10674f49f34ff5388`; total output characters are 302,325, matching every warm window. Another **38 edge cases** check non-number input, signed zero, decimal/compact negatives, NaN/infinities, empty/invalid dates and UTC/DST boundaries against each other and the original Intl expression.

The existing source-bound formatter tests additionally verify no constructor at import or invalid-only calls, then exactly two number formatters and one date formatter over the 10,000-row fixture. Those checks are part of the already recorded combined 951-test pass; they were not counted again as fresh timing evidence here. Retention remains three fixed formatter instances, not a per-value or unbounded cache. Invalid dates retain `Invalid Date EVE` rather than throwing.

## Scope and remaining gate

This runs the **actual UI formatter exports under Node**, including native TypeScript module import overhead. It is not a Chromium rendering benchmark, total browser/OBS CPU measurement, user-machine latency guarantee or measurement of process RSS/native Intl memory. The bounded fixture deliberately stresses repeated cells; it does not represent every page's call count.

The measured decision is to keep the source already present at c954 and unchanged in f010. No further formatter change is justified. Populated model/table/browser comparisons, unrelated frontend decisions and the final exact-source local/independent-CI matrix remain their owners' separate gates. PR #10 remains withdrawn.
