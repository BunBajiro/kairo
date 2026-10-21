# Market recovery and focused edge-case checkpoint

Status: **focused run complete; corrections independently reviewed and combined Build97 verified**. Work is on `review/0.8.0-rc-premerge-bug-review`, draft PR #12, version `0.8.0-rc.17`. This follows the Jita full-scan report after Build93. It does not reopen the historical final audit or establish release readiness.

## Findings and evidence

| ID | Failure and correction | Owning evidence |
| --- | --- | --- |
| MR-01 | Otherwise valid exhausted orders with zero duration stopped the scan. Permit zero duration only when remaining volume is zero; exhausted rows still do not contribute price/depth. | [Owner baseline/review](market-recovery-evidence/owner-verification.json): duration baseline 4 fail/10 pass; independent integrated gate 35/35. |
| MR-02 | Malformed responses stopped scanning and could remain cached. Validate before cache publication and retry only the affected order page within the job budget. | Same owner receipt: ESI baseline 22 fail/1 pass; independent gate 63/63. [Build94](BUILD94-VERIFICATION.json) verifies the MR-only checkpoint. |
| EC-01 | Malformed SSO discovery poisoned its hour-long cache. Validate required metadata before caching. | [Runtime review](market-recovery-evidence/runtime-edge-verification.json): before 6 fail/7 pass; independent Auth gate 32/32. |
| EC-02 | A fresh feed response without ETag inherited a stale validator. Inherit it only for HTTP 304. | [Feed review](market-recovery-evidence/feed-validator-review.json): before 1 fail/1 pass; owner 30/30, independent 26/26. |
| EC-03 | Cancelled reads still dispatched after waiting for ESI admission. Recheck consumer eligibility at dispatch boundaries while preserving eligible shared consumers. | Runtime review: before 7/7 fail; independent ESI gate 70/70. |
| EC-04 | Invalid wallet values replaced good saved balances. Require finite numeric responses, preserving valid zero/negative balances. | Runtime review: before 5/5 fail; independent gate 14/14. |
| EC-05 | A pilot starting during a pending shared packet could be omitted while the cursor advanced. Refresh target ownership and bound repeat acceptance. | [Session-owner review](market-recovery-evidence/session-owner/review.json): both failing boundaries retained; owner 43/43, independent 24/24. |
| EC-06 | Malformed successful local-API JSON was published or treated as a save acknowledgement. Reject syntax failures through existing owner recovery. | [Response review](market-recovery-evidence/response-boundary/review.json): before 3 fail/1 pass; owner and independent 15/15. |
| EC-07 | A delayed manual-protection acknowledgement left remounted policy editors stale; overlapping policy saves could release protection. Synchronize manual display and use a strict policy-only command preserving current stored manual intent. | [Policy review](market-recovery-evidence/opsec-policy/review.json): native before 1 pass/8 fail; owner and independent 15/15. Browser failures retained below. |
| EC-08 | Older accepted OBS settings overwrote newer settings after navigation. Serialize accepted writes across editor remounts. | [Build95 baseline](market-recovery-evidence/ui-baseline95.json): four durable-order failures; Build96 passes all 36 owner checks. Source independently reviewed. |
| EC-09 | Older accepted Session details overwrote newer details after closing/reopening a report. Serialize accepted writes per Session and clean up idle queue entries. | [Session-save review](market-recovery-evidence/session-save-review.json): Build96 four failures/28 healthy controls; fixed source independently reviewed. |

MR-01's public Jita witness and schema support the correction; the original reported response bytes were unavailable, so the exact original offending row is not proved. Recovery permits **two extra order-page attempts across the whole job**, including comparison hubs, with at most **60 seconds of recovery waiting** and provider cooldowns respected. Cancellation, shutdown, disabled Markets and lost access stop recovery. Pages stage once; only complete books replace prior data. Commands are not automatically retried.

## Verification and scope

