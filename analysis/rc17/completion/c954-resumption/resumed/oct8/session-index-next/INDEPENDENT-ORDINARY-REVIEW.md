# Independent S3 ordinary evidence review

8 October 2026. Read-only post-run review by `review_m9_summary_trial`; no application, benchmark, build or test execution and no source/ledger edits. **No evidence or arithmetic blocker found. Retaining the existing S3 query/index is supported within the measured scope, with the costs below retained explicitly.**

## Integrity and pairing

Bound inputs reviewed:

- `ordinary-attempt1/completed.json`: `f6331dd888b9d4dff29430d4f4bf2cc0c2aa98cfbfc9db3eddd43a2631b89cfc`
- `ordinary-attempt1/summary.json`: `997ae19f2233c198b0d405311b43312d1bcf35ed4f091e937df38b499af040ed`
- `summarize-ordinary.py`: `45b2b636a42d78b37c2065e9549092a80624806cf6bc3b5b53d4dd0d2af861ae`

Independently checked all 24 write workers and eight real-cadence workers, both seed children, inner/outer completion receipts and their raw outputs/logs. All declared source fingerprints and roles match the exact-a7 comparison; initial/final source fingerprints match. Every worker exited zero, reports source verification, and preserves its shape's exact declared parity. Successful fixture/seed cleanup is recorded, both coordinator process groups have no live survivors, and no cleanup/inventory failure is recorded. All outer/inner artifact and child output/log hashes matched on reread: 239 checks including repeated bindings of the same files.

The summary uses the correct counterbalanced pairs, baseline worker 1 versus candidate 2 and baseline 4 versus candidate 3. Independently recomputed all **1,748 paired numeric comparisons** from raw phase/storage/cadence values, plus every cadence control object; all match. Tick-work totals sum the 41 measured collector-call durations, and p95 is the correct nearest-rank 39th observation of 41. It is not a percentile across independent process replications. Raw Node CPU fields are microseconds, not milliseconds. Source manifests and verification receipts establish the recorded trial boundary; this review does not rerun the application or its final combined source.

## Retain decision and costs

At 10,000 archives per pilot and four pilots, actual work across 41 ordinary collector ticks falls **392.30→170.61 ms** and **383.16→163.62 ms** (56.5–57.3%). Median tick work falls 6.39/6.66→1.05/1.08 ms. Both user and system CPU components are lower in both pairs. The 120-second elapsed wall window mostly consists of scheduled waits; its near-equality is not a speed result. Eligibility, provider/state and deadline controls still match.

The small 100-archive/one-pilot endpoint has essentially mixed total work: 61.00→60.37 ms and 53.27→53.47 ms; medians increase 0.49/0.46→0.60/0.50 ms. Do not claim universal improvement. Large-endpoint p95 is also mixed, **35.70→24.36 ms** and **28.95→30.39 ms**; small p95 is mixed too. Event-loop maxima are mixed, and these runs establish neither a retained-memory gain nor whole-Core idle/concurrent-dispatch performance.

Migration, writes and storage have real costs. At the largest write shape, first populated `openStore` rises **2.18→14.22 ms** and **1.64→16.15 ms**; ordinary reopen remains below 1 ms in these observations. Ending 500 inserted sessions per pilot in one transaction rises **3.47→6.95 ms** and **3.50→5.66 ms** for four pilots. End-update cost increases in both pairs at every write cardinality. Insert/checkpoint results are mixed and remain in the summary. These are batched writes, not single interactive session-end latency measurements.

Final equivalent-checkpoint DB growth ranges from **28,672 bytes** at 100/one to **1,478,656 bytes** at 10,000/four; the latter is **6,303,744→7,782,400 bytes (+23.46%)** for this fixture. Percentages are not whole-user-database estimates. WAL snapshots are not cumulative write-amplification bytes. The bounded recurring query benefit at large histories, durable semantic parity, and ordinary index ownership justify retaining the already-implemented S3 change while documenting those costs; they do not justify claiming every operation got faster.

The four interior ordinary-cadence shapes were not executed. The separate six-shape diagnostic/planner parity and six-shape write/storage matrix, combined with both real-cadence endpoints, support this bounded retention decision without inventing interior timing results. Calls await each pilot sequentially rather than reproducing Core's concurrent dispatch. Those scope limits, the mixed small/p95 observations and historical adverse write evidence must remain in the final decision. This review does not close unrelated Session report, route, archive DOM or final release gates.

## Current candidate transfer check

Compared the measured candidate manifest and frozen source bytes against both exact current commit `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` and its working tree. All **nine measured import-closure files** match byte-for-byte, including Store, SessionCombat, SessionLive, policy, travel, details, polling, market-history-store and visit-sovereignty. Both eligibility/live test references match too. `CURRENT-S3-SOURCE-REVIEW.json` records each hash. Core is **not** whole-file identical: accepted names-directory revision/delivery changes are present. Its SessionCombat construction, three-second timer dispatch block and close call are separately exact-byte identical. This supports transferring the scoped Store/collector decision to current source; it does not turn this sequential collector benchmark into a whole-Core performance result.
