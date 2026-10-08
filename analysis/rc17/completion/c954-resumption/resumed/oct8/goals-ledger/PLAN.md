# Retained Goals ledger SUM decision — exact 985 source

Prepared 8 October 2026. This lane has not run. It measures whether the existing retained-credit SUM warrants a maintained aggregate; no application change is proposed or authorized by this preparation.

The source is `985a6c17d466d01f1f098a1704de68f6eae5f6e6`, extracted with `git archive` into `kairo-goals-985-isolated`. All 484 tracked files match their canonical Git blobs. Current staged M7 changes are excluded. The actual `server/goals.mjs` and `server/store.mjs` bytes match the historical c954 run, and the original `backend-decisions/goals-ledger-trial.mjs` is unchanged. `source-manifest.json` records all hashes. The historical one-run result remains separate and will never be pooled with these four new processes.

## Ordinary absolute cost

Run four fresh Node processes, each using the original ordinary-mode harness and actual SQLite `openStore` / `createGoals.refresh`. Each process creates fresh file-backed databases with 100 / 10,000 / 100,000 retained income credits and a 50-record current source window. After one untimed warm refresh, it measures 100 unchanged refreshes and one changed refresh. No SQL wrapper, sampling profiler, forced collection, mocked SUM, or production aggregate is used. All results must retain zero unchanged database writes, exact +52 changed progress, ten newly retained rows, zero unexpected events and identical deterministic ledger hashes. The 100,000-credit case is a stress scenario, not a normal-player assertion. These are repeated current-source absolute costs, not an A/B improvement claim or a four-arm ABBA comparison.

The runner acquires both `/tmp/kairo-performance.lock` and `/tmp/kairo-rc16-benchmark.lock` non-blockingly, refuses an existing attempt folder, and hashes all source/harness bytes before and after every child. Any failed attempt keeps its progress, logs and outputs. All four run results remain raw and independently labeled; report min/median/max refresh cost and CPU. The prior historical file is checked only for semantic hashes and source provenance, never included in timing statistics.

## Query plans and real call cadence

After timings, run a separate untimed SQLite diagnostic with the exact prepared SUM and keyed-entry SQL extracted from `server/goals.mjs`; record `EXPLAIN QUERY PLAN`, index definitions, SQLite version, source hashes and explicit result isolation between goals. This checks whether the SUM uses the existing `(goal_id, entry_key)` key prefix and whether a proposed extra index would add anything useful. It is not another performance sample.

Current Core calls `goals.refresh(id,d.key)` only after a due/forced dataset fetch is stored (`server/core.mjs`), and keyed active-goal selection restricts income refresh to journal updates. The default and minimum supported journal interval is 300 seconds; jobs is 300 seconds and mining 600 seconds. HTTP expiry can delay a refresh further. A goal creation explicitly refreshes all that pilot's active goals; manual sync and reconnect/provider behavior may change timing, so the default cadence is not an absolute call-frequency cap. Reading `/goals` uses `listGoals` and does not execute this accumulator. The diagnostic imports actual polling policy and Goal source definitions rather than inventing those intervals. No five-minute wall-clock simulation is needed to establish this source call path; the measured refresh cost must not be described as cadence wall time.

## Decision scope

Decide from absolute current-source cost, actual call cadence, retained cardinality and index plan. If bounded normal-case cost and infrequent source refresh do not justify aggregate synchronization/migration complexity, retain the SUM with the stress cost and multi-goal scaling explicitly recorded. If the cost justifies a trial, preserve credits and reconcile current samples; update ledger deltas plus total in the existing savepoint and cover initial mining baseline, decreased observations, completion/clipping, imported ledgers, outer rollback, reentrant creation, stale/unavailable samples and exactly-once completion. No claimed closure of the whole backend or clean RC17 follows from this narrow decision.

Prepared runtime estimate: 20–45 seconds for four processes plus the untimed plan capture; reserve one minute. No run starts before the coordinator grants the slot after M7 and queued F3/bindings work.
