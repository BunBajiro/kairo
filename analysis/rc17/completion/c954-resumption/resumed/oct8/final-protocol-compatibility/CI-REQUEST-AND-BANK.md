# Prepared all-suite request and evidence retrieval

Prepared only; nothing here has been dispatched or written to either live request path. Candidate: `70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`. Wait for S3 disposition and the coordinator's final freeze. If source changes, retain this preparation and create a new candidate-specific one.

The exact push-request body is `candidate-source-70cd12f.PREPARED.json` beside this file. After final disposition, the coordinator may place its reviewed bytes at `analysis/rc17/candidate-source.json` on `BunBajiro/kairo`, branch `perf/rc16-checkpoint-v0.8.0`; that commit triggers `.github/workflows/rc17-comparison.yml`. Do not also dispatch manually for the same request.

Alternatively the exact manual inputs are `candidate_sha=70cd12f9a4d014e7e2cf931b9681c4bdc7f18789`, `suite=all`, with `accepted_full_run` omitted. The equivalent command, **not executed**, is:

```bash
gh workflow run rc17-comparison.yml --repo BunBajiro/kairo --ref perf/rc16-checkpoint-v0.8.0 -f candidate_sha=70cd12f9a4d014e7e2cf931b9681c4bdc7f18789 -f suite=all
```

Pre-dispatch: bank the final source, reviewed harness/adapter files and final ledger; check candidate clean exact SHA, c954 ancestor,508 excluded, canonical nonshallow history, locked dependencies and fixed RC16 baseline `57c8dcc7fbd8fc2b62129498d1819050c78381a1`. Record the exact analysis harness commit separately. The workflow builds both versions plus historical0.7.3 on Node24.19.0 / Ubuntu24.04. It captures manifests after build and rechecks source/compiled assets after all lanes. Original workload rows and adverse results stay intact. A workflow timeout, missing lane or bundle created after a failed lane is not a pass.

For the minimal retrieval path, retain the actual run ID and attempt from the chosen trigger, then fetch the latest job steps/conclusion and artifact list. Available connector calls are:

```javascript
tools.mcp__codex_apps__github_fetch_workflow_run_jobs({repo_full_name:"BunBajiro/kairo",run_id:RUN_ID})
tools.mcp__codex_apps__github_fetch_workflow_run_artifacts({repo_full_name:"BunBajiro/kairo",run_id:RUN_ID})
tools.mcp__codex_apps__github_download_workflow_artifact({repo_full_name:"BunBajiro/kairo",artifact_id:ARTIFACT_ID,file_name:"rc17-RUN_ID-ATTEMPT-evidence.zip"})
```

The artifact listing returns its first page only. This workflow has at most six expected artifact names, but explicitly confirm the returned count and preserve IDs, names, byte sizes, expiry/digest metadata where provided. Download `internal-rc17-comparison-evidence` first; keep the original ZIP and hash it before safe extraction into a new run-and-attempt directory. Obtain job logs for failed/skipped lanes as well as success. The other artifacts are `internal-instrumented-rc17-70cd12f9a4d014e7e2cf931b9681c4bdc7f18789` (part manifest/verification files) and its `-part-01` through `-part-04` artifacts when present. Use `parts.json` to determine the actual required parts; absence of an unused part is not failure, absence of a required part is.

Validate `run-provenance.json`: exact candidate, fixed RC16 and0.7.3 commits, `suite=all`, actual harness commit, run URL/attempt and harness hashes. Validate both source manifests and every expected lane's completion/raw controls, preserving all failures/adverse rows. The internal bundle metadata must say `allComparisonLanesPassed:true` and show success for compile, correctness, maps, routes, legacy, backend, memory, mixed, restart, browser, camera and sources; also require the actual Actions conclusion and bundle/source steps to succeed. Bundle integrity or existence alone is insufficient. Packaging deliberately keeps `releaseReady:false` and does not update whitepaper closure.

Bank raw ZIPs (or documented hash-verified parts), extracted evidence, original manifests, logs, artifact listing, source lineage receipt, validation receipt and a recursive SHA256/size inventory through the existing analysis evidence-bank path. Compress only when the shared performance slot is free. Commit/upload a new run-specific path, verify remote bytes/blob identities, and record its durable commit before relying on it across workspace resets. GitHub artifact retention is30days, so an Actions URL alone is not the backup. Do not replace earlier runs or aggregate away adverse rows.

Completion UI has its own workflow/request and seven lanes; updater and final-source startup/full-report/routes/database gates remain separate. No live `ui-request.json` or updater request is part of this preparation. The existing final merged frontend wrapper is correctness-only and does not request another names performance matrix. PR10 and a clean user-review package remain blocked on the coordinator's complete evidence/ledger disposition.
