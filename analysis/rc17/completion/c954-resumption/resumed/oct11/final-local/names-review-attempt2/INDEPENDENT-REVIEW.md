# Independent review: names output-location attempt 2

The narrow evidence envelope passes independent review. Root's execution receipt records actual exit zero, and all final guards and cross-bindings pass. Independent rereads verify every one of the 26 inventoried files, the complete 28-file attempt set, all 16 closed-command log tuples, four consumed measurement JSONs, six copied inputs and all 22 frozen preparation bindings. Both source/build trees remain clean and match their manifests: c9d component baseline has 488 source files/20 assets; integrated70 has 486/20.

All four workers retain the original ordinary browser mode, fixture/provider parity, exact Node/Chrome identity, source/harness guards and correct 30-row Assets assertion. All worker/browser exits and owned-group cleanup receipts are clean, with no forced signals or timeouts. Both browser and fixture temporary-directory prefixes are currently absent. Root's coordinator exited normally; no Node/Chrome workload or holder of either shared lock was visible during the read-only review. This names runner has no separate persisted lock-release receipt, so the conclusion is supported by normal coordinator exit, its reviewed lock-close path and the current kernel observation.

The only changed conditions were a fresh output destination under `/tmp` and no concurrent coordinator/subagent tool operations during the bounded run. Both changed together. This successful observation neither identifies the cause of earlier mutations nor proves that output location alone fixes them. The failed workspace names attempt remains failed and is separately preserved.

All 56 raw metric values are preserved across 14 comparisons and 28 matched A1/B2, A4/B3 pairs. There are 18 positive paired deltas, including twelve beyond the descriptive >1 ms AND >10% marker. No value was removed as an outlier, and the marker is not a newly invented release threshold.

| Renderer metric | Baseline mean | Candidate mean | Change | Both pairs higher? |
| --- | ---: | ---: | ---: | --- |
| Overview window | 683.977 ms | 803.575 ms | +119.598 ms / +17.49% | Yes |
| Overview task | 312.652 ms | 390.067 ms | +77.415 ms / +24.76% | No |
| Overview script | 149.006 ms | 188.233 ms | +39.227 ms / +26.33% | No |
| Overview layout | 54.240 ms | 74.832 ms | +20.592 ms / +37.96% | No |
| Overview heap after | 16,048,932 B | 17,384,666 B | +1,335,734 B / +8.32% | Yes |
| First Assets window | 254.821 ms | 391.802 ms | +136.981 ms / +53.76% | No |
| First Assets task | 80.220 ms | 155.361 ms | +75.141 ms / +93.67% | Yes |
| First Assets script | 36.672 ms | 78.741 ms | +42.069 ms / +114.72% | Yes |
| First Assets layout | 8.749 ms | 9.964 ms | +1.215 ms / +13.89% | Yes |
| First Assets heap after | 21,050,534 B | 20,931,502 B | -119,032 B / -0.57% | No |

The first candidate observation has a large spike that remains in the means: Overview window loses 225.808 ms / 33.12%, and Assets window loses 282.139 ms / 111.22%. The other candidate still loses 13.389 ms / 1.95% in Overview window but improves Assets window by 8.177 ms / 3.19%. Both Assets task pairs lose (136.672 ms / 145.67%; 13.610 ms / 20.43%), and both script pairs lose (78.079 ms / 199.26%; 6.060 ms / 17.74%). Both Assets task pairs and both script pairs exceed the joint diagnostic >1 ms AND >10% marker. Overview window is higher in both pairs, but the second pair is only +1.95%, so it does not meet the joint flag. Thus the task/script costs are not solely the large window spike. All pair values and smaller changes remain in the JSON audit.

Disposition: the input/output provenance and narrow correctness/cleanup evidence pass. Performance acceptance remains open: initial Overview latency/heap and first Assets renderer task/script/layout costs are adverse and must be carried into the release decision. These sparse c9d-to-integrated70 observations cannot isolate names causality or establish population percentiles. They do not supersede earlier component costs, the failed workspace observations, or other RC17 gates. The Assets timing still excludes the later 30-row assertion; renderer metrics exclude browser/GPU/worker CPU and heap snapshots are not allocation totals. No further runtime is requested by this review.

The exact root execution receipt is copied as `ROOT-EXECUTION.json`; the audit records byte/hash tuples for that original receipt, console and completed receipt. Root bindings: execution `86753515d44f7eb3f74eec67f59db6ec35439ac777e9148ac66728b0f89e41b8`; completed receipt `770bf009a4ce3f4de8e397594f2f7486778dd61d52fc36627d0354960b862070`; console `53c802f1daba0136a76058b9080b17e2cd7c4f64baa93f60024e041963a35160`. No application/browser/build was executed and no original output was changed during the audit.
