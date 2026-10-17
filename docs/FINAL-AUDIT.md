# Final 0.8.0 release-readiness and development-baseline audit

Status: **in progress; not release acceptance**. The audit and justified remediation are authorized on `review/0.8.0-rc-premerge-bug-review`. PR #12 remains draft. Main, version `0.8.0-rc.17`, tags and stable releases are outside this authorization.

## Recovered starting point

GitHub PR metadata and remote refs were checked on 17 October 2026 UTC (18 October locally). The clean recovered checkout and GitHub agree on `b9f9e43ea84d3a7b1b8c206b48e442a75353b46d`; main is `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. The working audit checkout was cloned from that verified local repository, without discarding older workspaces.

[Build91](REVIEW-BUILD.md) remains the last independently verified download at audit start: source `99b8b0a19ab4e098cf34dcf051024ef7f97c6041`, tree `8839fdf8705fa8dff750687ac95b7a02491f80a5`, run `39076551873`, artifact `12117353379`. GitHub confirms the workflow passed and its artifact is unexpired, with SHA256 `1dd74fef9c6061060d03c597eaa6b2a0a047eb5323555613e2c0726d7005970c`, expiring 16 November 2026 at 23:05 UTC. The receipt, completed documentation ledgers/receipts, bug ledger and raw review evidence are preserved. Their results retain their original scope and source identity.

## Acceptance criteria and ownership

| Area | Audit owner | Required disposition | Status |
| --- | --- | --- | --- |
| Installation, first launch, configuration, authentication, operation, navigation, settings, recovery, shutdown/restart/upgrades | frontend_stream, packaging_ci, runtime_data | Coherent supported workflow, honest prerequisites and recovery | Reviewing |
| Runtime/privacy/persistence/datasets | runtime_data | Owned and drained work; private credentials/data; safe migration, activation, cancellation and rollback | Reviewing |
| Markets/import plans and Sessions/report/replay | markets_sessions | Correct calculations and observation ownership; bounded reads; save/request ownership | Reviewing |
| Universe geometry, navigation, scopes, expiry and provenance | universe | Correct boundaries, lifetimes, asynchronous owners and observed/inferred distinctions | Reviewing |
| Goals, Studio, Stream, OPSEC and OBS | frontend_stream | Accepted save order, private/public boundaries and output protection | Reviewing |
| Production data policy | runtime_data, root | Explicit preservation, upgrade/backup/restore/downgrade limits; approval decisions recorded | Reviewing |
| Future development baseline, documentation and source contracts | docs_tests, root | Clear ownership/setup/extension path, coherent authority, retained performance bounds | Reviewing |
| Tests and harnesses | all owners, docs_tests | Meaningful failures, races, recovery, isolation/cleanup and reproducible blocking results | Reviewing |
| CI, dependencies, packaging, provenance and notices | packaging_ci, root | Locked clean build, safe package, exact acceptance prerequisites and release boundary | Reviewing |
| Combined candidate and independent review | root and cross-reviewers | All confirmed corrections independently reviewed and appropriately validated together | Pending |

Coverage reports identify files and tests actually inspected/run, exclusions and remaining uncertainty. A passing count is not proof of an individual correction. New behavioral findings require real failing-before/fixed evidence, healthy controls and relevant failure/recovery/cost cases. Changed UI requires affected Chrome and Firefox flows including cold/navigation and narrow layouts where relevant. Any changed executable or packaging candidate needs fresh hosted acceptance and independent downloaded-package verification before replacing Build91.

## Findings

Findings below belong to this audit; earlier closed findings are not renumbered or silently reopened. Candidate concerns remain unconfirmed until supported by a reproduction or precise evidence.

| ID | Severity | Finding | Status / owner |
| --- | --- | --- | --- |
| FA-01 | High | POSIX startup creates a traversable data root before SQLite; WAL/SHM retain mode 0644 despite the main database becoming 0600. Real launcher-order reproduction with umask 022 exposes private plaintext journal data to other local accounts. | Confirmed; regression and bounded permission correction in progress, runtime_data |
| FA-02 | Medium | Packager includes ignored/untracked files and follows an out-of-checkout file symlink. Synthetic fixture reproduced inclusion; no claim that Build91 contained private material. | Confirmed; bounded packaging correction/regression in progress, packaging_ci |
| FA-03 | Release decision | Historical alpha discard allowance must not become stable data policy; complete stopped-profile restore needs explicit supported scope and direct evidence. | Policy/recovery assessment and test in progress, runtime_data/root |

Frontend candidates under reproduction: import settings accepted order across remount; OPSEC manual toggle versus unsaved policy draft; Studio accepted layout after ordinary navigation; pending tactical-window adoption after unmount. These are not yet accepted fixes or closed findings.

## Evidence, limits and exclusions

Established evidence: Build91's 1,215 packaged-runtime tests and 2,317 regression-browser checks plus baseline gates, exact downloaded ZIP verification, completed documentation verification and historical performance acceptance. These were not rerun merely by reading the records.

This environment has Node 24.19.0. Offline fresh dependency installation attempts failed because the local cache lacks `yocto-queue`; no clean install is claimed from those attempts. Existing dependency files with the matching lockfile receipt are being reused for local development checks. Hosted clean-checkout installation remains a separate gate. Local Chrome/Firefox executables are unavailable, so compiled browser reproductions will use the authorized blocking hosted workflow.

Real Windows/DPAPI under the actual user login, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output behavior and extended play remain environment checks. No new historical benchmark investigation, arbitrary dependency upgrade, feature work or broad rewrite is part of this phase. Dependency locking and notices review are distinct from a current vulnerability scan. No stable-release workflow will be run as an audit exercise.

## Banking and current acceptance

At ledger creation all audit changes are workspace-only and unverified as a combined candidate. Each pushed checkpoint, failed baseline, independent review and validation result will be recorded here or in linked audit evidence. Build91 remains the last verified download until a new artifact is explicitly accepted; it does not contain audit corrections.

Completion requires a disposition for every scope, resolved blockers or an explicit remaining block, independently reviewed banked source, exact build/source identities, coherent developer baseline and a concise readiness decision with remaining human checks and approval steps. Readiness itself authorizes no merge/version/tag/publication action.
