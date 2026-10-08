# Predeclared follow-up for the adverse dense selected row

The complete first matrix is retained in `matched-attempt1/`. Selected reads with 100 signatures and 1,000 connections regressed from process medians 6.675/8.413 ms to 7.891/10.915 ms, exceeding both 10% and 1 ms in both paired observations. This finding remains unresolved. The large summary win cannot erase it.

Run a fixed follow-up on the exact same baseline and candidate, without edits or adaptive reruns. Use the unchanged original `maps-scaling.mjs` timing implementation and all six original dense selected cases: 0/100/1,000 signatures crossed with 100/1,000 links. Every process retains the original three warmups and seven ordinary samples per case. Fixture construction remains outside measured service time as in the first matrix.

The predeclared order is eight fresh processes:

| Pair | Baseline case order | Candidate case order | Process order |
|---|---|---|---|
| 1 | Forward | Forward | A1 then B1 |
| 2 | Reverse | Reverse | B2 then A2 |
| 3 | Reverse | Reverse | B3 then A3 |
| 4 | Forward | Forward | A4 then B4 |

Thus each arm gets two forward and two reverse process observations, with A/B and B/A ordering. Stop after these eight processes regardless of result. Report each process median, sample range and all four paired differences, including full serialization timings. Count pairs exceeding the unchanged >10% and >1 ms investigation threshold; do not turn it into a new automatic acceptance rule or pool individual samples as independent process replications. The first matrix remains a separate observation, not folded away.

Two additional, untimed diagnostic processes use `dense-diagnostics.mjs`, a declared derivative of the same original harness. It adds actual application JSON parse/stringify counts and full-output hashes to existing SQL calls/rows/transferred-byte/write counts. The observer's own JSON parsing is excluded. This script rejects timing mode. Both arms must retain identical complete selected-output hashes and fixture identity; unchanged reads must make zero writes. Diagnostic durations never supply performance evidence.

If the material selected-read signal recurs, retain it and examine separate GC/CPU-profile evidence before proposing a causal source ablation. Predeclared hypotheses are the extracted no-change predicate versus its former inline body, and constructor/write-time side-table work affecting SQLite caches or later memory/GC behavior. These are hypotheses only. A later ablation must use its own frozen checkout and matched receipts; do not edit this candidate mid-run or assume an unchanged selected endpoint implies zero system-level effect.

The side-table write/backfill/storage gate remains independent. Neither a nonrecurrence in this follow-up nor a strong summary improvement by itself closes the adverse row, M9 or final RC17 acceptance. Root owns the runtime grant; preparing this plan is not permission to start other concurrent timing jobs.
