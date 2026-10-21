# Market scan recovery follow-up

Status: **market correction banked; Build94 running; additional edge-case pass in progress**. This is the Jita full-scan follow-up reported after [Build93](BUILD93-VERIFICATION.json), not a reopening of the completed [final audit](FINAL-AUDIT.md). Work stays on `review/0.8.0-rc-premerge-bug-review`, draft PR #12, version `0.8.0-rc.17`. No main push, merge or publication is authorized.

| Finding | Evidence and correction | Acceptance |
| --- | --- | --- |
| MR-01: exhausted order rejected | Public Jita page 8 briefly contained an otherwise valid order with zero duration and zero remaining volume. Real Markets/SQLite reproduction stopped after seven pages with no promoted book. Permit zero duration only for exhausted rows, which remain excluded from price/depth. Active and otherwise malformed orders still fail validation. | Corrected; duration baseline 4 failures / 10 passes, independent integrated gate 35/35 passes. |
| MR-02: failed order response stops the scan without recovery | A malformed page stops the job; cache reuse can return the same rejected representation. Validate read responses before cache publication, reject invalid cached representations, and retry only the affected page within a shared job budget. | Corrected; real ESI baseline 22 failures / 1 pass; independent ESI gate 63/63 passes. |

The public witness and current official schema support MR-01; Bun's original response bytes were unavailable, so the exact offending row cannot be proved. The later cache generation removed the witnessed row, consistent with the successful second scan.

Recovery is limited to two extra order-page attempts across the entire job, including comparison hubs. Delays respect provider cooldowns, with at most 60 seconds of recovery waiting. Cancellation, shutdown, disabled Markets and lost access stop recovery. Validated pages stage once; only complete books replace prior data. Pagination drift, access failures and non-order work retain their existing failure boundaries. Commands are never retried by this change.

[Owner verification and retained baseline evidence](market-recovery-evidence/owner-verification.json) record exact scopes and limits. The real HTTP browser fixtures pass 3/3 locally; all 12 new Chrome/Firefox cases still require hosted execution.

## Continuation ledger

| Checkpoint | State and next action |
| --- | --- |
| `02646da850cda876ebe5d06931b94e6338082a07` | Verified starting head; Build93 remains the last accepted download and does not contain this follow-up. |
| `cde4723e47cbf7cf43be7eb4ce7885771d99103c` | Complete reviewed MR-01/02 correction and evidence bank. Tree `129ccde0bee552b531d7524bb107bf3f70dd5d41`; [Build94](https://github.com/BunBajiro/kairo/actions/runs/39524490519) is running. Hosted/package acceptance is pending. |
| `5ee71a7c7aa22fffc19788492e8370f551bfcebf` | Complete independently reviewed EC-02 correction and evidence. Combined acceptance remains pending. |
| `0289e83ef1c1ea5d6362c5e2cf0b76a03f6cd375` | Complete reviewed EC-01/03/04 corrections and four Markets/Imports recovery controls. Combined hosted/package verification remains pending. |
| Session and UI-baseline checkpoint | EC-05 complete and independently reviewed; three UI probes fully prepared against unchanged product UI. Wait for Build94 to finish before triggering the hosted baseline, to avoid cancelling its package verification. |

Owners: root integrates Markets recovery and banks checkpoints; markets_sessions owns MR-01; runtime_data owns ESI validation; docs_tests and universe independently review owner boundaries; frontend_stream verifies real scan recovery in Chrome/Firefox; packaging_ci independently verifies the new download. Preserve prior receipts and raw evidence. Update existing manuals only for changed user/developer contracts.

## Additional edge-case pass

Bun requested another pass on 21 October after this failure. Coverage is assigned to Markets/Imports (markets_sessions), Sessions/report/replay (docs_tests), Core/Auth/persistence (runtime_data), UI/Stream/Studio/OPSEC (frontend_stream), Universe (universe) and launch/package boundaries (packaging_ci). Focus on minimum-valid/empty/unexpected data, transient outages, cooldowns, partial completion, cancellation, restart/reconnection and delayed saves/navigation. Require concrete owner reproductions, before/fixed tests and independent review for new findings. Findings and disposition stay in this ledger; historical closed work remains intact.

| ID | Confirmed boundary failure | Disposition |
| --- | --- | --- |
| EC-01 | Empty SSO discovery JSON is cached for an hour, preventing recovery after the provider returns healthy metadata. | Corrected; baseline 6 fail/7 pass, independent Auth gate 32/32. |
| EC-02 | A feed HTTP 200 without ETag inherits the prior representation’s validator; a later 304 falsely refreshes different data. | Corrected; before 1 fail/1 pass, owner 30/30 and independent 26/26 pass. [Evidence](market-recovery-evidence/feed-validator-review.json). |
| EC-03 | A market read cancelled while awaiting a saturated ESI slot still dispatches; publication is prevented, but the request is wasted. | Corrected; baseline 7/7 fail, independent ESI gate 70/70. Eligible shared consumers still dispatch once. |
| EC-04 | Null/object/array wallet responses replace valid saved balances and emit ready-data events. | Corrected; baseline 5/5 fail, independent wallet/adjacent gate 14/14. Zero and negative balances remain valid. |
| EC-05 | A pilot starting while a shared live-feed packet is pending can be omitted from verification while its cursor advances. | Corrected at packet-fetch and verification boundaries; owner 43/43 and independent 24/24 pass. One repeat acceptance is allowed; further churn retains the cursor. |

[OPSEC, OBS and Session report delayed-save/navigation probes](market-recovery-evidence/browser-baseline-plan.json) are ready for hosted baseline; no finding or UI correction is claimed yet. Universe’s remaining bounded owner checks pass 132/132; live-provider/native-window/in-game checks remain outside automated coverage.

[Runtime evidence](market-recovery-evidence/runtime-edge-verification.json) binds EC-01/03/04 to source, tests and before/fixed/independent logs. [Four added Markets/Imports controls](market-recovery-evidence/market-imports-review.json) independently pass; that owner pass found no further defect. Existing runtime/lifecycle controls pass 93/93. Launcher probes against unchanged Build93 owners pass partial-start rollback, duplicate supervisor rejection and restart from paths with spaces/non-ASCII characters; native Windows/DPAPI remains a human check.

[EC-05 evidence](market-recovery-evidence/session-owner/review.json) preserves both failing boundaries, exact source equivalence and the final independent disposition. All five confirmed edge-pass backend corrections are complete; the remaining technical work is hosted UI-baseline disposition, any reproduced UI corrections, and fresh combined/package acceptance. Build94’s downloaded browser evidence already passes 40 cases / 600 checks, including 12 new recovery cases / 204 checks; its remaining package gates are still running.
