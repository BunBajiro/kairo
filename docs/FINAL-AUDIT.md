# Final 0.8.0 release-readiness and development-baseline audit

Status: **audit complete; Build93 accepted for final human review**. Confirmed technical findings are corrected, independently reviewed and verified together on `review/0.8.0-rc-premerge-bug-review`. [The receipt](BUILD93-VERIFICATION.json) binds that decision to the exact downloaded package. PR #12 remains draft; version remains `0.8.0-rc.17`. This decision authorizes no main push, merge, version change, tag or publication.

## Recovered starting point

GitHub PR metadata and remote refs were checked on 17 October 2026 UTC (18 October locally). The clean recovered checkout and GitHub agree on `b9f9e43ea84d3a7b1b8c206b48e442a75353b46d`; main is `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. The working audit checkout was cloned from that verified local repository, without discarding older workspaces.

[Build91](BUILD91-VERIFICATION.json) is the independently verified starting package. Its receipt, completed documentation ledgers/receipts, bug ledger and raw review evidence remain unchanged and retain their original source/scope. [REVIEW-BUILD.md](REVIEW-BUILD.md) owns the current download.

## Acceptance criteria and ownership

| Area | Audit owner | Required disposition | Status |
| --- | --- | --- | --- |
| Installation, first launch, configuration, authentication, operation, navigation, settings, recovery, shutdown/restart/upgrades | frontend_stream, packaging_ci, runtime_data | Coherent supported workflow, honest prerequisites and recovery | Reviewed; Build93 accepted |
| Runtime/privacy/persistence/datasets | runtime_data | Owned and drained work; private credentials/data; safe migration, activation, cancellation and rollback | Reviewed; Build93 accepted |
| Markets/import plans and Sessions/report/replay | markets_sessions | Correct calculations and observation ownership; bounded reads; save/request ownership | Reviewed; Build93 accepted |
| Universe geometry, navigation, scopes, expiry and provenance | universe | Correct boundaries, lifetimes, asynchronous owners and observed/inferred distinctions | Reviewed; Build93 accepted |
| Goals, Studio, Stream, OPSEC and OBS | frontend_stream | Accepted save order, private/public boundaries and output protection | Reviewed; Build93 accepted |
| Production data policy | runtime_data, root | Explicit preservation, upgrade/backup/restore/downgrade limits; approval decisions recorded | Tests accepted; Bun’s policy approval outstanding |
| Future development baseline, documentation and source contracts | docs_tests, root | Clear ownership/setup/extension path, coherent authority, retained performance bounds | Reviewed; Build93 accepted |
| Tests and harnesses | all owners, docs_tests | Meaningful failures, races, recovery, isolation/cleanup and reproducible blocking results | Reviewed; Build93 accepted |
| CI, dependencies, packaging, provenance and notices | packaging_ci, root | Locked clean build, safe package, exact acceptance prerequisites and release boundary | Reviewed; Build93 accepted |
| Combined candidate and independent review | root and cross-reviewers | All confirmed corrections independently reviewed and appropriately validated together | Build93 hosted, downloaded-package and independent reviews pass |

Coverage reports identify files and tests actually inspected/run, exclusions and remaining uncertainty. A passing count is not proof of an individual correction. New behavioral findings require real failing-before/fixed evidence, healthy controls and relevant failure/recovery/cost cases. Changed UI requires affected Chrome and Firefox flows including cold/navigation and narrow layouts where relevant. Any later executable or packaging change needs fresh applicable acceptance; Build93 results do not transfer to a different candidate.

## Findings

Findings below belong to this audit; earlier closed findings are not renumbered or silently reopened. Candidate concerns remain unconfirmed until supported by a reproduction or precise evidence.

| ID | Severity | Finding | Status / owner |
| --- | --- | --- | --- |
| FA-01 | High | POSIX startup creates a traversable data root before SQLite; WAL/SHM retain mode 0644 despite the main database becoming 0600. Real launcher-order reproduction with umask 022 exposes private plaintext journal data to other local accounts. | Corrected and independently reviewed; banked `42ed1f1`, Build93 accepted |
| FA-02 | Medium | Packager includes ignored/untracked files and follows an out-of-checkout file symlink. Synthetic fixture reproduced inclusion; no claim that Build91 contained private material. | Corrected and independently reviewed; banked `ddfde52`, Build93 accepted |
| FA-03 | Release decision | Historical alpha discard allowance must not become stable data policy; complete stopped-profile restore needs explicit supported scope and direct evidence. | Stopped-profile restore and real 0.7.3→0.8.0 upgrade independently reviewed; tests banked `42ed1f1`/`7d0b77c`; preservation/support decision recorded below |
| FA-04 | Medium | Advanced Broker Relations used the retired five-point relist discount instead of the permanent six-point discount, overstating trained-pilot repricing costs. | Corrected and independently reviewed; banked `24bba81`, Build93 accepted |
| FA-05 | High | OPSEC manual toggle also persists unsaved policy fields; turning manual protection off can reveal broadcast output under an unaccepted High-Sec release draft. | Confirmed in both browsers/widths; correction independently reviewed and banked `edbc633`; Build93 gate accepted |
| FA-06 | Medium | Studio remount uses stale bootstrap configuration; a subsequent save can overwrite a previously accepted layout. | Confirmed in both browsers/widths; correction independently reviewed and banked `edbc633`; Build93 gate accepted |
| FA-07 | Medium | An older delayed import Apply can persist after a newer Apply across navigation and roll back destination settings. | Confirmed in both browsers/widths; per-hub queue independently reviewed and banked `edbc633`; Build93 gate accepted |
| FA-08 | Medium | Deferred tactical-window success/rejection can outlive its Universe owner, leaving a stale child/portal or opening a fallback after unmount. | Confirmed in both browsers/widths; correction independently reviewed and banked `edbc633`; Build93 gate accepted |
| FA-09 | Low | Landmark category picker contains a duplicate A0-star option/key. | Confirmed in both browsers/widths; duplicate removed, independently reviewed and banked `edbc633`; Build93 gate accepted |
| FA-10 | Medium | Compiled frontend distribution omitted bundled dependency license texts. | Corrected and independently reviewed; banked `ddfde52`, Build93 accepted |
| FA-11 | High (development surface) | Current RSC/plugin and Vite advisories affect retained source development dependencies; the distributed static client/standalone server does not execute their server handlers. | Corrected and independently reviewed; banked `019630e`, Build93 accepted; [dependency disposition](final-audit/dependencies.md) |
| FA-12 | Medium (local runtime) | Node 24.19.0 built-in WebSocket crashes on an unsolicited protocol returned by a loopback OBS endpoint. | Corrected and independently reviewed; banked `58a6028`; old runtime fails the real OBS regression, patched Node passes; Build93 accepted |

The [Build92 baseline receipt](final-audit/evidence/build92-baseline-verification.json) and [unaltered check rows](final-audit/evidence/build92-ui-baseline.json) preserve the actual failing probes against original executable UI at `090172169817feb7b6a4924424be75a8c0819a9f`. The workflow finished with the expected failing new gate; later baseline/package steps were skipped, so no review ZIP was produced. All 24 new scenarios completed in Chrome 155.0.8059.39 and Firefox 153.0 at 1600/390 pixels. Healthy/current-failure/retry controls remain alongside the failures; no baseline assertion was weakened to produce a passing candidate.

## Evidence, limits and exclusions

Build93 passed a clean locked install, types, fresh build, 16 Python packaging controls, **2,713 regression-browser checks** plus the existing baseline gates, and **1,246 packaged-runtime tests**. Independent download verification matched GitHub’s digest, all **635 eligible tracked files** and **21 generated client files**, safe archive paths/modes, client references and bundled notices. A fresh extraction without `node_modules` independently passed **1,246/1,246** on official Node **24.22.0 / Undici 7.29.1**, with zero failures, cancellations or skips.

The new browser gate passed **28 cases / 396 checks** across Chrome/Firefox at 1600/390 pixels: all 60 original failures now pass, all 236 healthy baseline controls remain, and 100 added ownership checks pass. Original assertions were not weakened. The [receipt and durable raw records](BUILD93-VERIFICATION.json) separate hosted results, independent checks and visual/native-platform limits.

Earlier Build91/performance and local-source checks retain their original scope. An initial extracted run accidentally selected unsupported host Node 24.19.0 after archive extraction lost executable permissions; its failed result is explicitly excluded in the receipt. Restoring official binary modes and verifying the actual selected runtime resolved the environment setup error; no application change was made.

Real Windows/DPAPI under the actual login, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output and extended play remain human environment checks. Native platform PiP was not certified by the controlled window-lifetime harness. Current dependency findings remain explicitly scoped in the [dependency report](final-audit/dependencies.md); no zero-advisory or blanket safety claim is made. No new historical benchmark investigation or stable-release workflow execution was part of this audit.

## Banking and current acceptance

| Pushed checkpoint | Scope and actual validation |
| --- | --- |
| `c1621f2fdd9da4e02d2fac8bc03a5bf959358a99` | Recovered audit scope/criteria and phase instructions; remote head verified. |
| `090172169817feb7b6a4924424be75a8c0819a9f` | New browser probes and blocking gate only, preserving original executable UI. Build92 reproduces FA-05–09; download digest/CRC checked independently. |
| `42ed1f19fed884bf01fff7e8b74fc42d1889b15e` | FA-01 correction plus stopped-profile recovery coverage; original three permission regressions fail before/pass after, five final permission controls and 220 focused owner checks pass; independent reviewer 28/28. |
| `24bba81c1260748ec6177f4a1c0d829b7daec673` | FA-04 correction, authoritative fee formula and historical-plan preservation; 53 focused checks and independent rerun pass. |
| `ddfde52f1ded10ff18e9ab3cf8d195ec2e2bef57` | FA-02/10 package input boundaries, bundled notices and blocking Python gate; 16 focused controls and independent review pass. |
| `edbc633c7f70692c6dd077cfd7559e1472bee6c0` | FA-05–09 reviewed UI corrections, native OPSEC regression and preserved failing browser baseline; Build93 gate accepted. |
| `7d0b77ca29aae5fb94f6dd059434825f4899fe49` | Real previous-release fixture and current-runtime upgrade/rollback/retry; 48 focused owner checks and 9 independent upgrade/retention checks pass. |
| `f26a270751398d4753f0bd7ae84e943b962abe7c` | Consolidated five owner reports by 55%; preservation policy and concise existing-guide updates. |
| `58a602826361dfb5d172f9fc7dab12897474b270` | FA-12 patched-runtime prerequisite, both launchers, actual OBS before/fixed regression; independent 29/29 and obsolete-launch/no-profile checks pass. |
| `019630e9ca3d7c19894f7ea0109b713bf881f11c` | FA-11 scoped dependency patches, retained platform constraints/notices, clean install/fresh build/types/16 packaging controls and independent review. |
| `763960b5a764f6791fa1de410ebaa1f8360ddfa3` | Complete combined candidate; Build93’s exact tested source/tree and hosted/download acceptance are recorded in the receipt. |
| `6a93b136de931a60b80d7ced1ad7b293135250f1` | Safe pre-refresh handoff; ledger-only change pinned the running Build93 identity. Subsequent acceptance records do not alter that ZIP. |

Build93 supersedes Build91 as the verified review download. The [runtime/data](final-audit/runtime-data.md), [Markets/Sessions](final-audit/markets-sessions.md), [Universe](final-audit/universe.md), [frontend/Stream](final-audit/frontend-stream.md), [documentation/tests](final-audit/docs-tests.md), [packaging/CI](final-audit/packaging-ci.md) and [dependency](final-audit/dependencies.md) reports retain finding-specific coverage, independent reviews and exclusions. Earlier completed ledgers, receipts and raw evidence remain unchanged. This ledger and the new receipt own current acceptance; the existing manuals own product/developer contracts.

## Proposed production data boundary

Preserve durable user data. Support the tested 0.7.3→0.8.0 upgrade with a complete stopped-profile backup and same-account recovery; do not promise every historical alpha version, portable Windows DPAPI or in-place downgrade. [Persistence](PERSISTENCE.md#production-baseline-and-version-compatibility) owns the policy and recovery detail. Bun must approve this support boundary with the final release decision.

## Final handoff and resumption

The target is **0.8.0**, currently `0.8.0-rc.17`; 0.7.3 is solely the real previous-release upgrade fixture. All authorized implementation, regression evidence and combined acceptance are complete. No unfinished source edit or running verification is needed to resume. Current records were written after package verification and are not retroactively inside the ZIP.

Recover from GitHub, not a scratch workspace: clone/fetch `BunBajiro/kairo`, review branch `review/0.8.0-rc-premerge-bug-review`, then read this ledger, [current build](REVIEW-BUILD.md), [verification receipt](BUILD93-VERIFICATION.json), `AGENTS.md` and PR #12. Verify the remote head and clean checkout; the PR stays draft, main stays `239794774320fcdebaa1d76ce8a77c5c25cfc48c`, and the version stays `0.8.0-rc.17` unless Bun subsequently authorizes a change. Raw check rows, package inventory and extracted-runtime output are banked with the receipt; downloadable artifacts have the expiry listed in the handoff.

The next action belongs to final human review: assess the real-environment checks above and approve the production data boundary. First-party licensing was not chosen by this audit. If Bun then authorizes a stable release, prepare matching stable package/lock versions and changelog on the review branch and verify that resulting candidate before merge. The main-branch release workflow can automatically publish when `package.json` changes; it does not repeat the browser gates. Final approval must therefore cover both merge and publication. Do not run it merely to test the audit.

For later authorized work, bank finished, verified units on the review branch and keep this ledger current; do not reopen the 74 closed historical findings without new evidence or expand the manuals with duplicate audit narrative. GitHub’s expected-head ref update can bank a verified tree when shell push credentials are unavailable; inspect any rejected lease before retrying.
