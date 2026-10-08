# Selected-source bounded enrichment decision — 8 October 2026

**Adopt the four-file isolated proposal**, subject to integration and exact-source combined verification. This is a component decision against selected-source9afa; it does not produce cleanRC17 or reopen withdrawnPR10. Shared source was not changed by this trial.

The actual Core/ESI comparison completed all8 ABBA arms and96 cases against complete, immutable9afa baseline/candidate archives. The candidate adds four bounded local workers for optional asset/PI metadata. ESI retains its existing global4request limiter, protection priority, cache, coalescing, pilot keys and retry/cooldown behavior. Exact ordered dataset outputs, cold provider counts and zero warm provider calls match in every case. Multi-item actual ESI concurrency changes from1 to4;0/1cases remain1. This preserves output order, not chronological metadata response completion.

With50ms controlled response delays, six planets complete in357.336→153.472ms;10stations in612.087→256.501ms and10structures in564.308→205.220ms. Every paired6/10item delayed comparison improves. These are synthetic transport-delay measurements of actual Core/ESI behavior, not observed EVE latency or whole-application performance.

## Source and verification

- Base `9afa9a7197fa6b5a802e9efdaa322dedf2439150`; candidate exactly the four files listed in `proposal-files.json`. Excluded508 was not used.
- Independent reviewer `/root/review_enrichment_oct8` verified both modified-file baseline hashes against exact9afa Git objects, every482baseline/484candidate manifest entry, and found no actionable implementation defect.
- `semantic-attempt1/receipt.json`: **61/61 tests passed**, no failures/cancellations/skips, including seven new cap/order/fatal-drain, denial/abort/rate-limit, fresh-name, realESI global capacity/priority/coalescing/cache/private-key and actual Core asset/PI+nested publication drain cases.
- `matched-attempt1/receipt.json`: all8fresh processes completed, before/after full-source and frozen-harness checks passed. `summarize.py` verifies saved result hashes, internal source/harness hashes, all96case identities and exact output/call parity before deriving `summary.json`.
- Runs held `/tmp/kairo-performance.lock`; no other timed workload or build ran concurrently. Runtime released when the final arm completed.

## Complete ordinary comparison

Means of two observations per variant; absolute milliseconds. CPU is process user+system milliseconds over the cold window. Both paired deltas and raw observations remain in `summary.json`.

| Delay | Kind | Items | Cold elapsed baseline→candidate | Warm elapsed baseline→candidate | Cold CPU baseline→candidate |
|---:|---|---:|---:|---:|---:|
| 0 | stations | 0 | 6.508 → 6.003 | 1.464 → 1.277 | 7.026 → 6.467 |
| 0 | stations | 1 | 2.579 → 2.833 | 0.907 → 0.886 | 2.963 → 3.366 |
| 0 | stations | 6 | 4.128 → 3.364 | 0.957 → 0.908 | 5.621 → 4.681 |
| 0 | stations | 10 | 3.317 → 3.183 | 0.859 → 0.826 | 3.930 → 3.797 |
| 0 | structures | 0 | 0.837 → 0.880 | 0.665 → 0.772 | 1.065 → 1.166 |
| 0 | structures | 1 | 1.091 → 1.089 | 0.756 → 0.761 | 1.240 → 1.087 |
| 0 | structures | 6 | 1.926 → 1.624 | 0.654 → 0.702 | 1.925 → 1.654 |
| 0 | structures | 10 | 3.573 → 3.094 | 0.742 → 0.785 | 4.498 → 4.220 |
| 0 | planets | 0 | 0.888 → 0.794 | 0.696 → 0.799 | 1.012 → 0.863 |
| 0 | planets | 1 | 0.900 → 1.218 | 0.605 → 0.735 | 0.899 → 1.216 |
| 0 | planets | 6 | 1.751 → 1.552 | 0.839 → 0.840 | 1.878 → 1.663 |
| 0 | planets | 10 | 2.271 → 2.037 | 0.783 → 0.867 | 2.787 → 2.528 |
| 50 | stations | 0 | 63.840 → 56.958 | 3.110 → 1.581 | 14.892 → 7.487 |
| 50 | stations | 1 | 154.859 → 156.219 | 1.023 → 1.085 | 5.168 → 6.821 |
| 50 | stations | 6 | 410.301 → 206.633 | 1.081 → 1.163 | 13.247 → 9.299 |
| 50 | stations | 10 | 612.087 → 256.501 | 0.928 → 1.846 | 11.990 → 9.689 |
| 50 | structures | 0 | 51.664 → 51.521 | 0.775 → 0.778 | 1.895 → 1.936 |
| 50 | structures | 1 | 102.697 → 102.787 | 3.642 → 0.923 | 3.062 → 2.625 |
| 50 | structures | 6 | 356.933 → 153.588 | 0.783 → 1.004 | 34.512 → 33.495 |
| 50 | structures | 10 | 564.308 → 205.220 | 0.855 → 0.953 | 11.790 → 6.830 |
| 50 | planets | 0 | 51.222 → 51.481 | 0.732 → 0.718 | 10.138 → 1.496 |
| 50 | planets | 1 | 103.290 → 102.552 | 0.892 → 0.795 | 3.058 → 2.389 |
| 50 | planets | 6 | 357.336 → 153.472 | 1.017 → 1.299 | 7.301 → 3.887 |
| 50 | planets | 10 | 560.108 → 204.509 | 1.237 → 1.155 | 10.254 → 34.249 |

## Adverse observations and limits

Tiny/no-delay cases do not support a blanket speedup: one planet increases0.900→1.218ms (+0.318ms/+35.3%). At50ms delay, one station increases154.859→156.219ms (+1.360ms/+0.9%). Warm10station cost increases0.928→1.846ms, with paired deltas+1.774ms and+0.063ms; six-planet warm mean increases1.017→1.299ms with mixed paired signs. All adverse CPU and elapsed rows remain visible in the table and machine-readable summary.

The50ms/10planet stress CPU mean increases10.254→34.249ms. Candidate arms are60.557ms and7.941ms, versus9.595ms and10.912ms baseline; the signal does not repeat across the two pairs. No cause was established, so it is not relabeled as garbage collection or dismissed. The same cold elapsed pair improves by~355ms both times. This component decision rests on bounded network completion and semantic parity, not a general CPU reduction claim; the adverse CPU sample stays represented in final combined acceptance.

Current timed cardinalities are **0/1/6/10**, for stations, structures and planets. Six planets represents a fully trained ordinary pilot;10PI planets is explicit stress. The unchanged historical harness contains a generic limit mentioning50PI planets, but no50planet lane ran in this continuation. Earlier a27 evidence at0/50/200ms and0/1/10/50 remains historical; it is not relabeled as9afa evidence.

The pool starts at most4local operations and drains accepted siblings before surfacing an unexpected failure. Existing expected-error catches still retain each failed item and continue. Core closing retains accepted work and nested semantic writes; it does not cancel the dataset or prematurely close ESI. No new scheduler/cache/lifecycle owner was added.

Remaining work after adoption: verify the integrated source (including other concurrent approved changes), keep these adverse rows in final populated/independent gates, and freeze/package only after all other whitepaper findings close. This narrow component decision does not close those combined gates.
