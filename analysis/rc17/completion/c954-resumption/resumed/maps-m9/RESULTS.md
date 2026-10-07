# M9 measured disposition — c954 isolated proposal

**Recommendation: adopt the synchronous roster owner and no-op connection reconciliation guard after coordinator review. Keep M9 open for residual summary parsing and final integrated acceptance.** The completed comparison supports these two narrow mechanisms; it does not support restoring clean RC17 or PR #10 to user review.

This independent analysis uses only `matched-attempt1/`. It ran no application, tests, build, browser or benchmark. The saved source is exact user-selected c954 versus its declared five-file proposal; excluded build #55/508 is not used. The proposal contains three server changes and two test changes. No integration is claimed here.

## Integrity and measurement boundary

Reverified all **28 saved artifact hashes and sizes**, all **11 harness/proposal hashes**, matching sets of **482 source paths** with exactly five declared deltas, and the six successful completed child receipts. The parent and worker records report before/after source verification. Baseline fingerprint is `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27`; isolated trial fingerprint is `75c20d27192f0e6174b98edb3e2365dab962866e26afe3a454faef4121040105`. Both identify c954 as base. Baseline has 26 recorded compiled assets; trial has none, so this is not browser evidence.

Both timing families ran baseline/candidate/candidate/baseline in separate fresh processes. The 27 plain/wide/roster cases use two warmups and five ordinary samples per process. The 21 frozen Maps cases use three warmups and seven samples; the second pair reverses case order. That is **1,128 ordinary service measurements**, with diagnostic counters and guards in separate processes. Both performance locks were held by the recorded outer runner.

**Tables report the median of the two process medians per arm**, in milliseconds. This is the arithmetic midpoint when there are two values; it does not treat all within-process samples as independent replications. Serialization is timed separately after service work, with unchanged complete output. CPU medians, both individual process medians, paired deltas and raw sample ranges are retained in [summary.json](summary.json). No p95, confidence interval, user-perceived latency or whole-application speedup is inferred.

## Semantic and byte controls

- All 15 mutation/access guard phases have equal complete selected/full/summary values, output hashes/bytes, stored documents/digests and database write deltas. Phases include actual retained notes/passages, rename, revoked scopes, reauth, module toggles, ESI/log authority, disconnect/reconnect, expiry, pause, legacy/dangling cleanup, timezone-expired canonical links, direct canonical/document replacement and collapsed unknown lifetime. Both sources reject disconnected-owner reads and mutation. No external requests occurred.
- Every sample of all 27 summary workload cases matches the same fixture input digest and complete response digest/byte count across both arms. The 21 frozen Maps cases retain equal fixtures, correctness controls and output byte counts. The independent selected-response equivalence adapter also compares the complete object and ordered arrays: zero field or property-order differences; identical raw 229,559-byte response hash `5064dfaae3e14d49957e6d37c7f3772cb036d7c3f382a84f192848e7f92a8968`.
- The mutation fixture exercises direct stored/canonical replacement; it does not itself invoke the public import API. Public import/undo/export and deferred fleet authorization belong to the separately saved semantic test lane and final integrated tests.

## Counted mechanism and residual cost

| Operation | Baseline | Trial | Meaning |
|---|---:|---:|---|
| 24 maps / 100 tracked pilots, full Auth calls | 7,507 | 3 | One response owns the connected roster. |
| Same operation, returned Auth rows | 750,700 | 300 | Actual SQLite-backed `createAuth.characters()` rows. |
| 100 tracked pilots, selected Auth calls / rows | 607 / 60,700 | 3 / 300 | Constant across the tested 1/8/24 total maps. |
| 24 wide maps, reconciliation map stringify calls / characters | 50 / 171,428,702 | 0 / 0 | Removes unchanged-document stringify work during service execution. |
| 24 wide maps, summary map parse calls / characters | 26 / 85,714,734 | 26 / 85,714,734 | Still outstanding; no parse saving is claimed. |
| 24 wide maps, full map parse calls / characters | 50 / 171,428,702 | 50 / 171,428,702 | Full projection also retains its current parsing work. |
| 24 wide maps, summary response bytes | 7,332 | 7,332 | Small output still incurs substantial input processing. |
| 24 wide maps, full response bytes | 87,284,760 | 87,284,760 | Required output retained in full. |

