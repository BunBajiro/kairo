# M9 persisted summary inputs: first read matrix

**NOT ADOPTED.** The first read matrix supports substantially faster wide-map summaries, but records an unresolved repeated regression in dense selected reads. The original adverse observations remain acceptance evidence; a later confirmation must be reported separately. M9 and clean RC17 remain open, and PR #10 remains withdrawn.

This report derives only from [`matched-attempt1/completed.json`](matched-attempt1/completed.json) and [`matched-attempt1/summary.json`](matched-attempt1/summary.json). The run completed on 8 October 2026 at 08:41:52 UTC. The completion receipt verifies source/harness stability; the derived summary records verification of 28 raw artifact hashes. Both timing families used fresh-process ABBA order, with two process observations per arm. No result below comes from diagnostic timings.

## Source and semantic boundary

- Baseline: clean `9afa9a7197fa6b5a802e9efdaa322dedf2439150`, fingerprint `27c7677624e713a0b4eea157194f9aae79194fe3386c9f4bb77a0a57d9a2e8c2`.
- Candidate: the same commit plus the isolated four-file prototype, fingerprint `a5ef9b76567db7aff307a613838ed294d81f4815cdf4fb5d4ce86e7db5bde83a`. This is not the combined continuation candidate or a release build.
- All 15 mutation/access phases preserve output, complete authoritative records and authoritative map-write counts. The 12 unchanged phases make zero writes in both arms. The three cleanup phases retain one authoritative map write each; candidate totals add two derivative-row changes per map write, explicitly audited in the completion receipt.
- All 27 summary-family diagnostic cases retain output parity. The original selected-map equivalence fixture also has identical bytes and SHA-256 (`5064dfaae3e14d49957e6d37c7f3772cb036d7c3f382a84f192848e7f92a8968`), with no field, array-order or property-order differences.

## Ordinary service medians

Values are milliseconds, shown to six decimal places; full recorded precision and every sample range remain in the linked JSON. Columns A1/B1 and A2/B2 are matched process medians, not pooled medians. The summary family has five ordinary samples per case/process (540 total); the Maps family has seven (588 total). Serialization was measured separately.

| Summary-family case | A1 baseline | B1 candidate | A2 baseline | B2 candidate |
|---|---:|---:|---:|---:|
| plain/1/summary | 0.716902 | 0.835292 | 0.987181 | 0.936965 |
| plain/1/selected | 1.505122 | 1.368497 | 2.026089 | 1.695810 |
| plain/1/full | 1.499204 | 1.387084 | 1.422027 | 1.278260 |
| plain/8/summary | 3.119029 | 3.364770 | 3.765394 | 3.650321 |
| plain/8/selected | 1.213623 | 1.195425 | 1.414376 | 1.443229 |
| plain/8/full | 9.523849 | 9.725594 | 11.777190 | 10.359500 |
| plain/24/summary | 9.223675 | 8.785475 | 9.572552 | 8.368664 |
| plain/24/selected | 1.219722 | 1.198740 | 1.171579 | 1.220403 |
| plain/24/full | 21.089952 | 22.164615 | 25.728291 | 22.978497 |
| wide/1/summary | 8.856261 | 0.920200 | 8.787776 | 0.820048 |
| wide/1/selected | 16.343625 | 14.777351 | 11.729859 | 13.968901 |
| wide/1/full | 16.984593 | 15.536537 | 16.541744 | 16.023413 |
| wide/8/summary | 73.216422 | 4.587776 | 76.810830 | 4.836713 |
| wide/8/selected | 13.183374 | 11.610680 | 12.862008 | 11.157165 |
| wide/8/full | 155.633502 | 134.372074 | 134.865298 | 163.587108 |
| wide/24/summary | 241.709623 | 14.831634 | 255.017746 | 16.975659 |
| wide/24/selected | 11.651863 | 10.912166 | 11.476777 | 13.143953 |
| wide/24/full | 446.081189 | 454.955435 | 448.350086 | 485.989194 |
| roster/1/summary | 0.818616 | 0.759667 | 0.692846 | 0.728210 |
| roster/1/selected | 4.514446 | 4.549889 | 4.406493 | 4.504811 |
| roster/1/full | 4.682459 | 4.907930 | 4.460234 | 4.643040 |
| roster/8/summary | 3.955182 | 3.675510 | 3.522398 | 3.591433 |
| roster/8/selected | 4.145719 | 4.467836 | 4.197768 | 4.537961 |
| roster/8/full | 18.243184 | 17.667664 | 17.924813 | 18.873002 |
| roster/24/summary | 10.894859 | 10.672473 | 11.224367 | 10.310316 |
| roster/24/selected | 4.217058 | 4.496939 | 4.914700 | 4.356427 |
| roster/24/full | 46.958780 | 48.501246 | 54.483439 | 49.375663 |

Wide summary reductions are 89.61%/90.67% for one map, 93.73%/93.70% for eight maps and 93.86%/93.34% for 24 maps. Ordinary plain/roster summaries have much smaller or mixed differences. Selected/full outputs still require complete documents.

