# RC17 retention completion evidence

[Measured review and final policy](REVIEW.md); [complete domain recommendation trace](TRACE.md) maps the original whole-application findings to current source, code-confirmed causes, fresh regression checks and cross-owner gates. Production policy is in `docs/DATA-RETENTION.md` on the implementation branch.

## Reproduction

Hold `/tmp/kairo-rc16-benchmark.lock` exclusively. Keep runtime tests/builds stopped during the measured lane.

- `node inventory-all-http.mjs <candidate-root> <output-directory>`: final all-HTTP cohort, including twenty public Combat pages per day and two actively used public pages.
- `node inventory.mjs <candidate-root> <output-directory>`: 30/180/365-day synthetic domains, managed versus unmanaged cache/job growth, durable-row SHA-256 equivalence, logical bytes, allocated table/index pages, SQLite/WAL bytes and reusable pages.
- `node archive-index.mjs <output-directory>`: four-region/365-day/250-type (365,000-row) same-process ABBA index trial. Measures initial import, identical 30-day projections, corrected-date replacement, plans, file/WAL bytes and output digest.

The inventory assumes daily 90 transport representations, ten expired resource failures, four terminal market summaries, 400 daily archive rows, two sessions, twenty visits/events/personal records/alliance records, plus five actively used stale representations and fifty notes. It is a stated synthetic workload, not a user database prediction. No network or real player data is used. Both fixtures retain their data without VACUUM.

`focused-tests.log` records the fresh 78-case retention/Politics/combat/market/history/import gate. Independent source review separately found no blocking issue in the restored changes. Final integrated and CI evidence is owned by the main completion workflow.

Both isolated lanes are complete. Use `all-http/inventory.json` for the final ESI plus public Combat cohort; `inventory.json` retains the earlier ESI-only scope. `archive-index.json` and both input-hash/identity-check sets are preserved. Measurements from the lost Oct3 scratch snapshot are not reused.
