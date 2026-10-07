# Internal completion UI evidence workflow

Prepared 7 October 2026; no request file has been created and no run was dispatched by this preparation.

`.github/workflows/rc17-completion-ui.yml` only starts from a push changing `analysis/rc17/completion/ui-request.json` on the analysis branch, or a manual dispatch on that branch with a full lowercase `candidate_sha`. A future push request uses `{ "candidateCommit": "FULL_40_CHARACTER_SOURCE_SHA" }`; an optional `sourceCommit` must equal that same SHA. The parent coordinator owns publication and selection of the final candidate.

The workflow checks out that exact candidate in a separate clean directory. It runs the locked `install:ci`, types, runtime suite and production build; captures the full source/compiled manifest; and records the source commit/tree, combined source/build fingerprint, lockfile hash, Node version, build command/time, exit code and build-log SHA-256. Build success alone does not imply completed evidence.

Seven independent lanes run sequentially under the local benchmark lock on one runner:

1. Dashboard refresh and Session archive publication.
2. Markets/OBS/Goals administrative polling.
3. Populated frontend model diagnostics.
4. Studio/browser-source rendered behavior.
5. Compiled replay: repeated geography with small history.
6. Compiled replay: repeated geography at the event cap.
7. Compiled replay: distinct geography at the event cap.

`ui-ci-lane.mjs` pins the exact manifest before and after each lane, sets each harness's actual argument/environment contract, checks the lane's structured result and records its command, harness hashes, stdout/stderr log, source identity and output hashes. Studio receives the build receipt. Refresh/models receive their manifest argument. Admin and Studio capture their own source, which the owner compares with the pinned manifest. Replay has no manifest parameter; its SHA environment is checked against output and complete external manifest verification brackets it. The replay cases are full runs (no smoke), with controls and 12-cycle ownership/retention completion checked. They remain single-candidate evidence, not an ABBA comparison or claimed performance improvement.

A failed or timed-out lane keeps its raw output and a failure receipt. Its process group is terminated before another lane can start, including descendant browsers; later independent lanes still run. A failed prerequisite (install/build/types/runtime) prevents invalid candidate UI acceptance. Final source verification still runs after attempted lanes, and a separate final gate compares every analysis harness hash and its file inventory with the initial provenance. The 90-minute job ceiling allows all seven independent 10-minute timeout budgets plus setup; normal successful runs stop when the work completes. The completeness record rejects every failed/missing prerequisite or lane, and the overall Actions job fails even while artifacts are retained.

The independent concurrency group is `internal-kairo-rc17-completion-ui`, so other CI workflows on different runners need not wait. Only raw internal evidence is uploaded. This workflow creates no application package, release, review handoff or PR transition. PR #10 remains withdrawn.

Static verification performed at preparation: Node syntax check of the owner; YAML trigger/step structure; seven sequential lane invocations; embedded Python AST parsing. No runtime invocation was performed while preparing this workflow. Historical browser helpers and application source were not modified.
