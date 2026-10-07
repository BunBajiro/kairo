# RC17 completion: retention, archive evaluation and Politics evidence

The restored implementation closes the cache/job policy work and disabled-inference backlog, with fresh local measurements and functional tests. The requested `(region_id,date)` archive index was measured and deliberately not adopted. These are domain closures; final whole-application, browser and CI acceptance belong to the main completion workflow.

## Evidence identities and scope

Both fresh lanes ran alone under `/tmp/kairo-rc16-benchmark.lock`. The original lane's [input hashes](inputs.sha256) and [successful identity recheck](identity-check.log) identify the seven runtime modules and two harnesses used. It measured ESI-family transport rows only. A subsequent exhaustive owner audit found public Combat pages also lived in the HTTP cache; that concrete omission was fixed, independently reviewed and given a separate expanded fixture. The final [all-HTTP input hashes](all-http/inputs.sha256) and [identity recheck](all-http/identity-check.log) include Combat and the final restart test as well. Every input matched before/after its lane.

[All-HTTP inventory](all-http/inventory.json) is the complete current transport-owner measurement. The earlier [ESI-only inventory](inventory.json) remains available with its narrower scope and original source identity. The archive-index trial uses a standalone, identical schema/rowset in both arms; later public-cache ownership changes do not change it. No measurement from the lost Oct3 scratch snapshot is reused.

## Implemented retention policy

- One store-owned transport maintenance cursor is shared by ESI and public Combat. Known read response, per-name/name-batch, resource retry and public query/page cache keys become eligible after 90 days without a successful update or use. Unknown owners are excluded.
- Fresh entries, active resource retry deadlines and active public Combat provider cooldowns veto removal. Touch happens before pruning. Last-good body, ETag, Last-Modified, observation time, provider cooldown and durable evidence survive active/offline use.
- Existing installations receive 90 days of grace. Each hourly opportunity examines at most 200 indexed candidates; cursor and deletion commit together. There is no new timer, full-table purge or routine VACUUM. Inactivity/batch bounds deliberately do not evict currently used data.
- Terminal market summaries retain the newest eight regardless of age and up to 100 within 30 days. Deletion is at most 200 per pass. A generated terminal flag/partial index avoids scanning unrelated nonterminal rows; a separate running-job index narrows startup recovery. Running jobs, books and upgrade/resume settings are excluded.
- Durable sessions, travel, events, personal/alliance combat, user records and daily market archives are not purged. The current 30-day market projection and disabled hub books retain their owners. Freed SQLite pages can be reused; an existing database is not promised to shrink immediately.

The production explanation is `docs/DATA-RETENTION.md`. [TRACE.md](TRACE.md) maps these changes back to every related original recommendation, including explicit cross-owner dependencies rather than presenting the cache policy as a blanket memory/performance fix.

## Fresh 30/180/365-day inventory

Daily assumptions: 90 ESI/read HTTP representations, ten expired retry entries, **twenty public Combat pages**, four terminal market jobs, 400 market archive rows across four regions, two sessions, twenty visits/events/personal combat/alliance combat records. Five ESI and two public last-good representations remain actively used; fifty notes persist. The 30-day working projection has 400 region/type pairs. This is a specified synthetic workload, not a user database prediction; goals/import plans and populated market books are instead covered by functional tests.

All seeded durable-table SHA-256 digests match between managed and unmanaged fixtures at every age. Raw output includes logical bytes, allocated table/index pages, database/WAL bytes and free pages before/after a diagnostic checkpoint. No fixture VACUUM is used.

| Days | HTTP rows: unmanaged → retained | Cache/access logical bytes | Terminal jobs | SQLite file bytes |
|---:|---:|---:|---:|---:|
| 30 | 3,607 → 3,607 | 6,549,725 → 6,549,988 | 120 → 100 | 11,567,104 → 11,567,104 |
| 180 | 21,607 → 10,807 | 39,256,025 → 19,644,688 | 720 → 100 | 57,761,792 → 36,294,656 |
| 365 | 43,807 → 10,807 | 79,611,925 → 19,646,788 | 1,460 → 100 | 114,896,896 → 49,270,784 |

Retained domain inventory (managed fixture rows / logical bytes, excluding page/index overhead):

| Domain | 30 days | 180 days | 365 days |
|---|---:|---:|---:|
| marketArchives | 12,030 / 723,720 | 72,180 / 4,342,320 | 146,365 / 8,805,260 |
| marketWorking | 800 / 1,981,300 | 800 / 1,981,300 | 800 / 1,981,300 |
| sessionEvidence | 1,260 / 211,608 | 7,560 / 1,285,332 | 15,330 / 2,613,632 |
| combatEvidence | 1,200 / 283,368 | 7,200 / 1,712,772 | 14,600 / 3,477,672 |
| userData | 50 / 2,880 | 50 / 2,880 | 50 / 2,880 |

