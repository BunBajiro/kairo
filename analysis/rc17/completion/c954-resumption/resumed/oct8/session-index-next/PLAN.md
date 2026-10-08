# S3 Session eligibility: remaining measured decision

8 October 2026. **Preparation only: no application execution, test, measurement, source edit or remote action was performed for this plan. S3 remains open.** PR #10 remains withdrawn. The runtime slot currently belongs to M9.

## Current source and proposed comparison

The requested boundary is `c9d04ef62cb8a18292b309a2452fcab851185a7d`. During inspection the continuation advanced to clean `a7b1bf97b0073695926c443e52d523638e59e48d`; every bound backend/reference file was verified byte-for-byte against the requested c9d04ef commit. This does not silently move the planned experiment to the newer commit.

[`source-harness-binding.json`](source-harness-binding.json) freezes SHA-256/byte lengths for the nine-file static import closure of `openStore` and `createSessionCombat`, three reference files, and 13 historical harness/evidence files. All nine imported backend files match the historical c954 candidate bytes. The Core file differs overall, while its three-second scheduler call remains present. The old c954 candidate and baseline directories no longer exist locally.

| Source path | Relevant behavior |
|---|---|
| `server/core.mjs:357` | A 3,000 ms timer launches `sessionCombat.syncRecent` for each connected, non-reauth pilot, alongside other Core work. |
| `server/session-combat.mjs:10` | `SESSION_COMBAT_RECENT_SQL` selects open and recent-ended ranges separately with `UNION ALL`; open-first, start-descending and explicit rowid tie order remain. |
| `server/session-combat.mjs:154` | `syncRecent` selects eligible IDs then schedules existing Session work and the shared live collector. |
| `server/store.mjs:87` | Additive `session-combat-eligibility-v080` migration creates `(character_id, ended)`. |
| `server/session-live.mjs` / `session-policy.mjs` | The live feed retains its 120,000 ms due interval, cursor, pending-owner and retry behavior. |
| `tests/kairo/session-combat-eligibility.test.mjs` | Existing populated semantic contract covers all eligible IDs, exact cutoff, tied starts, immediate end writes, bounded plans and durable migration/reopen. |

Construct isolated sources from the exact selected commit only after coordination with the root. Candidate retains committed source. Baseline removes only the S3 migration and restores the previous eligibility SQL/argument list; do not revert the unrelated R1 timeline. [`baseline-ablation-recipe.json`](baseline-ablation-recipe.json) provides exact single-match replacements and expected source hashes; it has **not** been applied. Capture full before/end manifests using `analysis/rc17/harness/source-manifest.mjs`, and verify the two-file delta. A binding of historical bytes is not itself an executable frozen candidate.

## Evidence already available and exact debt

- `completion/session-replay/eligibility-diagnostics.json`: all six combinations of 100/1,000/10,000 archived Sessions per pilot × one/four pilots; matching IDs/order and indexed ranges over 41 simulated ticks. Both plans retain a sort. It measures returned results and plans, not SQLite rows examined or elapsed cadence.
- `eligibility-actual-source-counts.json` and `eligibility-baseline-controls-20261007.json`: simulated largest fixture has 41 ticks, 164 eligibility calls, 572 eligible IDs/Session reads, 28 route queries/16,024 rows, 68 historical provider calls, three live responses, and cursor 100. These are workload controls, not two minutes of host timing.
- Only `write-100-1-{1-baseline,2-candidate,3-candidate,4-baseline}` are completed in `timed-20261007/manifest.json`; no ordinary cadence arm is recorded complete. All four retain equal durable row hashes. Their unfavorable insert/end-update costs remain evidence: insert A1/B1 1.701471/2.449590 ms, A2/B2 1.378366/1.816576 ms; end-update 1.185905/2.310711 ms and 1.073797/1.817357 ms. Candidate post-checkpoint file size is 28,672 bytes larger for that 600-row fixture.
- The minimal diagnostic database's index cost was +335,872 bytes at 10,005 rows and +1,376,256 bytes at 40,020 rows. Its roughly 24% growth is not a whole-app percentage.

Finish upgrade, inserted-row and end-update costs at all six cardinalities, and the previously declared smallest/largest real-cadence ABBA endpoints. Re-run the full write matrix at the new frozen boundary for one coherent comparison, retaining the four earlier observations separately. Any decision to omit interior ordinary cadence combinations needs an explicit rationale after the endpoints and full six-case planner/write evidence; those lanes must never be labelled executed.

## Historical harness changes required before execution

