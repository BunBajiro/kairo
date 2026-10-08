# Names protocol trial: interim evidence

Status: semantic, diagnostic and ordinary backend measurements completed; compiled-browser races and combined integration remain open. This is not an adoption/closure claim or Clean RC17 release. PR #10 stays withdrawn.

The isolated comparison is exact227 plus the accepted hidden saved-binding filter, with only the six-file names protocol proposal differing. It excludes the later Assets boundary. Source manifests, proposal hashes and independent static review are beside this report. The initial unexecuted proposal and both reviewer-discovered ordering gaps are preserved under `initial-review-proposal` and described in `INDEPENDENT-REVIEW.md` / `PLAN.md`.

## Completed gate

`semantic-attempt1`: **75/75 tests pass**, including all20 new Core/owner tests and existing SSE backpressure, scoped refresh, resource state, dataset generation, lifecycle, UI revision and hidden-binding tests. Runtime3.55s. No build or compiled dashboard execution is implied by these tests.

`counts-attempt1`: both arms passed all12 cases:100/1,000/10,000/20,000 names ×0/1/3 consumers. Actual Core/Store/SSE implementations ran with synthetic immediate ESI responses. All source/harness guards passed. Reconstituted names plus snapshot data/metadata/revision counters match across arms; random process epoch prefixes and intentional wire envelope differences are the only normalizations. Every admitted burst calls the four expected Wallet endpoints. Zero consumers encode no snapshots or directories.

| 20,000 names; bytes per client | Baseline | Candidate |
| --- | ---: | ---: |
| Two unchanged four-snapshot bursts | 4,402,554 | 2,930 |
| Two bursts, each following one name change | 4,402,602 | 1,103,120 |
| First SSE directory bootstrap | 0 | 550,089 |
| Names + snapshots part of full `/state` | 553,498 | 553,556 |

The aligned original directory alone is550,001 JSON bytes. Three consumers receive the same per-client bytes shown above. Changed-directory encoding is once per snapshot boundary audience: eight individual `rememberNames` calls before each of two bursts produce two total directory encodes, eight snapshot encodes and no embedded names in candidate snapshots. The baseline embeds the full map in all eight snapshots. A new connection receives a separate full map and does not mark existing clients current.

The additional550KB connection bootstrap is an explicit startup/reconnect cost alongside HTTP state, not a free optimization. First-connect timings will have only1/3 correlated observations per process; reconnect timing reports the full audience operation but stored per-client bytes describe its final repetition. Those limitations are recorded in the harness.

The table above contains deterministic counter/transport observations. The separate ordinary backend measurements follow; they do not establish browser performance. Compiled initial-open/error/remount wiring, actual Core browser publication, process reset/reconnect, selected-pilot independence and late-state acceptance remain required before adoption. The final integrated source must include the Assets boundary and retain the two adverse hidden-filter cases from the prior lane.


## Ordinary backend ABBA

`abba-attempt1` contains four fresh ordinary processes,12 cases each, with no stringify wrappers or frame retention inside measured publication operations. Every source/harness guard and matched application-domain comparison passed. All rows, four process medians/p95 and both nearest AB/BA pairs remain in `summary.json`; no adverse result was removed.

At20,000 names and one UI consumer, the mean of the two process medians is:

| Actual Core operation | Baseline ms | Candidate ms |
| --- | ---: | ---: |
| Unchanged four-snapshot burst |20.317|0.464|
| One persisted name change + burst |27.298|11.100|
| Eight persisted changes + burst |70.418|47.227|
| First connection |0.038|4.836|
| Reconnect |0.002|5.128|
| Full state names + snapshots serialization |4.962|4.991|

First connection/reconnect now do additional work and are slower: the full map is an intentional additional startup/connection cost. This crosses the repeated >1ms/>10% criterion at10k/20k with1/3 consumers. First-connect samples are only1/3 correlated client observations within a process; they are not a reliable latency distribution. Browser startup cost remains open.

One adverse same-operation row needs to remain visible:20,000 names, zero clients, eight persisted changes + burst increases36.862→41.945ms (+5.084ms/+13.79% mean of medians). Its nearest pairs are+3.097ms/+8.40% and+7.071ms/+19.18%; it does not cross >10% in both pairs, but that does not establish a cause or dismiss the increase. No causal attribution or optional replacement rerun has been made. Pin this row in final combined acceptance or a coordinator-approved follow-up. All other same-operation mean-median increases are below1ms. Short within-process p95 rows are preserved without converting them into independent-run evidence.

The backend evidence supports continuing to compiled protocol acceptance. It cannot close the finding or approve integration on its own.
