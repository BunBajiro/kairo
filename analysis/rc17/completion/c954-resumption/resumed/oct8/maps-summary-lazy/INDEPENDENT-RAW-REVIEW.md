# Independent lazy M9 raw and numeric review

8 October 2026. Read-only post-run checks by `review_write_inputs`; no application import, test, diagnostic, performance worker, source change or measured-harness change. This review does not authorize adoption or a new runtime gate.

| Artifact | SHA-256 |
| --- | --- |
| `screen-attempt1/completed.json` | `c58707e5d3a4fa1d3625f3da6e24ee3117473ce48f118f108bb38e89f3efca32` |
| `screen-attempt1/summary.json` | `4f3262e64163cea7f363e8e39c28412b574f45b7b95e3c585c63b88a793b8c91` |
| `screen-attempt1/baseline-1.json` | `110b68fc393feeec30a39d54fe446fb5fb6447a8fbbb99107fba0dbeeb8944fe` |
| `screen-attempt1/candidate-1.json` | `bbd5f6296f27b2b4d2cbca15ad6d7de8007d0280ce4daade43fcef68e46cb66f` |
| `screen-attempt1/candidate-2.json` | `b0e72468de49377eee56224d94d0e09a6ff3482e0c481f2fd935d69051474081` |
| `screen-attempt1/baseline-2.json` | `63207c50e93ac49379007d064171052218df24a8b47d5aeb2ef7a821e2dd68c6` |

All 19 artifacts declared by the completed receipt match their recorded byte lengths and hashes. The receipt records complete source/harness verification, final guard success, all children exiting zero and no cleanup/inventory failures. Exact parity agrees across all 32 shape/arm combinations. Independently recalculated all 624 paired phase/storage comparison objects, including baseline and candidate values, differences and percentages; all equal `summary.json`. Pairing correctly uses baseline-1 with candidate-1 and baseline-2 with candidate-2. Derivative-state and database-change maps also match the raw arms. Five steady reads and the final post-expiry steady read have zero changes. Candidate construction has no derivative body/row backfill.

Storage review included every recorded snapshot before canonical expiry, not only the smaller post-expiry metadata. Wide-24 compact-body peak is 1,556,885 bytes and allocated pages rise from 102,215,680 to 103,788,544 bytes. Dense-eight peaks at 1,001,111 compact-body bytes and 27,090,944 to 28,102,656 allocated bytes. Plain-24 peaks at 395,759 compact-body bytes and 2,576,384 to 2,998,272 allocated bytes. Both repetitions agree. For all eight shapes and four arms, pre-expiry allocated-page maxima equal final checkpointed DB sizes. WAL maxima depend on intermediate checkpoints and are not cumulative bytes written.

No numerical/parity defect was identified. `RESULTS-SCREEN.md` accurately preserves the mixed first-read/API cycle results, repeated expiry/isolated response/detail regressions, populated storage cost and substantial warm wide-summary gains. Seven of eight shapes have slower canonical expiry in both pairs; dense-eight is +44.69%/+44.27%, plain-24 +26.12%/+73.74%. Wide-24 node response alone is +34.93%/+28.14%, while combined node response/summary/detail improves by about 61%. Primitive-fallback steady reads are +7.24%/+4.28%. None of these observations is discarded or converted into a post-hoc threshold. Selected-path allocation/GC coupling remains a hypothesis, not a demonstrated cause.

The report's bounded decision scope is appropriate: keep the prototype unintegrated until the warmed background-tracking semantic gap and explicit expiry/isolated-response disposition are supported. API undo/import are no longer wholly untested: the screen exercises their declared bounded cases. The evidence does not require an automatic blanket matrix expansion, nor establish production caller frequencies. If adopted later, combined-source correctness/build gates still apply. If existing behavior is retained, record that decision with the unresolved wide-summary cost visible; do not describe the optimization as implemented or the latency as fixed.

A minor report wording clarification was requested: raw arms retain CPU and point-memory observations; the current summary contains paired elapsed/storage/change derivatives. This does not affect measured values or the decision.
