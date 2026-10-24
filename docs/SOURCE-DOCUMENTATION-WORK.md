# 0.8.0 source documentation ledger

This phase documents first-party source contracts and maintainability. The completed [manual documentation work](DOCUMENTATION-WORK.md), [74 closed premerge findings](PREMERGE-BUG-REVIEW.md) and raw review evidence retain their original scope. Version remains **0.8.0-rc.17**. No merge, release or version bump is authorised; PR #12 stays draft.

**Complete for review.** All seven ownership areas and independent reviews are complete. The entire source pass is pushed at `b24948b04828b73b7a47b703d6ff18f821aafeeb`; its fetched Git tree exactly matches the validated local tree. This final receipt records completion without changing source or expanding the validation claims below.

## Recovery and scope

On 17 October 2026 the clean workspace, remote branch and GitHub PR #12 agreed on `8c19913842c5770daa76b1d640d5960c1ef41e13`. PR #12 was open/draft on `review/0.8.0-rc-premerge-bug-review`; main was `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Build90 application source remains `5c55cbbbae6c935a86ad5dde71cc1899958fde62`. Recovery verified actual repository state before edits.

[The inventory](SOURCE-DOCUMENTATION-INVENTORY.json) classifies every baseline tracked path, including unchanged files and exclusions. Authors review owning source and relevant tests before adding purpose, lifecycle, inputs/results, side effects, error behaviour, asynchronous ownership and bounded-cost explanations. Simple self-explanatory helpers do not require narration. Declarations and styles are reviewed with their owners; generated data/assets, dependency locks, vendored dependencies and reference data are preserved. Retained Sites/D1 and upstream UI scaffolding are identified at their entry boundaries rather than documented as the local Kairo runtime.

## Work areas

| Area / author | Principal contracts | State |
| --- | --- | --- |
| Core / root | Composition, HTTP guards, accepted request draining, catalog/Registry extension contracts, semantic bus and SSE backpressure | Complete; independently reviewed |
| Foundation / source_foundation | Startup/replacement, Auth/Vault, ESI pacing/cache/pagination, Store/migrations, dataset preparation/cancellation/rollback | Complete; independently reviewed |
| Domains / source_domains | Markets/import assumptions and saved plans, Sessions/replay, Goal accounting, Stream/OBS/OPSEC, shared transport | Complete; independently reviewed |
| Universe backend / source_universe_server | Scope/expiry, observed/inferred information, navigation and operations, request-local preparation, geometry | Complete; independently reviewed |
| Universe frontend / source_universe_ui | Pilot/map ownership, effects/cleanup, drafts/saves, workers, clock/camera and projection bounds | Complete; independently reviewed |
| Dashboard and broadcast / source_dashboard_ui | Resource identities, async refresh, global save queues, domain editors, public renderer privacy/recovery | Complete; independently reviewed |
| Tooling/tests / source_tooling_tests | Offline generators, packaging, fixture isolation, timing barriers, intentional failures and retained scaffold | Complete; independently reviewed |

Initial assessment: useful comments already explain several hard-won race/performance constraints, but module/API contracts are uneven. Preserve those explanations, correct stale statements only after checking implementation, and add nearby contracts at meaningful boundaries. A header alone does not establish coverage.

## Verification and banking

Integrated verification passed: 235 JavaScript/TypeScript/JSX files preserve parsed structure and tooling annotations; six Python files preserve complete AST; three stylesheets preserve PostCSS structure; five shell/launcher files preserve their complete original bodies with only header comments inserted. Shell syntax, types and a fresh build pass. All 551 local links (60 heading fragments) across 34 Markdown files and 159 source references to 24 guides resolve. No naive regular-expression comment stripping was used. Independent review checked accuracy and coverage separately from parser checks; all findings were documentation refinements and are resolved.

The checkpoints below distinguish pushed work from their validation state. Authors did not commit shared work independently. The integration owner banks reviewed batches and verifies the remote head/tree. No application correction was required or introduced.

