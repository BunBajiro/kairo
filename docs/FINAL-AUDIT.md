# Final 0.8.0 release-readiness and development-baseline audit

Status: **in progress; not release acceptance**. The audit and justified remediation are authorized on `review/0.8.0-rc-premerge-bug-review`. PR #12 remains draft. Main, version `0.8.0-rc.17`, tags and stable releases are outside this authorization.

## Recovered starting point

GitHub PR metadata and remote refs were checked on 17 October 2026 UTC (18 October locally). The clean recovered checkout and GitHub agree on `b9f9e43ea84d3a7b1b8c206b48e442a75353b46d`; main is `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. The working audit checkout was cloned from that verified local repository, without discarding older workspaces.

[Build91](BUILD91-VERIFICATION.json) is the independently verified starting package. Its receipt, completed documentation ledgers/receipts, bug ledger and raw review evidence remain unchanged and retain their original source/scope. [REVIEW-BUILD.md](REVIEW-BUILD.md) owns the current download.

## Acceptance criteria and ownership

| Area | Audit owner | Required disposition | Status |
| --- | --- | --- | --- |
| Installation, first launch, configuration, authentication, operation, navigation, settings, recovery, shutdown/restart/upgrades | frontend_stream, packaging_ci, runtime_data | Coherent supported workflow, honest prerequisites and recovery | Reviewed; combined acceptance pending |
| Runtime/privacy/persistence/datasets | runtime_data | Owned and drained work; private credentials/data; safe migration, activation, cancellation and rollback | Reviewed; combined acceptance pending |
| Markets/import plans and Sessions/report/replay | markets_sessions | Correct calculations and observation ownership; bounded reads; save/request ownership | Reviewed; combined acceptance pending |
| Universe geometry, navigation, scopes, expiry and provenance | universe | Correct boundaries, lifetimes, asynchronous owners and observed/inferred distinctions | Reviewed; combined acceptance pending |
| Goals, Studio, Stream, OPSEC and OBS | frontend_stream | Accepted save order, private/public boundaries and output protection | Reviewed; combined acceptance pending |
| Production data policy | runtime_data, root | Explicit preservation, upgrade/backup/restore/downgrade limits; approval decisions recorded | Reviewed; combined acceptance pending |
| Future development baseline, documentation and source contracts | docs_tests, root | Clear ownership/setup/extension path, coherent authority, retained performance bounds | Reviewed; combined acceptance pending |
| Tests and harnesses | all owners, docs_tests | Meaningful failures, races, recovery, isolation/cleanup and reproducible blocking results | Reviewed; combined acceptance pending |
| CI, dependencies, packaging, provenance and notices | packaging_ci, root | Locked clean build, safe package, exact acceptance prerequisites and release boundary | Reviewed; combined acceptance pending |
| Combined candidate and independent review | root and cross-reviewers | All confirmed corrections independently reviewed and appropriately validated together | Pending |

Coverage reports identify files and tests actually inspected/run, exclusions and remaining uncertainty. A passing count is not proof of an individual correction. New behavioral findings require real failing-before/fixed evidence, healthy controls and relevant failure/recovery/cost cases. Changed UI requires affected Chrome and Firefox flows including cold/navigation and narrow layouts where relevant. Any changed executable or packaging candidate needs fresh hosted acceptance and independent downloaded-package verification before replacing Build91.

## Findings

Findings below belong to this audit; earlier closed findings are not renumbered or silently reopened. Candidate concerns remain unconfirmed until supported by a reproduction or precise evidence.

| ID | Severity | Finding | Status / owner |
| --- | --- | --- | --- |
| FA-01 | High | POSIX startup creates a traversable data root before SQLite; WAL/SHM retain mode 0644 despite the main database becoming 0600. Real launcher-order reproduction with umask 022 exposes private plaintext journal data to other local accounts. | Corrected and independently reviewed; banked `42ed1f1`, combined acceptance pending |
| FA-02 | Medium | Packager includes ignored/untracked files and follows an out-of-checkout file symlink. Synthetic fixture reproduced inclusion; no claim that Build91 contained private material. | Corrected and independently reviewed; banked `ddfde52`, combined acceptance pending |
| FA-03 | Release decision | Historical alpha discard allowance must not become stable data policy; complete stopped-profile restore needs explicit supported scope and direct evidence. | Stopped-profile restore and real 0.7.3→0.8.0 upgrade independently reviewed; tests banked `42ed1f1`/`7d0b77c`; preservation/support decision recorded below |
| FA-04 | Medium | Advanced Broker Relations used the retired five-point relist discount instead of the permanent six-point discount, overstating trained-pilot repricing costs. | Corrected and independently reviewed; banked `24bba81`, combined acceptance pending |
| FA-05 | High | OPSEC manual toggle also persists unsaved policy fields; turning manual protection off can reveal broadcast output under an unaccepted High-Sec release draft. | Confirmed in both browsers/widths; correction independently reviewed and banked `edbc633`; fixed hosted gate pending |
| FA-06 | Medium | Studio remount uses stale bootstrap configuration; a subsequent save can overwrite a previously accepted layout. | Confirmed in both browsers/widths; correction independently reviewed and banked `edbc633`; fixed hosted gate pending |
| FA-07 | Medium | An older delayed import Apply can persist after a newer Apply across navigation and roll back destination settings. | Confirmed in both browsers/widths; per-hub queue independently reviewed and banked `edbc633`; fixed hosted gate pending |
| FA-08 | Medium | Deferred tactical-window success/rejection can outlive its Universe owner, leaving a stale child/portal or opening a fallback after unmount. | Confirmed in both browsers/widths; correction independently reviewed and banked `edbc633`; fixed hosted gate pending |
| FA-09 | Low | Landmark category picker contains a duplicate A0-star option/key. | Confirmed in both browsers/widths; duplicate removed, independently reviewed and banked `edbc633`; fixed hosted gate pending |
| FA-10 | Medium | Compiled frontend distribution omitted bundled dependency license texts. | Corrected and independently reviewed; banked `ddfde52`, combined acceptance pending |
| FA-11 | High (development surface) | Current RSC/plugin and Vite advisories affect retained source development dependencies; the distributed static client/standalone server does not execute their server handlers. | Corrected and independently reviewed; banked `019630e`, combined acceptance pending; [dependency disposition](final-audit/dependencies.md) |
| FA-12 | Medium (local runtime) | Node 24.19.0 built-in WebSocket crashes on an unsolicited protocol returned by a loopback OBS endpoint. | Corrected and independently reviewed; banked `58a6028`; old runtime fails the real OBS regression, patched Node passes; combined acceptance pending |

The [Build92 baseline receipt](final-audit/evidence/build92-baseline-verification.json) and [unaltered check rows](final-audit/evidence/build92-ui-baseline.json) preserve the actual failing probes against original executable UI at `090172169817feb7b6a4924424be75a8c0819a9f`. The workflow finished with the expected failing new gate; later baseline/package steps were skipped, so no review ZIP was produced. All 24 new scenarios completed in Chrome 155.0.8059.39 and Firefox 153.0 at 1600/390 pixels. Healthy/current-failure/retry controls remain alongside the failures; no baseline assertion was weakened to produce a passing candidate.

## Evidence, limits and exclusions

Established evidence: Build91's 1,215 packaged-runtime tests and 2,317 regression-browser checks plus baseline gates, exact downloaded ZIP verification, completed documentation verification and historical performance acceptance. These were not rerun merely by reading the records.

Initial local checks used Node 24.19.0 and reused dependencies matching the old lockfile after offline installation failed. Those results keep that scope. The final local source check passed 1,246/1,246 runtime tests on verified official Node 24.21.0. The corrected lock passed a clean installation, fresh build, types and 16 packaging controls; hosted installation/browser execution and downloaded-package acceptance remain separate gates. Local Chrome/Firefox binaries are unavailable.

Real Windows/DPAPI under the actual user login, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output behavior and extended play remain environment checks. No new historical benchmark investigation, arbitrary dependency upgrade, feature work or broad rewrite is part of this phase. Current npm and primary-upstream advisories are assessed in the dependency report; a scan count alone does not establish runtime reachability. No stable-release workflow will be run as an audit exercise.

## Banking and current acceptance

| Pushed checkpoint | Scope and actual validation |
| --- | --- |
| `c1621f2fdd9da4e02d2fac8bc03a5bf959358a99` | Recovered audit scope/criteria and phase instructions; remote head verified. |
| `090172169817feb7b6a4924424be75a8c0819a9f` | New browser probes and blocking gate only, preserving original executable UI. Build92 reproduces FA-05–09; download digest/CRC checked independently. |
| `42ed1f19fed884bf01fff7e8b74fc42d1889b15e` | FA-01 correction plus stopped-profile recovery coverage; original three permission regressions fail before/pass after, five final permission controls and 220 focused owner checks pass; independent reviewer 28/28. |
| `24bba81c1260748ec6177f4a1c0d829b7daec673` | FA-04 correction, authoritative fee formula and historical-plan preservation; 53 focused checks and independent rerun pass. |
| `ddfde52f1ded10ff18e9ab3cf8d195ec2e2bef57` | FA-02/10 package input boundaries, bundled notices and blocking Python gate; 16 focused controls and independent review pass. |
| `edbc633c7f70692c6dd077cfd7559e1472bee6c0` | FA-05–09 reviewed UI corrections, native OPSEC regression and preserved failing browser baseline; corrected hosted gate pending. |
| `7d0b77ca29aae5fb94f6dd059434825f4899fe49` | Real previous-release fixture and current-runtime upgrade/rollback/retry; 48 focused owner checks and 9 independent upgrade/retention checks pass. |
| `f26a270751398d4753f0bd7ae84e943b962abe7c` | Consolidated five owner reports by 55%; preservation policy and concise existing-guide updates. |
| `58a602826361dfb5d172f9fc7dab12897474b270` | FA-12 patched-runtime prerequisite, both launchers, actual OBS before/fixed regression; independent 29/29 and obsolete-launch/no-profile checks pass. |
| `019630e9ca3d7c19894f7ea0109b713bf881f11c` | FA-11 scoped dependency patches, retained platform constraints/notices, clean install/fresh build/types/16 packaging controls and independent review. |

These are banked corrections, not acceptance of a combined downloadable candidate. The [runtime/data](final-audit/runtime-data.md), [Markets/Sessions](final-audit/markets-sessions.md), [Universe](final-audit/universe.md), [frontend/Stream](final-audit/frontend-stream.md), [documentation/tests](final-audit/docs-tests.md) [packaging/CI](final-audit/packaging-ci.md) and [dependency advisories](final-audit/dependencies.md) reports retain owner coverage and review details. Later report dispositions are subordinate to the exact combined acceptance recorded here. Build91 remains the previous verified download until a new artifact is explicitly accepted; it does not contain audit corrections.

Completion requires a disposition for every scope, resolved blockers or an explicit remaining block, independently reviewed banked source, exact build/source identities, coherent developer baseline and a concise readiness decision with remaining human checks and approval steps. Readiness itself authorizes no merge/version/tag/publication action.

## Proposed production data boundary

Preserve durable user data. Support the tested 0.7.3→0.8.0 upgrade with a complete stopped-profile backup and same-account recovery; do not promise every historical alpha version, portable Windows DPAPI or in-place downgrade. [Persistence](PERSISTENCE.md#production-baseline-and-version-compatibility) owns the policy and recovery detail. Bun must approve this support boundary with the final release decision.

## Continuation checkpoint — 18 October 2026

**This is a resumable source checkpoint, not final release acceptance.** All corrections are complete, independently reviewed and banked. No agent has unfinished edits or an ongoing install/build. The only remaining source changes at checkpoint preparation are the finished CI Node-selection/prerequisite text and documentation integration committed with this ledger. Final combined hosted/download acceptance is the next task, not interrupted implementation.

The target remains the **0.8.0 build**, currently `0.8.0-rc.17`; 0.7.3 exists only as real prior-release upgrade fixture data. User instructions remain: follow the original final-audit handoff, keep docs lean, bank as you go, keep PR #12 draft, main/version unchanged, no merge/tag/stable-release invocation. Preserve the 74 closed findings and earlier completed evidence. The five detailed owner reports were cut from 8,413 to 3,808 words; use existing manuals as authority.

### Recover without this workspace

1. Read this ledger and the PR body from GitHub, inspect the actual review-branch head and latest `Kairo test build` run. Clone/fetch `BunBajiro/kairo`, branch `review/0.8.0-rc-premerge-bug-review`. Reconcile any local mismatch; do not assume this scratch directory survives. Main must still be `239794774320fcdebaa1d76ce8a77c5c25cfc48c`, PR #12 draft and package version `0.8.0-rc.17`.
2. Read the seven concise reports in `docs/final-audit/`, their linked receipts, `AGENTS.md`, `REVIEW-BUILD.md`, `DEVELOPMENT.md`, `VALIDATION.md` and both workflows. All fixtures, tests, source corrections, notices and required evidence are in Git. The previous accepted package is still Build91; Build92 is the intentional failing browser baseline, not a candidate.
3. Use current patched Node 24 LTS, at least 24.21.0 with embedded Undici 7.29.1. Official Linux 24.21.0 tarball SHA256 is `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`. The final lock SHA256 is `46a17f00e0282543e3b3b6bb691466d9fcda48fdd62819d646711de4dd404db9`. Source setup is `npm run install:ci`; do not copy old dependencies or claim an old Node run validates this prerequisite.

### Next work, in order

1. Finish the blocking review workflow for this combined candidate. If no current run exists, create a review-branch trigger commit with no application changes. Required gates include the new final-audit runner (28 cases: seven scenarios × Chrome/Firefox × desktop/narrow), all existing browser gates, 16 Python package-boundary controls and the packaged runtime suite. Do not weaken assertions or inherit Build91 acceptance. Preserve any new failure and remediate only its demonstrated cause.
2. Independently download the successful review ZIP and final-audit checks. Verify GitHub digest, ZIP CRC/path safety, exact eligible tracked source against the tested commit, generated client inventory/notices, and fresh extraction with no `node_modules`. Run `npm run test:kairo` there using supported Node; expected current source total is 1,246, but record the actual outcome. Obtain an independent package/receipt review.
3. Record a compact exact-source/build verification receipt, replace the current download handoff only after acceptance, finalize this ledger's area/finding dispositions, and update Validation/PR with current counts and limits. Keep older receipts/ledgers/raw evidence byte-identical. Recheck changed local links, clean status, remote source/tree, main/version and draft state. Bank metadata separately from the tested executable candidate.
4. Deliver the merge-readiness decision and remaining human/environment checks. The proposed production boundary is durable-data preservation and tested 0.7.3→0.8.0 upgrade with full stopped-profile, same-account recovery; no automatic backup/general import/in-place downgrade. Bun must approve that support boundary. Real Windows/DPAPI, live SSO/scopes/structures, actual OBS scene/audio/output and extended play remain separate environment checks. Third-party notices are corrected; no first-party license was invented. The dependency report transparently retains 28 npm advisory entries in unused server/build/scaffold owners; no zero-advisory or blanket production-safety claim is made.

### Practical recovery notes

The GitHub connector can bank even when shell `git push` lacks credentials: create blobs (base64 preserves bytes), create tree from the current remote tree, verify the exact local tree SHA, create commit with current remote parent, then `update_ref` with `expected_sha`. Fetch that commit and update the local branch ref without discarding work. Always inspect a rejected lease before retrying. Large lockfiles need bounded read chunks. No release/publish workflow is needed.

List workflow runs through `https://api.github.com/repos/BunBajiro/kairo/actions/runs?branch=review%2F0.8.0-rc-premerge-bug-review&per_page=3`; the connector's workflow-specific runs URL was rejected. Use run jobs/artifacts and artifact-download tools for evidence. Local browser binaries were unavailable, so browser acceptance is hosted. The latest all-source local gate and independent link/history checks are recorded in [the checkpoint receipt](final-audit/evidence/continuation-local-checks.json); these do not replace hosted/extracted acceptance.
