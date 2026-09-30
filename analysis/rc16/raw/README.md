# Evidence inventory

The primary report is `../README.md`; commands and limits are in `../METHOD.md`.

The [follow-up report](../followup/README.md) indexes new data under `followup/`,
including corrected legacy backend ABBA. A malformed original storm-cache
fixture makes the original backend idle windows partial-workload observations;
they remain preserved, with the corrected series superseding healthy-idle claims.
Failed smoke/CI attempts are retained and never counted as successful timings.

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
| `source-verification.json`, `frontend-build.log`, `stable-build.log`, `typecheck.log`, `behaviour-tests.log` | Source preservation and existing application validation. These tracked logs may be hidden by ignore-aware file searches. |
| `github-run/` | Complete independent GitHub run 36708404690, retained separately from workspace results. See links below. |

The [GitHub workflow](https://github.com/BunBajiro/kairo/actions/runs/36708404690)
completed successfully on 30 September at harness commit `0344ff4ec069080a87e19294fa8fddc28f737327`.
The downloaded artifact's SHA256 matches GitHub's digest. Extracted files are
unchanged; the job log and retrieval record were added after download.

- [Run/harness provenance](github-run/github-run-provenance.json), [retrieval and successful job metadata](github-run/retrieval.json), [source verification](github-run/source-verification.json), [complete Actions log](github-run/actions-job.log).
- [Balanced legacy/database comparison](github-run/github/legacy/comparison.md), with all four original result directories alongside it.
- [Backend SQL diagnostics](github-run/backend-diagnostics.json), [forward](github-run/backend-timings.json) and [reverse](github-run/backend-timings-reverse.json) timings.
- [Compiled-browser results](github-run/frontend-browser-github.json), its CPU profile, and all four `frontend-overview-*-github.json` files.
- [Lightweight updater checks](github-run/updater-light-github.json) and [async-disposal diagnostic](github-run/architecture-shutdown-github.json). The archive install/cancellation was measured locally only.

Historical September checkpoint evidence lives under `../historical/`, not in
the current workspace or GitHub comparisons. Do not count a configured workflow,
missing output, or stale result as a successful measurement.

All player/database data in this checkpoint is synthetic. Reports exclude claims
about physical disk IO from SQL emitted-row counts, desktop GPU FPS from RAF
intervals, and memory leaks from short RSS observations.