| Original Maps case | A1 baseline | B1 candidate | A2 baseline | B2 candidate |
|---|---:|---:|---:|---:|
| independence-selected-1-maps | 1.687117 | 2.197558 | 1.289597 | 2.003645 |
| independence-list-1-maps | 2.324269 | 1.840289 | 1.320093 | 1.864955 |
| independence-summaries-1-maps | 0.529329 | 0.594678 | 0.473866 | 0.521778 |
| independence-selected-8-maps | 2.642059 | 1.705786 | 1.294995 | 2.048202 |
| independence-list-8-maps | 13.148011 | 12.317808 | 9.766836 | 13.120559 |
| independence-summaries-8-maps | 3.128223 | 3.001411 | 3.101102 | 3.528026 |
| independence-selected-24-maps | 1.492383 | 1.852978 | 1.338251 | 1.373664 |
| independence-list-24-maps | 30.588602 | 34.471926 | 34.864999 | 32.596024 |
| independence-summaries-24-maps | 9.646845 | 9.759505 | 11.477318 | 11.877723 |
| constant-links-list-1-maps | 5.851134 | 6.369116 | 5.149865 | 4.333944 |
| constant-links-summaries-1-maps | 2.495658 | 2.810764 | 2.803883 | 2.461957 |
| constant-links-list-8-maps | 6.143465 | 6.546704 | 6.787247 | 5.794228 |
| constant-links-summaries-8-maps | 2.631913 | 2.762571 | 3.167712 | 2.715480 |
| constant-links-list-24-maps | 9.063404 | 11.403808 | 10.528587 | 9.827788 |
| constant-links-summaries-24-maps | 3.375286 | 3.217848 | 4.949123 | 3.393493 |
| dense-selected-0-signatures-100-links | 0.935853 | 0.946519 | 0.958037 | 1.231299 |
| dense-selected-0-signatures-1000-links | 5.534256 | 6.062283 | 10.450478 | 7.011116 |
| dense-selected-100-signatures-100-links | 1.371250 | 1.942502 | 2.221364 | 1.614147 |
| dense-selected-100-signatures-1000-links | 6.674898 | 7.891394 | 8.413012 | 10.914508 |
| dense-selected-1000-signatures-100-links | 4.722871 | 6.010605 | 5.649560 | 5.513304 |
| dense-selected-1000-signatures-1000-links | 10.074971 | 10.682399 | 14.674476 | 13.713355 |

## Adverse observations retained

**Dense selected, 100 signatures / 1,000 links:** service medians increase by **1.216496 ms (+18.22494%)** and **2.501496 ms (+29.73366%)**. This is the sole row exceeding both the predeclared >10% and >1 ms investigation threshold in both matched pairs. Baseline sample ranges are 6.033990–10.285830 ms and 5.975032–12.088803 ms; candidate ranges are 5.921150–21.396208 ms and 9.506944–14.675237 ms. Overlapping ranges do not erase the repeated median signal.

The same row also has slower serialization: **3.384610→4.098929 ms** (+0.714319 ms, +21.10491%) and **3.142704→3.575228 ms** (+0.432524 ms, +13.76280%). These serialization changes fall below the absolute 1 ms investigation threshold, but remain adverse observations.

Other unfavorable rows remain visible in the tables and raw serialization records. In particular, wide/24/full rises **446.081189→454.955435 ms** and **448.350086→485.989194 ms** (+8.874246/+37.639108 ms; +1.98938%/+8.39503%). Wide/8/full has a mixed first pair and a +28.721810 ms (+21.29666%) second pair; wide/1/selected and wide/24/selected also have material second-pair slowdowns. None is declared harmless merely because it misses the repeated combined threshold. No serialization row exceeds both threshold components in both pairs.

The fixed follow-up in [`TARGETED-DENSE-PLAN.md`](TARGETED-DENSE-PLAN.md) retains the original six dense cases, four additional matched process pairs and separate untimed work counters. Its results must neither overwrite nor retrospectively invalidate this first matrix. Possible predicate/inlining or constructor/write-time cache/GC effects remain hypotheses until separate causal evidence exists.

## What the diagnostics establish

For the 24-wide-map summary diagnostic, JavaScript map parsing falls from **85,714,734 to 1,593,786 characters**, and total JSON parsing from **86,482,404 to 2,361,456 characters**. Descriptor output remains **7,332 bytes**. Both arms perform zero map serialization in this diagnostic. These counts explain reduced JavaScript work; they are not elapsed-time measurements or evidence of lower retained memory.

The candidate steady summary SQL has no JSON projection function opcodes. The retained bytecode branches over the authoritative `body` column read when a non-null compact input exists (`NotNull` at address 24 skips address 25). The query still reads parent identity/order and uses a temporary B-tree for the final ordering term. This is evidence about the SQL execution path, not proof of zero parent-table page/overflow IO or one decode during write-time projection.

## Remaining decision gates

This read matrix does not measure first installation/backfill, ordinary writes/deletes, write/read ratios, SQLite/WAL/SHM growth, concurrent lock hold time, historical populated startup or retained process memory. Those costs are decisive for an eager side table and are handled separately. Connections, activity and pilots remain in compact bodies; dense connection notes and fallback documents can remain expensive.

The two process observations per arm do not justify percentile, statistical-significance or universal user-latency claims. This is synthetic service work on Node v24.19.0 / AMD EPYC 9V74, without provider traffic or HTTP/browser rendering. The first read matrix is complete internal evidence; it supplies no adoption, M9 closure or clean RC17 acceptance by itself.
