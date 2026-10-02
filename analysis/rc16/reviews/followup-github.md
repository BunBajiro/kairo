# Follow-up GitHub confirmation: partial evidence and confirmed stream failure

The [first dedicated follow-up run](https://github.com/BunBajiro/kairo/actions/runs/36716150075) **failed** during the first quiet mixed-workload window. Maps, memory/Sessions and managed-restart lanes completed beforehand. Browser retention/replay and corrected legacy backend lanes were skipped by the workflow after that failure. This run is not a complete confirmation of the locally completed follow-up.

**Update:** the [second run](https://github.com/BunBajiro/kairo/actions/runs/36718342385) also failed, but its separate trace now proves the production backlog cutoff destroyed the dashboard stream mid-asset frame. Its browser lane passed. The corrected backend comparison encountered a missing v0.7.3 build prerequisite and remains incomplete. Details below preserve both failed runs.

## First-run identity and completeness

The run used harness commit `4d9366c3889c0d9df49dd2022e46d92c7e5b443a`, canonical RC16 application `57c8dcc7fbd8fc2b62129498d1819050c78381a1`, and v0.7.3 baseline `239794774320fcdebaa1d76ce8a77c5c25cfc48c`. Node was v24.19.0 on Linux with two logical CPUs reported by the mixed observer, AMD EPYC 7763. Local-host timings must not be pooled with these measurements.

The retained [artifact and log](../raw/followup/github-run-36716150075/) identify artifact `11096411503`, 141,457 bytes, archive SHA-256 `b303f8f2a1edcec57361192a779556289111ff0b96295c46f8191fdb066709b4`; retrieval recorded the failed conclusion. All 20 recorded follow-up harness hashes match the frozen local files. The source verifier checked 405 protected files with no errors, retaining the existing two investigation exceptions. The diagnostic copy added after this run is not part of those 20 hashes.

| Lane | Retained completion evidence | Interpretation |
|---|---|---|
| Maps | Three complete files, 15 cases each; forward/reverse timing lanes contain seven samples per case (210 total). Source/harness stability and zero external requests recorded. | Confirms the fixture, semantic guards and repeated-work diagnostics on this runner. Keep host-specific timing separate. |
| Memory/Sessions | All 14 sample hashes match the run manifest; ordinary, forced-GC and query diagnostic lanes remain separate; zero external attempts. | Bounded residency and session-query evidence, with the original window/group equivalence limits. |
| Managed restart | Both scenarios complete; 13 recorded source/harness hashes match. Normal accepted-work controls pass. Forced-late scenario reproduces the known shutdown ownership gap. | An expected-gap reproduction is not a safe-shutdown pass. |
| Mixed operation | Only `quiet-1`, nominal 28 seconds; all 56 HTTP requests return 200, OBS SSE remains connected, dashboard SSE fails. Overall and window `complete` are false. | No balanced CI mixed comparison. Assertions after the failed dashboard client-count gate did not run. |
| Browser retention/replay | No output; skipped. | Local results remain available; no confirmation from this run. |
| Corrected legacy backend | No output; skipped. | Local corrected ABBA remains the healthy workload baseline; no corrected CI comparison from this run. |

The fresh evidence manifest starts at 12:39:35 UTC. Maps finish at 12:41:18, memory at 12:41:38, restart at 12:41:42; mixed reports its failed assertion at 12:42:12. No stale output fills missing lanes.

## What failed, and what is still an inference

The server reported zero dashboard SSE clients and one OBS client at the end of the first quiet window. The dashboard reader reported `terminated`, not invalid JSON. It received 3,139,823 bytes, but its 13 complete SSE packets account for only 313,591 bytes: **2,826,232 bytes arrived in an unfinished packet**. OBS received 36 complete events without a reader error. All 56 HTTP requests completed and cleanup reported no in-flight transport, forbidden network attempt or worker stderr.

The last complete dashboard packet arrived around 2.96 seconds after the observation began. Synthetic assets returned around 3.08 and 3.24 seconds. Neither asset snapshot completed on the CI dashboard connection. In the preserved local quiet window, each corresponding asset snapshot was 3,262,964 bytes. The observer's maximum recorded event-loop delay was 41.25 ms; the server's was 146.41 ms. These observations do not identify a stalled parser or deliberate reader stop.

Production `server/core.mjs` sends full dataset snapshots plus the names dictionary over dashboard SSE. Its next send destroys a client whose `writableLength` exceeds 1,000,000 bytes; heartbeat and dataset notifications have the same threshold. **The leading explanation is that a large asset frame remained queued when a subsequent production send applied that cutoff, terminating the response mid-frame.** Socket buffering and scheduling on the two-CPU runner can expose this without any fixture change. The original evidence has no server destroy call stack or queue-length trace, so this was an inference from the first run. The second-run trace below confirms the application call site and queued frame.

The observer uses a continuously read fetch stream rather than a browser EventSource. Actual browser reconnection and resynchronisation were not exercised here. A later reconnect may restore current state, but silently reconnecting this observer would hide the failed continuity contract. Keep this failure and its existing assertion; assess browser recovery separately.

## Focused next diagnostic and acceptance

A separate [diagnostic copy](../followup/harness/mixed-diagnostic/README.md) preserves the same quiet fixture and controls, and records dashboard client addition, real response writes, queued bytes, drain/close and the destroy stack. It changes no threshold, frame content or reconnect behavior. All its timing values are diagnostic only; a non-reproduction does not erase the failed original run.

Allow independent later CI lanes to run when install/build/source prerequisites succeeded, even after a mixed failure. Keep the mixed failure in the overall job result and retain a per-lane completeness record. Do not use blanket `continue-on-error` to label the suite successful.

Before changing production transport, establish the destroy path. Any fix needs a bounded slow-client policy, preserved pilot/privacy and ordering semantics, eventual fresh dashboard state, no unbounded application queue, and a genuine stalled-reader test. Raising the byte limit or shrinking this fixture alone would not establish those contracts. Use a positive continuity/recovery gate alongside the retained failure, and measure candidate costs independently of this trace instrumentation.

## Second run: destroy path confirmed, browser confirmed, baseline prerequisite missing

Run `36718342385` used harness/workflow commit `e30b45ab4dcee5ea44aa5a992a7af26f3de5e5d3` against the same unchanged RC16 and v0.7.3 sources. Its [retained artifact](../raw/followup/github-run-36718342385/) is `11097651492`, 182,801 bytes, archive SHA-256 `f7bfb6a6e4e88f32ba04b38781de2d5b4a749bcccaf16af05f70dbde382d19c5`, independently checked before extraction. Job `109896788044`, the decoded log and retrieval metadata are retained. All 23 workflow-recorded harness/document hashes match; all 405 protected application files verify. The additional three entries are the separate diagnostic runner, worker and README.

Maps again completed its three 15-case files with stable identities and zero network attempts. All 14 memory sample hashes match their manifest and report zero external attempts. Both managed-restart scenarios completed with their original normal-pass/known-gap distinction and matching recorded source hashes. These are separate repetitions on this host, not additions to a pooled local timing sample.

The frozen, uninstrumented mixed runner again failed in its first quiet window with the same 13 complete dashboard packets, 3,139,823 received bytes and `terminated` reader error. The separate diagnostic then reproduced it with the existing continuity assertion intact:

| Trace event | Evidence |
|---|---|
| Asset snapshot for pilot 42 | 3,262,964-byte frame; queue was zero immediately before the real `write`. |
| Immediately after `write` | Return value `false`, `writableNeedDrain=true`, 3,262,974 queued bytes (including HTTP framing). |
| 176 ms later | Queue still 3,262,974; `destroy()` called while response was not already destroyed or ended. |
| Actual caller | `server/core.mjs:29`, `send`, from dataset snapshot emission at `runDataset:266`. |
| Reader outcome | Dashboard disconnects mid-frame; OBS remains connected; all 56 HTTP requests complete. |
| Diagnostic controls | 27 trace rows, zero dropped rows, zero unexpected/forbidden network attempts, no in-flight transport at cleanup, source and all five harness/helper hashes verified again at the end. |

This is a production SSE backpressure failure under the supported synthetic large-asset fixture. The consumer is continuously reading; it did not reject malformed JSON or intentionally stop. A valid single snapshot can exceed the fixed queue threshold and is destroyed by a later send before it drains. The trace establishes that mechanism; it does not establish every possible disconnect cause or actual browser reconnection behavior. Diagnostic timing and memory values must not be used as performance measurements.

The workflow continuation allowed browser retention/replay to complete from 13:01:48.897 to 13:05:02.307 UTC: eight replay samples, five GC checkpoints, 17 ownership gates, one EventSource, 503 recorded API requests all returning 200, and zero renderer/backend/external-response failures. Source hashes match; seven downloaded asset hashes are recorded. Chrome was 154.0.8037.57 with SwiftShader, whereas the local follow-up used a different browser version, so timings/heaps are not pooled. DOM remains one document, 577 nodes and 612 listeners at each quiescent checkpoint; collected JS/embedded heap still rises modestly. The original bounded-playback, repeated-geography and no-leak-inference limits apply.

The corrected backend lane started but failed after the first v0.7.3 typical profile's idle and eight direct operations: `GET /` returned 404 where `legacy-corrected/backend.mjs:24` requires 200 before authenticated HTTP measurement. The workflow installed v0.7.3 dependencies but built only RC16; the original full-checkpoint workflow builds both checkouts. The missing v0.7.3 client build explains that bootstrap failure. The partial baseline has `complete:false`; no candidate profiles, balanced ABBA result or end verification exist for this attempt. Preserve it as a workflow-prerequisite failure, build v0.7.3, then rerun the corrected comparison. It is not a backend performance regression and does not supersede the completed corrected local data.

The overall second-run conclusion remains **failure**. Browser confirmation and a diagnosed transport defect are useful outcomes, but they do not make mixed continuity or the incomplete corrected comparison pass. Production transport acceptance must retain a bounded stalled-client policy while permitting a healthy reader to finish valid large frames; use explicit fresh-state/reconnect and privacy/ordering checks before declaring the issue fixed.

## Focused workflow repair prepared

The follow-up workflow now compiles both v0.7.3 and RC16 before the corrected
backend runner. A manual `corrected-backend` suite, or a change to the explicit
`analysis/rc16/followup/run-corrected.json` request file, reruns only that missing
ABBA comparison. Updating other reports or workflows does not repeat the entire
diagnostic suite. This is a prerequisite repair, not new measurement evidence;
the two failed runs and their conclusions above remain unchanged until a new
run and its complete retained artifact are reviewed.
