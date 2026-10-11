# Independent review: failed names attempt 1

The workspace attempt remains failed. All four browser workers and twelve source-verification commands recorded zero exits, complete owned-group cleanup and no termination signals, and all four measurement JSONs remain intact. The final strict cross-binding check correctly rejected `3-candidate-after.log`: its closed-command pin is 157 bytes, SHA-256 `afd5ff748cdfe2b4c88c5d74b944c6d969a26974e1a7e9bf986d637630d43c16`, but the final inventory and current file contain zero bytes. No log was reconstructed and this audit does not upgrade the failed envelope.

The current file has inode 310754, birth `2026-10-11T08:26:49.564799915Z`, mtime `08:26:47.229085307Z`, and ctime `08:26:49.576799404Z`. The command had closed at `08:26:47.431824Z`. Birth therefore follows close while mtime precedes birth, supporting subsequent replacement with older metadata. The original inode was not captured, and neither actor nor mechanism is established. Raw stat output and nanosecond fields are retained in `NUMERIC-AUDIT.json`.

Independent checks cover all 26 inventoried files and the complete 28-file attempt set, 22 preparation bindings, both clean source/build trees, all six copied inputs and every consumed worker JSON. The single failed closed-log tuple is the only mismatch. The ordinary Node/Chrome identities, original fixture/provider parity, empty network/error arrays, source/harness guards, 30-row Assets assertion and browser/fixture cleanup receipts all verify. All 56 raw metric values are retained, forming 14 metric comparisons and 28 matched A1/B2, A4/B3 pairs. There are 19 positive paired deltas, including seven beyond the diagnostic >1 ms AND >10% marker; that marker is descriptive, not a new release threshold.

| Renderer metric | Baseline mean | Candidate mean | Change | Both pairs higher? |
| --- | ---: | ---: | ---: | --- |
| Overview window | 671.703 ms | 694.785 ms | +23.082 ms / +3.44% | Yes |
| Overview task | 318.596 ms | 322.333 ms | +3.738 ms / +1.17% | No |
| Overview script | 150.538 ms | 147.456 ms | -3.082 ms / -2.05% | No |
| Overview heap after | 16,322,590 B | 17,126,938 B | +804,348 B / +4.93% | Yes |
| First Assets window | 254.231 ms | 275.061 ms | +20.830 ms / +8.19% | Yes |
| First Assets task | 71.158 ms | 85.952 ms | +14.794 ms / +20.79% | Yes |
| First Assets script | 35.648 ms | 41.317 ms | +5.669 ms / +15.90% | Yes |
| First Assets layout | 8.815 ms | 10.596 ms | +1.781 ms / +20.20% | Yes |
| First Assets heap after | 21,101,706 B | 20,942,638 B | -159,068 B / -0.75% | No |

All metrics, both raw pairs and smaller adverse values appear in the JSON audit. These are c9d component-baseline versus integrated70 observations, not RC16 or an isolated names causal comparison. The first Assets window retains the original route barrier and 120 ms wait; its 30-row assertion is outside timing. Two observations per arm cannot establish population percentiles, and renderer counters exclude browser/GPU/worker CPU. Heap snapshots are not allocation totals.

Disposition: evidence acceptance fails because a consumed source-verification log was replaced. Preserve the measurements and their costs as failed-attempt observations. The separate successful `/tmp` attempt does not erase this failure or explain its cause. No application or browser was run, and no original attempt files were changed during this review.
