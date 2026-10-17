# History and evidence

[Documentation index](../README.md)

This page separates completed investigations from current operating and development instructions. Preserve failed baselines and adverse results alongside successful outcomes; none are erased by a newer candidate or a documentation rewrite.

## Current candidate provenance

| Record | What it establishes |
| --- | --- |
| [Final release/baseline audit](../FINAL-AUDIT.md) | Current audit scope, distinct new findings and correction/review/validation checkpoints; preserves all earlier evidence. |
| [Current review build](../REVIEW-BUILD.md) | Build91's exact tested source, consolidated package, actual checks and remaining environment limits; links its separate verification receipt. |
| [Completed premerge bug review](../PREMERGE-BUG-REVIEW.md) | Four completed passes, 74 closed findings, their before/fixed evidence and historical build90 identity. The ledger remains preserved intact. |
| [Validation](../VALIDATION.md) | Scope of source, Chrome/Firefox, extracted-package and environment-specific checks. |
| [Fourth-pass evidence](../review-evidence/2026-10-15-fourth-pass.json) | Failed/partial builds87–89, owner and independent review results, final build90 and recovered package verification. |
| [Third-pass evidence](../review-evidence/2026-10-15-third-pass-fixed.json) | Historical build86 acceptance; superseded during bug review by build90. |
| [Retrospective review](../review-evidence/2026-10-15-retrospective-review.json) | Review of the earlier 37 corrections, retained against their original evidence. |
| [Documentation ledger](../DOCUMENTATION-WORK.md) | Completed manual refresh and its separate phase verification; no new runtime/performance claim. |
| [Source documentation ledger](../SOURCE-DOCUMENTATION-WORK.md) | Completed source contracts, independent review and parser/type/build checks, followed by a separate consolidation note. |

The other JSON files in [review-evidence](../review-evidence/) are retained under their original names and source identities. Historical artifacts can expire; the committed structured records and their limits remain. Do not silently replace a failed run or assume an unavailable artifact passed.

## Completed performance work and superseded plans

The performance branch preserves investigation material outside candidate ancestry. The following immutable checkpoint is `568ce3e29213e4132a535340c1321e28c46a83cc`:

- [Acceptance/recovery checkpoint](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/completion/c954-resumption/resumed/CURRENT-CHECKPOINT.md).
- [Component decision ledger](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/completion/c954-resumption/resumed/CURRENT-ISSUES.md).
- [Three-version performance report](https://github.com/BunBajiro/kairo/blob/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/PERFORMANCE-REVIEW-0.8.0.md).
- [Archived plans, source audits and superseded documentation](https://github.com/BunBajiro/kairo/tree/568ce3e29213e4132a535340c1321e28c46a83cc/analysis/rc17/completion/c954-resumption/resumed/oct8/documentation-prune).

Measurements belong to their stated source, workload and environment. Separately matched 0.7.3/RC16 and RC16/current groups cannot be combined into an invented 0.7.3/current percentage. Correctness cost bounds in the later review are not fresh elapsed-time measurements.

Preserve `perf/benchmark-baseline`, `perf/database-review-v0.7.3` and `perf/rc16-checkpoint-v0.8.0`, including non-ancestor recovery and excluded/withdrawn candidate histories. Do not merge investigation branches into the application to collect their records. [Repository cleanup provenance](../PREMERGE-BUG-REVIEW.md#repository-cleanup-and-recovery) describes the closed review chain.

## Release history and specialist history

[CHANGELOG.md](../../CHANGELOG.md) retains version history. [Schematic geometry](../SCHEMATIC-GEOMETRY.md) and [routing validation](../UNIVERSE-ROUTING-VALIDATION.md) identify historical map corrections separately from current contracts. Third-party notices remain current attribution, not archived product instructions.
