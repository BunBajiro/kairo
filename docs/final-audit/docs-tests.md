# Documentation, development baseline and harness audit

Audit owner: `docs_tests`. Starting source: `b9f9e43ea84d3a7b1b8c206b48e442a75353b46d` on `review/0.8.0-rc-premerge-bug-review`. This is a source review of the final-audit candidate, not a new claim of Build91 execution. Integration, later changes and banking are recorded in the final-audit ledger.

## Scope and acceptance

Reviewed the handoff, `AGENTS.md`, documentation index, development/architecture/internal API/HTTP guides, Validation, current Build91 handoff and receipt, both completed documentation ledgers and receipts, and the history index. Compared setup commands with package scripts/install/build wrappers; compared extension and request examples with their owning interfaces and established example-execution evidence. Reviewed retained scaffold entrypoints and tests. Inspected both Actions workflows for test selection and failure propagation; packaging and release mechanics have a separate owner.

Acceptance is a developer being able to identify the real runtime, use an isolated profile, locate behavior and its tests, extend through an existing owner, and distinguish current instructions from historical acceptance. Harness acceptance requires meaningful assertions, visible failures, isolated fixture data, owned cleanup, reproducible timing controls and honest browser/environment scope. This audit does not claim to have re-reviewed every assertion in the full suite or every comment in all 249 comment-edited files.

## Disposition

| Area | Assessment |
| --- | --- |
| Setup and execution boundaries | Clear: Linux/WSL source toolchain, Node 24+, locked install, compiled client, standalone supervisor and isolated temporary profile are documented separately. `npm run dev`, Worker/D1/Drizzle and component-catalog tests are explicitly retained scaffold rather than the production runtime. |
| Ownership and extension path | Architecture maps services, data owners and lifetimes. Internal API distinguishes observation, durable publication and UI invalidation; Registry migration/cleanup limits, built-in collection/scopes and generic extension-page refresh limits are explicit. No broad architectural rewrite is justified. |
| HTTP examples and contracts | API reference inventories route families, body limits, guards, status/error shapes, dynamic dispatch exceptions and SSE recovery. Worked examples use the actual helper and envelope. Prior executable-example verification remains scoped to its recorded source; no incompatible application changes existed between it and the audit starting source. |
| Source contracts | Sampled lifecycle, ownership, controlled-clock, filesystem-publication, worker-exit, request-count and cold-navigation comments match the owners/assertions they explain. Existing comment/type preservation receipts are historical evidence, not a substitute for validating new executable changes. |
| Historical authority | Build91's handoff owns the current download; Build90 and earlier phase-time claims are explicitly historical. The history index points to immutable performance checkpoints and preserves failures/partial runs. Completed ledgers/receipts must remain unchanged. |
| Failure detection | At the starting source, all 148 `tests/kairo/*.test.mjs` files are included by the runtime script, with no `test.only`, explicit skip or todo markers found. Inspected browser entrypoints propagate thrown errors or assert their final aggregate. Captured screenshots/partial JSON alone do not establish success. |
| Isolation and cleanup | Inspected fixtures use temporary SQLite/data directories and synthetic unusable tokens. Browser contexts are fresh across scenarios; results are retained outside disposable profile directories. Deferred provider/HTTP/filesystem gates are released before draining owners. Global hooks in serial unit tests are restored. |
| Timing and work bounds | Regression samples assert actual admission/settlement, worker exit, result ownership and bounded requests/queries, using deferred gates or mocked clocks. Browser waits are bounded and older animation checks intentionally use elapsed frames. These are correctness/cost controls, not fresh performance measurements. |
| Cross-browser scope | The compiled regressions explicitly enumerate Chromium/Firefox and desktop/narrow cases. Older broad CDP gates remain Chrome-only; Validation accurately records this. The baseline Firefox icon gate is not presented as comprehensive coverage of every module. |
| Maintenance burden | Separate scenario files and small domain fixture helpers preserve local ownership. Some older browser scripts retain their own CDP helpers and substantial workflows. No demonstrated hidden failure justifies replacing them during release preparation. |

## Concrete follow-ups

