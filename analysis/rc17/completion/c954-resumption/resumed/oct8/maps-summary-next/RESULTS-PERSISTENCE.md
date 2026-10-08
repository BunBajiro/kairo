# M9 eager summary metadata: persistence gate

**NOT ADOPTED. Recommend rejecting this prototype as-is.** Authoritative parity and compatibility checks pass, but ordinary mutations repeatedly cost more, dense connection notes substantially increase database size, and some write/read combinations regress. The wide-summary read win does not cancel these costs. M9 and clean RC17 remain open.

Evidence: `persistence-attempt1/completed.json`, all four raw worker reports, and `persistence-attempt1/summary.json`. The summary verifies all 13 inventoried artifacts against the completion receipt. Baseline is clean 9afa9a7197fa6b5a802e9efdaa322dedf2439150; candidate is the frozen four-file eager side-table prototype, unchanged from the first read matrix.

## Method and semantic result

A separate seed process created ten immutable closed SQLite fixtures through production storage/Auth/Universe paths. Four fresh measured processes ran baseline/candidate/candidate/baseline, each using two fresh database copies per shape (80 measured copies total). There was no forced GC or timing-path SQL/JSON observer. Full authoritative digests, output checks, storage snapshots and fixture hashing run outside operation timings. Every planned process completed, no attempt was discarded, and source/harness end verification passed.

Every cross-arm stable parity boundary passes. Initial/backfill/reopen checks compare complete authoritative records exactly. Raw SQL phases retain exact outputs and stored records. API-generated random UUID spellings remain in raw evidence; only these UUID spellings are normalized for matched cross-process parity, preserving repeated-identifier relationships, all other data and original byte counts. Seed documents contain no normalized UUIDs. Primitive legacy fallback is covered for reads/raw mutation/expiry, but is deliberately not an API-edit fixture. No provider/socket traffic occurred.

Numbers below are process medians of two fresh-copy observations, in milliseconds. Each A→B pair is reported separately; individual samples are not pooled as independent process replications. Counts differ by phase and are stated.

## Installation and reopen

First open times include production store/Auth/Universe construction plus candidate installation/backfill. They do not isolate backfill from existing startup work. Reopen uses the same populated, checkpointed database with metadata already installed. These are fresh handles, not forced cold OS caches; module import and seed copying are excluded.

| Shape | First open pair 1 A→B | First open pair 2 A→B | Reopen pair 1 A→B | Reopen pair 2 A→B |
|---|---:|---:|---:|---:|
| plain-1 | 31.634→37.051 | 46.415→50.048 | 34.742→38.183 | 31.007→31.131 |
| plain-8 | 104.411→118.651 | 102.075→108.737 | 99.485→106.166 | 102.630→96.944 |
| plain-24 | 258.586→304.619 | 248.134→287.250 | 241.180→263.292 | 254.762→257.488 |
| wide-1 | 781.221→885.546 | 771.714→878.706 | 768.270→753.531 | 762.029→881.720 |
| wide-8 | 3487.172→3850.371 | 3451.181→3640.039 | 3403.423→3575.560 | 3495.672→3457.324 |
| wide-24 | 9655.057→9975.514 | 9995.311→10128.928 | 9587.801→9658.841 | 9867.475→9487.448 |
| dense-notes-1 | 1938.245→2009.916 | 2136.082→2000.625 | 2050.190→2070.757 | 2000.869→1932.416 |
| dense-notes-8 | 15454.188→15359.487 | 16097.635→15430.823 | 14899.011→15143.949 | 16438.499→15133.594 |
| primitive-fallback-8 | 96.541→117.341 | 93.816→105.377 | 93.527→102.498 | 92.371→97.578 |
| wide-source-1 | 430.931→448.434 | 426.990→437.660 | 424.069→440.426 | 420.434→415.318 |

The existing startup path is itself costly on these populated synthetic fixtures: wide-24 takes roughly 9–10 seconds in both arms and dense-notes-8 roughly 15–16 seconds. This trial does not explain or close that existing startup cost; candidate backfill is only part of the timed construction.

## Changed writes and one-write/one-summary work

The first two columns time eight changed full-body SQL autocommit writes (window 0). The next two time four repetitions of a changed write immediately followed by a summary. There is no assumed production polling ratio. Window 1 and all other phase medians are retained in the complete table below and raw JSON.

