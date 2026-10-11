# Mandatory Actions preflight — 11 October 2026

**No new dispatch blocker found.** Read-only review at analysis checkpoint `3e023e21222e04f46dc1b86b39e4c5375946e2f2`; no request was changed and no workflow was dispatched. The coordinator must bank the completed updater audit and then commit the three requests together. Application remains frozen at `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`.

## Exact push requests

All three workflows match only branch `perf/rc16-checkpoint-v0.8.0` and their exact request path. Their job-level branch guards also reject other branches. Changing this report or the workflow alone does not trigger them.

| Request path | Minimum JSON contents | Current state |
|---|---|---|
| `analysis/rc17/candidate-source.json` | `{ "candidateCommit": "70cd12f9a4d014e7e2cf931b9681c4bdc7f18789", "suite": "all" }` | Stale fa6/backend request; replace it |
| `analysis/rc17/completion/ui-request.json` | `{ "candidateCommit": "70cd12f9a4d014e7e2cf931b9681c4bdc7f18789" }` | Absent; create it |
| `analysis/rc17/completion/updater/request.json` | `{ "candidateCommit": "70cd12f9a4d014e7e2cf931b9681c4bdc7f18789" }` | Absent; create it |

A dated `request` label may be added for provenance. UI optionally accepts `sourceCommit`, which must equal `candidateCommit`. Comparison must omit `acceptedFullRun` for this full run; that field is restricted to a focused browser recovery. Every candidate SHA must be 40 lowercase hexadecimal characters. The measured runtime checkout is the explicit candidate SHA; the harness/workflow checkout is the new trigger commit. Record both.

## Guards and retained evidence

All three use pinned action revisions, read-only repository permission, credentials-disabled checkouts, Ubuntu 24.04 and Node 24.19.0. Concurrency groups are separate and `cancel-in-progress:false`; their measured lanes execute sequentially within separate jobs. Job budgets are comparison 40 minutes, UI 90 minutes and updater 25 minutes. CI browser identity comes from the runner and retained results; do not pool its observations with local Chrome138 results.

- **Comparison `all`:** fixed RC16 `57c8dcc7fbd8fc2b62129498d1819050c78381a1` and historical 0.7.3 `239794774320fcdebaa1d76ce8a77c5c25cfc48c`; fresh builds, clean full source/build manifests, candidate correctness/types, Maps, routes, same-runner historical anchor, backend, memory, mixed, restart, Maps browser and camera, followed by final source verification. Later lanes continue after earlier failures where declared so missing evidence cannot be mistaken for a pass. Require successful job/steps and `metadata/bundle.json: allComparisonLanesPassed:true`. The internal bundle can deliberately be assembled after a failed lane with that flag false; artifact presence is insufficient.
- **Completion UI:** install/types/runtime tests/build, exact source/build receipt, seven independent lanes and final source/harness guards. The canonical owner's sole replay schema correction reads `result.environment?.smoke`; SHA-256 `27f05929f03ec6b17d9632c561420b0a802578518db93169d046ed0f0a134378`. All four general lanes and repeat-small/repeat-cap/distinct-cap are required. `completion.json` fails closed for any missing/failed step or lane receipt; `evidence-sha256.json` records retained file hashes. This new CI collection runs all seven; the local adoption receipt is not substituted into it.
- **Updater:** fresh exact candidate build/types/tests; official build3552227 archive is checked at 99,197,259 bytes / SHA-256 `0788ec9352556fcb2eb28ba084eb1f408cb0ad22f8e30d91bfa49f534ec1ad83`. Inventory25 then the unchanged six default 60-second loaded/control windows run sequentially under the performance lock; source is verified afterward. Require successful job plus complete inventory and loaded records, correct source/archive pins, all six runs and loaded `endVerified`. This is actual conversion/replacement evidence, not every rollback-fault counterfactual.

Raw upload steps use `always()`, `if-no-files-found:error` and 30-day retention. Expected artifact names are `internal-rc17-comparison-evidence`, `internal-rc17-completion-ui-<run_id>-<run_attempt>` and `internal-rc17-updater-evidence`. Comparison additionally uploads the internal manifest/reassembly files and up to four numbered bundle parts. Download, hash-verify and bank actual artifacts/logs per run/attempt before treating CI collection as durable; retain failed attempts separately. No clean review package or approval follows from these internal artifacts.

## Existing release and documentation work

All46 component decisions stay closed. B/W/L/P acceptance still needs review of independent CI against the local evidence, an honest three-version report with adverse rows/limits, and a clean extracted-package verification. Reopen an owner only for a concrete failed gate or repeated material new signal, not to seek better numbers.

The documentation refactor is already integrated: user/developer map, consolidated user guide, internal service/API backbone guide, HTTP/event reference, and nine superseded documents pruned with originals banked. Do not repeat that pruning project. **`docs/VALIDATION.md` needs its final status refreshed:** it still cites a7/test-build63 and component decisions as pending. Update it and the release/changelog/readme status only after evidence supports the stated scope. A documentation/version preparation commit changes the package source identity; identify that commit and its relationship to measured source70 explicitly instead of relabelling source70 results. Existing documentation plan requires relevant link/package checks, not another benchmark for prose edits alone.

The internal comparison bundle is not the clean release ZIP. Prepare that ZIP from the application feature branch, preserve required API guides/notices, verify its extracted runtime/source/compiled inventory, and provide a successful feature-branch test-build download for user review. `test-build.yml` deliberately excludes the perf analysis branch. Actual EVE SSO/scopes/permissions, Windows DPAPI and OBS/scene/cover behavior remain user-environment review on the clean candidate. PR10 stays withdrawn; PR11 stays internal until a justified clean handoff. Merge/main still require explicit approval after that review.