1. **Phase and production-data authority — integration owner.** The starting `AGENTS.md` still described the completed source-comment phase as current and retained the alpha-era permission to discard data. The supplied handoff explicitly supersedes both for this audit. Update active guidance and record the production policy/approval boundary without rewriting completed phase evidence.
2. **Local harness concurrency — documentation clarification.** `tests/premerge-operation-icons-ui.mjs` and `tests/premerge-pass4-markets-ui.mjs` both bind ports 18652/18653. The current workflow runs them sequentially, so this is not a CI defect. Development instructions should say to run browser harnesses one at a time; isolated profiles do not isolate listener ports, and not every runner exposes a port override.
3. **Duplicate landmark option — handed to Universe UI owner.** `components/kairo/universe-operations-detail.tsx` lists `a0_star` twice in the Landmark category options. This yields duplicate choices/React keys. The domain owner should record its disposition and any focused correction; no change was made by this audit owner.

No additional release blocker was established in the reviewed documentation/extension/harness contracts. The production-policy issue is cross-cutting and remains subject to the final ledger's disposition.

## Validation and limitations

This owner performed source/configuration/receipt comparison and test-selection/failure-path inspection. Representative runtime files included `lifecycle`, `startup-rollback`, `runtime-lock`, `http-body`, `dataset-publication-cancellation`, `sde-worker-limits`, `market-history-worker`, `scoped-refresh`, `resource-state`, `startup-indexes`, `frontend-formatters`, `frontend-derived-models`, `cache-retention`, `session-event-window` and connection-ownership tests. Browser inspection covered the premerge entrypoints, their selected scenarios, provider-aware icon fixtures and retained dataset/Universe/CDP runners.

An optional `npm run lint` baseline probe stopped with `fatal library error, lookup self` before producing ESLint diagnostics. Its cause was not established; it is not evidence of a source defect or a passing lint gate. Lint is not part of the declared release-acceptance workflow. No rules were disabled and no tests were relaxed in response.

The integration owner owns fresh combined type/build/runtime/browser/package acceptance after executable changes. Existing Build91 counts remain attached to Build91. Windows/DPAPI, live EVE SSO/scopes and structure permissions, actual OBS scene/audio/output behavior and extended play remain outside this source review. PR #12 must remain draft; no merge, version bump, tag or stable release is authorized by this disposition.

## Independent reviews

These dispositions cover the reviewed corrections. The [main ledger](../FINAL-AUDIT.md) owns banking and combined-candidate readiness; linked owner records retain implementation details, negative controls and scope limits.

| Correction / reviewed owners | Independent evidence and disposition |
| --- | --- |
| [Private-file permissions and whole-profile restore](runtime-data.md): Store/runtime-lock and new permission/recovery tests | **Accepted.** `node --test tests/kairo/store-permissions.test.mjs tests/kairo/persistence-recovery.test.mjs tests/kairo/runtime-lock.test.mjs tests/kairo/startup-rollback.test.mjs`: **28/28**, zero failures/skips/cancellations. Reviewer requested and inspected EPERM/error/descriptor controls. Same-version restore is not an arbitrary upgrade or DPAPI portability claim. |
| [Import fee policy](markets-sessions.md): import-math, fee regression and formula guidance | **Accepted.** `node --test tests/kairo/import-fee-policy-review.test.mjs tests/kairo/imports.test.mjs tests/kairo/imports-roster.test.mjs`: **53/53**, zero failures/skips/cancellations. Independently verified official permanent six-percentage-point policy, numeric costs, unchanged historical saved-plan bytes and zero ESI requests. |
| [Package inputs and notices](packaging-ci.md): packager, Python tests, Vite config, supplement and workflow gate | **Accepted.** `python3 tests/package-release.test.py`: first **14/14**, then both newly added supplement-drift controls **2/2**; inspected owner's final single-run **16/16**. Reviewer requested the unreadable-subtree negative control, inspected its failed baseline, checked all six supplement versions/digests, four upstream blob identities, 13 vendored notices and two CSS texts. |

Reviewer log SHA256 values: permissions/restore `5d76c19f6108d0a29bf31a4adaa08ccb10441a691a23ce9e06e9d33be2a1331e`; fee `ea96f81e16df8b2273c326e998730ceb28b3026657e939ddc4e15fb1b2ea585c`; packaging 14-test run `9a28d470611796cf75426d574e1787d2ea6991efe37cf945adf808474be26c4b`, two-test run `de9b494b58b82cc8995e0fd5241d9d7f3b66cefed2f517f7360f41b3197bf747`. An intermediate packaging command used nonexistent test method names; those loader errors were corrected and are not counted as product failures or passing evidence.

The subsequent [dependency review](dependencies.md) adds source-versus-runtime reachability and a confirmed host-Node OBS failure. Its [runtime prerequisite receipt](evidence/runtime-version-verification.json) owns the scoped correction and fresh evidence; earlier Node 24.19.0 results above remain historical executions, not acceptance of the new prerequisite.
