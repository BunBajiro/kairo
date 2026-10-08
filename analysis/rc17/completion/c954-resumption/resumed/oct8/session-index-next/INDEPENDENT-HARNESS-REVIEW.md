# Independent S3 harness review

Reviewed by `backend_enrichment_decision` on8 October2026. This review reads source and hashes files only. It imports no application code, runs no JavaScript/test/diagnostic/timed workload, and makes no application source or remote change. PR #10 remains withdrawn; S3 closure remains conditional on exact-source semantics and measured evidence.

Initial prepared binding SHA256: `68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c`. All12 entries in that binding were independently checked against current bytes. Both isolated HEADs are exact `a7b1bf97b0073695926c443e52d523638e59e48d`; Store, Session combat, Session live and Session details bytes match the respective manifests. The baseline intervention is confined to removing the additive S3 index migration and restoring the prior eligibility SQL/arguments. The accepted R1 timeline, hidden filter and Assets boundary remain in both arms.

## Workload review

- The dedicated baseline seed process creates checkpointed pre-S3 databases. Both arms receive a file whose size and SHA256 are asserted before and after copying. Candidate first open measures the actual additive migration; baseline uses the prior Store implementation. Ordinary reopen is separate, and both arms perform equivalent first/final checkpoints. Insert and end-update statements/input rows are prepared outside measured transaction loops.
- Application-table digests cover all durable rows. Only SQLite implementation tables and the one expected S3 migration row are excluded; migration/index presence is separately asserted. Every newly inserted row's pilot/start/end is checked, then the final digest must survive close/reopen. Storage includes DB/WAL/SHM and page/freelist observations without asymmetric VACUUM.
- Actual `createSessionCombat.syncRecent` runs with sequential pilots, explicitly distinct from Core's concurrent launches. The ordinary41-tick schedule preserves the sampled first offset and waits for the actual first live deadline before the last tick. Injected domain time is frozen within each tick; host timers remain real. The exact20 pre-cutoff ticks, live final deadline,143 returned IDs/Session reads per pilot,7 route queries/4,006 returned rows per pilot and17 historical requests per pilot are consistent with the fixture and current collector paths.
- Diagnostics retain actual ordered eligibility IDs on every tick and assert cutoff/tie controls. Ordinary mode does not use SQL wrappers or retain SQL row arrays; its separately labelled expected oracle is not passed off as observation. The live provider has a precise200/404/404 sequence and cursor100. Historical provider contents are checked independently as a multiset and ordered sequence is compared exactly across arms. This is a synthetic immediate-provider workload, not service latency evidence.
- Only explicitly asserted collector clock fields are normalized to tick markers. Other state, ordering, pilot ownership, cursor/revision and durable application rows remain exact. Delayed timing that changes cutoff membership fails instead of being normalized away.
- Fresh process ABBA, full source/harness guards, declared six write shapes, all six diagnostic shapes and two ordinary cadence endpoints are explicit. First-open maxRSS includes imports/guards and is labelled cumulative. Ticks are not independent process repetitions. Interior ordinary cadence is recorded as unexecuted.

## Initial receipt robustness findings

No SQL, source-boundary, fixture-cardinality or domain-parity defect was identified in the static review. Before runtime freeze, the author was asked to correct these evidence-recovery paths:

1. `run.py` creates directories and checks initial harness/source bindings before entering its result/try failure handler. A failed initial guard can leave no `failed.json`.
2. The artifact inventory is populated only on the success path, despite the preparation contract promising failed-attempt manifests. Interrupted/failed logs and partial raw outputs need a current inventory in the final receipt too.
3. Seed-directory cleanup in the coordinator and temporary-directory cleanup in workers can throw before the final receipt is written. Cleanup failures should mark completion false and be recorded. Cadence cleanup should attempt Store close independently if collector close throws.

These are bounded receipt/cleanup corrections, not a request to expand workloads or change application code. Final static acceptance awaits the corrected hash binding. No runtime result is asserted here.

## Corrected static gate

Re-reviewed the bounded receipt/cleanup changes against prepared binding revision2, SHA256 `68380761bd44f2c5f8b1f566283d59bf6ae82790d709fcb79abc4f0def784b0c`; all12 bound file hashes/byte lengths were independently rechecked. Initial binding/source guards now run inside the coordinator's receipt handler. Finalization inventories current artifacts on success and failure, records inventory/seed-cleanup failures, and emits an incomplete/nonzero outcome when needed. Both workers record temporary-directory cleanup failures before output; cadence independently attempts collector and Store close. These changes address the identified recovery paths without changing workload or source scope.

No further concrete blocker was found for the staged exact-source semantic/diagnostic gate and subsequent coordinator-approved measurements. This is static acceptance of the prepared harness, not a runtime pass or S3 retain decision. JavaScript parsing, all focused semantics, both-arm six-shape diagnostics, ordinary write/storage matrix and two real cadence endpoints remain unexecuted in this reviewed preparation. Root must grant the serialized runtime slot before execution. Existing adverse write/storage observations and the unexecuted interior cadence limitation must remain in the final decision.