The continuing archive/session/combat growth is deliberate retained evidence, not a cache-policy failure. At 365 days, whole-database size is 114,896,896 versus 49,270,784 bytes in the paired from-fresh fixtures. That does not mean an existing upgraded file will immediately lose the same number of physical bytes.

## Archive index: measured no-change decision

[Raw ABBA results and query plans](archive-index.json) use 365,000 identical rows (365 days × four regions × 250 types), prepared imports, corrected-day replacement, ANALYZE and a 30-day/7,500-row per-region projection. All output digests match.

| Metric | Existing indexes A1 / A2 | Added region/date B1 / B2 |
|---|---:|---:|
| Full import, ms | 1,476.356 / 1,437.550 | 2,042.593 / 1,880.250 |
| Projection median, ms | 9.727 / 11.857 | 8.857 / 8.067 |
| Projection observed p95, ms | 52.507 / 19.118 | 10.675 / 9.901 |
| Corrected daily import, ms | 12.048 / 13.206 | 15.201 / 12.718 |
| SQLite file bytes | 40,226,816 / 40,226,816 | 49,901,568 / 49,901,568 |
| Corrected-day WAL bytes | 4,239,512 / 4,239,512 | 4,330,152 / 4,330,152 |

The existing date index already bounds the populated, analysed query to its calendar window, correcting the earlier simple-schema suspicion of a full regional history scan. The additional index reduces the mean of the two median reads by 2.330 ms, while increasing database size by 24.1% and mean bulk-import time by 34.6%. Corrected-day time is 12.627 versus 13.960 ms. The small absolute gain on an infrequent projection does not justify that storage/write cost, so the additional index is not installed.

Each arm contains only twelve read samples: its reported empirical p95 equals its maximum. The 52.507 ms A1 outlier remains in the raw report; this is not a portable latency-tail claim or proof of its cause. No extra runs were selected to hide it.

## Corrected archive semantics

The original gate covered a rejected incomplete changed archive, but not a successful correction removing the last current day for a type. A fresh positive test exposed stale working data in that case. The narrow fix refreshes previous **EVE Ref-owned** projections to an explicit empty 30-day window when the corrected source no longer has a current observation. It retains older daily archives, does not overwrite ESI-owned histories, and preserves source attribution. The new test verifies a corrected price, removed row, zero reported days and retention of an older archive; existing incomplete/restart/batch rollback tests continue to pass.

## Disabled inference and authoritative evidence

Disabled writes keep a single replay marker while retaining original combat ledgers. Re-enable/restart streams both sources through one shared 1,000-record budget. No whole-graph assessment or inference-history entry is generated per intermediate batch; read-only output uses saved progress and withholds inferred memberships until completion. Configured blocs remain immediate.

Copies are selected consistently during live queue drain and replay: personal ledger first, then lowest owner ID. This is deterministic canonical ownership, not a newest-observation guarantee. Provenance survives compaction. An ineligible canonical correction leaves a bounded exclusion marker, preventing a stale lower-priority copy from restoring it. Deleting the exact canonical source invalidates its compact record and requests replay to select any remaining copy. Legacy truncated/provenance-free bootstraps replay on migration.

Compact evidence/exclusions retain their 60-day/20,000-record cap. If the cap omits evidence, incompleteness persists until the omitted window expires; it does not disappear just because the next batch has exactly 20,000 rows. Durable raw evidence is untouched.

## Fresh correctness and independent review

- [Focused log](focused-tests.log): 78 passing retention/Politics/combat/market/history/import cases, including a real 200-reference public page with zero repeated writes, isolated missing-event repair and one corrected valuation.
- [Public-owner log](public-owner-tests.log): 25 passing cache/combat/session cases after the additional Combat cache owner hook, actual shared ESI/Combat cursor check, public cooldown/last-good retention, and real database reopen. These suites overlap and must not be summed.
- The Politics fixture retains 4,205 raw records, stays queue-free while disabled, processes 1,000 records in its first replay batch, survives restart, applies a behind-cursor correction, rejects stale subordinate restoration and generates one final assessment. Separate cases cover canonical deletion/ineligibility, old three-column/truncated migration and 20,001-record capacity pressure.
- Independent read-only review found no blocker in ownership, SQL bounds, migration, exclusion/canonical rules or successful archive correction. Its Windows test teardown observation was fixed by closing the reopened database in `finally` before directory cleanup.
- Final integrated runtime/type/build and CI results are recorded by the parent completion workflow. These local domain gates do not replace them.