- `1038033c49e6e15dcc4d7b40abb06ec63c8cfa5a`: inventory and phase instructions pushed; fetched back with identical Git tree.
- `528663c164af47b0b406f0f182c6299f2fb2df40`: foundation contracts pushed and fetched back with identical Git tree; syntax/AST checks passed at banking, then independent review accepted with one later wording refinement.
- `b24948b04828b73b7a47b703d6ff18f821aafeeb`: completed source pass, resolved independent reviews and verification receipt pushed; fetched tree `f4f2ce6e44c1da83e3947e1c414c355ac81d6753` matches the validated local tree exactly.

At completion of this documentation phase, no new runtime/browser/performance acceptance was claimed. Build90 remained the verified application download then; neither the refreshed manuals nor this phase's comments were retroactively added to that ZIP. Windows/DPAPI, live EVE permissions/SSO, actual OBS output and extended play retain the limits in [Validation](VALIDATION.md). Subsequent consolidation is recorded separately below.

## Coverage and independent review

The inventory accounts for all **575 baseline tracked paths**. It distinguishes 249 comment-edited source/tooling/test files, reviewed unchanged helpers/declarations/styles/tests, 62 retained upstream UI/hook files, and 73 manual/evidence/data/vendor/configuration paths outside source scope (including three supporting phase/navigation edits). Generated topology/detail shards, reference JSON, binary assets, lockfiles and fixture payloads are not comment targets; their contracts live at readers/builders. Existing clear names, types, tests and comments are retained where further prose would duplicate them.

| Area | Independent reviewer | Disposition |
| --- | --- | --- |
| Core/HTTP/bus/Registry/SSE | source_foundation | Accepted; clarified skipped-heartbeat return semantics. |
| Auth/ESI/Store/datasets/lifecycle | source_domains | Accepted; clarified that close refuses new API calls, including private reads. |
| Markets/Sessions/Goals/Stream/OBS | source_universe_server | Accepted; refined pagination/worker counts, toast-family and retained-visual semantics; removed duplicate prose. |
| Universe backend/shared geometry | source_tooling_tests | Accepted; refined timestamp tolerances, partial reports/saves, nullable reference values, cache bounds, geometry fallback, disabled refresh and lookup outcomes. |
| Universe/Maps frontend | source_dashboard_ui | Accepted; refined coordinate spaces, missing-expiry tracing, clock visibility, geometry identity, optional clocks and plan checks. |
| Dashboard/domain editors/broadcast | source_universe_ui | Accepted; clarified replay smoothing versus follow ownership. |
| Tooling/scaffold/test harnesses | root | Accepted; checked units, output/publication order, real versus injected boundaries, cleanup and unchanged-path exclusions. |

Parser preservation is independently reviewed too. It compares syntax trees and printed executable structure, plus parsed compiler directives and tooling-sensitive annotations; Python retains complete AST including docstrings, CSS uses PostCSS nodes, and shell/launcher changes preserve the exact original body with only header comments inserted. The [verification receipt](SOURCE-DOCUMENTATION-VERIFICATION.json) records final results and source identities. New prose examples are explanatory contracts; no new executable example or API was introduced.

The existing type check and fresh build passed. Two focused existing helper/model/renderer sets passed (129 and 90 tests, 219 total); these are scoped Node checks, not new browser runs or a rerun of all 1,215 runtime tests. During this documentation phase, no timing comparison, new application package or broader acceptance claim was made.

## Post-phase consolidated review build

After this phase, Bun authorised Build91 to package the reviewed application together with the completed manuals and source comments. Its tested source is `99b8b0a19ab4e098cf34dcf051024ef7f97c6041`; the [current review handoff](REVIEW-BUILD.md) records the accepted download and separate verification. Hosted packaged-runtime and browser checks, followed by independent downloaded-package verification, belong to that build's evidence; they do not alter the original phase receipts above. No new performance measurement or separate full source-runtime run is claimed.

Build91 includes documentation at its tested source commit. This post-build handoff update and the new Build91 receipt are branch records, not additions to the already-created ZIP. The completed bug-review ledger, raw review evidence and earlier phase receipts remain unchanged. PR #12 remains draft, version remains `0.8.0-rc.17`, and no merge or release was performed.
