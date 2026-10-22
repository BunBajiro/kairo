# Comprehensive audit: execution handoff

**Staged execution has begun with P0 inventory.** Recover from the current [ledger](AUDIT-LEDGER.md) and [P0 continuation](audit-p0/README.md); the original planning checkpoints below remain historical. Inventory is not behavioral acceptance, baseline measurement or implementation. Release progression remains paused.

## Recover exact state

P0-01 inventory and clean-slate policy are banked at [`f9cd6935932401bf39e3a32c1fa3d56446844144`](https://github.com/BunBajiro/kairo/commit/f9cd6935932401bf39e3a32c1fa3d56446844144), with read-back continuation `5f63d8c6195844aad9c620dfe3b5312921c93be1`. [P0-02A](audit-p0/command-contracts.md) is independently reviewed and banked at [`61d972b63306d73021221536be89b316b5ff40e1`](https://github.com/BunBajiro/kairo/commit/61d972b63306d73021221536be89b316b5ff40e1): source-grounded settings/OBS/Session contracts only. Exact remote tree/bytes were read back; the following documentation receipt records that verification. It is not implementation or new runtime acceptance.

The earlier P0-02B WIP bank `9e72c08c6a786d908be7d4ba5203dec44266d14c` was recovered on 22 October 2026 with unchanged main and open/draft PR. Its [historical WIP receipt](audit-p0/command-followup-wip.json) remains intact. **P0-02B Auth/module dependencies are now source/design reviewed**: [Auth](audit-p0/auth-command-contracts.md), [Modules](audit-p0/module-command-contracts.md), [review receipt](audit-p0/command-followup-verification.json). This continuation contains their acceptance; identify its exact bank from GitHub, and do not confuse it with the tested executable.

Resume **P0-02C OPSEC/Stream controls and local output** (HTTP-039/049/050–053, with read/preview/public-delivery dependencies). Settle immediate conservative Stream/OBS and binding fences, derived-event failure order, command receipts and bounded test-output outcomes; these are explicit Auth/module implementation prerequisites. Then continue the remaining command families. P0-03 diagnostics decisions and P0-04 measured budgets remain pending. Check current remote state before continuing; do not repeat completed units absent a relevant source delta.

- Repository: `BunBajiro/kairo`; branch `review/0.8.0-rc-premerge-bug-review`; [PR #12](https://github.com/BunBajiro/kairo/pull/12) remains open/draft.
- **Exact plan/start bank: [`4a2f6b2d023b776fa19bf4841224dae8801fce71`](https://github.com/BunBajiro/kairo/commit/4a2f6b2d023b776fa19bf4841224dae8801fce71).** It contains the independently reviewed [plan](https://github.com/BunBajiro/kairo/blob/4a2f6b2d023b776fa19bf4841224dae8801fce71/docs/COMPREHENSIVE-AUDIT-PLAN.md) and initial [ledger](https://github.com/BunBajiro/kairo/blob/4a2f6b2d023b776fa19bf4841224dae8801fce71/docs/AUDIT-LEDGER.md).
- That bank descends directly from completed continuation bank `814710ba9e16f18ecb0524c745347842650f7684`. This handoff and current navigation pointers are a subsequent **documentation-only continuation**, identified by the immutable commit in its handover link. Retain them when working from the review branch; do not reset away later work.
- **Build97 executable source remains `0eece9d7d5f60f0246dbfda89b5cb4f55e576979`; executable tree `3349f0b083bb9df8a88fc99f3f4fb36ade8d3d10`.** Neither planning bank is a new tested executable.
- Version `0.8.0-rc.17`; last verified main `239794774320fcdebaa1d76ce8a77c5c25cfc48c`.

Recover from GitHub, not a surviving workspace. Read current branch/main/PR first and compare any advance from the exact plan bank. Confirm the expected handoff/pointer delta is documentation-only; inspect other advances before choosing the execution base. Record the resulting exact continuation SHA in the ledger. Never overwrite an advanced branch or assume an inherited workspace is newer.

Read `AGENTS.md`, the [original requirements handoff](AUDIT-PLANNING-HANDOFF.md), [audit plan](COMPREHENSIVE-AUDIT-PLAN.md), [ledger](AUDIT-LEDGER.md), [focused recovery ledger](MARKET-RECOVERY.md), [current build](REVIEW-BUILD.md) and [Build97 receipt](BUILD97-VERIFICATION.json). Restate checkpoint/scope in chat and require **every subagent** to read the same handoff and constraints.

## Execute in bounded units

Follow plan P0–P6: recover/map/baseline; shared safety boundaries; domain/algorithm waves; commands/UI integration; diagnostics/toast implementation; cross-owner faults/performance; integrated review candidate. The plan owns priorities, owner entry points, fault schedules, acceptance and gates; do not duplicate it or turn the work into a one-shot pass.

**Bun explicitly confirmed that execution need not finish in one shot or one chat.** Use as many sessions as needed; a phase, including P0, may span several. At each session boundary bank completed reviewable units, state incomplete gates accurately and give the next concrete action. Each new session verifies GitHub state and resumes the ledger without repeating completed work or rushing acceptance to fit remaining context/time/usage.

**First phase is P0; its reviewed inventory is in [P0-01](audit-p0/README.md). Resume the next bounded unit from the ledger.** Expand C01–C16 into a complete current file/feature/API/collector/command denominator, assign named owners and different reviewers, record meaningful existing proof and missing coverage, classify command commit/ack/reconciliation boundaries, finalize diagnostics/toast inventory and measure affected baseline workloads. Set numerical budgets before the corresponding implementation. Bank these reviewable units before broad implementation; do not require all later native/live checks to start deterministic work.

For each subsequent defect: retain failing-before reproduction and healthy controls, fix in the owning boundary, verify actual data/intent and resource cost, independently review, then bank exact source/evidence. New features use requirement acceptance tests. Parallelize disjoint owners after shared contracts settle; one writer per shared file. Update coverage even when no defect is found. A green subset or pushed-but-unverified correction is not completion.

Required implementation outcomes are robust performant recovery, configurable Off/Normal/Detailed reporting, Settings **Logging** with useful copy/export, optional flood-controlled error toasts, and one integrated application-toast interface using existing delivery ownership. These are **not implemented by Build97**. Preserve valid data, cancellation/cooldowns and user intent; reconcile uncertain mutations without blind resubmission. Stream toasts are excluded from consolidation; native desktop/audio consent remains unchanged. Diagnostics are local and redacted; no automatic telemetry.

## Decisions and acceptance still open

- Proposed defaults: Normal capture on, Detailed/error toasts off; the plan's finite caps are starting proposals to measure, not verified costs or Bun's explicit approval. At P0 settle persistence versus memory, supervisor crash-report ownership, clear/export races, previous-report retention and safe cross-tab settings. Temporary detail restores prior Off/Normal choice, respecting newer user choices.
- [P0-02A](audit-p0/command-contracts.md) selects authoritative order/conflict/read-back semantics for settings, OBS and Sessions; these are not yet implemented or behaviorally verified. P0-02B extends these rules through Auth/module dependencies; remaining families start with OPSEC/Stream output. Build97's OBS/Session ordering covers one dashboard lifetime, not cross-tab/restart or all lost acknowledgments.
- Bun approved the [fresh-data 0.8.0 policy](PERSISTENCE.md#production-baseline-and-version-compatibility) on 21 October: expect no prior-version data carryover; destructive prior-version incompatibility is authorized until finalization. 0.7.3 compatibility is no longer owed. The audit assumes no existing data, allowing storage redesign/reset without legacy preservation, migration, recovery or handling gates. Standard durable-data policy resumes from finalized 0.8.0 onward; use fresh synthetic profiles to verify intended behavior.
- Native Windows/DPAPI, live EVE SSO/scopes/structures, actual OBS output, native PiP and extended play remain environment limits. Automated fixtures cannot certify them.

Preserve the 74 closed findings, completed final audit, MR/EC receipts and historical performance evidence. Reopen only with new evidence. Unresolved confirmed defects, missing feature acceptance or blocked automated coverage prevent comprehensive-completion claims; scope reductions require Bun's recorded decision.

Use plan G1–G5 for later verification: owning tests, affected integration, both browser engines, matched costs, full blocking candidate workflow, then independent exact-artifact download/source checks and extracted-runtime tests. Browser harnesses sharing ports run serially. Build97 counts remain historical proof; no requirement to rerun or reproduce them merely to read this handoff. If its artifact expires, any rebuilt artifact needs a new identity and receipt.

## Planning bank receipt and continuation discipline

`4a2f6b2d023b776fa19bf4841224dae8801fce71` was read back from GitHub: both files matched the reviewed local text; comparison against `814710b…` showed exactly two new documentation files. Eighteen relative documentation targets and all sixteen coverage IDs were checked. Independent review: `plan_review`, with `plan_review/diagnostic_contract_review`; gate/source feasibility: `verification_plan`. All delegates followed the mandatory handoff. No product findings or runtime evidence were generated. `[skip ci]` intentionally avoided an unnecessary executable build.

The separate handoff, ledger receipt and current-pointer changes were independently accepted by `plan_review`; 66 relative documentation links in that continuation were checked. This remains documentation verification only.

For every next bank record commit, executable source/tree versus evidence bank, gates actually run, reviewer/disposition, limits and next bounded action. Read back remote state. Interrupted/local-only work is not a safe bank point. Keep PR #12 draft and version/main unchanged. **No main push, merge, version bump, tag, publication or PR-ready action is authorized.**
