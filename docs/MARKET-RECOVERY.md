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
| EC-02 correction checkpoint | Completed and independently reviewed feed-validator correction below; combined acceptance remains pending. Other edge-pass work is separate and unfinished. |

Owners: root integrates Markets recovery and banks checkpoints; markets_sessions owns MR-01; runtime_data owns ESI validation; docs_tests and universe independently review owner boundaries; frontend_stream verifies real scan recovery in Chrome/Firefox; packaging_ci independently verifies the new download. Preserve prior receipts and raw evidence. Update existing manuals only for changed user/developer contracts.

## Additional edge-case pass

Bun requested another pass on 21 October after this failure. Coverage is assigned to Markets/Imports (markets_sessions), Sessions/report/replay (docs_tests), Core/Auth/persistence (runtime_data), UI/Stream/Studio/OPSEC (frontend_stream), Universe (universe) and launch/package boundaries (packaging_ci). Focus on minimum-valid/empty/unexpected data, transient outages, cooldowns, partial completion, cancellation, restart/reconnection and delayed saves/navigation. Require concrete owner reproductions, before/fixed tests and independent review for new findings. Findings and disposition stay in this ledger; historical closed work remains intact.

| ID | Confirmed boundary failure | Disposition |
| --- | --- | --- |
| EC-01 | Empty SSO discovery JSON is cached for an hour, preventing recovery after the provider returns healthy metadata. | Real Auth baseline confirmed; runtime_data correcting. |
| EC-02 | A feed HTTP 200 without ETag inherits the prior representation’s validator; a later 304 falsely refreshes different data. | Corrected; before 1 fail/1 pass, owner 30/30 and independent 26/26 pass. [Evidence](market-recovery-evidence/feed-validator-review.json). |
| EC-03 | A market read cancelled while awaiting a saturated ESI slot still dispatches; publication is prevented, but the request is wasted. | Real four-slot baseline confirmed; consumer-aware admission correction in progress. |
| EC-04 | Null/object/array wallet responses replace valid saved balances and emit ready-data events. | Real Core/Auth/ESI baseline confirmed; narrow finite-number validation in progress. |
| EC-05 | A pilot starting while a shared live-feed packet is pending can be omitted from verification while its cursor advances. | Real Session/Combat/SQLite baseline confirmed; targeted eligibility refresh in progress. |

OPSEC, OBS and Session report delayed-save/navigation candidates require hosted browser reproduction; no finding or correction is claimed yet. Universe’s remaining bounded owner checks pass 132/132; live-provider/native-window/in-game checks remain outside automated coverage.
