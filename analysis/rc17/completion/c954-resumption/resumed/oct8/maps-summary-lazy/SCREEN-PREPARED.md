# Bounded lazy M9 screen: prepared interface

The immutable workload is `SCREEN-PLAN.md` plus `SCREEN-ADDENDUM-1.md`. `SCREEN-HARNESS-REVIEW.json` binds all nine measured/coordination inputs, including the parent's `freeze-sources.mjs` and imported shared fixture/source helpers. The screen has not run. Subsequent parent-authorized Node --check passed for the worker/coordinator (SCREEN-SYNTAX.json); no imports, application/test code or measurement executed during that parse-only check. The parent reviewed the worker and coordinator statically, including authority preservation and failure end guards. The root still owns execution scheduling.

Coordinator interface:

```sh
node run-screen.mjs NEW_OUTPUT_DIRECTORY
```

It acquires both established benchmark locks unless its authorized parent declares `KAIRO_M9_MATCHED_LOCK_HELD=1`. It freezes exact baseline/candidate source into that new directory, starts the dedicated baseline seed child, then four fresh workers in ABBA order. It imports the existing fixture builder without modifying or duplicating it. No prior output directory or old arm is resumed.

Worker interface, normally invoked only by the coordinator:

```text
node screen-worker.mjs BASELINE_MANIFEST ARM_MANIFEST OUTPUT_JSON SHARED_SEED_DIRECTORY seed-only|measure HARNESS_MANIFEST
```

Successful workers expose `complete`, `sourceVerified`, `source.fingerprint`, `harnessFingerprint`, and stable `cases[].id` / `cases[].parity`. Per-case output includes cold construction, phase timings, exact/UUID-normalized authority and output hashes, metadata schema/states/body bytes, DB/WAL/SHM/page snapshots, no persistent eager backfill, and zero steady writes. API fallbacks and scope limits are explicit. The coordinator compares all four parity objects exactly, checks five steady phases per shape, and records final source/harness guard outcome on failed as well as successful attempts.

Each child has separate stdout/stderr buffers consumed until its `close` event. Each raw log is then written once, fsynced, read back and hashed. Failed copies/seeds are preserved. Every final attempt inventories existing artifacts; cleanup and guard failures mark it incomplete without replacing the primary failure. Live per-case progress also appears in each worker JSON, while the coordinator's terminal milestones occur after each child completes. Reading that progress does not reconstruct or modify logs.

Expected wall duration is only an estimate: approximately 12–20 minutes, with ordinary work plus deliberately untimed full-authority hashing and storage checks. The prior eager persistence run took about 16.4 minutes; this screen uses fewer fixture copies but more explicit first-read/API phase checks. This estimate is not a timeout, performance result or permission to overlap workloads. Root/parent should report active process and elapsed progress while the exclusive slot is held.

The optional `summarize-screen.py` belongs to the parent and is post-run analysis, outside the timed harness pin set. Full read/dense/persistence matrices, contention and background tracking remain pending even if this bounded screen succeeds.