1. **Replace unverified resumption.** The old runner embeds c954 source labels, nonexistent scratch roots and filename-only success skipping. Workers trust environment labels and lack end guards, explicit completion receipts and an asserted lock. Create a new output directory, pin the new sources and every harness file, require both shared locks from the parent, and publish `complete/sourceVerified` only after all guards. Preserve failed/interrupted attempts. Do not use the old summarizer to merge missing or unmatched runs.
2. **Keep diagnostic modes distinct.** Current `eligibility-workload.mjs` is SHA-256 `b8465eeb47781aa02db1c27a20e322073970c483ca8c63958af40be77063497a`; the earlier candidate diagnostic recorded `b6313c...` before the absolute-deadline/tick-work changes. The write harness remains `d9add0ed...`, matching the four completed outputs. Ordinary mode deliberately leaves SQL counters and `eligibleIds` empty/zero; those values cannot be presented as absence of SQL work. Run separate exact-source diagnostics for all six shapes, asserting oracle IDs/order, route controls and provider behavior.
3. **Close the first-tick deadline gap.** Waiting until the outer 120,000 ms target does not by itself prove the feed deadline was reached: the first actual tick can be late and anchor `nextCheckAt` slightly beyond that target. Record that initial offset/deadline. Before running, choose and freeze a 41-tick schedule whose final tick waits until both the planned 120-second endpoint and the recorded initial live due deadline. Keep actual offsets; no extra forced sync or hidden simulated tick may manufacture the final provider response. Validate cutoff/cursor controls separately from wall-clock timestamp spelling.
4. **Do not overstate scheduler scope.** The historical collector workload awaits pilots sequentially, whereas Core launches their work without awaiting inside the timer. Preserve that workload for the isolated query/index decision and label the difference. Whole-Core contention, overlapping ticks and startup acceptance belong to the combined Core gate; no S3 result here proves them. If adding a Core-dispatch-style diagnostic, give it its own declared source/harness boundary rather than changing the old workload invisibly.
5. **Measure actual migration and storage.** The old write trial opens a migrated database, drops the index, then manually creates it; its baseline `upgradeMs` is effectively an empty timing. That isolates index creation but is not the production migration/reopen path. Seed a populated pre-S3 store once through the isolated baseline, checkpoint/close it, and give both arms byte-identical copies. Time actual `openStore` first migration and ordinary reopen separately. Record CPU, complete row digests, page size/count/freelist, DB/WAL/SHM sizes and equivalent checkpoints. No one-sided VACUUM. Keep the existing 500 inserts and 500 end updates per pilot, transaction boundaries and complete row/ownership verification.
6. **Strengthen complete-run controls.** Assert 41 ticks, `41 × pilots` calls and 41 work durations; exact expected provider URL/status sequence, ready/no-failure state, cursor 100, no unintended verification and no external network. Compare all logical Session collector state with narrowly documented actual-clock differences. Record original versus candidate plans and all adverse per-process measurements. Event-loop observations describe the monitored 120-second window; two process repetitions are not a population percentile estimate.

## Fixed runtime sequence and decision

After the root releases M9's exclusive slot:

1. Freeze isolated sources, corrected harnesses, fixtures and output schema; run focused semantic tests plus separate six-shape diagnostics on both arms. Preserve exact cutoff, tie order, immediate updates, long open Session, pending/deadline, disabled/reauth, 24-hour settling expiry, verification and close/drain contracts.
2. Run the six write/upgrade/storage cases in ABBA order: 24 fresh workers, no reused database mutation state. Prepare seeds in a separate child so first-arm construction/JIT/heap history is not unique.
3. Run ordinary 120-second ABBA at 100 archives/one pilot and 10,000 archives/four pilots: eight fresh workers and at least 16 minutes of cadence time, plus preparation/checks. Each endpoint has two process observations per arm; report individual observations, CPU, tick-total/median/max, actual tick lateness and event-loop metrics. Do not pool 41 ticks as independent process replications.
4. Compare measured read savings against migration/write/storage costs. Explicitly justify any bounded interior-cadence omission; expand the declared matrix if endpoint behavior or costs do not support that reasoning. Preserve original Session/report adverse rows and remaining route work. No route cache follows automatically from returned-row counts.
5. Write an evidence-backed retain/reject decision for S3 and carry it into final combined local/CI acceptance. Passing this isolated lane does not close S1 report costs, R1 compiled replay, F6 archive DOM, whole-Core startup/idle or clean RC17.

The plan does not authorize overlapping runtime. All source and historical harness bindings are read-only preparation; no ordinary result is asserted here.
