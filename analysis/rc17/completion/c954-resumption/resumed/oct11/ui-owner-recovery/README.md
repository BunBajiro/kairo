# UI owner schema correction and bounded recovery

The first original UI attempt ran four lanes successfully, then its repeat-small replay worker completed normally with all12 navigation cycles. The external owner rejected that completed result because it checked `result.smoke`, while the frozen replay worker's schema2 stores the boolean at **`result.environment.smoke`**. The observed undefined-versus-false failure was an assertion/schema mismatch, not an application failure.

The failure, raw worker result, source checks, original owner and independent audit were banked at `4249df1bdb6437884d3a7ff4338c85958d9cd1f7` before the correction. The original failed lane and outer attempt receipts remain false and unchanged. The sole canonical owner change is `assert.equal(result.environment?.smoke,false)`; missing, malformed or true metadata remains rejected. The shared CI owner receives the same correction. No application or measured workload changed.

`OWNER-FIX.diff` shows the exact one-field correction. `OWNER-SCHEMA-CONTROLS.json` records19 offline assertions using the actual retained worker result: the original validator reproduces the failure, the corrected full replay branch passes, and smoke/missing/malformed metadata, wrong source/case, short cycles, errors, external responses, absent playback, extra EventSource and missing completion time are rejected. No browser or Kairo process ran for these controls.

`REPEAT-SMALL-ADOPTION.json` is a **new validation receipt**, bound to the independent `UI-ATTEMPT1-AUDIT.json`, original failed receipts, existing raw result, corrected validator and controls. It adopts no new measurement and rewrites no old receipt. The independent audit verified44 original inventory entries,39 closed-file pins,155 inputs, all original command drains, source/build files and full replay coverage. The four already successful lanes remain authoritative.

After independent recovery review and the coordinator's grant:

```sh
cd /workspace/scratch/a2f3334402fc/kairo-analysis-restored
KAIRO_UI_OWNER_RECOVERY_GRANTED=1 python3 analysis/rc17/completion/c954-resumption/resumed/oct11/ui-owner-recovery/run.py
```

This creates fresh `/tmp/kairo-final-matrix-public-20261011/ui-owner-recovery-attempt1` and runs **only** `session-replay-repeat-cap`, then `session-replay-distinct-cap`. Both use the unchanged original UI worker/specification and twelve-cycle coverage. It refuses either lane if an original output already exists. No successful lane or repeat-small worker is rerun.

The owner acquires performance→benchmark locks, preserves actual process/subreaper/namespace drain, checks replay temporary-path absence, verifies the unchanged candidate source/build before and after, and captures closed logs/results plus a final cross-bound inventory. For original historical/comparison/UI input receipts, the one changed canonical owner path is explicitly rebound to `original-ui-ci-lane.mjs` (SHA256 `58ff9778d7dc8857bad3f9c29d2c53e55b1ffd95115348c49ef7d482e8441b43`); **every other original path/hash must still match**. Current execution separately requires canonical owner bytes to equal the reviewed proposal. The final receipt records both owner identities and the assembled local coverage. Independent Actions and broader release gates remain separate.
