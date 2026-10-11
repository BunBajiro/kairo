# Original local matrix — exact command handoff

Prepared only, 11 October 2026. `ORIGINAL-LOCAL-MATRIX.sh` is a shell command list delegating to existing, unchanged orchestration/workers; it has not been run or syntax-executed by this reviewer. No new measurements or assertions are introduced. Root owns execution after the runtime agent's sequential builds and the separate final-source startup/contracts/database gates finish.

## Exact invocation

```sh
flock /tmp/kairo-performance.lock bash /workspace/scratch/a2f3334402fc/recovery-oct11/ORIGINAL-LOCAL-MATRIX.sh
```

The outer performance lock is distinct from the legacy benchmark lock used by the original lanes. Do not wrap the command list in the legacy benchmark lock: most lane entry points acquire that lock internally. No build, install, compression or other workload may overlap ordinary measurements.

All paths are frozen to this workspace. The command list checks RC16/source70cd12f/v0.7.3 HEADs and the fresh runtime-agent manifests at `recovery-oct11/final-local/{rc16,candidate,v073}-source.json`. It uses restored Chromium138.0.7204.0 and Node24.19.0. It keeps the original v0.7.3↔RC16 anchor separate from RC16↔candidate.

| Scope | Existing owner / retained output |
|---|---|
| Historical anchor | `analysis/rc16/followup/harness/legacy-corrected-run.mjs`; `legacy-corrected/` plus original summary |
| Eight original comparison lanes | `analysis/rc17/harness/local-run.py` with explicit `maps routes backend memory mixed restart browser browser-performance`; output `comparison/` |
| Maps | Both diagnostics then baseline1/candidate1/candidate2/baseline2, second arms reversed; original scaling rows |
| Backend, memory, routes, camera | Existing matched workers/summaries; backend typical/stress, ordinary vs diagnostic memory remain separate |
| Mixed, restart, Maps correctness | Existing schedules and controls; restart JSON stdout is in `comparison/restart.log`, not a fabricated `restart-candidate.json` |
| Seven completion UI lanes | Existing `ui-ci-lane.mjs` under explicit legacy flock; `completion-ui/<lane>/lane-receipt.json`, raw result and harness log |

`local-run.py` recaptures its own source/build manifests at `comparison/baseline-source.json` and `comparison/candidate-source.json`; these are additional bindings of the same unchanged builds, not fresh builds. Its `run.json` records all steps and stops on first failure. Its completion does not encompass the separate historical/UI/updater/source-adapter gates. The seven local UI lane receipts do not constitute a CI `completion.json`; do not fabricate GitHub step outcomes for local work.

## Required inputs and concrete ownership limits

1. Runtime agent must finish actual candidate/RC16/v0.7.3 build/manifests and record clean sources. Requested local UI receipt path: **`final-local/completion-ui/build-receipt.json`**. The runtime agent has the required schema: `schemaVersion`, `sourceCommit`, `sourceTree`, exact `sourceFingerprint`, `buildCommand`, `exitCode:0`, actual `startedAt`/`completedAt`, absolute original `buildLog`, its `logSha256`, `lockfileSha256`, `node`, `reviewReady:false`. Studio rehashes the actual accessible log; deriving this receipt from the existing successful build does not require another build.
2. October8 `final-protocol-compatibility/AUDIT.md` concludes the accepted names protocol needs **no compatibility adapter** for these original workloads. Keep their fixtures/assertions and measured transport bytes unchanged. Names-specific correctness was separately covered by the accepted89-control gate; older generic SSE parsing alone does not prove it.
3. `local-run.py` uses `subprocess.run(..., timeout=900)`. On timeout it kills/waits for the direct runner only; it does not establish descendant-group disappearance. It also waits for runner exit rather than independently auditing residual groups after success. Root must retain its real process ownership/stop procedure and confirm drain before proceeding after any interruption/failure. This is an existing envelope limit, not a request to rewrite measured workers.
4. `ui-ci-lane.mjs` spawns a detached worker and finally sends TERM then KILL, but sets `processGroupCleaned` without an actual group-absence census. Backend process and mixed helpers also have bounded TERM/KILL paths without final group absence proof. These receipts cannot alone certify namespace-aware drain. The already-reviewed namespace helper can support the coordinator's external process observation; do not replace original workloads or interpret signal delivery as proven disposal. Nothing here uses the faulty host/local numeric census that was fixed in the separate final-source runner.
5. Missing fresh build receipt/manifests is the current input gate. Restored historical fixture manifests are present: the original historical owner verifies source blobs directly and preserves its two documented investigation-only RC16 exemptions. Preserve all failures/partial outputs; do not rerun the same output directories or change cycle counts to erase adverse samples.

After successful local lanes, root reviews all raw/paired outcomes and banks them, then requests the independent comparison `all`, completionUI and updater workflows against the exact source/harness identities. Updater and package acceptance remain separate.