| Shape | 8 writes pair 1 A→B | 8 writes pair 2 A→B | 4 write+summary pair 1 A→B | 4 write+summary pair 2 A→B |
|---|---:|---:|---:|---:|
| plain-1 | 0.356→10.658 | 0.306→9.580 | 5.088→12.219 | 5.125→9.960 |
| plain-8 | 0.401→10.873 | 0.447→9.685 | 15.213→19.519 | 14.695→19.422 |
| plain-24 | 0.408→10.651 | 0.396→10.492 | 43.696→47.636 | 49.301→43.781 |
| wide-1 | 20.683→291.614 | 19.902→342.119 | 117.489→154.917 | 99.427→161.254 |
| wide-8 | 41.071→242.818 | 47.639→204.866 | 324.217→121.870 | 367.030→107.796 |
| wide-24 | 47.780→246.652 | 50.476→204.131 | 1071.123→171.986 | 1160.567→148.722 |
| dense-notes-1 | 9.202→121.712 | 11.087→142.631 | 30.973→89.677 | 31.436→89.374 |
| dense-notes-8 | 19.698→194.706 | 21.570→205.193 | 242.034→385.013 | 235.660→375.615 |
| primitive-fallback-8 | 0.399→7.838 | 0.393→10.220 | 15.806→18.431 | 13.777→17.565 |
| wide-source-1 | 0.383→10.679 | 0.275→11.120 | 56.470→10.074 | 51.186→11.107 |

The mixed workload improves sharply for wide-8 and wide-24, but worsens in both pairs for plain-1, plain-8, wide-1, dense-notes-1/8 and primitive fallback. This establishes a workload-dependent tradeoff, not a universal optimization. Ordinary API edits also regress: wide-1 node save rises 61.814→118.182 / 61.202→124.049 ms, and dense-notes-8 comment-add rises 39.313→63.751 / 41.081→66.648 ms. Bulk canonical expiry costs more in every shape/pair here, including wide-24 at 721.543→867.259 / 765.480→935.699 ms.

## Storage cost

The following first-install figures are after equivalent successful TRUNCATE checkpoints. Every arm/repetition produces the same initial checkpointed size for its shape. Bytes are exact, not estimates.

| Shape | Baseline DB bytes | Candidate DB bytes | Increase | Derivative body bytes | Fallback rows / metadata rows |
|---|---:|---:|---:|---:|---:|
| plain-1 | 577,536 | 634,880 | 9.9% | 42,960 | 0 / 2 |
| plain-8 | 1,171,456 | 1,380,352 | 17.8% | 184,157 | 0 / 9 |
| plain-24 | 2,498,560 | 3,039,232 | 21.6% | 509,693 | 0 / 25 |
| wide-1 | 7,729,152 | 7,888,896 | 2.1% | 146,690 | 0 / 2 |
| wide-8 | 33,210,368 | 33,837,056 | 1.9% | 605,442 | 0 / 9 |
| wide-24 | 91,475,968 | 93,212,672 | 1.9% | 1,670,818 | 0 / 25 |
| dense-notes-1 | 3,076,096 | 5,095,424 | 65.6% | 2,001,177 | 0 / 2 |
| dense-notes-8 | 21,123,072 | 37,027,840 | 75.3% | 15,849,893 | 0 / 9 |
| primitive-fallback-8 | 1,171,456 | 1,208,320 | 3.1% | 22,789 | 8 / 9 |
| wide-source-1 | 4,177,920 | 4,292,608 | 2.7% | 101,325 | 0 / 2 |

Dense-notes-8 grows from 21,123,072 to 37,027,840 bytes (+75.3%) because metadata still stores complete connection objects and their notes: derivative bodies total 15,849,893 bytes. Dense-notes-1 grows 65.6%; wide-24 grows only 1.9%. This points to an overbroad connection projection, not proof of the cause of the separate selected-read elapsed regression. A narrower projection requires independent semantic and write/read measurements.

The raw reports also retain page count, freelist, DB/WAL/SHM size snapshots, metadata bytes, and post-mutation checkpoint sizes. WAL sizes are sampled file lengths, not total bytes written. RSS/heap before-and-after observations and cumulative maxRSS are retained without a retained-memory claim.

## Complete phase medians

All operation windows, API mutations, deletion and expiry rows follow. `count` is operations in the timed call; `firstOpen`/`reopen` each count one full construction. Exact samples, CPU, memory observations, total SQLite changes, authoritative digests and storage snapshots remain in JSON.

