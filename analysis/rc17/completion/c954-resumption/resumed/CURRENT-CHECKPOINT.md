# Current continuation checkpoint — 8 October 2026

Application source: `22773cc7cb6e83ac51e412565ba65c101613536a`, tree `fb4db42e42f4a4c23c7006c7d262fd8763efa134`, branch `refactor/rc17-c954-continuation-v0.8.0`, internal draft PR #11. The selected original base remains c954/build #54. Excluded 508/build #55 is not integrated.

Changes since 9afa: bounded four-worker asset/planet metadata enrichment and unchanged-snapshot names merging (`985a6c1`), then deferred unused Atlas layout derivation (`22773cc`). Earlier timer receiver, durable updater rollback and response-local Maps roster/no-op connection reconciliation fixes remain.

Validation: 985a passed 972/972 tests, types and a fresh build. The first attempt had 971 passes and one HTTP 404 because the restored workspace lacked built index.html. Attempt 1 is preserved; types/build/full tests passed in attempt 2. The Atlas integration passed 60 affected tests, types, a fresh build, 12 paired Atlas snapshots, two radar labels and compiled 1,000-system/10,000-event schematic replay with pilot and lifecycle checks. Canonical 227 source/build bytes match the tested combined manifest: 487 source files, 20 client assets, fingerprint `2c72fd451304d300e05a57d9b4eecc8bd906233c65c9478ad353e4578a474872`. No full 978-test suite or final performance acceptance is claimed here.

## Bounded decisions

- Retain F7 formatter reuse (earlier decision).
- Adopt bounded enrichment, retaining all tiny-case and CPU adverse observations.
- Adopt the F3 names owner, retaining the measured first Assets open tradeoff.
- Adopt the bounded M7 lazy Atlas owner, retaining first-switch and mixed browser costs.
- Retain the existing Goals SUM after four fresh absolute-cost runs and independent review. Preserve the approximately 11 ms single-goal stress cost and unmeasured many-goal burst limit.

These decisions do not close full F3 Context/name-payload work or final combined acceptance.

## Rejected Maps experiment and active work

The M9 compact SQL read-time projection is rejected. Its complete 1,128-sample matrix preserves outputs but repeatedly regresses ordinary summaries; the 24-wide-map case gains only about 6% despite much less JavaScript parsing. The application excludes that trial. Evidence is under `oct8/maps-summary`.

A separate write-time metadata prototype is under `oct8/maps-summary-next`. It passed 33 focused tests after independent review corrections; performance, startup/backfill, write and storage gates remain pending. It is not adopted.

Active next work: a narrow Assets render boundary, saved-hidden binding evaluation and names-payload costs, and the isolated Maps metadata trial. Other open items in the four c954 traces remain: M6 scene work, F6 archive/table cardinality, populated admin/Studio, Session replay ordinary performance, index cadence/write cost, startup/state/idle acceptance and final frozen local/independent CI/package gates. Successful normal CI does not close those findings.

## Recovery and review restriction

Source and current analysis were restored from GitHub after the workspace reverted. Four large older historical gzip blobs remain absent locally; their exact remote entries are preserved with skip-worktree. Use `git write-tree --missing-ok` in this analysis checkout until restored. Details: `oct8/recovery/`.

Current raw recovery instructions: `oct8/RAW-RECOVERY.md`, `oct8/FRONTEND-RAW-RECOVERY.md`, and the later integration/Atlas archive instructions. Earlier c954 raw recovery remains `../BANKED-RAW.md`.

PR #10 remains withdrawn/draft at `9a01826d863602c5738b89c90644933d2f30ddc2`. No clean RC17 review, merge, main update or release until required closure. Start here before older status prose.
