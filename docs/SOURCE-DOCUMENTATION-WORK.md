# 0.8.0 source documentation ledger

This phase documents first-party source contracts and maintainability. The completed [manual documentation work](DOCUMENTATION-WORK.md), [74 closed premerge findings](PREMERGE-BUG-REVIEW.md) and raw review evidence retain their original scope. Version remains **0.8.0-rc.17**. No merge, release or version bump is authorised; PR #12 stays draft.

## Recovery and scope

On 17 October 2026 the clean workspace, remote branch and GitHub PR #12 agreed on `8c19913842c5770daa76b1d640d5960c1ef41e13`. PR #12 was open/draft on `review/0.8.0-rc-premerge-bug-review`; main was `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Build90 application source remains `5c55cbbbae6c935a86ad5dde71cc1899958fde62`. Recovery verified actual repository state before edits.

[The inventory](SOURCE-DOCUMENTATION-INVENTORY.json) classifies every baseline tracked path, including unchanged files and exclusions. Authors review owning source and relevant tests before adding purpose, lifecycle, inputs/results, side effects, error behaviour, asynchronous ownership and bounded-cost explanations. Simple self-explanatory helpers do not require narration. Declarations and styles are reviewed with their owners; generated data/assets, dependency locks, vendored dependencies and reference data are preserved. Retained Sites/D1 and upstream UI scaffolding are identified at their entry boundaries rather than documented as the local Kairo runtime.

## Work areas

| Area / author | Principal contracts | State |
| --- | --- | --- |
| Core / root | Composition, HTTP guards, accepted request draining, catalog/Registry extension contracts, semantic bus and SSE backpressure | Inventory complete; source review in progress |
| Foundation / source_foundation | Startup/replacement, Auth/Vault, ESI pacing/cache/pagination, Store/migrations, dataset preparation/cancellation/rollback | Documentation and syntax/AST checks complete; independent review in progress |
| Domains / source_domains | Markets/import assumptions and saved plans, Sessions/replay, Goal accounting, Stream/OBS/OPSEC, shared transport | Inventory complete; source review in progress |
| Universe backend / source_universe_server | Scope/expiry, observed/inferred information, navigation and operations, request-local preparation, geometry | Inventory complete; source review in progress |
| Universe frontend / source_universe_ui | Pilot/map ownership, effects/cleanup, drafts/saves, workers, clock/camera and projection bounds | Inventory complete; source review in progress |
| Dashboard and broadcast / source_dashboard_ui | Resource identities, async refresh, global save queues, domain editors, public renderer privacy/recovery | Inventory complete; source review in progress |
| Tooling/tests / source_tooling_tests | Offline generators, packaging, fixture isolation, timing barriers, intentional failures and retained scaffold | Inventory complete; source review in progress |

Initial assessment: useful comments already explain several hard-won race/performance constraints, but module/API contracts are uneven. Preserve those explanations, correct stale statements only after checking implementation, and add nearby contracts at meaningful boundaries. A header alone does not establish coverage.

## Verification and banking

Planned verification: parse changed JavaScript/TypeScript/JSX and compare executable structure with the recovered baseline; compare Python executable AST and syntax where changed; inspect shell/HTML/CSS changes with appropriate parsers or exact non-comment preservation; run the existing type/build gates where annotations affect tooling; verify links/examples. Do not use naive regular-expression comment stripping. Independent review will inspect accuracy and coverage separately from parser checks.

All source edits are workspace-only until a checkpoint below confirms they were pushed. Authors do not commit shared work independently. The integration owner banks reviewed useful batches and verifies the remote head/tree. Behaviour corrections, if needed, require separate review and regression evidence; none is currently proposed.

- `1038033c49e6e15dcc4d7b40abb06ec63c8cfa5a`: inventory and phase instructions pushed; fetched back with identical Git tree.
- Foundation checkpoint: this commit banks Auth/ESI/Store/dataset/supervisor contracts. Syntax and executable-AST comparison pass; independent accuracy/coverage review remains in progress.

No new runtime/browser/performance acceptance is claimed. Build90 remains the verified application download; neither the refreshed manuals nor this phase's comments are retroactively added to that ZIP. Windows/DPAPI, live EVE permissions/SSO, actual OBS output and extended play retain the limits in [Validation](VALIDATION.md).
