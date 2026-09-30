# Evidence inventory

The primary report is `../README.md`; commands and limits are in `../METHOD.md`.

| Files | Status and use |
|---|---|
| `legacy-abba/` | Completed fresh same-machine v0.7.3 → RC16 → RC16 → v0.7.3 backend/database runs, provenance and generated comparisons. |
| `backend-timings.json`, `backend-timings-reverse.json` | Completed uninstrumented Universe/Maps/routing component timings. |
| `backend-diagnostics*.json` | SQL amplification and query plans; diagnostic counts, not elapsed-time evidence. |
| `frontend-browser.json` | Final complete 37-sample compiled-browser run using frozen corrected harness `c30258df...`; source of reported Maps/Atlas/replay/probe figures. |
| `frontend-overview-{baseline,candidate}-{1,2}.json` | Four complete matched minimal Overview runs, in balanced order. |
| `frontend-summary.json`, `frontend-bundles-*.json` | Derived frontend tables and actual compiled asset byte counts. |
| `frontend-browser.cpuprofile` | Diagnostic profile collected after ordinary timing samples. |
| `frontend-exploratory-raf-observer.*` | Retained exploratory run with a measuring-observer defect; excluded from final timing tables. See its explanatory note and frontend review. |
| `frontend-smoke*` | Harness/control-development diagnostics; excluded from final timing tables. |
| `updater-{light,archive,abort}.json`, `updater-provenance.json` | Completed metadata/cache counts, local real-archive worker/install and cancellation measurements; disclosed reconstructed harness provenance. |
| `architecture-shutdown.json` | Deterministic reproduction of the known RC16 disposal gap, not a test proving safe shutdown. |
| `source-verification.json`, build/type/behaviour logs | Source preservation and existing application validation. |

GitHub results will be retained separately after the authorised run completes.
Do not count a configured workflow, missing output, or stale local result as a
successful GitHub measurement. Historical September checkpoint evidence lives
under `../historical/`, not in the current workspace comparison.

All player/database data in this checkpoint is synthetic. Reports exclude claims
about physical disk IO from SQL emitted-row counts, desktop GPU FPS from RAF
intervals, and memory leaks from short RSS observations.