[Build97](BUILD97-VERIFICATION.json) binds the combined result to source `0eece9d7d5f60f0246dbfda89b5cb4f55e576979`, tree `3349f0b083bb9df8a88fc99f3f4fb36ade8d3d10`. Its browser artifact passes **72/72 cases and 864/864 checks** across Chrome/Firefox at 1600/390 pixels, with no browser errors or unexpected browser/server requests. All 52 hosted steps pass, including 3,181 regression-browser checks, 16 packaging controls and 1,349 runtime tests. The independently downloaded package matches source and separately passes 1,349/1,349 extracted-runtime tests.

The [independent comparison](market-recovery-evidence/build97-ui-comparison.json) preserves all 804 Build96 scenario checks, adds 56 rejected/unreadable-acknowledgement checks, and verifies four global controls. All 16 product-failure assertions from each of Builds95/96 now pass. [Build96](market-recovery-evidence/ui-baseline96.json) retains the overlapping-policy and Session failures. Build95's four Session selector stops remain fixture limits, not product evidence; neither baseline run is an accepted package. Expected fixture times/job IDs and captured pre-failure state vary between runs; assertions were not weakened.

Additional reviewed controls cover [Markets/Imports](market-recovery-evidence/market-imports-review.json), runtime/lifecycle (93/93), Universe (132/132), and launch rollback/duplicate supervisor/restart from paths with spaces/non-ASCII characters. The earlier [combined runtime](market-recovery-evidence/combined-runtime.json) retains its explicit compiled-client fixture limit. Before/fixed/independent evidence remains intact.

OBS/Session queue acceptance covers one dashboard lifetime, not cross-tab or restart guarantees. Real Windows/DPAPI, live EVE permissions/SSO/structures, actual OBS output, extended play and broad native/narrow-screen usability remain outside these automated checks. Request/queue bounds do not establish new elapsed-performance measurements.

## Durable continuation ledger

| Bank | Completed unit |
| --- | --- |
| [`02646da`](https://github.com/BunBajiro/kairo/commit/02646da850cda876ebe5d06931b94e6338082a07) | Starting handoff after historical Build93. |
| [`cde4723`](https://github.com/BunBajiro/kairo/commit/cde4723e47cbf7cf43be7eb4ce7885771d99103c) | MR-01/02 and their independently verified Build94 checkpoint. |
| [`5ee71a7`](https://github.com/BunBajiro/kairo/commit/5ee71a7c7aa22fffc19788492e8370f551bfcebf) | EC-02 correction and review. |
| [`0289e83`](https://github.com/BunBajiro/kairo/commit/0289e83ef1c1ea5d6362c5e2cf0b76a03f6cd375) | EC-01/03/04 and Markets/Imports controls. |
| [`1f0a11c`](https://github.com/BunBajiro/kairo/commit/1f0a11c4a627b1c7dc2a0ad21897b47cab215828) | EC-05 and initial unchanged-product UI probes. |
| [`6ed58f4`](https://github.com/BunBajiro/kairo/commit/6ed58f498a820b27d7b65b63087ae9994fd04dc7) | Build95 baseline and combined runtime evidence. |
| [`214f30b`](https://github.com/BunBajiro/kairo/commit/214f30b669794541f9d9e9bdbe7c2311fcda1fe6) | EC-06/08, initial EC-07 display correction, Build96 baseline. |
| [`11f0f2a`](https://github.com/BunBajiro/kairo/commit/11f0f2a3299c81a8b7f291c484fcf0a36c994105) | User's staged audit-planning direction. |
| [`0eece9d`](https://github.com/BunBajiro/kairo/commit/0eece9d7d5f60f0246dbfda89b5cb4f55e576979) | Final EC-07/09 corrections, independent reviews and Build97 executable source. |

This ledger, completed receipt and [audit-planning handoff](AUDIT-PLANNING-HANDOFF.md) form the documentation-only continuation bank after the exact executable source above. Use the commit permalink supplied in PR #12/the chat to recover it. Next action: take the handoff into a new planning chat. The next chat plans the comprehensive audit; a later chat executes it. That handoff owns the robust/performance recovery, configurable diagnostics and integrated application-toast requirements, excluding stream toasts. Release progression is paused. Main, merge, version, tag, publication and PR-ready actions remain unauthorized.