| Shape | Phase | Count | Pair 1 A→B ms | Pair 2 A→B ms |
|---|---|---:|---:|---:|
| plain-1 | firstOpen | 1 | 31.634→37.051 | 46.415→50.048 |
| plain-1 | reopen | 1 | 34.742→38.183 | 31.007→31.131 |
| plain-1 | raw-changed-body-write-0 | 8 | 0.356→10.658 | 0.306→9.580 |
| plain-1 | raw-changed-body-write-1 | 8 | 0.189→10.599 | 0.159→9.419 |
| plain-1 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 5.088→12.219 | 5.125→9.960 |
| plain-1 | raw-populated-source-writes | 2 | 0.095→2.877 | 0.126→2.519 |
| plain-1 | raw-map-deletes | 1 | 0.085→0.074 | 0.072→0.083 |
| plain-1 | api-node-save | 1 | 4.305→6.046 | 4.405→5.775 |
| plain-1 | api-undo-node-save | 1 | 3.340→4.881 | 3.452→4.938 |
| plain-1 | api-comment-add | 1 | 3.008→4.592 | 3.108→4.548 |
| plain-1 | api-undo-comment | 1 | 3.613→5.001 | 2.797→4.545 |
| plain-1 | api-native-import-two-nodes | 1 | 2.478→2.792 | 2.199→2.827 |
| plain-1 | api-remove-imported-map | 1 | 0.799→1.306 | 0.759→0.836 |
| plain-1 | api-summary-at-bulk-canonical-expiry | 1 | 5.945→7.911 | 5.073→7.236 |
| plain-8 | firstOpen | 1 | 104.411→118.651 | 102.075→108.737 |
| plain-8 | reopen | 1 | 99.485→106.166 | 102.630→96.944 |
| plain-8 | raw-changed-body-write-0 | 8 | 0.401→10.873 | 0.447→9.685 |
| plain-8 | raw-changed-body-write-1 | 8 | 0.298→11.000 | 0.297→9.514 |
| plain-8 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 15.213→19.519 | 14.695→19.422 |
| plain-8 | raw-populated-source-writes | 2 | 0.108→2.941 | 0.099→2.567 |
| plain-8 | raw-map-deletes | 8 | 0.182→0.294 | 0.201→0.235 |
| plain-8 | api-node-save | 1 | 2.851→4.457 | 3.018→4.212 |
| plain-8 | api-undo-node-save | 1 | 2.628→5.358 | 2.919→3.885 |
| plain-8 | api-comment-add | 1 | 2.844→4.857 | 3.185→4.230 |
| plain-8 | api-undo-comment | 1 | 2.669→4.829 | 2.836→4.405 |
| plain-8 | api-summary-at-bulk-canonical-expiry | 1 | 19.470→31.056 | 20.153→28.757 |
| plain-24 | firstOpen | 1 | 258.586→304.619 | 248.134→287.250 |
| plain-24 | reopen | 1 | 241.180→263.292 | 254.762→257.488 |
| plain-24 | raw-changed-body-write-0 | 8 | 0.408→10.651 | 0.396→10.492 |
| plain-24 | raw-changed-body-write-1 | 8 | 0.430→10.522 | 0.393→10.096 |
| plain-24 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 43.696→47.636 | 49.301→43.781 |
| plain-24 | raw-populated-source-writes | 2 | 0.133→3.443 | 0.274→2.736 |
| plain-24 | raw-map-deletes | 24 | 0.826→1.140 | 0.569→0.820 |
| plain-24 | api-node-save | 1 | 3.748→4.817 | 3.044→4.806 |
| plain-24 | api-undo-node-save | 1 | 3.738→5.493 | 2.859→4.005 |
| plain-24 | api-comment-add | 1 | 3.083→4.624 | 2.881→4.290 |
| plain-24 | api-undo-comment | 1 | 4.916→4.793 | 2.900→4.109 |
| plain-24 | api-summary-at-bulk-canonical-expiry | 1 | 70.402→90.774 | 55.430→87.773 |
| wide-1 | firstOpen | 1 | 781.221→885.546 | 771.714→878.706 |
| wide-1 | reopen | 1 | 768.270→753.531 | 762.029→881.720 |
| wide-1 | raw-changed-body-write-0 | 8 | 20.683→291.614 | 19.902→342.119 |
| wide-1 | raw-changed-body-write-1 | 8 | 17.584→293.978 | 13.963→311.603 |
| wide-1 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 117.489→154.917 | 99.427→161.254 |
| wide-1 | raw-populated-source-writes | 2 | 8.451→82.275 | 8.495→91.730 |
| wide-1 | raw-map-deletes | 1 | 1.234→2.144 | 1.202→1.485 |
| wide-1 | api-node-save | 1 | 61.814→118.182 | 61.202→124.049 |
| wide-1 | api-undo-node-save | 1 | 52.701→92.962 | 47.124→92.879 |
| wide-1 | api-comment-add | 1 | 61.513→106.922 | 61.656→111.282 |
| wide-1 | api-undo-comment | 1 | 52.127→88.504 | 48.587→82.018 |
| wide-1 | api-summary-at-bulk-canonical-expiry | 1 | 59.551→82.799 | 61.716→95.395 |
| wide-8 | firstOpen | 1 | 3487.172→3850.371 | 3451.181→3640.039 |
| wide-8 | reopen | 1 | 3403.423→3575.560 | 3495.672→3457.324 |
| wide-8 | raw-changed-body-write-0 | 8 | 41.071→242.818 | 47.639→204.866 |
| wide-8 | raw-changed-body-write-1 | 8 | 41.978→224.208 | 50.708→187.584 |
| wide-8 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 324.217→121.870 | 367.030→107.796 |
| wide-8 | raw-populated-source-writes | 2 | 8.752→55.266 | 10.113→47.277 |
| wide-8 | raw-map-deletes | 8 | 9.129→10.444 | 9.945→9.970 |
| wide-8 | api-node-save | 1 | 59.288→86.930 | 68.671→90.094 |
| wide-8 | api-undo-node-save | 1 | 55.938→73.900 | 65.761→73.307 |
| wide-8 | api-comment-add | 1 | 60.013→82.157 | 66.827→95.034 |
| wide-8 | api-undo-comment | 1 | 54.460→79.525 | 67.182→80.504 |
| wide-8 | api-summary-at-bulk-canonical-expiry | 1 | 241.746→284.056 | 253.256→266.975 |
| wide-24 | firstOpen | 1 | 9655.057→9975.514 | 9995.311→10128.928 |
| wide-24 | reopen | 1 | 9587.801→9658.841 | 9867.475→9487.448 |
| wide-24 | raw-changed-body-write-0 | 8 | 47.780→246.652 | 50.476→204.131 |
| wide-24 | raw-changed-body-write-1 | 8 | 45.491→209.940 | 41.281→192.649 |
| wide-24 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 1071.123→171.986 | 1160.567→148.722 |
| wide-24 | raw-populated-source-writes | 2 | 8.991→49.818 | 8.521→47.409 |
| wide-24 | raw-map-deletes | 24 | 26.868→28.327 | 24.424→26.990 |
| wide-24 | api-node-save | 1 | 55.883→84.851 | 69.218→81.328 |
| wide-24 | api-undo-node-save | 1 | 59.502→74.299 | 56.820→80.952 |
| wide-24 | api-comment-add | 1 | 71.408→90.693 | 70.602→101.836 |
| wide-24 | api-undo-comment | 1 | 58.065→77.125 | 59.527→86.413 |
| wide-24 | api-summary-at-bulk-canonical-expiry | 1 | 721.543→867.259 | 765.480→935.699 |
| dense-notes-1 | firstOpen | 1 | 1938.245→2009.916 | 2136.082→2000.625 |
| dense-notes-1 | reopen | 1 | 2050.190→2070.757 | 2000.869→1932.416 |
| dense-notes-1 | raw-changed-body-write-0 | 8 | 9.202→121.712 | 11.087→142.631 |
| dense-notes-1 | raw-changed-body-write-1 | 8 | 9.664→117.739 | 8.960→113.213 |
| dense-notes-1 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 30.973→89.677 | 31.436→89.374 |
| dense-notes-1 | raw-populated-source-writes | 2 | 0.233→5.666 | 0.155→5.097 |
| dense-notes-1 | raw-map-deletes | 1 | 1.097→1.136 | 0.788→1.127 |
| dense-notes-1 | api-node-save | 1 | 42.231→59.533 | 46.669→57.043 |
| dense-notes-1 | api-undo-node-save | 1 | 35.516→51.057 | 34.969→55.189 |
| dense-notes-1 | api-comment-add | 1 | 43.256→66.603 | 41.818→63.024 |
| dense-notes-1 | api-undo-comment | 1 | 38.444→54.360 | 34.003→51.006 |
| dense-notes-1 | api-summary-at-bulk-canonical-expiry | 1 | 25.641→39.268 | 27.274→47.868 |
| dense-notes-8 | firstOpen | 1 | 15454.188→15359.487 | 16097.635→15430.823 |
| dense-notes-8 | reopen | 1 | 14899.011→15143.949 | 16438.499→15133.594 |
| dense-notes-8 | raw-changed-body-write-0 | 8 | 19.698→194.706 | 21.570→205.193 |
| dense-notes-8 | raw-changed-body-write-1 | 8 | 22.882→195.051 | 23.054→181.429 |
| dense-notes-8 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 242.034→385.013 | 235.660→375.615 |
| dense-notes-8 | raw-populated-source-writes | 2 | 0.189→12.397 | 0.170→15.898 |
| dense-notes-8 | raw-map-deletes | 8 | 6.790→14.465 | 6.041→15.764 |
| dense-notes-8 | api-node-save | 1 | 42.630→61.403 | 36.996→71.541 |
| dense-notes-8 | api-undo-node-save | 1 | 38.340→57.349 | 39.887→54.654 |
| dense-notes-8 | api-comment-add | 1 | 39.313→63.751 | 41.081→66.648 |
| dense-notes-8 | api-undo-comment | 1 | 36.913→53.621 | 45.034→55.545 |
| dense-notes-8 | api-summary-at-bulk-canonical-expiry | 1 | 203.037→302.759 | 206.480→348.759 |
| primitive-fallback-8 | firstOpen | 1 | 96.541→117.341 | 93.816→105.377 |
| primitive-fallback-8 | reopen | 1 | 93.527→102.498 | 92.371→97.578 |
| primitive-fallback-8 | raw-changed-body-write-0 | 8 | 0.399→7.838 | 0.393→10.220 |
| primitive-fallback-8 | raw-changed-body-write-1 | 8 | 0.311→7.570 | 0.300→7.722 |
| primitive-fallback-8 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 15.806→18.431 | 13.777→17.565 |
| primitive-fallback-8 | raw-populated-source-writes | 2 | 0.117→2.922 | 0.099→2.749 |
| primitive-fallback-8 | raw-map-deletes | 8 | 0.205→0.214 | 0.177→0.228 |
| primitive-fallback-8 | api-summary-at-bulk-canonical-expiry | 1 | 21.201→26.654 | 17.622→26.857 |
| wide-source-1 | firstOpen | 1 | 430.931→448.434 | 426.990→437.660 |
| wide-source-1 | reopen | 1 | 424.069→440.426 | 420.434→415.318 |
| wide-source-1 | raw-changed-body-write-0 | 8 | 0.383→10.679 | 0.275→11.120 |
| wide-source-1 | raw-changed-body-write-1 | 8 | 0.185→10.381 | 0.195→9.482 |
| wide-source-1 | raw-changed-body-write-plus-summary-1-to-1 | 4 | 56.470→10.074 | 51.186→11.107 |
| wide-source-1 | raw-populated-source-writes | 2 | 6.315→66.101 | 6.432→63.715 |
| wide-source-1 | raw-map-deletes | 1 | 0.067→0.063 | 0.073→0.064 |
| wide-source-1 | api-node-save | 1 | 3.804→4.365 | 3.520→4.624 |
| wide-source-1 | api-undo-node-save | 1 | 3.235→4.427 | 3.425→4.459 |
| wide-source-1 | api-comment-add | 1 | 5.541→4.275 | 6.269→4.434 |
| wide-source-1 | api-undo-comment | 1 | 2.903→4.931 | 2.908→4.323 |
| wide-source-1 | api-summary-at-bulk-canonical-expiry | 1 | 31.222→38.216 | 30.287→33.233 |

## Limits and disposition

This gate covers bounded synthetic documents, production synchronous service calls, a two-node native import/remove, ordinary undo and canonical expiry. It does not cover a historic user database, first-ever empty startup, full/dense import, background tracking write frequency, concurrent lock contention/duration, or long-term retained memory. UUID normalization is narrowly documented and does not replace raw exact receipts. No percentile, significance, user-visible browser latency or universal workload claim follows from two process replications per arm.

The first read matrix and fixed dense confirmation remain separate evidence. No source is integrated from this trial, and no PR/release is readied. Connection projection refinement and avoiding eager full-document SQL work on every write are possible follow-ups, not accepted fixes.
