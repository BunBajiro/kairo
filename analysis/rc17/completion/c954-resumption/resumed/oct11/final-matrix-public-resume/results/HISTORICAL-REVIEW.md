# Historical comparison: independent review

11 October 2026. **Collection and independent numeric review pass.** This stage measures v0.7.3 (`2397947`) against RC16 (`57c8dcc`) in the original baseline/candidate/candidate/baseline order. Integrated70 was source/build guarded but was not a measured arm. These historical costs neither attribute a defect to70 nor reopen its accepted first-use retention decision.

Completed receipt SHA256: `211b5e9a0a1363276f68da6ca545b320e83890acb790af8d22ca63bb58cf4383`. [HISTORICAL-AUDIT.json](HISTORICAL-AUDIT.json) records hashes, source identities, all78 comparison rows, adverse flags and scope limits. [Raw recovery manifest](historical/RAW-MANIFEST.json) retains the original39 files.

The independent audit verified all38 inventoried files/39 total files,153 original input bindings,36 closed-file pins and eight owned commands with exit0 and completed descendant drain. Source/build inventories remain clean and exact: v0.7.3 has195 source files/18 assets; RC16 has407/20; integrated70 has486/20. The outer full-source guard covers the two administrative files exempted by the historical inner verifier. Both shared locks were observed free. No application, build or benchmark was executed during review.

All four raw reports and eight profile observations pass their original settings/fixture checks. The review independently recomputed1,360 retained samples into544 distribution values, all78 summary rows/156 nearest pairs and all26 displayed Markdown rows. Summary/comparison JSON and Markdown copies agree. No numeric or provenance discrepancy was found.

## Results retained for the three-version report

Values below are means of the two per-run observations for each source. Full individual observations, tails, payloads and both pairs remain in the raw summary and audit.

| Profile/metric | v0.7.3 | RC16 | Change |
| --- | ---: | ---: | ---: |
| Typical idle CPU (% one logical core) |0.509|2.648|+420.39%|
| Stress idle CPU (% one logical core) |1.202|2.223|+84.97%|
| Typical idle RSS (MiB) |69.027|150.367|+117.84%|
| Stress idle RSS (MiB) |92.232|171.082|+85.49%|
| Typical startup (ms) |12.785|172.443|+1248.82%|
| Stress startup (ms) |18.506|172.408|+831.62%|
| Typical direct-state p50 (ms) |4.239|4.619|+8.95%|
| Stress direct-state p50 (ms) |20.827|25.895|+24.33%|
| Typical HTTP-state p50 (ms) |9.015|9.711|+7.73%|
| Stress HTTP-state p50 (ms) |39.864|37.542|-5.83%|
| Typical Session p50 (ms) |15.324|15.440|+0.76%|
| Stress Session p50 (ms) |95.472|87.430|-8.42%|

Eight summary rows exceed the existing >1ms and >10% marker in both nearest pairs: startup and idle-loop maximum in both profiles; typical Session p95; and stress direct-state p50, p95 and CPU p50. Typical Session p95 is19.502→23.397ms; stress state p95 is25.736→34.021ms. Idle-loop maxima average59.212→137.331ms typical and37.372→92.570ms stress. The flag is descriptive, not a statistical test or a request to investigate obsolete RC16 independently.

Other adverse rows remain visible even without that flag. For example, stress warm Imports p50 rises0.669→0.840ms (+25.57%); its absolute change is below1ms. All mean changes, tails and payload-size differences are retained in the audit. State, Journey and Session payload sizes differ across versions, so equal or faster timings are not full output-equivalence proof.

## Scope and next action

Each profile uses one fresh disposable server per report, three operation warmups and ten measured iterations including JSON serialization, plus one real35-second idle window. Real scheduler activity is enabled. RC16 records12 successful Universe ticks per idle observation with zero rejected subtasks; v0.7.3 has no Universe collector service. Observed external request attempts are zero, caches use the corrected fixture, and automatic SDE start is deferred. These differences describe the actual historical products and do not isolate a single implementation cause.

Two per-source observations are not confidence intervals. With ten samples, the reported p95 is the sample maximum. RSS is process memory, not leak evidence; idle-loop maxima do not measure interactive stalls. The production operation assertions passed, but complete decoded cross-version backend output equality was not tested here. No database workers ran in this backend-only stage: empty database results are not a database parity pass. Nested raw files were pinned at their orchestrator's exit, not continuously monitored during timed windows.

The historical anchor is complete. Proceed to the original RC16-versus70 comparison and remaining UI/updater/CI/package acceptance. No historical rerun or application change is requested by this review.
