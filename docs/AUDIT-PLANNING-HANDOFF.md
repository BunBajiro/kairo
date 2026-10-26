# Kairo comprehensive audit: planning handoff

Historical requirements record. Execution has now begun; the [current ledger](AUDIT-LEDGER.md) and [approved fresh-data policy](PERSISTENCE.md#production-baseline-and-version-compatibility) supersede its planning-only timing and pending prior-version compatibility approval below.

Bun has paused release progression after repeated timing and recovery defects during 0.8.0 review. **The next chat plans the audit; a separate later chat executes it.** Do not start implementation, declare release readiness or turn this into a one-shot audit. First repeat this handoff into the new chat and ensure every delegated agent follows it.

## Recover the checkpoint

- Repository: `BunBajiro/kairo`; branch `review/0.8.0-rc-premerge-bug-review`; [draft PR #12](https://github.com/BunBajiro/kairo/pull/12).
- Version: `0.8.0-rc.17`. Main remains `239794774320fcdebaa1d76ce8a77c5c25cfc48c`.
- Executable source: `0eece9d7d5f60f0246dbfda89b5cb4f55e576979`; tree `3349f0b083bb9df8a88fc99f3f4fb36ade8d3d10`. Later receipt/handoff commits are documentation only; do not conflate their HEAD with tested source.
- Read [AGENTS.md](../AGENTS.md), the compact [focused-run ledger](MARKET-RECOVERY.md), [current download](REVIEW-BUILD.md) and [Build97 receipt](BUILD97-VERIFICATION.json). Recover from GitHub; the previous workspace may no longer exist.

The focused Jita recovery and additional edge-case pass is complete. The Build97 receipt records successful combined gates and independent download verification. Its scope is MR-01/02 and EC-01–09. Preserve the historical [final audit](FINAL-AUDIT.md), 74 closed [premerge findings](PREMERGE-BUG-REVIEW.md), documentation work and Build93/94 evidence; reopen a closed finding only with new evidence.

## Required outcome

Plan a comprehensive audit of **timing and other common programming and algorithm design/implementation issues across Kairo**. Its eventual execution must implement **robust yet performant error handling and recovery**, with evidence that valid data and user intent survive failures and the user can recover.

The plan must account for bounded retries, waiting and resource use; cancellation and provider cooldowns; malformed or unexpected responses; partial completion and restart; stale ownership and overlapping work; and uncertain command acknowledgement. These are observed problem patterns, not an exhaustive audit checklist. Retrying every operation is not a recovery policy: an accepted mutation may have succeeded despite a lost response. Preserve verified performance gains and establish relevant request, queue, memory and latency costs alongside correctness.

Bun also requires an error reporting/logging system for usage tests: enable/disable controls, normal and higher-detail levels, optional error toasts, and a **Logging** section in Settings to inspect errors and copy/export useful reports. Plan these as implementation deliverables, not documentation alone. Define what each level captures, bounded retention and event rates, correlation/context needed to diagnose failures, sensitive-data redaction, and performance evidence. Any diagnostics with material overhead must require a deliberate, explained opt-in. Toasts must be controllable and avoid floods from repeated errors; reports are shared by the user, without assuming permission for automatic telemetry. Inspect existing logging/toast owners before choosing how to extend them. This requirement belongs to the later staged audit, not an expansion of the finished focused pass.

Standardise Kairo's application notifications into **one integrated toast system** that modules can publish to, including the optional error notifications. Inventory and consolidate the existing separate implementations, with consistent behaviour, bounded queues and duplicate suppression. **Stream toasts are explicitly excluded.** The planning chat determines the migration and verification approach; do not add another isolated notification implementation.

The focused pass found invalid data entering caches or durable state, cancellation while awaiting admission, changing Session targets during a shared packet, and older accepted saves overwriting newer intent after navigation. Corrections now have owning regressions and independent review. OBS/Session write ordering is established within one dashboard lifetime; this is not proof of cross-tab, process-restart or every uncertain-acknowledgement behavior. Automated HTTP/SQLite and browser fixtures do not establish live-provider or native-environment reliability.

## Deliver from the planning chat

Produce a reviewable audit plan and a separate execution handoff: bounded phases, scope/coverage ledger, priorities justified by code and evidence, ownership and independent-review assignments, reproduction and fault-injection approach, performance/recovery acceptance criteria, CI/build gates, and explicit unresolved questions. The execution handoff must identify the approved plan and exact starting bank so the following chat can work without inherited workspace state. Keep repository documentation concise; link existing evidence instead of copying it.

Bank completed, independently reviewable units on the review branch as work proceeds. Record exact commits, verification status, limits and next actions in a ledger; a local edit or interrupted task is not a safe bank point. No main push, merge, version bump, tag, publication or PR-ready action is authorized. Release remains paused pending this staged work and final human approval.

Real Windows/DPAPI, live EVE permissions/SSO/structures, actual OBS output and extended play remain environment checks. The durable-data policy and 0.7.3→0.8.0 upgrade/full stopped-profile recovery boundary still require Bun's approval; earlier alpha data-discard permission does not carry forward.
