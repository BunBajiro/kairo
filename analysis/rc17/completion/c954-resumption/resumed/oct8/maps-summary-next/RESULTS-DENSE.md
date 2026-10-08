# M9 dense selected follow-up

**NOT ADOPTED; original adverse observations retained.** The exact originally adverse 100-signature/1,000-link case does not repeat the combined >10% and >1 ms threshold in any of the four additional matched pairs. Three pairs remain slower, and the original two-pair +18.2%/+29.7% result is not erased. This is a narrower, nonrepeating signal in the fixed confirmation, not proof that selected reads are unaffected.

The predeclared `TARGETED-DENSE-PLAN.md` was frozen before execution. Evidence is `dense-confirmation-attempt1/completed.json` and its per-process raw files. The exact original timing harness ran all six dense cases in eight fresh processes, three warmups plus seven ordinary samples per case, with A/B and B/A process order and forward/reverse case order balanced. Two additional instrumented processes supplied diagnostic counts only. The full fixed schedule completed; no adaptive retries, GC/CPU profiles, or source ablations were run. Source and harness end verification passed.

## Retained-log integrity gap

A subsequent post-run audit found that all non-log measurement/source artifacts match the completed inventory, but two retained logs do not match all their earlier hashes. `A2.log` is 200 bytes and matches its final inventory entry, but differs from its child completion hash. `B4.log` is 244 bytes versus 478 bytes in the final inventory and differs from both earlier hashes. Cause is unknown; neither file was edited by this lane. Original receipts and partial logs are preserved, and `post-run-integrity-audit.json` records exact expected/observed hashes and the observed partial log text. No log reconstruction or rerun was performed. This report uses verified JSON measurement artifacts and explicitly does not claim that every raw artifact verifies.

## Service medians

Values are baseline→candidate milliseconds for each process pair. The last column counts pairs exceeding both >10% and >1 ms. Full sample ranges remain in the receipt.

| Signatures / links | Pair 1 | Pair 2 | Pair 3 | Pair 4 | Material adverse pairs |
|---|---:|---:|---:|---:|---:|
| 0 / 100 | 1.905→1.885 | 1.027→0.962 | 0.958→1.307 | 1.682→1.753 | 0 |
| 0 / 1000 | 10.155→10.831 | 10.730→10.989 | 7.371→10.474 | 10.290→9.785 | 1 |
| 100 / 100 | 1.643→1.597 | 2.214→2.078 | 1.589→2.119 | 1.762→1.560 | 0 |
| 100 / 1000 | 6.269→6.700 | 6.577→7.206 | 7.780→7.693 | 6.265→7.116 | 0 |
| 1000 / 100 | 5.124→6.325 | 5.438→5.466 | 5.430→6.395 | 5.752→5.543 | 1 |
| 1000 / 1000 | 11.356→12.705 | 14.930→14.658 | 17.913→15.543 | 10.381→11.397 | 1 |

The 0/1000, 1000/100 and 1000/1000 rows each have one threshold-exceeding pair. No row exceeds it in multiple confirmation pairs. This does not retrospectively change the first matrix disposition or establish a statistical effect size.

## Serialization medians

| Signatures / links | Pair 1 | Pair 2 | Pair 3 | Pair 4 | Material adverse pairs |
|---|---:|---:|---:|---:|---:|
| 0 / 100 | 0.516→0.557 | 0.400→0.411 | 0.432→0.442 | 0.416→0.388 | 0 |
| 0 / 1000 | 2.987→3.514 | 3.221→3.458 | 3.093→2.902 | 3.108→3.325 | 0 |
| 100 / 100 | 0.721→0.794 | 1.135→0.749 | 0.932→0.804 | 0.761→0.819 | 0 |
| 100 / 1000 | 3.271→3.433 | 3.248→3.389 | 3.395→3.892 | 3.216→3.374 | 0 |
| 1000 / 100 | 4.268→4.556 | 4.081→4.430 | 4.323→4.903 | 4.250→4.212 | 0 |
| 1000 / 1000 | 6.309→7.292 | 6.305→6.501 | 7.150→6.926 | 5.986→6.472 | 0 |

## Actual work diagnostics

For every case, both arms have identical complete output SHA-256 and output bytes, identical SQL call/row/transferred-byte counts, identical actual application JSON parse/stringify call/character counts, and zero writes. The observer excludes its own JSON parsing. Each arm makes 27 observed SQL calls and four JSON stringify calls totaling 2,384 characters. These instrumented runs supply counts, not elapsed evidence.

| Signatures / links | SQL rows | SQL JSON bytes | JSON parse calls | JSON parse characters |
|---|---:|---:|---:|---:|
| 0 / 100 | 104 | 110,850 | 106 | 113,234 |
| 0 / 1000 | 1,004 | 744,450 | 1,006 | 746,834 |
| 100 / 100 | 204 | 160,732 | 206 | 163,116 |
| 100 / 1000 | 1,104 | 794,332 | 1,106 | 796,716 |
| 1000 / 100 | 1,104 | 611,633 | 1,106 | 614,017 |
| 1000 / 1000 | 2,004 | 1,245,233 | 2,006 | 1,247,617 |

Matching observable work does not exclude JIT/inlining, GC, native SQLite cache or constructor/write-time side effects. It also does not identify one as the cause. The extracted cleanup predicate and side-table setup/write effects remain hypotheses only. Separate causal profiling/ablation would need its own frozen source and runtime grant.

Persistence is a separate blocker: `RESULTS-PERSISTENCE.md` records repeated ordinary edit costs and dense-note storage amplification. The root disposition is to reject eager write-time projection as-is with no integration. The fixed confirmation supplies no M9 closure or clean RC17 acceptance.
