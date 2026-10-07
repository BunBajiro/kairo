# Weekly-reset recovery checkpoint

**Resumed after this bank:** the user explicitly asked to continue working on 7 October after checkpoint `801829695f5f5956b1fac137c2e4e77b54c4dfb7` was verified. The pause instruction below is historical; newer work is recorded under `resumed/` and should be banked at verified milestones. Continue from the newest verified successor on the c954 continuation branch, never from excluded 508.

The user requested a durable bank and pause on 7 October 2026 because credits are nearly exhausted. **Stop further investigation, builds, benchmarks and implementation after publishing this checkpoint.** Resume only when the user returns. The local workspace may disappear; GitHub must contain the recovery record.

## Source of truth

The selected workspace is `/workspace/scratch/a2f3334402fc/kairo-rc17-c954-continuation`, clean at `c954c0d808847f249df0659ed15fdce2e89f84c4` (test build #54). Its GitHub backup is `refactor/rc17-c954-continuation-v0.8.0`. The source tree is `87c20772b3843504a467c3e7f6de05f9018b3b6c`; [source.json](source.json) records all 482 source files, 26 compiled assets and fingerprint `472afe35fc135243350cad554205ac5845e5bd9404e81838a52aca8d09b63b27`.

The old `/kairo-rc17-completion` checkout and `refactor/rc17-v0.8.0` branch are at excluded parallel-process commit `508f2d450c7cc17cc464cf316b80748367adc9e2` / build #55. **Do not resume from their HEAD, transplant 508 wholesale, or count its verification as c954 acceptance.** PR #9 is marked superseded. Earlier source revisions and isolated trials are retained only as historical comparison/proposal evidence.

Analysis workspace: `/workspace/scratch/a2f3334402fc/kairo-analysis-restored`; backup branch `perf/rc16-checkpoint-v0.8.0`, internal draft PR #8. Parent before this bank: `84534435a7af74af0d15214c77c90e74aacf1c2d`. The published commit containing this file is the recovery checkpoint. Application source is not changed by this analysis bank.

## What this session completed

1. Verified build #54 succeeded (GitHub run `37613842075`), recreated the exact clean c954 continuation and verified every source/build file against the receipt.
2. Traced every original and additional whitepaper finding against c954 in [frontend](frontend-trace.md), [backend](backend-trace.md), [Maps/Atlas](maps-atlas-trace.md) and [gates/updater](gates-updater-trace.md). A separate cross-document review found no omitted master-trace category or material contradiction.
3. Corrected stale live-status/source-selection wording. Source, trial, failed and partial evidence are distinguished; passing a test build is not final optimization acceptance.
4. Prepared lossless backups of 25 large raw files: 88,348,890 original bytes, 6,989,553 compressed bytes, with original paths and checksums. See [restoration instructions](BANKED-RAW.md). The complete evidence bank also preserves smaller recovered results, unfinished lanes and proposed patches.

## Resume in this order

1. Read [README.md](README.md), [source-policy.json](source-policy.json) and the four current traces. Older WORK-CHECKPOINT/LIVE-STATUS and a27 TRACEABILITY tables are historical; their later-508 adoption wording is superseded.
2. Recover the analysis branch and the exact source SHA above from GitHub. Verify Git tree identity and source file hashes. From the analysis repository root, run `python analysis/rc17/completion/c954-resumption/restore-banked-raw.py --verify`, then the same command with `--restore`. Never infer missing measurements from a progress file or rewrite original evidence to fit a new source.
3. Recreate dependencies and browser tooling rather than relying on transient node_modules or `/tmp`: recorded runtime is Node 24.19.0, Chromium 138.0.7204.0 from `@sparticuz/chromium@138.0.2`. Source build #54 and its artifact are identified above; if rebuilding, produce a fresh receipt and do not claim old compiled-byte identity without checking it.
4. Recreate any required frozen baseline/trial root from its full SHA and saved patch/manifest. Important historical baselines: RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1`, fa6 `fa6e852b76089b51cd552fa202de85ad6948b0ec`, original `05d0d4b36c154329006d6772769063db874762da`, a27 `a27d36c602435ce220452b5d45b0109d30efa533`. These are comparison controls, not selected RC17 source.
5. Assign one coordinator the runtime slot. Timed workloads/builds must be sequential; use a common lock (recent wrappers use `/tmp/kairo-performance.lock`; historical harnesses have their own lock, so avoid nested self-locking). Inspect saved completion/source/harness verification before deciding what to rerun.

## Next concrete work

- **F5 correctness:** c954 captures native Window timer functions into a plain scheduler object, causing `Illegal invocation`; virtual-clock acceptance missed it. Review a minimal receiver-safe wrapper correction and test native scheduling, cancellation and compiled administrative behavior. The later 508 fix is not adopted merely because it exists.
- **U2b correctness:** direct pending-pointer removal can abort rollback before a valid active generation is selected. Review the separate saved recovery proposal; verify exact failed-generation exclusion, visible removal/metadata failures, retry and valid active fallback.
- **M9:** c954 has costly no-op document reconciliation/stringification and repeated tracked-pilot roster reads. The proposed fast-path crossover is incomplete. Preserve full output/expiry/import/canonical behavior and investigate request-local roster ownership, then complete matched evidence.
- **Measured decisions still open:** broad frontend Context/name ownership; ordinary populated UI/formatter/Studio timing; growing archive DOM; M6 scene leaves; deliberate M7/enrichment adopt-or-reject from c954; S3 index write/space plus actual two-minute cadence; full R1 replay ABBA; retained Goal SUM; corrected binding/names counters and timings. The four traces identify exact code, proposals, evidence and tests.
- **Keep valid completed evidence scoped:** F1/F2 compiled21, models17, Studio/source10; local Maps/camera/query-plan diagnostics; real loaded updater and inventory; historical G8/G9 crossovers. They do not collectively replace final c954 acceptance. G8 c954 domain parity must account explicitly for new private revision metadata while retaining actual bytes in timing.
- **Final gate:** after all findings have dispositions, freeze one combined source/build/harness identity, complete correctness/types/build/browser and unchanged matched local plus independent CI matrix, retain all adverse rows, independently review, then verify a clean extracted package.

## Review and authorization boundary

PR #10 remains withdrawn and draft at `9a01826d863602c5738b89c90644933d2f30ddc2`. No clean RC17, user-review handoff, merge, main update or release has been prepared or authorized. The user authorized private Kairo source/evidence banking and explicitly requested this full workspace-progress backup before pausing. Banking historical evidence does not change the selected source or authorize adopting excluded build #55.
