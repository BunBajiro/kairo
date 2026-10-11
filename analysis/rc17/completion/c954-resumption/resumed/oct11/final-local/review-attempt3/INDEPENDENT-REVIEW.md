# Final-source adapter attempt 3: independent review

11 October 2026. **PASS for the complete local adapter envelope and retained evidence.** This does not grant blanket performance acceptance or complete the remaining backend, mixed, UI, updater, three-version comparison and package gates. No application code was imported or executed during this audit.

The audited original is `/tmp/kairo-final-source-output-location-20261011/attempt3`. The earlier failed attempts remain failed and retained. This attempt deliberately changed both the output/temporary-file location and concurrent subagent tool activity; it does not isolate a filesystem cause.

## Exact binding

| Artifact | SHA256 |
|---|---|
| `receipt.json` | `c116a7d9aca1e9cf5ffd57f6b5b184f53446ee7a69ff7a5ecd537ad1cabbe34a` |
| `artifacts.json` | `b87f8253392f0aef5f78dc17707a0260816ca07ab9e97e049c1c2eda952c9184` |
| `lock-release.json` | `a2d722f3582c36a7890f5fc63c21fbf52f44d2938e8cd5478089d2edaa91d10d` |

`EXECUTION-AUDIT.json` additionally binds the original wrapper receipt, console, exact runner and configuration. Exit code is zero, the console reports 30 rows and no failures, both locks were acquired and released, and every final receipt is complete. The reviewed runner SHA is `a0ea1e26f4cf62cff6761be61d2bbfc275a1c376c31ae24f02a115a09c6ac531`.

The existing independent audit was adapted transparently from attempt 2. `ADAPTATION.patch` and `ADAPTATION.json` record the input path, attempt-specific success expectations and wording changes. The arithmetic, complete decoded contract checks, raw-file checking and source checking remain the same.

## Evidence and correctness

- Rehashed all **75 inventoried files**, verified the complete **77-file attempt set**, and checked both release-receipt links.
- Verified every original closed-child log fingerprint, all retained result and contract payload pins, and both strict final row/inventory checks. No temporary path exists at review time; no raw log required reconstruction or embedded-only substitution.
- Verified all **30 actual child exits**: 24 startup children, two full-contract children and four original database children. No signal, timeout, forced cleanup, surviving group, blocked cleanup or log error is recorded.
- Rehashed all **23 harness files**, both pinned source trees and their **20 compiled assets each**. Current source file sets, compiled file sets, Git identities and clean status match the manifests. RC16 is `57c8dcc7fbd8fc2b62129498d1819050c78381a1`; the candidate is `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`.
- Recomputed **128 quantile values**, **212 raw-backed row metric values**, all **25 comparison metrics**, and **106 matched metric pairs**, including every delta, percentage and pair/cycle flag.
- Independently decoded complete Session reports and route contracts. Common outputs are deeply equal after exactly **9,200 asserted-null `session_id` fields** are removed at the eight documented candidate visit paths. Five route shapes cover eight pilots. Raw ownership event/visit/route IDs match the required controls.
- Original database work retains 5,000 event inserts per transaction, 1,000 history types across 30 days, matching reported import/history output hashes, **2,400,256 event-index bytes**, and **16,355,000 working-history JSON bytes**. The original worker does not retain the full database response/history payloads, so their reported hashes cannot be independently re-derived from absent bytes.

## Performance observations that remain visible

Means below summarize paired samples from this attempt only. Full distributions, individual pairs, every positive delta and all earlier attempt summaries are preserved in `NUMERIC-AUDIT.json` and `ATTEMPT-COMPARISON.json`.

| Metric | RC16 mean | Candidate mean | Change | Pair evidence |
|---|---:|---:|---:|---|
| Cold Core import | 45.144 ms | 35.656 ms | −21.02% | All six pairs improve |
| Core construction | 131.179 ms | 116.204 ms | −11.42% | Five improve; one +4.755 ms/+4.00% |
| First Market categories | 1.006 ms | 8.167 ms | +7.161 ms/+711.70% | All six pairs exceed +1 ms and +10%; retain the known deferred first-use cost |
| Same-process import + construction + first Market | 177.329 ms | 160.027 ms | −9.76% | All six pairs improve, ranging from −0.146% to −31.44%; the mean benefit is not uniform |
| Cold import + first formatted pair | 14.682 ms | 14.255 ms | −2.91% | Four improve; two small positive pairs remain |
| Database first open | 817.956 ms | 826.455 ms | +1.04% | Both pairs increase: +3.567 ms/+0.43%, +13.431 ms/+1.66% |
| Aged Imports p50 | 456.028 ms | 477.115 ms | +4.62% | Pair 1 −5.851 ms/−1.27%; pair 2 **+48.026 ms/+10.62%** |
| Aged Imports maximum | 505.671 ms | 523.120 ms | +3.45% | Pair 1 −40.033 ms/−7.59%; pair 2 **+74.931 ms/+15.48%** |

The first-use Market penalty was present in all six pairs of both failed attempts as well. Their same-process cumulative startup means were +2.68% and −33.92%, respectively, with adverse individual pairs. Those observations are preserved rather than overwritten by attempt 3's favorable cumulative result.

Aged Imports needs continued visibility in final acceptance. Failed attempt 2 showed both pairs adverse for p50 (+13.05%, +27.78%) and maximum (+46.76%, +22.77%). Failed attempt 1 had p50 improvements in both pairs and modest maximum increases (+0.73%, +1.48%). Attempt 3 therefore does **not** establish that the adverse behavior is resolved, nor a uniform improvement. No cause is assigned and the runs are not pooled.

Attempt 3 also retains small increases in event insert p50/maximum (+1.79%/+2.55% mean), history-write p50/maximum (+1.52%/+0.94%), and synchronous history-block p50/maximum (+3.02%/+7.93%). The largest history-block percentage pair is +19.00% but only +0.474 ms, below the existing joint flag; it remains recorded.

## Disposition

This is one coherent passing local collection for the startup/full-contract/original-database adapter scope. Preserve all three attempts and the output-location diagnostic receipt. No further local repetition is justified merely to improve the numbers. Final comparison/acceptance and independent Actions remain outstanding, including explicit consideration of the retained first-use and aged-import observations.
