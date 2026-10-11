# Independent review: final-source all attempt 2

The attempt remains failed. All 30 workers completed successfully and all retained file, contract, source, harness and numeric bindings verify, but three empty temporary directories reappeared after recorded removal. Both strict final guards caught them and retained `complete:false`, `cleanupComplete:false` and exit failure. No acceptance is inferred from the otherwise correct results. This review did not execute Kairo, rebuild assets, rerun measurements, reconstruct logs or modify the attempt.

The independent audit verifies 75 inventoried files (73,156,256 bytes), the complete 77-file attempt set including inventory/release receipts, and all 23 harness bindings. The RC16 source `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` remain clean with complete source/assets matching their manifests. All 30 child exits are recorded zero with no timeout, signal, residual group, forced termination or log error. Both shared locks were closed without error; the release receipt correctly retains failed evidence status.

All 60 closed child log tuples match their original bytes and hashes. All retained contract/database results match the consumed results, and complete retained contract payloads match their declared bindings. Both decoded common contracts agree; the only candidate normalization removes 9,200 asserted-null session ownership fields across the eight permitted paths. All five route shapes, eight route pilots and candidate ownership IDs verify. Database response/history hashes agree across all four workers, but the original worker does not retain those underlying payloads, so their hashes cannot independently be recomputed from absent bodies.

The strict checks report exactly the same three temporary paths at both final-row and final-inventory stages. They remain empty during independent inspection:

| Row | Recorded finishedAt (UTC) | Current birth time (UTC) | Current mtime (UTC) | Inode |
| --- | --- | --- | --- | --- |
| startup-core-1-3-candidate | 08:13:38.312 | 08:13:39.754695651 | 08:13:36.650827331 | 310474 |
| startup-format-1-3-candidate | 08:13:52.758 | 08:13:54.842053474 | 08:13:52.618389188 | 310534 |
| startup-format-3-4-baseline | 08:13:59.519 | 08:14:01.305777891 | 08:13:58.765886251 | 310578 |

The runner records no separate deletion timestamp or original inode. Its removal, `stat(ENOENT)`, cleanup success and post-guards precede `finishedAt`, making that timestamp an upper bound on recorded removal. All current birth times are later, and all mtimes precede their birth times. This supports later directory recreation with older metadata; it does not identify the actor or establish a particular synchronization mechanism. Full nanosecond birth/mtime/ctime, device/inode, raw stat output and the original failed guard records are preserved in `PROVENANCE-DISCREPANCIES.json`.

The numerical audit recomputes 128 quantile values, all 212 metric values from raw outputs, 25 summary metrics and 106 matched metric pairs. Every recomputed value matches the receipt. All 48 positive paired deltas remain listed, including values below the original joint >1 ms and >10% flag. These are observations from a failed envelope, not a replacement acceptance decision:

| Metric (means of matched observations) | Baseline | Candidate | Change |
| --- | ---: | ---: | ---: |
| First Market categories | 1.807 ms | 10.881 ms | +9.074 ms / +502.25% |
| Import + construction + first Market | 349.325 ms | 230.840 ms | -33.92%; three adverse pairs remain |
| Full first formatter pair | 15.017 ms | 14.900 ms | -0.78%; five adverse pairs remain |
| Warm wallet/goal pair p50 | 0.05968 ms | 0.00746 ms | -87.50% |
| Database first open | 865.839 ms | 881.602 ms | +15.763 ms / +1.82% |
| Aged imports p50 | 470.658 ms | 566.552 ms | +95.895 ms / +20.37% |
| Aged imports max | 534.932 ms | 725.835 ms | +190.903 ms / +35.69% |
| Event insert 5,000-row batch p50 | 18.776 ms | 18.646 ms | -0.69% |
| History write 1,000-type p50 | 42.374 ms | 35.083 ms | -17.21% |

First Market is adverse beyond the existing flag in all six pairs (all three ABBA cycles). Aged imports p50 and max are adverse beyond the flag in both pairs. The event-insert max mean improves, but one pair loses 11.000 ms / 47.77%; it is retained. The cumulative startup mean also hides two flagged adverse pairs. Event index size remains 2,400,256 bytes and working history JSON remains 16,355,000 bytes in both arms; these are narrow parity rows, not whole-database size claims. Earlier write/storage costs elsewhere remain relevant. The material variance and failed cleanup envelope prevent blanket performance acceptance or isolated-cause conclusions.

Attempt bindings: receipt `e5de42621d4575ec626f92a584195452d954f22a06bd08ed54d26fc18a35db06`; artifacts `415d2a313cf3b310262a3b61ad63b3d79d88cf17628fc8b5008f66863e48f99a`; lock release `f13e5a2338d667a63d5e1b14a350108d3baffead9866305de30eb2714cfcead0`.