The JSON wrappers count **JavaScript string characters**, not allocated bytes or UTF-8 wire bytes. Fixture and response `inputBytes`/`outputBytes` use UTF-8 byte counts. The wide fixture holds 500 comments and 1,000 passages per map, each supported document below 4 MB; the 100-pilot roster case is an explicitly populated stress case, not an assertion about normal usage.

There is **no heap/RSS/GC measurement in this matrix**. Source inspection bounds the added roster array/by-ID Map to one synchronous response, and counters establish fewer repeated materializations. They do not establish a retained-memory reduction or leak result. Diagnostic instrumented phase timings are not pooled with the ordinary timings below.

## Plain, wide and tracked-pilot matrix

| Fixture / maps / operation | Service ms, baseline → trial | Change | Serialization ms, baseline → trial |
|---|---:|---:|---:|
| plain/1/summary | 0.946 → 0.705 | -25.5% | 0.005 → 0.006 |
| plain/1/selected | 1.971 → 1.519 | -23.0% | 0.296 → 0.283 |
| plain/1/full | 1.654 → 1.517 | -8.3% | 0.288 → 0.298 |
| plain/8/summary | 5.190 → 3.158 | -39.2% | 0.009 → 0.010 |
| plain/8/selected | 1.670 → 1.328 | -20.5% | 0.270 → 0.271 |
| plain/8/full | 11.332 → 9.267 | -18.2% | 2.227 → 2.335 |
| plain/24/summary | 12.516 → 8.609 | -31.2% | 0.022 → 0.021 |
| plain/24/selected | 1.470 → 1.212 | -17.6% | 0.293 → 0.297 |
| plain/24/full | 28.388 → 20.410 | -28.1% | 7.361 → 7.312 |
| wide/1/summary | 16.662 → 8.773 | -47.3% | 0.006 → 0.014 |
| wide/1/selected | 20.640 → 15.456 | -25.1% | 7.320 → 7.445 |
| wide/1/full | 28.475 → 15.268 | -46.4% | 8.776 → 7.299 |
| wide/8/summary | 146.587 → 74.205 | -49.4% | 0.015 → 0.021 |
| wide/8/selected | 20.051 → 11.768 | -41.3% | 7.325 → 7.587 |
| wide/8/full | 220.028 → 160.106 | -27.2% | 110.299 → 109.162 |
| wide/24/summary | 475.965 → 253.133 | -46.8% | 0.032 → 0.045 |
| wide/24/selected | 19.611 → 11.907 | -39.3% | 7.452 → 6.703 |
| wide/24/full | 663.008 → 459.404 | -30.7% | 355.103 → 360.056 |
| roster/1/summary | 0.985 → 0.740 | -24.8% | 0.005 → 0.005 |
| roster/1/selected | 69.376 → 4.355 | -93.7% | 0.620 → 0.433 |
| roster/1/full | 70.178 → 4.301 | -93.9% | 0.747 → 0.508 |
| roster/8/summary | 5.142 → 3.919 | -23.8% | 0.007 → 0.014 |
| roster/8/selected | 68.660 → 4.057 | -94.1% | 0.597 → 0.393 |
| roster/8/full | 311.599 → 17.874 | -94.3% | 3.287 → 2.993 |
| roster/24/summary | 14.701 → 10.812 | -26.5% | 0.019 → 0.025 |
| roster/24/selected | 68.358 → 4.583 | -93.3% | 0.624 → 0.380 |
| roster/24/full | 865.895 → 47.870 | -94.5% | 10.110 → 10.014 |

Every service process-median pair improves in this 27-case matrix. The 24-map wide summary falls **475.965→253.133 ms (−46.8%)**, but approximately 253 ms remains to produce a 7,332-byte response. The 24-map/100-pilot full projection falls **865.895→47.870 ms (−94.5%)**. These large reductions and the exact work counters support the narrow adoption decision. They do not close residual wide-summary parsing.

The 24-map wide full response still takes **459.404 ms service + 360.056 ms serialization** as separately summarized phase medians. Those values are not a measured end-to-end percentile or the median of summed samples. Serialization is slightly adverse in aggregate, **355.103→360.056 ms (+1.4%)**, with mixed paired deltas −9.509/+19.414 ms. Output is unchanged at 87,284,760 bytes; no serialization speedup is claimed.

## Frozen Maps matrix

The independence family keeps one selected map fixed while total map count grows. The constant-links family retains 720 total links across 1/8/24 maps. Dense selected cases vary signatures and links. `list` is the full Maps state operation.

