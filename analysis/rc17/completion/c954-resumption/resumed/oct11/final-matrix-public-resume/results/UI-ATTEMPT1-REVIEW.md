# Independent UI attempt 1 review

**The existing repeat-small worker result is eligible for adoption through corrected schema validation without rerunning it.** The failure is in the external owner: `ui-ci-lane.mjs:47` asserts nonexistent top-level `result.smoke === false`. The unchanged schema-2 worker writes `result.environment.smoke`, which is explicitly `false` in the raw result. This is a validation/schema defect, not evidence of an application or replay-worker failure.

The failed attempt and its receipt must remain failed and unchanged. A separate adoption receipt should bind the original raw result, failed lane receipt, outer completion/ownership records, this audit and the corrected validator/control hashes. The correction must retain all existing replay checks and change only the smoke field location. No measurement needs replacing.

## Verified evidence

All 44 completion-inventory entries, 39 closed-file pins and 155 bound inputs match their current bytes. All eight outer command drain records report no unexpected live descendants, empty final groups and no remaining children. The replay worker itself exited **0, signal null**; its external owner exited **1** on the schema assertion. All five lane owners verified the candidate source/build manifest before and after execution. This review independently rehashed all 486 source and 20 built files for candidate `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`.

| Lane | Original result |
|---|---|
| frontend-refresh | Complete; 21 checks pass |
| admin-polling | Complete; 18 checks pass |
| frontend-models | Complete; 17 checks pass; 10,000-row fixture |
| studio-stream | Complete; 10 checks pass |
| session-replay-repeat-small | Worker succeeds; owner rejects wrong schema field |
| session-replay-repeat-cap | Not run |
| session-replay-distinct-cap | Not run |

Repeat-small satisfies every replay-branch assertion after reading `environment.smoke`. It records three samples including midpoint playback, two warmup cycles and 12 measured navigation cycles, one successful SSE connection, zero renderer exceptions, zero successful external browser responses and zero denied backend fetch attempts. The 1,000-visit/200-event replay validates its 999 transitions, route hash, owner, complete coordinates, backward seek and natural end. All 15 unmounted ownership probes return zero stale Universe requests; all 14 pilot fences pass. Eight reported source subset hashes and seven fetched asset hashes match the full manifest.

Five retention checkpoints cover cycles 0/0/4/8/12. Global listener signatures remain equal, no map/replay surface remains on Overview, and warmed DOM counters remain 583 nodes/614 listeners. Final forced-GC used heap rises 597,844 bytes from the warmed baseline. This remains explicit diagnostic growth; twelve cycles do not establish absence of leaks. The three single-candidate timing samples are not matched ABBA improvement evidence.

The outer stage abort prevented its final source-after commands; this does not negate the five completed per-lane source-after guards. Do not represent the original outer attempt as complete. After banking it, recover only the two unrun cap cases under a new envelope and separate the adoption receipt from new executions.

`UI-ATTEMPT1-AUDIT.json` contains the full checked hashes, source identity, lane receipts, command drains and replay details. No application, browser, benchmark or bound harness was executed or changed during this review.
