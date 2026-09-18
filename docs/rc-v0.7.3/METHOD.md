# RC comparison method and scope

Three application commits are compared directly:

| Build | Commit | Role |
|---|---|---|
| 0.7.2 | `b151125cd7b26611364923f00683b1c6f1c1bdd6` | Released baseline |
| Pre-database 0.7.3 | `ff8bbc530ce278a883f8b1831407095a14d3277d` | Earlier optimisation/refactoring candidate |
| 0.7.3-rc.1 | `5a58faff44e6292705550ea5e3994d341b748455` | Previous optimisations plus database follow-up |

Harness revision: `1a1866bd0cf5f54cf522374277d6930f1baf105a` on `perf/database-review-v0.7.3`. Measurement runs import the production modules without editing tracked application files. A copy of the external harness is untracked in each disposable measurement checkout. None of that harness enters the RC source branch or ZIP.

The workspace and GitHub each run all three applications sequentially in **0.7.2 → pre-DB → RC → RC → pre-DB → 0.7.2** order, on Node 24.19.0. The dependency lock is identical apart from the application version fields. This order limits timing drift; it is not a substitute for measurements on every user's hardware. All fixtures are synthetic, and external requests are blocked and counted.

The backend suite uses three warmups and ten measured samples per operation, including complete JSON serialization. It also measures authenticated loopback HTTP from a separate observer process and 35-second idle periods with the real scheduler enabled. Each profile runs in a new child process. The typical profile contains one character, 2,000 assets, 10,000 events, 300 visits, 600 combat records and 1,000 market types. Stress contains four characters, 20,000 assets per character, 50,000 events, 2,000 visits, 4,000 combat records and 5,000 market types.

Full decoded outputs are compared at a fixed clock against each earlier build, for both profiles: protection, state, names, journey, session, market browse, market report, imports, and imports after an unrelated write. There are also 250 deterministic alliance-combat matching comparisons per baseline. Timing runs use the real clock separately.

The database suite creates an identical legacy stress database before opening each application. It expands the working history cache to 365 completed days across 5,000 types. The RC must compact that cache through its actual startup migration. A warmup and three timed cold import analyses follow, with relevant dependency invalidations forcing recalculation; complete output hashes must agree across all builds and repetitions. Initial database opening is recorded separately so migration cost is visible.

Write probes compare five timed 5,000-event committed transactions after a warmup, and three timed 1,000-type history refreshes after a warmup. The latter use each implementation's production write function and yield after every 100 types, with maximum synchronous block durations retained. Event insertion is a bulk test, not a measurement of single-event latency. Index storage is measured as the SQLite pages released by a transactional drop/rollback in the disposable database. No durability setting is changed. These are component write probes, not claims about full network/download refresh time.

The ten required performance checks in each environment reproduce the original three improvements versus 0.7.2 twice (idle CPU, imports after unrelated writes and session reports), plus aged-history cold analysis and bounded working JSON size twice versus pre-database 0.7.3. All other backend metrics remain visible for regression review. Read-performance gains are considered together with index size, insertion cost, initial migration time and write batch duration.

RC correctness gates also include 155 behaviour tests, type checks, frontend compilation and the Chrome session-card layout/keyboard test. GitHub tests the extracted ZIP without source dependencies, on Node 24.20.0; workspace package smoke validation uses Node 24.19.0. The frontend's only change since pre-database 0.7.3 is its fallback version label, so the earlier six-scenario browser performance study remains applicable to that unchanged interface code. This RC comparison does not repeat that browser performance study or measure physical fans, GPU power, EVE, OBS rendering or a real Windows player database.

The RC's cache-size reduction means fewer JSON bytes stored and read by the working projection. SQLite can reuse released pages; the migration does **not** vacuum the file or claim an immediate reduction in the database file's physical size. Daily archive rows remain separate and retain their historical data. Player data and saved cache summary/freshness values are preserved. Regression tests cover stale windows, missing/duplicate days, failed writes, outer-transaction rollback, migration failure/retry and interrupted archive refreshes.