| Case | Service ms, baseline → trial | Change | Serialization ms, baseline → trial |
|---|---:|---:|---:|
| independence-selected-1-maps | 1.657 → 1.639 | -1.1% | 0.730 → 0.751 |
| independence-list-1-maps | 1.856 → 1.587 | -14.5% | 0.741 → 0.742 |
| independence-summaries-1-maps | 0.694 → 0.547 | -21.2% | 0.004 → 0.006 |
| independence-selected-8-maps | 1.621 → 1.434 | -11.5% | 0.753 → 0.733 |
| independence-list-8-maps | 13.111 → 10.698 | -18.4% | 6.107 → 6.204 |
| independence-summaries-8-maps | 4.628 → 3.157 | -31.8% | 0.010 → 0.011 |
| independence-selected-24-maps | 1.476 → 1.385 | -6.2% | 0.740 → 0.771 |
| independence-list-24-maps | 34.758 → 29.176 | -16.1% | 20.194 → 20.468 |
| independence-summaries-24-maps | 13.795 → 9.793 | -29.0% | 0.027 → 0.028 |
| constant-links-list-1-maps | 4.549 → 4.807 | +5.7% | 2.052 → 2.056 |
| constant-links-summaries-1-maps | 2.721 → 2.341 | -14.0% | 0.004 → 0.006 |
| constant-links-list-8-maps | 7.403 → 5.958 | -19.5% | 2.546 → 2.542 |
| constant-links-summaries-8-maps | 3.690 → 2.639 | -28.5% | 0.011 → 0.011 |
| constant-links-list-24-maps | 11.630 → 9.052 | -22.2% | 3.422 → 3.274 |
| constant-links-summaries-24-maps | 4.887 → 3.727 | -23.7% | 0.017 → 0.022 |
| dense-selected-0-signatures-100-links | 1.117 → 0.942 | -15.7% | 0.388 → 0.389 |
| dense-selected-0-signatures-1000-links | 6.598 → 7.547 | +14.4% | 2.745 → 2.848 |
| dense-selected-100-signatures-100-links | 1.604 → 1.612 | +0.5% | 0.731 → 0.716 |
| dense-selected-100-signatures-1000-links | 8.436 → 6.156 | -27.0% | 3.265 → 3.182 |
| dense-selected-1000-signatures-100-links | 5.537 → 4.922 | -11.1% | 4.252 → 4.215 |
| dense-selected-1000-signatures-1000-links | 12.926 → 11.971 | -7.4% | 6.031 → 6.192 |

## Adverse observations

**No service, serialization or CPU metric exceeds baseline by both >10% and >1 ms in both paired process medians.** This is only an investigation rule, not proof of no regression or a universal user-impact threshold. There are two process observations per arm.

The most relevant mixed service signals are **constant-links-list-1-maps**, 4.549→4.807 ms (+5.7%), and **dense-selected-0-signatures-1000-links**, 6.598→7.547 ms (+14.4%, +0.949 ms aggregate). Their paired deltas are +1.196/−0.681 ms and −0.964/+2.863 ms respectively. These do not repeat across both pairs, but they prevent a claim that every Maps case improves. Retain both in final integrated acceptance and investigate if they recur; this saved evidence alone does not identify a new causal defect.

The following table retains **every service or serialization row with any adverse pair**, including tiny differences. Deltas compare candidate-1 with baseline-1 and candidate-2 with baseline-2. Positive means slower. All CPU rows, including adverse CPU pairs, are in `summary.json`; none meets the repeated investigation rule.

| Family / case | Metric | Pair 1 delta ms | Pair 2 delta ms | Aggregate delta ms |
|---|---|---:|---:|---:|
| summary / plain/1/summary | serialization | +0.000461 | +0.001622 | +0.001041 |
| summary / plain/1/full | serialization | +0.001482 | +0.019700 | +0.010591 |
| summary / plain/8/summary | serialization | -0.000181 | +0.001312 | +0.000566 |
| summary / plain/8/selected | serialization | +0.005518 | -0.004025 | +0.000747 |
| summary / plain/8/full | serialization | +0.079370 | +0.138176 | +0.108773 |
| summary / plain/24/selected | serialization | -0.012950 | +0.021181 | +0.004115 |
| summary / plain/24/full | serialization | -0.344231 | +0.246403 | -0.048914 |
| summary / wide/1/summary | serialization | +0.007031 | +0.008203 | +0.007617 |
| summary / wide/1/selected | serialization | -0.523622 | +0.772855 | +0.124616 |
| summary / wide/8/summary | serialization | +0.006460 | +0.005608 | +0.006034 |
| summary / wide/8/selected | serialization | -0.606984 | +1.129828 | +0.261422 |
| summary / wide/8/full | serialization | -5.921279 | +3.646210 | -1.137535 |
| summary / wide/24/summary | serialization | +0.014262 | +0.012107 | +0.013184 |
| summary / wide/24/full | serialization | -9.509426 | +19.414487 | +4.952530 |
| summary / roster/1/summary | serialization | +0.001062 | -0.000360 | +0.000351 |
| summary / roster/8/summary | serialization | +0.004146 | +0.008443 | +0.006294 |
| summary / roster/24/summary | serialization | +0.006640 | +0.005378 | +0.006009 |
| summary / roster/24/full | serialization | -0.651790 | +0.458484 | -0.096653 |
| maps / independence-selected-1-maps | service | +0.171930 | -0.208580 | -0.018325 |
| maps / independence-selected-1-maps | serialization | +0.031568 | +0.008630 | +0.020099 |
| maps / independence-list-1-maps | serialization | +0.023296 | -0.020543 | +0.001376 |
| maps / independence-summaries-1-maps | serialization | +0.001473 | +0.001422 | +0.001448 |
| maps / independence-list-8-maps | serialization | +0.091572 | +0.103408 | +0.097490 |
| maps / independence-summaries-8-maps | serialization | +0.002053 | +0.001443 | +0.001748 |
| maps / independence-selected-24-maps | serialization | +0.034793 | +0.027297 | +0.031045 |
| maps / independence-list-24-maps | serialization | +0.513946 | +0.034131 | +0.274039 |
| maps / independence-summaries-24-maps | serialization | +0.002804 | -0.001242 | +0.000781 |
| maps / constant-links-list-1-maps | service | +1.195943 | -0.680664 | +0.257639 |
| maps / constant-links-list-1-maps | serialization | +0.079902 | -0.072550 | +0.003676 |
| maps / constant-links-summaries-1-maps | serialization | +0.002523 | +0.001522 | +0.002022 |
| maps / constant-links-list-8-maps | service | +0.000644 | -2.890360 | -1.444858 |
| maps / constant-links-list-8-maps | serialization | +0.031729 | -0.040431 | -0.004351 |
| maps / constant-links-summaries-8-maps | serialization | -0.000210 | +0.001011 | +0.000401 |
| maps / constant-links-summaries-24-maps | serialization | +0.003053 | +0.005819 | +0.004436 |
| maps / dense-selected-0-signatures-100-links | serialization | -0.001893 | +0.004507 | +0.001307 |
| maps / dense-selected-0-signatures-1000-links | service | -0.963525 | +2.862748 | +0.949611 |
| maps / dense-selected-0-signatures-1000-links | serialization | +0.024278 | +0.181503 | +0.102890 |
| maps / dense-selected-100-signatures-100-links | service | -0.218328 | +0.233451 | +0.007562 |
| maps / dense-selected-1000-signatures-100-links | serialization | -0.094330 | +0.020461 | -0.036934 |
| maps / dense-selected-1000-signatures-1000-links | serialization | -0.082229 | +0.403647 | +0.160709 |

## Disposition and remaining gate

Adopt the three-server-file implementation as a deliberately reviewed change derived from c954, retaining its two test files. The exact response/stored-document controls, request-local ownership review, large paired benefits and preserved small/adverse results support that recommendation. Coordinator integration and a new source checkpoint remain separate actions; these isolated results are not relabeled as integrated results.

**M9 remains open.** The next decision is whether a narrow summary metadata/reconciliation boundary can avoid parsing wide map bodies while preserving direct canonical mutations, expiry/pruning, normalization, import/undo and full output semantics. At 24 wide maps the remaining 85,714,734 parsed map characters and ~253 ms summary service time give a concrete workload for that decision. Any proposed change must first preserve these semantic guards and then receive its own exact-source comparison. No broad persistence rewrite is implied.

Final affected integrated tests, the frozen local/independent CI matrix, all original adverse rows and package verification remain required before clean RC17. PR #10 stays withdrawn. Raw results remain immutable in `matched-attempt1/`; this summary neither reruns nor repairs them.
